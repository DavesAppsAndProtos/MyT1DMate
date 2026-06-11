package com.t1dmate

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class GlucoModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG             = "GlucoModule"
        const val EVENT_NAME      = "GlucoUpdate"
        const val POLL_ALARM_ACTION = "com.t1dmate.ACTION_POLL_ALARM"
        private const val POLL_INTERVAL_MS = 300_000L  // 5 mins
        private var instance: GlucoModule? = null

        /**
         * Schedule the next Doze-safe poll alarm via AlarmManager.
         *
         * Android 12+ (API 31) requires SCHEDULE_EXACT_ALARM permission to call
         * setExactAndAllowWhileIdle. We declare it in the manifest, but if the user
         * has revoked it (or the OEM blocks it), we fall back to setAndAllowWhileIdle
         * which is still Doze-safe but fires within a ~10 min window rather than exactly.
         * For a CGM polling ~every 65s that's fine — the sensor only updates every 5
         * minutes anyway, so a reading is never missed, just slightly delayed.
         *
         * Called from JS (via schedulePollAlarm @ReactMethod) after every successful poll,
         * and from PollAlarmReceiver after it wakes JS to fire.
         */
        fun scheduleNextPollAlarm(context: Context) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, PollAlarmReceiver::class.java).apply {
                action = POLL_ALARM_ACTION
            }
            val pi = PendingIntent.getBroadcast(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val triggerAt = System.currentTimeMillis() + POLL_INTERVAL_MS

            when {
                // Android 12+ — check permission before using exact alarm
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
                    if (am.canScheduleExactAlarms()) {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                        Log.d(TAG, "Exact alarm scheduled in ${POLL_INTERVAL_MS / 1000}s")
                    } else {
                        // Fallback: inexact but still wakes CPU in Doze
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                        Log.w(TAG, "SCHEDULE_EXACT_ALARM not granted — using inexact fallback")
                    }
                }
                // Android 6-11 — exact alarms don't need explicit permission
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M -> {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                    Log.d(TAG, "Exact alarm scheduled in ${POLL_INTERVAL_MS / 1000}s")
                }
                // Pre-Marshmallow fallback (unlikely in practice)
                else -> {
                    am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                    Log.d(TAG, "Alarm scheduled in ${POLL_INTERVAL_MS / 1000}s")
                }
            }
        }

        fun cancelPollAlarm(context: Context) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, PollAlarmReceiver::class.java).apply {
                action = POLL_ALARM_ACTION
            }
            val pi = PendingIntent.getBroadcast(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            am.cancel(pi)
            Log.d(TAG, "Poll alarm cancelled")
        }

        /** Called by PollAlarmReceiver to fire a TriggerPoll event into JS. */
        fun emitTriggerPoll() {
            val inst = instance ?: run {
                Log.w(TAG, "emitTriggerPoll: no GlucoModule instance")
                return
            }
            inst.reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("TriggerPoll", null)
            Log.d(TAG, "TriggerPoll emitted to JS")
        }

        fun emitGlucoseUpdate(glucose: Double, trend: Int, timestamp: Long, direction: String, delta: Double) {
            val inst = instance ?: return
            Log.d(TAG, "emitGlucoseUpdate: glucose=$glucose trend=$trend")
            val params = Arguments.createMap().apply {
                putDouble("glucose",   glucose)
                putInt("trend",        trend)
                putDouble("timestamp", timestamp.toDouble())
                putString("direction", direction)
                putDouble("delta",     delta)
            }
            inst.reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("GlucoUpdate", params)
            Log.d(TAG, "GlucoUpdate emitted to JS")
        }
    }

    private val receiver = GlucoReceiver()
    private var receiverRegistered = false

    init {
        Log.d(TAG, "GlucoModule initialised")
        instance = this
    }

    override fun getName(): String = "GlucoModule"

    // ── Session 25: AlarmManager-based poll scheduling ────────────────────────

    /**
     * Schedule the next Doze-safe poll alarm.
     * JS calls this after every successful poll() instead of relying on setInterval.
     * The alarm fires PollAlarmReceiver → emits TriggerPoll → JS runs poll().
     */
    @ReactMethod
    fun schedulePollAlarm() {
        scheduleNextPollAlarm(reactContext)
    }

    /**
     * Cancel the pending poll alarm.
     * JS calls this on unmount / service stop so alarms don't accumulate.
     */
    @ReactMethod
    fun cancelPollAlarm() {
        cancelPollAlarm(reactContext)
    }

    // ── Session 23: Foreground service start/stop ─────────────────────────────

    /**
     * Start the GlucoseForegroundService.
     * Called from App.js on mount (after POST_NOTIFICATIONS permission granted).
     * The service shows a persistent notification and holds the foreground slot
     * so Android cannot freeze the JS polling loop when the app is backgrounded.
     */
    @ReactMethod
    fun startForegroundService() {
        try {
            val intent = Intent(reactContext, GlucoseForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            Log.d(TAG, "GlucoseForegroundService start requested")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start GlucoseForegroundService", e)
        }
    }

    /**
     * Stop the GlucoseForegroundService.
     * Called from App.js on unmount (cleanup only — not expected in normal use).
     */
    @ReactMethod
    fun stopForegroundService() {
        try {
            val intent = Intent(reactContext, GlucoseForegroundService::class.java)
            reactContext.stopService(intent)
            Log.d(TAG, "GlucoseForegroundService stop requested")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop GlucoseForegroundService", e)
        }
    }

    /**
     * Session 23: Update the persistent glucose notification from JS.
     *
     * Called by App.js on every LibreLinkUp poll tick so the notification
     * always reflects the latest reading without the service doing any
     * network work itself.
     *
     * @param params  ReadableMap with keys:
     *   glucose     Double  — mmol/L (0 = no data)
     *   trend       Int     — 1-7 mapped trend from LibreLinkUpService
     *   direction   String  — "Flat", "SingleUp", etc.
     *   displayMmol Boolean — true = show mmol/L, false = mg/dL
     *   critLow     Double  — user threshold (mmol/L)
     *   warnLow     Double  — user threshold (mmol/L)
     *   warnHigh    Double  — user threshold (mmol/L)
     *   critHigh    Double  — user threshold (mmol/L)
     */
    @ReactMethod
    fun updateGlucoseNotification(params: ReadableMap) {
        try {
            val glucose     = params.getDouble("glucose").toFloat()
            val trend       = params.getInt("trend")
            val direction   = if (params.hasKey("direction")) params.getString("direction") ?: "Flat" else "Flat"
            val displayMmol = if (params.hasKey("displayMmol")) params.getBoolean("displayMmol") else true
            val critLow     = if (params.hasKey("critLow"))  params.getDouble("critLow").toFloat()  else 3.0f
            val warnLow     = if (params.hasKey("warnLow"))  params.getDouble("warnLow").toFloat()  else 3.9f
            val warnHigh    = if (params.hasKey("warnHigh")) params.getDouble("warnHigh").toFloat() else 10.0f
            val critHigh    = if (params.hasKey("critHigh")) params.getDouble("critHigh").toFloat() else 13.9f

            GlucoseForegroundService.updateNotification(
                valueMmol   = glucose,
                trend       = trend,
                direction   = direction,
                displayMmol = displayMmol,
                critLow     = critLow,
                warnLow     = warnLow,
                warnHigh    = warnHigh,
                critHigh    = critHigh,
            )
        } catch (e: Exception) {
            Log.e(TAG, "updateGlucoseNotification failed: ${e.message}", e)
        }
    }

    // ── Legacy GDH broadcast listener (retained, not used for LLU) ───────────

    @ReactMethod
    fun startListening() {
        Log.d(TAG, "startListening called, registered=$receiverRegistered")
        if (receiverRegistered) return
        try {
            val filter = IntentFilter().apply {
                addAction(GlucoReceiver.ACTION)
                addAction("de.michelinside.glucodatahandler.action_new_value")
                addAction("de.michelinside.glucodatahandler.BROADCAST")
                addAction("de.michelinside.glucodatahandler.NEW_VALUE")
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(receiver, filter, ReactApplicationContext.RECEIVER_EXPORTED)
            } else {
                reactContext.registerReceiver(receiver, filter)
            }
            receiverRegistered = true
            Log.d(TAG, "GlucoReceiver registered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register GlucoReceiver", e)
        }
    }

    @ReactMethod
    fun stopListening() {
        if (!receiverRegistered) return
        try {
            reactContext.unregisterReceiver(receiver)
            receiverRegistered = false
            Log.d(TAG, "GlucoReceiver unregistered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister", e)
        }
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
