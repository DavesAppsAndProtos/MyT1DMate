package com.t1dmate

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * My T1D Mate — PollAlarmReceiver
 * Session 25: Replaces JS setInterval for the glucose poll cadence.
 *
 * AlarmManager fires this receiver via setExactAndAllowWhileIdle, which wakes
 * the CPU even in Doze mode. The receiver emits a "TriggerPoll" event into JS
 * so LibreLinkUpService.js can run poll(). JS then calls schedulePollAlarm()
 * after a successful poll to chain the next alarm.
 *
 * Why this instead of setInterval:
 *   Android's Doze mode can throttle or freeze JS timers in a backgrounded RN
 *   app even when a foreground service is running. setExactAndAllowWhileIdle is
 *   the system-level mechanism specifically designed to guarantee wakeups at
 *   an approximate interval in Doze. The 9-minute Doze floor does NOT apply
 *   when a foreground service is active — we get our full 65 s cadence.
 *
 * Registered in AndroidManifest.xml:
 *   <receiver android:name=".PollAlarmReceiver" android:exported="false" />
 */
class PollAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != GlucoModule.POLL_ALARM_ACTION) return

        Log.d(TAG, "Poll alarm fired — emitting TriggerPoll to JS")

        // Emit TriggerPoll event into JS. JS poll() will call schedulePollAlarm()
        // on success to chain the next alarm. If JS is not ready (race on startup),
        // scheduleNextPollAlarm here as a fallback so we don't lose the cadence.
        val emitted = tryEmitToJs()
        if (!emitted) {
            Log.w(TAG, "JS not ready — scheduling next alarm directly from receiver")
            GlucoModule.scheduleNextPollAlarm(context)
        }
    }

    private fun tryEmitToJs(): Boolean {
        return try {
            GlucoModule.emitTriggerPoll()
            true
        } catch (e: Exception) {
            Log.e(TAG, "emitTriggerPoll failed: ${e.message}")
            false
        }
    }

    companion object {
        const val TAG = "PollAlarmReceiver"
    }
}
