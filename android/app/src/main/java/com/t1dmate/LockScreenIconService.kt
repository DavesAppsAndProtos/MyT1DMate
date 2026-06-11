package com.t1dmate

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.graphics.drawable.IconCompat

/**
 * My T1D Mate — LockScreenIconService
 * Session 8 (new file).
 *
 * Displays a large coloured circle with the current glucose value on the
 * lock screen, using a high-priority notification with a Canvas-drawn
 * Bitmap as the large icon.
 *
 * Why this approach:
 *   Android 14 prevents third-party apps from placing custom indicators
 *   in the status bar strip (requires system signing). The confirmed
 *   workaround (from status bar investigation) is a persistent notification
 *   with a dynamically generated Canvas bitmap — visible on the lock screen
 *   as a large icon without any special permissions.
 *
 * What it draws:
 *   - Filled circle, colour-coded to the same thresholds as the banner:
 *       Green  — in range
 *       Amber  — warning low/high
 *       Red    — critical low/high
 *       Slate  — waiting / no data
 *   - Glucose value in large bold white text centred in the circle
 *   - Trend arrow below the number (smaller text)
 *
 * Integration:
 *   Called from GlucoModule.emitGlucoseUpdate() so it updates on every
 *   poll alongside the existing persistent notification. No new service
 *   lifecycle needed — update() is a static method.
 *
 * Notification channel: LockScreenGlucoseChannel (IMPORTANCE_HIGH so it
 * appears on the lock screen). Separate from the ongoing FGS channel so
 * the user can control them independently in system settings.
 *
 * BITMAP SIZE: 256×256px — large enough to be clear on all screen densities.
 */
object LockScreenIconService {

    private const val TAG        = "LockScreenIconService"
    private const val CHANNEL_ID = "LockScreenGlucoseChannel"
    private const val NOTIF_ID   = 1003
    private const val BITMAP_SIZE = 256

    // Glucose colour thresholds — kept in sync with GlucoseForegroundService defaults.
    // These are overridden per-profile when update() is called with threshold params.
    private const val DEFAULT_CRIT_LOW   = 3.0f
    private const val DEFAULT_WARN_LOW   = 3.9f
    private const val DEFAULT_WARN_HIGH  = 10.0f
    private const val DEFAULT_CRIT_HIGH  = 13.9f

    // Colours matching the JS banner
    private val COLOR_CRITICAL = Color.parseColor("#EF4444")
    private val COLOR_WARNING  = Color.parseColor("#F59E0B")
    private val COLOR_IN_RANGE = Color.parseColor("#10B981")
    private val COLOR_WAITING  = Color.parseColor("#64748B")

    // Mapped 1-7 scale from LibreLinkUpService TREND_MAP:
    //   1=DoubleDown  2=Down  3=FortyFiveDown  4=Flat
    //   5=FortyFiveUp 6=Up    7=DoubleUp
    // Must match GlucoseForegroundService and SplitScreen/GlucosePanel.
    private val TREND_ARROWS = mapOf(
        1 to "↓↓", 2 to "↓", 3 to "↘", 4 to "→",
        5 to "↗",  6 to "↑", 7 to "↑↑"
    )

    /**
     * Create the notification channel. Call once from Application.onCreate()
     * or from GlucoseForegroundService.onCreate().
     */
    fun createChannel(context: android.content.Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE)
            as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Lock Screen Glucose",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Large glucose circle shown on the lock screen"
            setShowBadge(false)
            enableLights(false)
            enableVibration(false)
            setSound(null, null)
        }
        nm.createNotificationChannel(channel)
        Log.d(TAG, "Lock screen notification channel created")
    }

    /**
     * Update (or create) the lock screen notification with the latest glucose.
     *
     * @param context      application context
     * @param glucoseMmol  current glucose in mmol/L (0 = waiting)
     * @param trend        1-7 Nightscout trend integer
     * @param displayMmol  true = show mmol/L, false = show mg/dL
     * @param critLow      threshold (mmol/L)
     * @param warnLow      threshold (mmol/L)
     * @param warnHigh     threshold (mmol/L)
     * @param critHigh     threshold (mmol/L)
     */
    fun update(
        context:     android.content.Context,
        glucoseMmol: Float,
        trend:       Int,
        displayMmol: Boolean = true,
        critLow:     Float   = DEFAULT_CRIT_LOW,
        warnLow:     Float   = DEFAULT_WARN_LOW,
        warnHigh:    Float   = DEFAULT_WARN_HIGH,
        critHigh:    Float   = DEFAULT_CRIT_HIGH,
    ) {
        try {
            val circleColor = resolveColor(glucoseMmol, critLow, warnLow, warnHigh, critHigh)
            val bitmap      = drawCircle(glucoseMmol, trend, displayMmol, circleColor)
            val trendArrow  = TREND_ARROWS[trend] ?: "→"

            val displayVal = when {
                glucoseMmol <= 0f -> "--"
                displayMmol       -> String.format("%.1f", glucoseMmol)
                else              -> (glucoseMmol * 18.0182f).toInt().toString()
            }
            val unit = if (displayMmol) "mmol/L" else "mg/dL"

            val smallIcon = try {
                val statusBitmap = drawStatusBarBitmap(glucoseMmol, displayMmol)
                IconCompat.createWithBitmap(statusBitmap)
            } catch (e: Exception) {
                Log.w(TAG, "Status bar bitmap failed, using fallback: ${e.message}")
                IconCompat.createWithResource(context, R.drawable.ic_notification)
            }

            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(
                    if (glucoseMmol <= 0f) "Glucose — waiting"
                    else "$displayVal $unit $trendArrow"
                )
                .setContentText(stateLabel(glucoseMmol, critLow, warnLow, warnHigh, critHigh))
                .setSmallIcon(smallIcon)
                .setLargeIcon(bitmap)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSound(null)

            val notification = builder.build()

            val nm = context.getSystemService(android.content.Context.NOTIFICATION_SERVICE)
                as NotificationManager
            nm.notify(NOTIF_ID, notification)

        } catch (e: Exception) {
            Log.e(TAG, "update() failed: ${e.message}", e)
        }
    }

    // ── Status bar bitmap icon ────────────────────────────────────────────────

    /**
     * Draw the glucose value as a small white-on-transparent bitmap suitable
     * for use as a notification smallIcon in the status bar.
     *
     * Android uses only the alpha channel in the status bar strip, so the
     * bitmap must be white text on a fully transparent background.
     * Size: 48x48px — maps to ~24dp at xxhdpi (2x), renders well across densities.
     *
     * For values >= 10 the decimal is dropped (e.g. "13" not "13.2") to fit.
     * For values < 10 one decimal is shown (e.g. "4.2").
     * Waiting state: "?"
     */
    fun drawStatusBarBitmap(glucoseMmol: Float, displayMmol: Boolean): Bitmap {
        val size = 48
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.TRANSPARENT)

        val displayVal = when {
            glucoseMmol <= 0f -> "?"
            displayMmol -> {
                // Drop decimal for two-digit values to fit the small canvas
                if (glucoseMmol >= 10f) glucoseMmol.toInt().toString()
                else String.format("%.1f", glucoseMmol)
            }
            else -> (glucoseMmol * 18.0182f).toInt().toString()
        }

        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color     = Color.WHITE
            typeface  = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
            // Scale text size to fit — shorter strings get bigger text
            textSize  = if (displayVal.length <= 2) size * 0.60f
                        else if (displayVal.length == 3) size * 0.46f
                        else size * 0.38f
        }

        // Vertically centre the text
        val bounds = android.graphics.Rect()
        paint.getTextBounds(displayVal, 0, displayVal.length, bounds)
        val x = size / 2f
        val y = size / 2f + bounds.height() / 2f - bounds.bottom

        canvas.drawText(displayVal, x, y, paint)
        return bitmap
    }

    // ── Drawing ──────────────────────────────────────────────────────────────

    private fun drawCircle(
        glucoseMmol: Float,
        trend:       Int,
        displayMmol: Boolean,
        circleColor: Int,
    ): Bitmap {
        val size   = BITMAP_SIZE
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        // Transparent background
        canvas.drawColor(Color.TRANSPARENT)

        // Filled circle
        val circlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = circleColor
            style = Paint.Style.FILL
        }
        val cx = size / 2f
        val cy = size / 2f
        val r  = size / 2f - 4f
        canvas.drawCircle(cx, cy, r, circlePaint)

        // Prepare display value
        val displayVal = when {
            glucoseMmol <= 0f -> "--"
            displayMmol       -> String.format("%.1f", glucoseMmol)
            else              -> (glucoseMmol * 18.0182f).toInt().toString()
        }
        val trendArrow = TREND_ARROWS[trend] ?: "→"

        // Glucose number — large, bold, centred
        val numPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color     = Color.WHITE
            typeface  = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textSize  = size * 0.30f
            textAlign = Paint.Align.CENTER
        }
        // Trend arrow — smaller, below number
        val arrowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color     = Color.WHITE
            typeface  = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textSize  = size * 0.18f
            textAlign = Paint.Align.CENTER
        }

        // Vertical centre: number sits slightly above centre, arrow below
        val numBounds  = android.graphics.Rect()
        numPaint.getTextBounds(displayVal, 0, displayVal.length, numBounds)
        val numH   = numBounds.height().toFloat()
        val gap    = size * 0.04f
        val totalH = numH + gap + arrowPaint.textSize
        val numY   = cy - totalH / 2f + numH
        val arrowY = numY + gap + arrowPaint.textSize

        canvas.drawText(displayVal, cx, numY, numPaint)
        canvas.drawText(trendArrow, cx, arrowY, arrowPaint)

        return bitmap
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun resolveColor(
        val_:     Float,
        critLow:  Float,
        warnLow:  Float,
        warnHigh: Float,
        critHigh: Float,
    ): Int = when {
        val_ <= 0f                          -> COLOR_WAITING
        val_ < critLow || val_ > critHigh   -> COLOR_CRITICAL
        val_ < warnLow || val_ > warnHigh   -> COLOR_WARNING
        else                                -> COLOR_IN_RANGE
    }

    private fun stateLabel(
        val_:     Float,
        critLow:  Float,
        warnLow:  Float,
        warnHigh: Float,
        critHigh: Float,
    ): String = when {
        val_ <= 0f          -> "T1D Mate is running"
        val_ < critLow      -> "⚠️ Critical low — act now"
        val_ < warnLow      -> "Low — check and treat"
        val_ > critHigh     -> "⚠️ Critical high — check ketones"
        val_ > warnHigh     -> "Running high"
        else                -> "In range ✓"
    }
}
