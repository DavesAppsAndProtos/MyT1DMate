/**
 * My T1D Mate — GlucosePanel
 * Session 10:
 *   - LibreLink scrubber wired: drag on graph → header shows historical reading + timestamp
 *   - Header fades between live reading and scrubbed reading
 *   - Scrub release snaps back to live data
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';
import { saveGlucoseReading, getGlucoseHistory, getProfile } from '../database/db';
import GlucoseGraph from './GlucoseGraph';
import { t } from '../i18n/en';

// Session 27 P1: critLow hardcoded to 3.1 to match LibreLink exactly
const DEFAULT_THRESHOLDS = {
  critLow:  3.1,
  warnLow:  3.9,
  warnHigh: 10.0,
  critHigh: 13.9,
};

// Session 27: Dave's softer clinical palette
// critHigh orange distinguishes high from low — less panic-inducing than all-red
const GLUCOSE_COLORS = {
  critHigh: '#db7b2b',  // orange — critical high
  critLow:  '#cc3232',  // red    — critical low
  warning:  '#e7b416',  // amber  — warn band
  inRange:  '#99c140',  // green  — in range
  waiting:  '#64748B',  // slate  — no data
};

// Rotation angles for the SVG arrow (0° = up, clockwise positive)
// Abbott trend values: 1=FallingQuickly 2=Falling 3=FallingSlowly
//                      4=Stable 5=RisingSlowly 6=Rising 7=RisingQuickly
const TREND_ROTATION = {
  1: 180,   // ↓↓
  2: 180,   // ↓
  3: 135,   // ↘
  4: 90,    // →
  5: 45,    // ↗
  6: 0,     // ↑
  7: 0,     // ↑↑
};

// Double-arrow for fast trends (values 1 and 7)
const TREND_DOUBLE = { 1: true, 7: true };

/**
 * SVG arrow that always renders on Android.
 * Single arrow for slow/stable, double arrow for fast trends.
 */
const TrendArrow = ({ trend }) => {
  const rotation = TREND_ROTATION[trend] ?? 90;
  const isDouble = TREND_DOUBLE[trend] ?? false;
  const size = 32;
  const cx = size / 2;

  const headH = 10;
  const shaftW = 4;
  const shaftTop = headH + 2;
  const shaftBot = size - 4;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: [{ rotate: `${rotation}deg` }] }}
    >
      {/* Arrowhead */}
      <Polygon
        points={`${cx},2 ${cx + 9},${headH + 2} ${cx - 9},${headH + 2}`}
        fill="#1A1A2E"
      />
      {/* Shaft */}
      <Line
        x1={cx} y1={shaftTop} x2={cx} y2={shaftBot}
        stroke="#1A1A2E" strokeWidth={shaftW} strokeLinecap="round"
      />
      {/* Second shaft line for double-arrow (offset left) */}
      {isDouble && (
        <Line
          x1={cx - 7} y1={shaftTop + 4} x2={cx - 7} y2={shaftBot}
          stroke="rgba(26,26,46,0.5)" strokeWidth={3} strokeLinecap="round"
        />
      )}
    </Svg>
  );
};

export const getGlucoseColor = (valueMmol, thresholds = DEFAULT_THRESHOLDS) => {
  if (!valueMmol || valueMmol <= 0) return GLUCOSE_COLORS.waiting;
  const { critLow, warnLow, warnHigh, critHigh } = thresholds;
  if (valueMmol > critHigh) return GLUCOSE_COLORS.critHigh;
  if (valueMmol < critLow)  return GLUCOSE_COLORS.critLow;
  if (valueMmol < warnLow || valueMmol > warnHigh) return GLUCOSE_COLORS.warning;
  return GLUCOSE_COLORS.inRange;
};

const getFreshnessLabel = (timestampMs) => {
  if (!timestampMs) return '';
  const diffMins = Math.floor((Date.now() - timestampMs) / 60000);
  if (diffMins < 1)   return 'just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60)  return `${diffMins} mins ago`;
  return `${Math.floor(diffMins / 60)}h ago`;
};

const getDeltaLabel = (delta) => {
  if (delta == null || delta === 0) return '';
  return `${delta > 0 ? '+' : ''}${Number(delta).toFixed(1)}`;
};

const formatScrubTime = (ms) => {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
};

const MMOL_TO_MGDL = 18.0182;

const toDisplayGlucose = (mmol, isMgdl) =>
  isMgdl ? Math.round(mmol * MMOL_TO_MGDL) : mmol;

const formatDisplayGlucose = (mmol, isMgdl) => {
  if (mmol == null || mmol <= 0) return null;
  return isMgdl
    ? String(Math.round(mmol * MMOL_TO_MGDL))
    : mmol.toFixed(1);
};

export default function GlucosePanel({ glucoData, thresholds = DEFAULT_THRESHOLDS, freshnessMs, backfillTick = 0 }) {
  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const scrubOpacity = useRef(new Animated.Value(0)).current;
  const [history,     setHistory]     = useState([]);
  const [graphLayout, setGraphLayout] = useState({ width: 0, height: 0 });
  const [scrubPoint,  setScrubPoint]  = useState(null); // { glucose, timestamp } | null
  const [isMgdl,      setIsMgdl]      = useState(false); // Session 27 P2: display unit
  const lastSavedTs = useRef(null);

  // ── Load history on mount (unconditional) ────────────────────────────────
  // Runs once immediately so the graph draws from SQLite on first open,
  // before the first poll arrives. Covers returning users who already have
  // data — graph is never empty on launch.
  // Session 27 P8: restored to 8 hours — regressed to 6 after S26 fix.
  useEffect(() => {
    (async () => {
      const rows = await getGlucoseHistory(8);
      setHistory(rows);
      // Session 27 P2: load display unit at same time as history
      try {
        const profile = await getProfile();
        setIsMgdl((profile.glucose_unit || 'mmol') === 'mgdl');
      } catch { /* keep current unit */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh history after each new poll / backfill tick ──────────────────
  // Runs whenever a new reading arrives OR backfillTick increments (every poll).
  // No guard — we always want the freshest SQLite rows after any poll completes.
  useEffect(() => {
    if (backfillTick === 0) return; // skip initial render before first poll
    (async () => {
      const rows = await getGlucoseHistory(8);
      setHistory(rows);
      // Session 27 P2: reload unit in case user changed it in Settings
      try {
        const profile = await getProfile();
        setIsMgdl((profile.glucose_unit || 'mmol') === 'mgdl');
      } catch { /* keep current unit */ }
    })();
  }, [glucoData?.timestamp, backfillTick]);

  // ── Save + merge new readings ──────────────────────────────────────────────
  useEffect(() => {
    if (!glucoData?.glucose || glucoData.glucose <= 0) return;
    if (glucoData.timestamp === lastSavedTs.current) return;
    lastSavedTs.current = glucoData.timestamp;

    saveGlucoseReading({
      timestamp: glucoData.timestamp,
      glucose:   glucoData.glucose,
      trend:     glucoData.trend     ?? 4,
      direction: glucoData.direction ?? 'Flat',
      delta:     glucoData.delta     ?? 0.0,
    });

    setHistory((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].timestamp === glucoData.timestamp) return prev;
      return [...prev, {
        timestamp: glucoData.timestamp,
        glucose:   glucoData.glucose,
        trend:     glucoData.trend     ?? 4,
        direction: glucoData.direction ?? 'Flat',
        delta:     glucoData.delta     ?? 0.0,
      }];
    });

    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.04, duration: 150, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 150, useNativeDriver: true }),
    ]).start();
  }, [glucoData?.timestamp]);

  // ── Scrubber callback ──────────────────────────────────────────────────────
  const handleScrub = useCallback((point) => {
    setScrubPoint(point);
    Animated.timing(scrubOpacity, {
      toValue:         point ? 1 : 0,
      duration:        120,
      useNativeDriver: true,
    }).start();
  }, [scrubOpacity]);

  // ── Displayed values — live or scrubbed ───────────────────────────────────
  const liveGlucose   = glucoData?.glucose   ?? null;
  const liveTrend     = glucoData?.trend     ?? 4;
  const liveTimestamp = glucoData?.timestamp ?? null;
  const liveDelta     = glucoData?.delta     ?? null;

  const hasData      = liveGlucose != null && liveGlucose > 0;
  const isScrubbing  = scrubPoint !== null;
  const displayGlucose = isScrubbing ? scrubPoint.glucose   : liveGlucose;
  const displayTs      = isScrubbing ? scrubPoint.timestamp : liveTimestamp;

  const bannerColor  = hasData
    ? getGlucoseColor(liveGlucose, thresholds)
    : '#1A3A6B'; // dark blue waiting state — not an error colour
  // trendArrow rendered via <TrendArrow trend={liveTrend} /> component
  const freshness    = getFreshnessLabel(freshnessMs > 0 ? Date.now() - freshnessMs : liveTimestamp);
  const deltaLabel   = getDeltaLabel(liveDelta);
  const displayValue = displayGlucose != null && displayGlucose > 0
    ? formatDisplayGlucose(displayGlucose, isMgdl)
    : null; // null = show waiting UI

  const unitLabel = isMgdl ? 'mg/dL' : 'mmol/L';

  const onGraphLayout = useCallback((e) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setGraphLayout({ width: w, height: h });
  }, []);

  // Waiting pulse animation
  const waitAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (hasData) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(waitAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
        Animated.timing(waitAnim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasData]);

  return (
    <View style={[styles.panel, { backgroundColor: bannerColor }]}>

      {/* ── Reading row ──────────────────────────────────────────────────── */}
      <View style={styles.readingRow}>
        {displayValue ? (
          <Animated.Text
            style={[styles.glucoseNumber, { transform: [{ scale: isScrubbing ? 1 : pulseAnim }] }]}
            numberOfLines={1}
          >
            {displayValue}
          </Animated.Text>
        ) : (
          <Animated.View style={[styles.waitingBlock, { opacity: waitAnim }]}>
            <Text style={styles.waitingValue}>--.-</Text>
            <Text style={styles.waitingLabel}>{t('glucoseWaiting')}</Text>
          </Animated.View>
        )}

        {displayValue && (
        <View style={styles.readingMeta}>
          {!isScrubbing && (
            <>
              <TrendArrow trend={liveTrend} />
              <Text style={styles.unitLabel}>{unitLabel}</Text>
              {deltaLabel ? <Text style={styles.deltaLabel}>{deltaLabel}</Text> : null}
            </>
          )}
          {isScrubbing && (
            <>
              <Text style={styles.unitLabel}>{unitLabel}</Text>
              <Text style={styles.scrubTimeLabel}>{formatScrubTime(displayTs)}</Text>
            </>
          )}
        </View>
        )}
      </View>

      {/* ── Freshness / scrub hint ────────────────────────────────────────── */}
      {displayValue && (
      <Text style={styles.freshness}>
        {isScrubbing ? `${t('glucoseHistory')}${formatScrubTime(displayTs)}` : freshness}
      </Text>
      )}

      {/* ── Graph card ───────────────────────────────────────────────────── */}
      <View style={styles.graphCard} onLayout={onGraphLayout}>
        {graphLayout.width > 0 && (
          <GlucoseGraph
            history={history}
            thresholds={thresholds}
            hoursShown={8}
            isMgdl={isMgdl}
            width={graphLayout.width}
            height={graphLayout.height}
            onScrub={handleScrub}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 48 : 52,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },

  readingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 4,
  },
  waitingBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 8,
  },
  waitingValue: {
    fontSize: 64,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: -2,
  },
  waitingLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  // S26 P1b: all panel text changed white → black for outdoor legibility.
  // Applies to all panel states (green/amber/orange/red).
  // waitingValue + waitingLabel intentionally kept white — rendered on dark
  // blue #1A3A6B waiting background where white is correct contrast.
  glucoseNumber: {
    fontSize: 72,
    fontWeight: '800',
    color: '#1A1A2E',
    letterSpacing: -2,
    lineHeight: 80,
  },
  readingMeta: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 2,
  },
  // trendArrow style removed — arrow is now a TrendArrow SVG component
  unitLabel: {
    fontSize: 12,
    color: 'rgba(26,26,46,0.75)',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  deltaLabel: {
    fontSize: 13,
    color: 'rgba(26,26,46,0.85)',
    fontWeight: '600',
  },
  scrubTimeLabel: {
    fontSize: 14,
    color: '#1A1A2E',
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  freshness: {
    textAlign: 'center',
    color: 'rgba(26,26,46,0.75)',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 8,
  },

  graphCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
});
