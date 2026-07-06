package com.t1dmate

import android.content.ContentProvider
import android.content.ContentValues
import android.content.UriMatcher
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri

/**
 * Exposes "the current glucose state" to any other app signed with the
 * same keystore — not an Auto-specific bridge. My T1D Mate is the hub:
 * it owns the LLU poll loop and is the single source of truth. Consumers
 * (Auto today, a watch app potentially later) only ever read from here.
 *
 * URI: content://com.t1dmate.provider/glucose
 * Columns: value (float, mmol/L), trend (int, raw LLU 1-7 TrendArrow),
 *          timestamp (long, ms epoch), unit ("mmol" | "mgdl")
 *
 * Read access is restricted to apps holding the signature-level
 * com.t1dmate.provider.READ_GLUCOSE permission (declared in this app's
 * manifest and requested by consumers) — enforced by Android, only granted
 * automatically to apps signed with the same keystore. Both apps MUST be
 * signed with the same keystore for this to work.
 *
 * Single row, single table. No insert/update/delete from outside this
 * process — GlucoseStateHolder.update() (called internally by
 * GlucoseForegroundService after every poll) is the only write path.
 * External writes are rejected.
 */
class GlucoseStateProvider : ContentProvider() {

    companion object {
        const val AUTHORITY = "com.t1dmate.provider"
        private const val PATH_GLUCOSE = "glucose"
        private const val CODE_GLUCOSE = 1

        val GLUCOSE_URI: Uri = Uri.parse("content://$AUTHORITY/$PATH_GLUCOSE")

        const val COL_VALUE = "value"
        const val COL_TREND = "trend"
        const val COL_TIMESTAMP = "timestamp"
        const val COL_UNIT = "unit"

        private val uriMatcher = UriMatcher(UriMatcher.NO_MATCH).apply {
            addURI(AUTHORITY, PATH_GLUCOSE, CODE_GLUCOSE)
        }

        /**
         * Called by GlucoseForegroundService after writing a new reading to
         * GlucoseStateHolder, to notify any registered ContentObservers
         * (e.g. Auto's GlucoseMediaService) that new data is available.
         */
        fun notifyChanged(context: android.content.Context) {
            context.contentResolver.notifyChange(GLUCOSE_URI, null)
        }
    }

    override fun onCreate(): Boolean = true

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor? {
        if (uriMatcher.match(uri) != CODE_GLUCOSE) {
            throw IllegalArgumentException("Unknown URI: $uri")
        }

        val state = GlucoseStateHolder.current()
        val cursor = MatrixCursor(arrayOf(COL_VALUE, COL_TREND, COL_TIMESTAMP, COL_UNIT))

        if (state != null) {
            cursor.addRow(arrayOf(state.valueMmol, state.trend, state.timestampMs, state.unit))
        }
        // No row at all if there's no state yet — consumers treat an empty
        // cursor the same as "no data", same semantics as a stale reading.

        cursor.setNotificationUri(context?.contentResolver, GLUCOSE_URI)
        return cursor
    }

    override fun getType(uri: Uri): String? = when (uriMatcher.match(uri)) {
        CODE_GLUCOSE -> "vnd.android.cursor.item/vnd.$AUTHORITY.$PATH_GLUCOSE"
        else -> null
    }

    // Read-only from outside this process — GlucoseStateHolder.update() is
    // the only sanctioned write path, called internally after each poll.
    override fun insert(uri: Uri, values: ContentValues?): Uri? =
        throw UnsupportedOperationException("GlucoseStateProvider is read-only")

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int = throw UnsupportedOperationException("GlucoseStateProvider is read-only")

    override fun delete(
        uri: Uri,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int = throw UnsupportedOperationException("GlucoseStateProvider is read-only")
}
