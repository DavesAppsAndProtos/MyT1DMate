package com.t1dmate

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

/**
 * My T1D Mate — PollHeartbeatWorker
 * Session 26: Replaces the AlarmManager + PollAlarmReceiver chain.
 *
 * Why WorkManager instead of AlarmManager:
 *   AlarmManagerService was throwing RemoteException over Binder IPC under Doze,
 *   killing the poll chain silently overnight (confirmed in Sentry — multiple
 *   events, RCA confirmed). try/catch(Throwable) still didn't catch it because
 *   the exception was thrown on the system server side of the Binder.
 *
 *   WorkManager uses JobScheduler under the hood, which has OS-level scheduling
 *   guarantees that AlarmManager does not. It:
 *     - Survives Doze without SCHEDULE_EXACT_ALARM permission
 *     - Survives process death and app restart
 *     - Handles retries natively if the worker fails
 *     - Never touches AlarmManager, so the Binder IPC exception path is gone
 *
 * Architecture:
 *   WorkManager fires this CoroutineWorker on a 15-minute periodic schedule
 *   (15 min is the OS minimum for periodic work). This is the overnight safety
 *   net — worst case staleness overnight is 20 minutes (15 min WorkManager
 *   window + 5 min sensor update interval). Clinically acceptable for a sleeping
 *   user per Dave's confirmation (S26).
 *
 *   Active (screen-on) polling cadence is unchanged — JS poll loop + AppState
 *   resume trigger handle real-time display. WorkManager is purely the heartbeat
 *   that guarantees the chain can never die for more than 15 minutes overnight.
 *
 * When this worker fires:
 *   1. Emits "TriggerPoll" event to JS via GlucoModule
 *   2. JS LibreLinkUpService.poll() runs, writes last_poll_timestamp to SQLite
 *   3. JS staleness watchdog on AppState 'active' provides morning recovery
 *
 * Scheduled by GlucoModule.scheduleHeartbeat(), called from JS on service start.
 * Cancelled by GlucoModule.cancelHeartbeat(), called from JS on service stop.
 *
 * Work tag: HEARTBEAT_TAG — used for cancellation and deduplication.
 * WorkManager ensures only one periodic request with this tag is ever active.
 */
class PollHeartbeatWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        Log.d(TAG, "Heartbeat fired — emitting TriggerPoll to JS")
        return try {
            GlucoModule.emitTriggerPoll()
            Log.d(TAG, "TriggerPoll emitted successfully")
            Result.success()
        } catch (e: Throwable) {
            // GlucoModule instance may not be ready yet (race on process restart).
            // Return retry — WorkManager will back off and try again.
            // The JS watchdog on next foreground resume is the primary recovery path.
            Log.e(TAG, "emitTriggerPoll failed — scheduling retry: ${e.message}")
            Result.retry()
        }
    }

    companion object {
        const val TAG           = "PollHeartbeatWorker"
        const val HEARTBEAT_TAG = "poll_heartbeat"
    }
}
