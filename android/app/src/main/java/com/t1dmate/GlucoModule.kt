package com.t1dmate

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.TimeUnit

class GlucoModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG        = "GlucoModule"
        const val EVENT_NAME = "GlucoUpdate"
        private var instance: GlucoModule? = null

        /**
         * Schedule the WorkManager periodic heartbeat.
         *
         * S26: Replaces scheduleNextPollAlarm() / AlarmManager entirely.
         *
         * WorkManager's PeriodicWorkRequest fires PollHeartbeatWorker every
         * HEARTBEAT_INTERVAL_MIN minutes (15 — OS minimum). This is the
         * overnight safety net ensuring the poll chain can never be dead for
         * more than ~15 minutes regardless of Doze, OEM battery killers, or
         * Binder IPC failures.
         *
         * ExistingPeriodicWorkPolicy.KEEP means if a heartbeat is already
         * scheduled (e.g. JS called scheduleHeartbeat twice), the existing
         * request is left in place — no duplicate workers, no drift.
         *
         * No permissions required. WorkManager handles Doze internally via
         * JobScheduler — no AlarmManager, no SCHEDULE_EXACT_ALARM, no Binder.
         */
        fun scheduleHeartbeat(context: Context) {
            val request = PeriodicWorkRequestBuilder<PollHeartbeatWorker>(
                HEARTBEAT_INTERVAL_MIN, TimeUnit.MINUTES
            ).addTag(PollHeartbeatWorker.HEARTBEAT_TAG).build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PollHeartbeatWorker.HEARTBEAT_TAG,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
            Log.d(TAG, "WorkManager heartbeat scheduled every ${HEARTBEAT_INTERVAL_MIN} min")
        }

        fun cancelHeartbeat(context: Context) {
            WorkManager.getInstance(context)
                .cancelUniqueWork(PollHeartbeatWorker.HEARTBEAT_TAG)
            Log.d(TAG, "WorkManager heartbeat cancelled")
        }

        /** Called by PollHeartbeatWorker to fire a TriggerPoll event into JS. */
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

        private const val HEARTBEAT_INTERVAL_MIN = 15L
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
     * Schedule the WorkManager periodic heartbeat.
     * JS calls this once on service start — not after every poll.
     * WorkManager is self-sustaining once scheduled: unlike the old AlarmManager
     * chain, there is no per-poll rescheduling and no Binder IPC on each cycle.
     */
    @ReactMethod
    fun scheduleHeartbeat() {
        scheduleHeartbeat(reactContext)
    }

    /**
     * Cancel the WorkManager heartbeat.
     * JS calls this on unmount / LLU disconnect so the worker doesn't fire
     * when there are no credentials to poll with.
     */
    @ReactMethod
    fun cancelHeartbeat() {
        cancelHeartbeat(reactContext)
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
