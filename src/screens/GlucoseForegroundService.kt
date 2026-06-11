package com.t1dmate

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.graphics.drawable.IconCompat

/**
 * My T1D Mate — GlucoseForegroundService
 * Session 23: Rearchitected for LibreLinkUp (Option A).
 *
 * Previous versions polled GlucoDataHandler's local HTTP endpoint
 * (127.0.0.1:17580/pebble). That is now gone — all LLU auth and polling
 * lives in useLibreLinkUpService (JS). This service has one job:
 *
 *   Hold a persistent foreground notification slot so Android cannot
 *   freeze the JS polling loop when the app is backgrounded.
 *
 * Notification content is driven entirely from JS via
 * GlucoModule.updateGlucoseNotification(), which calls updateNotification()
 * below on every poll tick. The service itself never makes a network call.
 *
 * Two notification channels (unchanged from previous sessions):
 *   GlucoseMonitorChannel   — IMPORTANCE_LOW  — persistent ongoing banner
 *   LockScreenGlucoseChannel— IMPORTANCE_HIGH — large icon on lock screen
 *                             (managed by LockScreenIconService)
 *
 * Android 13+ POST_NOTIFICATIONS permission is requested from JS (App.js)
 * on first launch. See AndroidManifest for service declaration.
 */
class GlucoseForegroundService : Service() {

    companion object {
        const val TAG              = "GlucoseForegroundService"
        private const val CHANNEL_ID  = "GlucoseMonitorChannel"
        private const val NOTIF_ID    = 1001
        private const val MMOL_TO_MGDL = 18.0182f

        private const val DEFAULT_CRITICAL_LOW  = 3.0f
        private const val DEFAULT_WARNING_LOW   = 3.9f
        private const val DEFAULT_WARNING_HIGH  = 10.0f
        private const val DEFAULT_CRITICAL_HIGH = 13.9f

        // Singleton reference so GlucoModule can call updateNotification()
        // without needing a Context or Intent round-trip.
        @Volatile private var instance: GlucoseForegroundService? = null

        /**
         * Called by GlucoModule.updateGlucoseNotification() on every JS poll tick.
         * Safe to call from any thread — NotificationManager is thread-safe.
         *
         * @param valueMmol  glucose in mmol/L (0 = no data yet)
         * @param trend      1-7 mapped trend integer from LibreLinkUpService
         * @param direction  "Flat", "SingleUp", etc.
         * @param displayMmol true = mmol/L display, false = mg/dL
         * @param critLow    user threshold (mmol/L)
         * @param warnLow    user threshold (mmol/L)
         * @param warnHigh   user threshold (mmol/L)
         * @param critHigh   user threshold (mmol/L)
         */
        fun updateNotification(
            valueMmol:   Float,
            trend:       Int,
            direction:   String  = "Flat",
            displayMmol: Boolean = true,
            critLow:     Float   = DEFAULT_CRITICAL_LOW,
            warnLow:     Float   = DEFAULT_WARNING_LOW,
            warnHigh:    Float   = DEFAULT_WARNING_HIGH,
            critHigh:    Float   = DEFAULT_CRITICAL_HIGH,
        ) {
            val svc = instance ?: run {
                Log.w(TAG, "updateNotification called before service started — ignored")
                return
            }
            svc.doUpdateNotification(valueMmol, trend, direction, displayMmol,
                critLow, warnLow, warnHigh, critHigh)
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()
        Log.d(TAG, "Service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Show the initial "waiting" notification immediately so Android sees
        // this as a foreground service before any JS poll data arrives.
        startForeground(NOTIF_ID, buildNotification(
            valueMmol   = 0f,
            trend       = 4,
            direction   = "Flat",
            displayMmol = true,
            critLow     = DEFAULT_CRITICAL_LOW,
            warnLow     = DEFAULT_WARNING_LOW,
            warnHigh    = DEFAULT_WARNING_HIGH,
            critHigh    = DEFAULT_CRITICAL_HIGH,
        ))
        Log.d(TAG, "Service started — waiting for JS poll data")
        return START_STICKY
    }

    override fun onDestroy() {
        instance = null
        Log.d(TAG, "Service destroyed")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Notification update (called from companion via GlucoModule) ───────────

    private fun doUpdateNotification(
        valueMmol:   Float,
        trend:       Int,
        direction:   String,
        displayMmol: Boolean,
        critLow:     Float,
        warnLow:     Float,
        warnHigh:    Float,
        critHigh:    Float,
    ) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotification(
            valueMmol, trend, direction, displayMmol,
            critLow, warnLow, warnHigh, critHigh,
        ))

        Log.d(TAG, "Notification updated: ${String.format("%.1f", valueMmol)} mmol/L trend=$trend")
    }

    // ── Notification builder ──────────────────────────────────────────────────

    private fun buildNotification(
        valueMmol:   Float,
        trend:       Int,
        direction:   String,
        displayMmol: Boolean,
        critLow:     Float,
        warnLow:     Float,
        warnHigh:    Float,
        critHigh:    Float,
    ): Notification {

        // Session 27: Dave's softer clinical palette — matches JS layer exactly.
        // critHigh is orange (not red) to distinguish high from low at a glance.
        val color = when {
            valueMmol == 0f      -> 0xFF64748B.toInt()  // slate  — waiting
            valueMmol < critLow  -> 0xFFcc3232.toInt()  // red    — critical low
            valueMmol < warnLow  -> 0xFFe7b416.toInt()  // amber  — warning low
            valueMmol > critHigh -> 0xFFdb7b2b.toInt()  // orange — critical high
            valueMmol > warnHigh -> 0xFFe7b416.toInt()  // amber  — warning high
            else                 -> 0xFF99c140.toInt()  // green  — in range
        }

        // Trend arrows — 1-7 mapped scale from LibreLinkUpService TREND_MAP
        val trendArrow = when (trend) {
            1 -> "↓↓"
            2 -> "↓"
            3 -> "↘"
            4 -> "→"
            5 -> "↗"
            6 -> "↑"
            7 -> "↑↑"
            else -> "→"
        }

        val displayValue: String
        val unitLabel: String
        when {
            valueMmol == 0f -> {
                displayValue = "--"
                unitLabel    = if (displayMmol) "mmol/L" else "mg/dL"
            }
            displayMmol -> {
                displayValue = String.format("%.1f", valueMmol)
                unitLabel    = "mmol/L"
            }
            else -> {
                displayValue = (valueMmol * MMOL_TO_MGDL).toInt().toString()
                unitLabel    = "mg/dL"
            }
        }

        val title = if (valueMmol == 0f) {
            "Glucose — waiting for reading"
        } else {
            "Glucose: $displayValue $unitLabel $trendArrow".trim()
        }

        val smallIcon = try {
            val statusBitmap = LockScreenIconService.drawStatusBarBitmap(valueMmol, displayMmol)
            IconCompat.createWithBitmap(statusBitmap)
        } catch (e: Exception) {
            Log.w(TAG, "Status bar bitmap failed, using fallback icon: ${e.message}")
            IconCompat.createWithResource(this, R.drawable.ic_notification)
        }

        // Flash LED red on critical low — 500ms on, 1000ms off
        val isCritLow = valueMmol > 0f && valueMmol < critLow

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setSmallIcon(smallIcon)
            .setColor(color)
            .setColorized(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .apply {
                if (isCritLow) setLights(0xFFcc3232.toInt(), 500, 1000)
            }
            .build()
    }

    // ── Channel setup ─────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Glucose Monitor",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Persistent CGM glucose readings — always visible, no sound"
                // Session 27: enable LED flash — colour set per-notification via setLights()
                enableLights(true)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }
}
