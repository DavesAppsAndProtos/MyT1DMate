package com.t1dmate

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log

/**
 * My T1D Mate — GlucoProfileHelper
 * Session 6: Lightweight synchronous SQLite reader for use inside
 * GlucoseForegroundService (which runs on a native thread, not the JS thread).
 *
 * Reads the same T1DMate.db / mate_profile table that db.js writes to.
 * Read-only — never writes.
 */
object GlucoProfileHelper {

    private const val TAG = "GlucoProfileHelper"
    private const val DB_NAME = "T1DMate.db"

    /**
     * Returns a Map<String, String> of all mate_profile field → value pairs.
     * Returns an empty map on any error so the service falls back to defaults.
     */
    fun getProfileSync(context: Context): Map<String, String> {
        return try {
            val helper = object : SQLiteOpenHelper(context, DB_NAME, null, 1) {
                override fun onCreate(db: SQLiteDatabase) {}
                override fun onUpgrade(db: SQLiteDatabase, o: Int, n: Int) {}
            }
            val db = helper.readableDatabase
            val cursor = db.rawQuery("SELECT field, value FROM mate_profile", null)
            val profile = mutableMapOf<String, String>()
            while (cursor.moveToNext()) {
                profile[cursor.getString(0)] = cursor.getString(1)
            }
            cursor.close()
            db.close()
            helper.close()
            Log.d(TAG, "Profile loaded: ${profile.keys.joinToString()}")
            profile
        } catch (e: Exception) {
            Log.w(TAG, "Could not read profile from SQLite", e)
            emptyMap()
        }
    }
}
