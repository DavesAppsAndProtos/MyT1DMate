/**
 * My T1D Mate — GlucoseGraph
 * Session 10:
 *   - Fixed: now/xStart memoized per-minute — was busting useMemo on every render
 *   - Fixed: threshold line colours now correctly amber (warn) / red (crit)
 *   - Fixed: threshold lines positioned from live settings values (already wired, confirmed working)
 *   - Added: LibreLink-style interactive scrubber — drag dot, header updates
 *
 * Props:
 *   history        — [{ timestamp, glucose, trend, direction, delta }] oldest-first
 *   thresholds     — { critLow, warnLow, warnHigh, critHigh }
 *   hoursShown     — hours to display (default 3)
 *   width / height — layout dimensions
 *   onScrub        — (point | null) => void  called while dragging
 *                    point = { glucose, timestamp } | null on release
 */

import React, { useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, PanResponder } from 'react-native';
import Svg, {
  Rect,
  Line,
  Path,
  Circle,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { t } from '../i18n/en';

// Session 27 P1: critLow hardcoded to 3.1 to match LibreLink exactly
const DEFAULT_THRESHOLDS = {
  critLow:  3.1,
  warnLow:  3.9,
  warnHigh: 10.0,
  critHigh: 13.9,
};

// Session 27: Dave's softer clinical palette
const COLORS = {
  gridLine:         '#E5E7EB',
  targetBand:       '#ECFFC3',  // soft green — Dave's palette
  axisLabel:        '#9CA3AF',
  background:       '#FFFFFF',
  warnLine:         '#e7b416',  // amber — matches warning banner
  critLine:         '#cc3232',  // red   — matches critical low banner
  scrubber:         '#003DA5',  // diabetes blue
  scrubberLine:     'rgba(0,61,165,0.25)',
};

const Y_MIN_DEFAULT = 3.0;
const Y_INTERVAL    = 3;
const LINE_COLOR = '#1A1A2E';

const formatTimeLabel = (ms) => {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
};

// Round down to nearest minute boundary so memoisation is stable
const minuteBucket = () => Math.floor(Date.now() / 60000) * 60000;

const MMOL_TO_MGDL = 18.0182;

export default function GlucoseGraph({
  history    = [],
  thresholds = DEFAULT_THRESHOLDS,
  hoursShown = 8,
  isMgdl     = false,
  width      = 320,
  height     = 160,
  onScrub,
}) {
  const PAD    = { top: 20, right: 8, bottom: 24, left: 36 };  // left: room for y-labels; top: room for 'mmol/L' unit label
  const chartW = width  - PAD.left - PAD.right;
  const chartH = height - PAD.top  - PAD.bottom;

  // now: actual current time — used as the right edge of the x-axis so live readings
  // (which carry real timestamps) are never clipped off the right side of the chart.
  // xStart: anchored to minuteBucket() so the left edge is stable per-minute and
  // doesn't cause unnecessary re-renders on every poll tick.
  const now    = Date.now();
  const xStart = minuteBucket() - hoursShown * 3600000;

  // Dynamic Y range — bottom always 3, top rounds up to nearest 3 above max reading
  const { yMin, yMax, yLabels } = useMemo(() => {
    const yMin = Y_MIN_DEFAULT;
    const maxReading = history.length > 0
      ? Math.max(...history.map(p => p.glucose))
      : 15;
    // Round up to nearest 3-unit interval, minimum ceiling of 15
    const rawMax = Math.max(15, maxReading + 1.5);
    const yMax = Math.ceil(rawMax / Y_INTERVAL) * Y_INTERVAL;
    const labels = [];
    for (let v = yMin; v <= yMax; v += Y_INTERVAL) labels.push(v);
    return { yMin, yMax, yLabels: labels };
  }, [history]);

  const xPx  = useCallback((ts)  => PAD.left + ((ts - xStart) / (now - xStart)) * chartW, [xStart, now, chartW]);
  const yPx  = useCallback((val) => PAD.top  + (1 - (val - yMin) / (yMax - yMin)) * chartH, [chartH, yMin, yMax]);
  const xToTs = useCallback((px) => xStart + ((px - PAD.left) / chartW) * (now - xStart), [xStart, now, chartW]);

  // Visible window
  const visible = useMemo(
    () => history.filter(p => p.timestamp >= xStart && p.timestamp <= now),
    [history, xStart, now]
  );

  // Target band
  const bandTop    = useMemo(() => yPx(thresholds.warnHigh), [yPx, thresholds.warnHigh]);
  const bandBottom = useMemo(() => yPx(thresholds.warnLow),  [yPx, thresholds.warnLow]);
  const bandHeight = bandBottom - bandTop;

  // Session 27 P7: bezier curve smoothing.
  // Build SVG path strings for each connected run of visible points.
  // Runs are broken where timestamp gap > 35 min (confirmed missing data).
  // Each run uses cubic bezier curves (C command) with control points at
  // 40% of the horizontal distance between adjacent points — this gives a
  // smooth natural curve without overshooting flat sections.
  const bezierPaths = useMemo(() => {
    if (visible.length < 2) return [];
    const paths = [];
    let run = [visible[0]];

    const buildPath = (pts) => {
      if (pts.length < 2) return null;
      let d = `M ${xPx(pts[0].timestamp)} ${yPx(pts[0].glucose)}`;
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const x0 = xPx(prev.timestamp), y0 = yPx(prev.glucose);
        const x1 = xPx(curr.timestamp), y1 = yPx(curr.glucose);
        const cpX = (x1 - x0) * 0.4;
        d += ` C ${x0 + cpX} ${y0}, ${x1 - cpX} ${y1}, ${x1} ${y1}`;
      }
      return d;
    };

    for (let i = 1; i < visible.length; i++) {
      const gap = visible[i].timestamp - visible[i - 1].timestamp;
      if (gap > 35 * 60 * 1000) {
        // Break — emit current run, start new one
        const d = buildPath(run);
        if (d) paths.push(d);
        run = [visible[i]];
      } else {
        run.push(visible[i]);
      }
    }
    const d = buildPath(run);
    if (d) paths.push(d);
    return paths;
  }, [visible, xPx, yPx]);

  const latest = visible.length > 0 ? visible[visible.length - 1] : null;

  // Session 26: 3-hourly labels snapped to 3-hour boundaries — matches LibreLink.
  // Gives consistent labels (e.g. 12:00, 15:00, 18:00, 21:00) regardless of
  // when the app started, so every user sees the same presentation.
  const timeLabels = useMemo(() => {
    const labels = [];
    const THREE_HOURS = 10800000;
    const startHour = Math.ceil(xStart / THREE_HOURS) * THREE_HOURS;
    for (let t = startHour; t <= now; t += THREE_HOURS) {
      labels.push({ ts: t, label: formatTimeLabel(t) });
    }
    return labels;
  }, [xStart, now]);

  // Threshold lines — amber for warn, red for crit

  // ── Scrubber state ─────────────────────────────────────────────────────────
  const [scrubX, setScrubX] = useState(null); // px from left edge of View
  const scrubbing = scrubX !== null;

  // Find nearest history point to a given x-pixel
  const getNearestPoint = useCallback((px) => {
    if (visible.length === 0) return null;
    const ts = xToTs(px);
    let best = null, bestDist = Infinity;
    for (const p of visible) {
      const d = Math.abs(p.timestamp - ts);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    return best;
  }, [visible, xToTs]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => visible.length > 0,
    onMoveShouldSetPanResponder:  () => visible.length > 0,

    onPanResponderGrant: (evt) => {
      const px = evt.nativeEvent.locationX;
      setScrubX(px);
      onScrub?.(getNearestPoint(px));
    },
    onPanResponderMove: (evt) => {
      const px = Math.max(PAD.left, Math.min(PAD.left + chartW, evt.nativeEvent.locationX));
      setScrubX(px);
      onScrub?.(getNearestPoint(px));
    },
    onPanResponderRelease: () => {
      setScrubX(null);
      onScrub?.(null);
    },
    onPanResponderTerminate: () => {
      setScrubX(null);
      onScrub?.(null);
    },
  }), [visible, getNearestPoint, onScrub, chartW]);

  // Point under scrubber
  const scrubPoint = scrubbing ? getNearestPoint(scrubX) : null;
  const scrubDotX  = scrubPoint ? xPx(scrubPoint.timestamp) : null;
  const scrubDotY  = scrubPoint ? yPx(scrubPoint.glucose)   : null;

  return (
    <View
      style={[styles.container, { width, height }]}
      {...panResponder.panHandlers}
    >
      <Svg width={width} height={height} pointerEvents="none">
        <Defs>
          <LinearGradient id="targetGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COLORS.targetBand} stopOpacity="0.8" />
            <Stop offset="1" stopColor={COLORS.targetBand} stopOpacity="0.4" />
          </LinearGradient>
        </Defs>

        {/* Background */}
        <Rect x={0} y={0} width={width} height={height} fill={COLORS.background} />

        {/* Target band */}
        {bandHeight > 0 && (
          <Rect
            x={PAD.left} y={bandTop}
            width={chartW} height={bandHeight}
            fill="url(#targetGrad)"
          />
        )}

        {/* Unit label — top left, Libre style */}
        <SvgText x={2} y={12} fontSize={10} fill={COLORS.axisLabel} textAnchor="start" fontWeight="600">
          {isMgdl ? 'mg/dL' : 'mmol/L'}
        </SvgText>

        {/* Grid lines + Y labels — LEFT side, Libre style */}
        {yLabels.map((val) => {
          const y = yPx(val);
          if (y < PAD.top || y > PAD.top + chartH) return null;
          const labelVal = isMgdl ? Math.round(val * MMOL_TO_MGDL) : val;
          return (
            <React.Fragment key={val}>
              <Line
                x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
                stroke={COLORS.gridLine} strokeWidth={1}
              />
              <SvgText x={PAD.left - 4} y={y + 4} fontSize={10} fill={COLORS.axisLabel} textAnchor="end" fontVariant="tabular-nums">
                {labelVal}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Threshold lines removed — green band shows target range */}

        {/* Glucose line — bezier curves (Session 27 P7) */}
        {bezierPaths.map((d, i) => (
          <Path
            key={i}
            d={d}
            stroke={LINE_COLOR}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}

        {/* Latest dot (hidden while scrubbing) */}
        {latest && !scrubbing && (
          <Circle
            cx={xPx(latest.timestamp)} cy={yPx(latest.glucose)}
            r={5} fill={LINE_COLOR} stroke="#FFFFFF" strokeWidth={2}
          />
        )}

        {/* ── Scrubber ─────────────────────────────────────────────────── */}
        {scrubbing && scrubDotX != null && (
          <>
            {/* Vertical line */}
            <Line
              x1={scrubDotX} y1={PAD.top}
              x2={scrubDotX} y2={PAD.top + chartH}
              stroke={COLORS.scrubberLine} strokeWidth={1.5}
            />
            {/* Dot */}
            <Circle
              cx={scrubDotX} cy={scrubDotY}
              r={7} fill={COLORS.scrubber} stroke="#FFFFFF" strokeWidth={2.5}
            />
            {/* Callout: value */}
            {scrubPoint && (
              <>
                <Rect
                  x={Math.min(scrubDotX - 22, PAD.left + chartW - 46)}
                  y={PAD.top + 2}
                  width={44} height={18} rx={4}
                  fill={COLORS.scrubber} opacity={0.9}
                />
                <SvgText
                  x={Math.min(scrubDotX, PAD.left + chartW - 24)}
                  y={PAD.top + 14}
                  fontSize={10} fill="#FFFFFF" textAnchor="middle" fontWeight="700"
                >
                  {isMgdl
                    ? String(Math.round(scrubPoint.glucose * MMOL_TO_MGDL))
                    : scrubPoint.glucose.toFixed(1)}
                </SvgText>
              </>
            )}
          </>
        )}

        {/* Time axis */}
        {timeLabels.map(({ ts, label }) => {
          const x = xPx(ts);
          if (x < PAD.left || x > PAD.left + chartW) return null;
          return (
            <React.Fragment key={ts}>
              <Line
                x1={x} y1={PAD.top + chartH} x2={x} y2={PAD.top + chartH + 4}
                stroke={COLORS.gridLine} strokeWidth={1}
              />
              <SvgText x={x} y={height - 4} fontSize={10} fill={COLORS.axisLabel} textAnchor="middle">
                {label}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Empty state */}
        {visible.length === 0 && (
          <SvgText
            x={PAD.left + chartW / 2} y={PAD.top + chartH / 2}
            fontSize={11} fill={COLORS.axisLabel} textAnchor="middle"
          >
            {t('glucoseWaitingGraph')}
          </SvgText>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
