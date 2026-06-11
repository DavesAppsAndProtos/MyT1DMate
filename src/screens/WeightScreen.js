/**
 * My T1D Mate — WeightScreen
 * Session 9c: Weight tracker.
 *
 * - Unit choice on screen: kg (default) / stone+lbs / lbs
 * - Date pre-filled today, tappable to pick a past date
 * - Stores in SQLite weight_entries table
 * - Simple line graph of last 30 entries
 * - ← Dashboard navigation
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import SQLite from 'react-native-sqlite-storage';
import { t } from '../i18n/en';

SQLite.enablePromise(true);

const COLORS = {
  primary:       '#003DA5',
  background:    '#F5F7FA',
  surface:       '#FFFFFF',
  textPrimary:   '#1A1A2E',
  textSecondary: '#6B7280',
  border:        'rgba(0,0,0,0.08)',
  accent:        '#E8EFFF',
  accentMid:     '#BBCFFF',
  success:       '#22863A',
};

const UNITS = [
  { id: 'kg',    label: 'kg' },
  { id: 'stone', label: 'st + lbs' },
  { id: 'lbs',   label: 'lbs' },
];

// ── DB helpers ────────────────────────────────────────────────────────────────
const getDB = async () => {
  const db = await SQLite.openDatabase({ name: 'T1DMate.db', location: 'default' });
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS weight_entries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT    NOT NULL,
      weight_kg  REAL    NOT NULL,
      unit       TEXT    NOT NULL,
      note       TEXT,
      created_at TEXT    NOT NULL
    );
  `);
  return db;
};

const toKg = (unit, val, stone, lbs) => {
  if (unit === 'kg')    return parseFloat(val);
  if (unit === 'lbs')   return parseFloat(val) * 0.453592;
  if (unit === 'stone') return (parseFloat(stone || 0) * 6.35029) + (parseFloat(lbs || 0) * 0.453592);
  return NaN;
};

const fromKg = (kg, unit) => {
  if (unit === 'kg')  return `${kg.toFixed(1)} kg`;
  if (unit === 'lbs') return `${(kg / 0.453592).toFixed(1)} lbs`;
  if (unit === 'stone') {
    const totalLbs  = kg / 0.453592;
    const st        = Math.floor(totalLbs / 14);
    const lb        = Math.min(13, Math.round(totalLbs % 14));
    return `${st}st ${lb}lb`;
  }
  return `${kg.toFixed(1)} kg`;
};

// ── Date helpers ──────────────────────────────────────────────────────────────
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const formatDateDisplay = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[parseInt(m,10)-1]} ${y}`;
};

// ── Simple sparkline graph ────────────────────────────────────────────────────
// Formats "2026-05-24" → "24 May" for X axis labels
const formatGraphDate = (iso) => {
  if (!iso) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]}`;
};

function WeightGraph({ entries, unit }) {
  const { width: screenWidth } = useWindowDimensions();

  if (entries.length < 2) return null;

  // Layout — Libre-inspired: white bg, y-axis labels on RIGHT, unit at top-right
  const SCROLL_PAD = 16;  // matches scroll contentContainerStyle padding (styles.scroll: padding: 16)
  const W       = screenWidth - SCROLL_PAD * 2;
  const H       = 180;
  const PAD_TOP = 20;     // room for unit label at top
  const PAD_BTM = 24;     // room for x-axis date labels
  const PAD_L   = 44;     // y-axis labels on LEFT — enough for "12st 4"
  const PAD_R   = 8;      // minimal right margin

  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_TOP - PAD_BTM;

  const vals  = entries.map(e => e.weight_kg);
  const minKg = Math.min(...vals);
  const maxKg = Math.max(...vals);

  // Clean step sizes — pick one that gives 4-5 gridlines on round numbers.
  // Session 26 P1: for stone display, snap gridlines to clean stone+lb values
  // (e.g. 11st 0, 11st 7, 12st 0) rather than letting kg steps convert to
  // ugly values like "11st 13". Half-stone (3.175 kg) steps are used when in
  // stone mode so labels always land on Xst 0 or Xst 7.
  const rawRange = maxKg - minKg || 2;
  let step;
  let yAxisMin, yAxisMax;
  if (unit === 'stone') {
    // Half-stone = 3.175 kg, full stone = 6.35029 kg
    // Pick whichever gives 3-5 gridlines
    step = rawRange / 3.175 <= 4 ? 3.175 : 6.35029;
    // Snap yAxisMin DOWN to nearest half-stone boundary
    const halfStone = 3.175;
    yAxisMin = Math.floor(minKg / halfStone) * halfStone;
    yAxisMax = Math.ceil(maxKg  / halfStone) * halfStone;
  } else {
    const steps = [0.5, 1, 2, 5, 10, 20];
    step  = steps.find(s => rawRange / s <= 4) ?? 20;
    yAxisMin = Math.floor(minKg / step) * step;
    yAxisMax = Math.ceil(maxKg  / step) * step;
  }
  const yRange   = yAxisMax - yAxisMin || step;

  const yAxisLabels = [];
  for (let v = yAxisMin; v <= yAxisMax; v = Math.round((v + step) * 10) / 10) {
    yAxisLabels.push(v);
  }

  const xPx = (i) => PAD_L + (i / (entries.length - 1)) * chartW;
  const yPx = (kg) => PAD_TOP + ((yAxisMax - kg) / yRange) * chartH;

  const points = entries.map((e, i) => ({
    x: xPx(i),
    y: yPx(e.weight_kg),
    kg: e.weight_kg,
    date: e.date,
  }));

  // X axis: first, middle, last
  const mid = Math.floor((entries.length - 1) / 2);
  const xAxisLabels = [
    { i: 0,                  date: entries[0].date,                  align: 'left'   },
    { i: mid,                date: entries[mid].date,                align: 'center' },
    { i: entries.length - 1, date: entries[entries.length - 1].date, align: 'right'  },
  ];

  // Unit label — short form for axis
  const unitLabel = unit === 'stone' ? 'st+lb' : unit;

  return (
    <View style={graph.container}>
      <View style={[graph.chart, { width: W, height: H }]}>

        {/* Unit label — top left above y-axis, Libre style */}
        <Text style={[graph.unitLabel, { top: 4, left: 2 }]}>{unitLabel}</Text>

        {/* Y axis grid lines + labels on LEFT */}
        {yAxisLabels.map((val) => {
          const top = yPx(val);
          if (top < PAD_TOP - 4 || top > PAD_TOP + chartH + 4) return null;
          // Format just the number — unit shown once above.
          // Round to clean display values: lbs to nearest whole, stone to nearest lb.
          let labelText;
          if (unit === 'kg') {
            labelText = val.toFixed(val % 1 === 0 ? 0 : 1);
          } else if (unit === 'lbs') {
            labelText = String(Math.round(val / 0.453592));
          } else {
            const totalLbs = val / 0.453592;
            const st = Math.floor(totalLbs / 14);
            const lb = Math.min(13, Math.round(totalLbs % 14));
            labelText = lb === 0 ? `${st}st` : `${st}st ${lb}`;
          }
          return (
            <React.Fragment key={val}>
              {/* Gridline across chart width only */}
              <View style={[graph.gridLine, { top, left: PAD_L, width: chartW }]} />
              {/* Label to the LEFT of chart */}
              <Text style={[graph.yLabel, { top: top - 8, left: 2, width: PAD_L - 4, textAlign: 'right' }]}>
                {labelText}
              </Text>
            </React.Fragment>
          );
        })}

        {/* Line segments */}
        {points.slice(0, -1).map((pt, i) => {
          const next  = points[i + 1];
          const dx    = next.x - pt.x;
          const dy    = next.y - pt.y;
          const len   = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View
              key={i}
              style={[
                graph.segment,
                {
                  width:           len,
                  left:            pt.x,
                  top:             pt.y - 1,
                  transform:       [{ rotate: `${angle}deg` }],
                  transformOrigin: '0 50%',
                },
              ]}
            />
          );
        })}

        {/* Dots */}
        {points.map((pt, i) => (
          <View key={i} style={[graph.dot, { left: pt.x - 4, top: pt.y - 4 }]} />
        ))}

        {/* X axis date labels */}
        {/* Session 27 P6: left label was overlapping the y-axis.
            Fix: left-aligned label starts at PAD_L (chart start) not x=0,
            so it never runs into the y-axis labels. */}
        {xAxisLabels.map(({ i, date, align }) => {
          const x = xPx(i);
          // left: start at the data point, never left of chart start
          // center: centre on data point
          // right: end at data point
          const offsetX = align === 'left' ? 0 : align === 'right' ? -40 : -20;
          const clampedX = align === 'left' ? Math.max(x, PAD_L) : x;
          return (
            <Text
              key={i}
              style={[
                graph.xLabel,
                { left: clampedX, top: H - PAD_BTM + 4, transform: [{ translateX: offsetX }] },
              ]}
            >
              {formatGraphDate(date)}
            </Text>
          );
        })}

      </View>
    </View>
  );
}

// ── Simple date picker (year/month/day scroll wheels not available without
//    a library, so we use a clean calendar-style grid modal) ──────────────────
function DatePickerModal({ visible, current, onSelect, onClose }) {
  const parseDate = (iso) => {
    const [y, m, d] = (iso || today()).split('-').map(Number);
    return { year: y, month: m, day: d };
  };

  const [view, setView] = useState(parseDate(current));

  useEffect(() => { if (visible) setView(parseDate(current)); }, [visible]);

  const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
  const firstDayOfWeek = (y, m) => new Date(y, m - 1, 1).getDay(); // 0=Sun

  const prevMonth = () => setView(v => {
    // Limit: 3 months back from today
    const limit = new Date();
    limit.setMonth(limit.getMonth() - 3);
    const limitYear  = limit.getFullYear();
    const limitMonth = limit.getMonth() + 1;
    if (v.year < limitYear || (v.year === limitYear && v.month <= limitMonth)) return v;
    const m = v.month === 1 ? 12 : v.month - 1;
    const y = v.month === 1 ? v.year - 1 : v.year;
    return { ...v, year: y, month: m };
  });
  const nextMonth = () => setView(v => {
    const todayObj = parseDate(today());
    if (v.year === todayObj.year && v.month === todayObj.month) return v; // can't go future
    const m = v.month === 12 ? 1 : v.month + 1;
    const y = v.month === 12 ? v.year + 1 : v.year;
    return { ...v, year: y, month: m };
  });

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  const totalDays  = daysInMonth(view.year, view.month);
  const startDay   = firstDayOfWeek(view.year, view.month);
  const todayObj   = parseDate(today());
  const limitDate  = new Date(); limitDate.setMonth(limitDate.getMonth() - 3);
  const limitYear  = limitDate.getFullYear();
  const limitMonth = limitDate.getMonth() + 1;
  const limitDay   = limitDate.getDate();

  const isToday    = (d) => view.year === todayObj.year && view.month === todayObj.month && d === todayObj.day;
  const isFuture   = (d) => {
    if (view.year > todayObj.year) return true;
    if (view.year === todayObj.year && view.month > todayObj.month) return true;
    if (view.year === todayObj.year && view.month === todayObj.month && d > todayObj.day) return true;
    return false;
  };
  const isTooOld = (d) => {
    if (view.year < limitYear) return true;
    if (view.year === limitYear && view.month < limitMonth) return true;
    if (view.year === limitYear && view.month === limitMonth && d < limitDay) return true;
    return false;
  };
  const isDisabled = (d) => isFuture(d) || isTooOld(d);
  const isSelected = (d) => view.year === parseDate(current).year && view.month === parseDate(current).month && d === parseDate(current).day;

  const selectDay = (d) => {
    if (isDisabled(d)) return;
    const iso = `${view.year}-${String(view.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    onSelect(iso);
    onClose();
  };

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={cal.overlay}>
        <View style={cal.box}>
          {/* Month nav */}
          <View style={cal.header}>
            <TouchableOpacity onPress={prevMonth} style={cal.navBtn}>
              <Text style={cal.navText}>‹</Text>
            </TouchableOpacity>
            <Text style={cal.monthLabel}>{MONTHS[view.month - 1]} {view.year}</Text>
            <TouchableOpacity onPress={nextMonth} style={cal.navBtn}>
              <Text style={cal.navText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={cal.dayRow}>
            {DAYS.map(d => <Text key={d} style={cal.dayHeader}>{d}</Text>)}
          </View>

          {/* Grid */}
          <View style={cal.grid}>
            {cells.map((d, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  cal.cell,
                  d && isSelected(d) && cal.cellSelected,
                  d && isToday(d) && !isSelected(d) && cal.cellToday,
                  d && isDisabled(d) && cal.cellFuture,
                ]}
                onPress={() => d && selectDay(d)}
                disabled={!d || isDisabled(d)}
              >
                <Text style={[
                  cal.cellText,
                  d && isSelected(d) && cal.cellTextSelected,
                  d && isDisabled(d) && cal.cellTextFuture,
                ]}>
                  {d || ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={cal.cancelBtn} onPress={onClose}>
            <Text style={cal.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function WeightScreen({ onBack, glucoData }) {
  const [unit,    setUnit]    = useState('kg');
  const [valKg,   setValKg]   = useState('');
  const [valSt,   setValSt]   = useState('');
  const [valLbs,  setValLbs]  = useState('');
  const [date,    setDate]    = useState(today());
  const [entries, setEntries] = useState([]);
  const [calOpen, setCalOpen] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const scrollRef = useRef(null);

  const loadEntries = useCallback(async () => {
    try {
      const db = await getDB();
      const [res] = await db.executeSql(
        'SELECT * FROM weight_entries ORDER BY date ASC LIMIT 30'
      );
      const rows = [];
      for (let i = 0; i < res.rows.length; i++) rows.push(res.rows.item(i));
      setEntries(rows);
    } catch (e) { console.warn('[Weight] load failed', e); }
  }, []);

  useEffect(() => { loadEntries(); }, []);

  const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null;

  // Date selected from calendar — dismiss keyboard, close cal
  const handleDateSelect = useCallback((d) => {
    setDate(d);
    setCalOpen(false);
    Keyboard.dismiss();
  }, []);

  const save = async () => {
    let kg;
    if (unit === 'stone') {
      kg = toKg('stone', null, valSt, valLbs);
      if (!valSt && !valLbs) { Alert.alert(t('weightEnterTitle'), t('weightEnterMsg')); return; }
    } else {
      if (!valKg.trim()) { Alert.alert(t('weightEnterTitle'), t('weightEnterNumMsg')); return; }
      kg = toKg(unit, valKg);
    }
    if (isNaN(kg) || kg <= 0 || kg > 500) {
      Alert.alert(t('weightCheckNum'), t('weightCheckNumMsg'));
      return;
    }

    const existing = entries.find(e => e.date === date);
    if (existing) {
      Alert.alert(
        t('weightExistsTitle'),
        `You already have ${fromKg(existing.weight_kg, unit)} logged for ${formatDateDisplay(date)}. Replace it?`,
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('replace'), style: 'destructive', onPress: () => doSave(kg) },
        ]
      );
      return;
    }
    doSave(kg);
  };

  const doSave = async (kg) => {
    setSaving(true);
    try {
      const db = await getDB();
      await db.executeSql('DELETE FROM weight_entries WHERE date = ?', [date]);
      await db.executeSql(
        'INSERT INTO weight_entries (date, weight_kg, unit, created_at) VALUES (?, ?, ?, ?)',
        [date, kg, unit, new Date().toISOString()]
      );
      setValKg(''); setValSt(''); setValLbs('');
      setDate(today());
      Keyboard.dismiss();
      await loadEntries();
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
      Alert.alert(t('weightSaved'), `${fromKg(kg, unit)} logged for ${formatDateDisplay(date)}.`);
    } catch (e) {
      Alert.alert(t('weightCouldNotSave'), t('weightCouldNotSaveMsg'));
      console.warn('[Weight] save failed', e);
    }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* App bar */}
      <View style={styles.appBar}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 16 }}
        >
          <Text style={styles.backText}>{t('backDashboard')}</Text>
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>{t('weightTitle')}</Text>
        <View style={{ width: 80 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Last entry */}
          {latestEntry && (
            <View style={styles.lastEntry}>
              <Text style={styles.lastEntryLabel}>{t('weightLastLogged')}</Text>
              <Text style={styles.lastEntryValue}>{fromKg(latestEntry.weight_kg, unit)}</Text>
              <Text style={styles.lastEntryDate}>{formatDateDisplay(latestEntry.date)}</Text>
            </View>
          )}

          {/* Graph */}
          <WeightGraph entries={entries} unit={unit} />

          {/* Unit selector */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('weightUnit')}</Text>
            <View style={styles.unitRow}>
              {UNITS.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.unitBtn, unit === u.id && styles.unitBtnActive]}
                  onPress={() => { setUnit(u.id); setValKg(''); setValSt(''); setValLbs(''); }}
                >
                  <Text style={[styles.unitBtnText, unit === u.id && styles.unitBtnTextActive]}>
                    {u.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Weight input */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('weightInput')}</Text>
            {unit === 'stone' ? (
              <View style={styles.stoneRow}>
                <View style={styles.stoneField}>
                  <TextInput
                    style={styles.input}
                    placeholder="st"
                    placeholderTextColor="#aaa"
                    value={valSt}
                    onChangeText={setValSt}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={styles.inputSuffix}>st</Text>
                </View>
                <View style={styles.stoneField}>
                  <TextInput
                    style={styles.input}
                    placeholder="lbs"
                    placeholderTextColor="#aaa"
                    value={valLbs}
                    onChangeText={setValLbs}
                    keyboardType="decimal-pad"
                    maxLength={4}
                  />
                  <Text style={styles.inputSuffix}>lbs</Text>
                </View>
              </View>
            ) : (
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder={unit === 'kg' ? '70.5' : '155'}
                  placeholderTextColor="#aaa"
                  value={valKg}
                  onChangeText={setValKg}
                  keyboardType="decimal-pad"
                  maxLength={6}
                />
                <Text style={styles.inputSuffix}>{unit}</Text>
              </View>
            )}
          </View>

          {/* Date */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('weightDate')}</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setCalOpen(true)}>
              <Text style={styles.dateBtnText}>{formatDateDisplay(date)}</Text>
              <Text style={styles.dateBtnIcon}>📅</Text>
            </TouchableOpacity>
            {date !== today() && (
              <TouchableOpacity onPress={() => setDate(today())} style={styles.todayLink}>
                <Text style={styles.todayLinkText}>Reset to today</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={save}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? t('settingsSaving') : t('weightLogBtn')}</Text>
          </TouchableOpacity>

          {/* History list */}
          {entries.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('weightHistory')}</Text>
              {[...entries].reverse().map((e) => (
                <View key={e.id} style={styles.historyRow}>
                  <Text style={styles.historyDate}>{formatDateDisplay(e.date)}</Text>
                  <Text style={styles.historyVal}>{fromKg(e.weight_kg, unit)}</Text>
                </View>
              ))}
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={calOpen}
        current={date}
        onSelect={handleDateSelect}
        onClose={() => setCalOpen(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: COLORS.background },

  appBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 12,
  },
  appBarTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  backText:    { color: '#fff', fontSize: 14, fontWeight: '600' },

  scroll: { padding: 16, paddingBottom: 48 },

  lastEntry: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    alignItems: 'center', marginBottom: 16,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width:0,height:1 },
  },
  lastEntryLabel: { fontSize: 12, color: COLORS.textSecondary },
  lastEntryValue: { fontSize: 32, fontWeight: '800', color: COLORS.primary, marginVertical: 4 },
  lastEntryDate:  { fontSize: 13, color: COLORS.textSecondary },

  section:      { marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

  unitRow: { flexDirection: 'row', gap: 8 },
  unitBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#ccc', borderRadius: 12,
    paddingVertical: 10, alignItems: 'center',
  },
  unitBtnActive:     { borderColor: COLORS.primary, backgroundColor: COLORS.accent },
  unitBtnText:       { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  unitBtnTextActive: { color: COLORS.primary, fontWeight: '700' },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stoneRow: { flexDirection: 'row', gap: 12 },
  stoneField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18,
    fontWeight: '600', color: '#000', textAlign: 'center',
    backgroundColor: COLORS.surface,
  },
  inputSuffix: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '500', width: 28 },

  dateBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: '#ccc', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: COLORS.surface,
  },
  dateBtnText: { fontSize: 16, color: COLORS.textPrimary, fontWeight: '500' },
  dateBtnIcon: { fontSize: 18 },
  todayLink:   { marginTop: 8, alignSelf: 'flex-start' },
  todayLinkText:{ fontSize: 13, color: COLORS.primary },

  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginBottom: 24,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { color: '#fff', fontWeight: '700', fontSize: 17 },

  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  historyDate: { fontSize: 14, color: COLORS.textSecondary },
  historyVal:  { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
});

// ── Graph styles — Libre-inspired: white bg, y-axis right, clean gridlines ────
const graph = StyleSheet.create({
  container:  { marginBottom: 20 },
  entryCount: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6, textAlign: 'center' },
  chart: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  // Gridlines — subtle, Libre-style
  gridLine:  { position: 'absolute', height: 1, backgroundColor: 'rgba(0,0,0,0.06)' },
  segment:   { position: 'absolute', height: 2.5, backgroundColor: COLORS.primary, borderRadius: 1 },
  dot:       { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, borderWidth: 2, borderColor: '#fff' },
  // Y axis labels — LEFT side, Libre style
  yLabel:    { position: 'absolute', fontSize: 10, color: COLORS.textSecondary },
  // Unit label — top left, above y-axis values
  unitLabel: { position: 'absolute', fontSize: 10, color: COLORS.textSecondary, fontWeight: '600' },
  // X axis date labels
  xLabel:    { position: 'absolute', fontSize: 10, color: COLORS.textSecondary, width: 40, textAlign: 'center' },
});

// ── Calendar styles ───────────────────────────────────────────────────────────
const cal = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  box:       { backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '100%', elevation: 12, height: 420 },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  navBtn:    { padding: 8 },
  navText:   { fontSize: 22, color: COLORS.primary, fontWeight: '700' },
  monthLabel:{ fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  dayRow:    { flexDirection: 'row', marginBottom: 8 },
  dayHeader: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  grid:      { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100/7}%`, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center', borderRadius: 20,
  },
  cellSelected:  { backgroundColor: COLORS.primary },
  cellToday:     { borderWidth: 1.5, borderColor: COLORS.primary },
  cellFuture:    { opacity: 0.25 },
  cellText:      { fontSize: 14, color: COLORS.textPrimary },
  cellTextSelected: { color: '#fff', fontWeight: '700' },
  cellTextFuture:   { color: COLORS.textSecondary },
  cancelBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  cancelText:{ fontSize: 15, color: COLORS.textSecondary },
});
