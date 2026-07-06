package com.t1dmate

/**
 * Holds the current glucose state in memory and is the single write path
 * for GlucoseStateProvider's query() results.
 *
 * Deliberately framed as "current glucose state for any consumer app", not
 * "the Auto bridge" — Sarah/Dave's call before this was built: the main
 * app is the hub, Auto is the first consumer, a watch app is a likely
 * second one. Nothing here is car-specific; it's just the latest reading
 * plus a notify-on-change hook. Whatever consumes it (car screen, watch
 * face, anything else later) decides what to do with the value.
 */
object GlucoseStateHolder {

    data class State(
        val valueMmol: Float,
        val trend: Int,       // raw 1-7 LLU TrendArrow scale — see LibreLinkUpService for mapping
        val timestampMs: Long, // when this state was last updated
        val unit: String,      // "mmol" | "mgdl" — current display preference
    )

    @Volatile private var current: State? = null

    fun update(valueMmol: Float, trend: Int, timestampMs: Long, unit: String) {
        current = State(valueMmol, trend, timestampMs, unit)
    }

    fun current(): State? = current
}
