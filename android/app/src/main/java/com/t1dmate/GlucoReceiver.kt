package com.t1dmate

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class GlucoReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "GlucoReceiver"
        const val ACTION = "de.michelinside.glucodatahandler.ACTION_NEW_VALUE"
    }

    override fun onReceive(context: Context, intent: Intent?) {
        Log.d(TAG, "onReceive fired! action=${intent?.action}")

        if (intent == null) {
            Log.w(TAG, "intent is null")
            return
        }
        if (intent.action != ACTION) {
            Log.w(TAG, "unexpected action=${intent.action}")
            return
        }

        try {
            // Log ALL top-level extras keys
            val rawExtras = intent.extras
            if (rawExtras != null) {
                Log.d(TAG, "top-level extras keys = ${rawExtras.keySet()}")
            } else {
                Log.w(TAG, "top-level extras is null")
            }

            val extras = intent.getBundleExtra("glucoExtras")
            if (extras == null) {
                Log.w(TAG, "glucoExtras bundle is null — trying top-level extras directly")
                // Some GDH versions put values directly in intent extras
                val glucose = rawExtras?.getDouble("glucose", -1.0) ?: -1.0
                val trend = rawExtras?.getInt("trend", 0) ?: 0
                val timestamp = rawExtras?.getLong("time", 0L) ?: 0L
                Log.d(TAG, "top-level: glucose=$glucose trend=$trend")
                if (glucose > 0) GlucoModule.emitGlucoseUpdate(glucose, trend, timestamp, "Flat", 0.0)
                return
            }

            Log.d(TAG, "glucoExtras keys = ${extras.keySet()}")

            val glucose = extras.getDouble("glucose", -1.0)
            val trend = extras.getInt("trend", 0)
            val timestamp = extras.getLong("time", 0L)

            Log.d(TAG, "parsed: glucose=$glucose trend=$trend timestamp=$timestamp")
            GlucoModule.emitGlucoseUpdate(glucose, trend, timestamp, "Flat", 0.0)

        } catch (e: Exception) {
            Log.e(TAG, "Error processing GDH broadcast", e)
        }
    }
}
