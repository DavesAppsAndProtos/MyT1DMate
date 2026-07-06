package com.t1dmate

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
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
 *
 * Session 26 — two additions:
 *
 *   5-minute poll Handler:
 *     A native Kotlin Handler loop (postDelayed on main looper) fires
 *     GlucoModule.emitTriggerPoll() every POLL_INTERVAL_MS (5 min).
 *     Runs entirely in the foreground service process — independent of JS
 *     timers, setInterval, and AlarmManager. Cannot be frozen by Doze
 *     while the service holds its foreground notification slot.
 *     WorkManager (15-min heartbeat) remains the safety net underneath.
 *
 *   Stale notification:
 *     A second Handler checks every STALE_CHECK_MS (1 min) whether the
 *     last successful poll was more than STALE_THRESHOLD_MS (5 min) ago.
 *     If stale: notification goes slate grey (#64748B), title shows
 *     "No data · ?" and the status bar bitmap draws "?" via
 *     LockScreenIconService.drawStatusBarBitmap(0f, ...).
 *     This gives an immediate visual signal at 3am without needing to
 *     open the app — grey + "?" means something is wrong.
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

        // S26: Handler cadence constants
        private const val POLL_INTERVAL_MS   = 5 * 60 * 1000L   // 5 min — native poll loop
        private const val STALE_CHECK_MS     = 60 * 1000L        // 1 min — staleness check cadence
        private const val STALE_THRESHOLD_MS = 5 * 60 * 1000L   // 5 min — stale if no update in 5 min

        // Singleton reference so GlucoModule can call updateNotification()
        // without needing a Context or Intent round-trip.
        @Volatile private var instance: GlucoseForegroundService? = null

        // Timestamp of last successful notification update from JS poll.
        // Written by updateNotification(), read by stale checker.
        @Volatile var lastUpdateMs: Long = 0L

        /**
         * Called by GlucoModule.updateGlucoseNotification() on every JS poll tick.
         * Safe to call from any thread — NotificationManager is thread-safe.
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
            lastUpdateMs = System.currentTimeMillis()

            // Per HDJim_v20: publish to GlucoseStateHolder + notify any
            // observers (e.g. Auto's GlucoseMediaService) on every
            // successful poll tick, same trigger as the notification update
            // below. This is the hub write — main app is the single source
            // of truth, consumers (Auto, future watch app) only ever read.
            GlucoseStateHolder.update(
                valueMmol = valueMmol,
                trend = trend,
                timestampMs = lastUpdateMs,
                unit = if (displayMmol) "mmol" else "mgdl",
            )
            GlucoseStateProvider.notifyChanged(svc)

            svc.doUpdateNotification(valueMmol, trend, direction, displayMmol,
                critLow, warnLow, warnHigh, critHigh)
        }
    }

    // ── S26: Handler fields ───────────────────────────────────────────────────

    // Single Handler on main looper — safe for both Runnables below.
    // The main looper is kept alive by the foreground service, so these
    // Runnables survive backgrounding as long as the service is running.
    private val handler = Handler(Looper.getMainLooper())

    // Fires every POLL_INTERVAL_MS — emits TriggerPoll to JS.
    // This is the primary 5-minute poll driver when app is backgrounded.
    // WorkManager (15-min heartbeat) is the safety net if this stalls.
    //
    // S26 RCA v2: dumpsys confirmed the foreground service stayed alive for
    // 17h (isForeground=true, never killed) but lastActivity was 6h49m stale —
    // the service was a healthy shell holding stale UI state. The Handler's
    // recursive postDelayed chain had silently died inside it.
    //
    // Root cause: postDelayed(this, ...) was the LAST line of run(), outside
    // the try/catch. Any throw — including from postDelayed itself, or from
    // anything after the catch block — meant the Runnable never rescheduled.
    // One single failure, anywhere, permanently ended the chain with no log
    // line marking the death. Same class of bug as the original AlarmManager
    // try/finally fix, but this time inside the Handler loop itself.
    //
    // Fix: entire run() body wrapped in try/finally. postDelayed lives in
    // finally — it is now genuinely unconditional, guaranteed to execute
    // regardless of what happens above it, exactly like the poll() fix.
    private val pollRunnable: Runnable = object : Runnable {
        override fun run() {
            try {
                Log.d(TAG, "Native poll loop firing — emitting TriggerPoll")
                GlucoModule.emitTriggerPoll()
            } catch (e: Throwable) {
                Log.e(TAG, "pollRunnable: emitTriggerPoll failed (${e.javaClass.simpleName}: ${e.message})")
            } finally {
                // Unconditional reschedule — this is the actual fix.
                // No code path through run() can skip this line.
                try {
                    handler.postDelayed(this, POLL_INTERVAL_MS)
                } catch (e: Throwable) {
                    // If postDelayed itself throws (e.g. looper in a bad state),
                    // there is genuinely nothing more this Handler can do.
                    // WorkManager heartbeat remains the safety net.
                    Log.e(TAG, "pollRunnable: postDelayed reschedule FAILED — loop will not continue: ${e.message}")
                }
            }
        }
    }

    // Fires every STALE_CHECK_MS — checks if last update is older than
    // STALE_THRESHOLD_MS. If stale, updates notification to grey + "?".
    // Resets automatically when the next successful poll updates lastUpdateMs.
    //
    // S26 RCA v2: same fix pattern as pollRunnable above — showStaleNotification()
    // was unguarded and postDelayed was the last line. Any throw in either
    // would silently kill this loop too, taking down the safety net that's
    // meant to surface pollRunnable's failure in the first place.
    private val staleRunnable: Runnable = object : Runnable {
        override fun run() {
            try {
                val now = System.currentTimeMillis()
                val sinceLastUpdate = now - lastUpdateMs
                if (lastUpdateMs > 0L && sinceLastUpdate > STALE_THRESHOLD_MS) {
                    Log.w(TAG, "Stale detected — ${sinceLastUpdate / 1000}s since last update — showing grey notification")
                    showStaleNotification()
                }
            } catch (e: Throwable) {
                Log.e(TAG, "staleRunnable: check/notify failed (${e.javaClass.simpleName}: ${e.message})")
            } finally {
                try {
                    handler.postDelayed(this, STALE_CHECK_MS)
                } catch (e: Throwable) {
                    Log.e(TAG, "staleRunnable: postDelayed reschedule FAILED — stale checker will not continue: ${e.message}")
                }
            }
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
            isStale     = false,
        ))

        // S26: Start the native poll loop.
        // First fire after POLL_INTERVAL_MS — JS fires poll() immediately on
        // mount so we don't need an immediate native poll here.
        handler.postDelayed(pollRunnable, POLL_INTERVAL_MS)

        // S26: Start the staleness checker.
        // Begins checking after STALE_CHECK_MS (1 min), giving JS time to
        // complete the first poll before we could falsely trigger stale state.
        handler.postDelayed(staleRunnable, STALE_CHECK_MS)

        Log.d(TAG, "Service started — poll loop and stale checker running")
        return START_STICKY
    }

    override fun onDestroy() {
        // S26: Cancel both Handlers cleanly on service stop.
        handler.removeCallbacks(pollRunnable)
        handler.removeCallbacks(staleRunnable)
        instance = null
        Log.d(TAG, "Service destroyed — Handlers cancelled")
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
            isStale = false,
        ))
        Log.d(TAG, "Notification updated: ${String.format("%.1f", valueMmol)} mmol/L trend=$trend")
    }

    // S26: Called by staleRunnable when no update received for > STALE_THRESHOLD_MS.
    // Shows slate grey notification with "No data · ?" — immediately visible
    // signal that the poll chain has stalled without needing to open the app.
    // Automatically replaced by the next successful doUpdateNotification() call.
    private fun showStaleNotification() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, buildNotification(
            valueMmol   = 0f,
            trend       = 4,
            direction   = "Flat",
            displayMmol = true,
            critLow     = DEFAULT_CRITICAL_LOW,
            warnLow     = DEFAULT_WARNING_LOW,
            warnHigh    = DEFAULT_WARNING_HIGH,
            critHigh    = DEFAULT_CRITICAL_HIGH,
            isStale     = true,
        ))
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
        isStale:     Boolean = false,
    ): Notification {

        // S26: stale state overrides everything — grey colour, "?" status bar,
        // "No data" title. Instantly communicable at 3am without reading specs.
        if (isStale) {
            val staleIcon = try {
                // Pass 0f to drawStatusBarBitmap — it draws "?" for <= 0f values
                val bm = LockScreenIconService.drawStatusBarBitmap(0f, displayMmol)
                IconCompat.createWithBitmap(bm)
            } catch (e: Exception) {
                IconCompat.createWithResource(this, R.drawable.ic_notification)
            }
            return NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("No data · ?")
                .setSmallIcon(staleIcon)
                .setColor(0xFF64748B.toInt())   // slate grey — #64748B
                .setColorized(true)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()
        }

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
