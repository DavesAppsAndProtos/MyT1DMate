package com.t1dmate

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log

/**
 * My T1D Mate — GlucoDbHelper
 * Session 8 (new file).
 *
 * A plain android.database.sqlite helper that writes glucose readings
 * to the same T1DMate.db file that react-native-sqlite-storage uses.
 *
 * WHY: When the app is backgrounded or closed the JS bridge is dead,
 * so GlucosePanel.js can no longer call saveGlucoseReading(). This
 * helper lets GlucoseForegroundService write directly to SQLite from
 * the native side so the database fills even while the app is closed.
 *
 * SCHEMA: mirrors glucose_readings as defined in db.js —
 *   id          INTEGER PK AUTOINCREMENT
 *   timestamp   INTEGER  UNIQUE  (epoch ms)
 *   glucose     REAL             (mmol/L)
 *   trend       INTEGER          (1-7)
 *   direction   TEXT
 *   delta       REAL
 *   recorded_at TEXT             (ISO-8601)
 *
 * The table is created here with CREATE TABLE IF NOT EXISTS so both
 * this helper and react-native-sqlite-storage are safe to run first.
 *
 * 90-day retention is enforced on every write (same policy as db.js).
 *
 * THREAD SAFETY: saveReading() is called from GlucoseForegroundService's
 * background thread. SQLiteDatabase handles its own locking; no extra
 * synchronisation needed for single-writer use.
 */
class GlucoDbHelper(context: Context) :
    SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

    companion object {
        private const val TAG        = "GlucoDbHelper"
        private const val DB_NAME    = "T1DMate.db"
        private const val DB_VERSION = 1   // must match or exceed rnss version

        private const val TABLE      = "glucose_readings"
        private const val NINETY_DAYS_MS = 90L * 24 * 60 * 60 * 1000
    }

    override fun onCreate(db: SQLiteDatabase) {
        // react-native-sqlite-storage creates this table first in practice,
        // but we guard with IF NOT EXISTS so either order is fine.
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS $TABLE (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp   INTEGER NOT NULL UNIQUE,
                glucose     REAL    NOT NULL,
                trend       INTEGER NOT NULL DEFAULT 4,
                direction   TEXT    NOT NULL DEFAULT 'Flat',
                delta       REAL    NOT NULL DEFAULT 0.0,
                recorded_at TEXT    NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE INDEX IF NOT EXISTS idx_glucose_timestamp
            ON $TABLE (timestamp DESC)
        """.trimIndent())
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Nothing to migrate at version 1. Add migration steps here when needed.
    }

    /**
     * Write a single glucose reading.
     * Uses INSERT OR IGNORE so duplicate timestamps are silently dropped.
     * Prunes rows older than 90 days after every write.
     *
     * @param timestamp   epoch ms (GDH "datetime" field)
     * @param glucoseMmol already converted from mg/dL by the caller
     * @param trend       1-7 Nightscout trend integer
     * @param direction   "Flat", "SingleUp", etc.
     * @param delta       bgdelta from GDH
     */
    fun saveReading(
        timestamp:   Long,
        glucoseMmol: Double,
        trend:       Int,
        direction:   String,
        delta:       Double,
    ) {
        if (timestamp <= 0 || glucoseMmol <= 0) {
            Log.w(TAG, "saveReading: invalid data — skipped (ts=$timestamp g=$glucoseMmol)")
            return
        }

        val db = writableDatabase
        try {
            val cv = ContentValues().apply {
                put("timestamp",   timestamp)
                put("glucose",     glucoseMmol)
                put("trend",       trend)
                put("direction",   direction)
                put("delta",       delta)
                put("recorded_at", java.time.Instant.now().toString())
            }
            val rowId = db.insertWithOnConflict(TABLE, null, cv, SQLiteDatabase.CONFLICT_IGNORE)

            if (rowId == -1L) {
                Log.d(TAG, "Duplicate timestamp $timestamp — skipped (expected)")
            } else {
                Log.d(TAG, "Saved reading: ts=$timestamp glucose=${String.format("%.1f", glucoseMmol)} mmol/L")
            }

            // Prune old readings — same 90-day retention as db.js
            val cutoff = System.currentTimeMillis() - NINETY_DAYS_MS
            val pruned = db.delete(TABLE, "timestamp < ?", arrayOf(cutoff.toString()))
            if (pruned > 0) Log.d(TAG, "Pruned $pruned readings older than 90 days")

        } catch (e: Exception) {
            Log.e(TAG, "saveReading failed: ${e.message}", e)
        }
        // Note: do NOT close writableDatabase here — SQLiteOpenHelper manages the
        // connection lifecycle. Closing after each write causes crashes on re-open.
    }
}
