/**
 * My T1D Mate — Settings Screen (Session 3 fix)
 *
 * Changes:
 * - IC ratio fields: numeric-only (keyboardType decimal-pad), format enforced as "1:N"
 * - Correction factor: numeric-only decimal input, mmol/L suffix shown
 * - Target glucose range: two numeric fields (low / high) instead of free text
 * - Bolus "Other" placeholder: "Type your insulin name…" (matches basal)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  StatusBar,
  Alert,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { getProfile, saveProfile, clearProfileFields } from '../database/db';
import { t } from '../i18n/en';

const COLORS = {
  primary: '#003DA5',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  accentLight: '#E8EFFF',
  accentMid: '#BBCFFF',
};

// ── Reusable pill-select ──────────────────────────────────

const PillSelect = ({ options, value, onChange, otherPlaceholder }) => {
  const [otherText, setOtherText] = useState('');
  const hasOther = options.includes('Other');
  const isOtherSelected =
    value === 'Other' ||
    (typeof value === 'string' && !options.includes(value) && value !== '' && value !== undefined);

  useEffect(() => {
    if (isOtherSelected && value !== 'Other') setOtherText(value);
  }, []);

  return (
    <View>
      <View style={styles.pillGrid}>
        {options.map((opt) => {
          const selected = opt === 'Other' ? isOtherSelected : value === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.pill, selected && styles.pillSelected]}
              onPress={() => onChange(opt === 'Other' ? 'Other' : opt)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {hasOther && isOtherSelected && (
        <TextInput
          style={[styles.input, { marginTop: 10 }]}
          placeholder={otherPlaceholder || 'Type here…'}
          placeholderTextColor={COLORS.textSecondary}
          value={otherText}
          onChangeText={(t) => {
            setOtherText(t);
            onChange(t);
          }}
          autoCorrect={false}
        />
      )}
    </View>
  );
};

// ── IC ratio row — both sides TextInput ──────────────────────────────────────
// Stored as "L:R" string, e.g. "1.5:10".
// Dose calc reads both sides: dose = carbs ÷ R × L
// Pink background until the user has entered a value.

const RatioRow = ({ label, value, onChange }) => {
  const parse = (v) => {
    if (!v) return { left: '', right: '' };
    const parts = v.toString().split(':');
    return parts.length === 2
      ? { left: parts[0] || '', right: parts[1] || '' }
      : { left: parts[0] || '', right: '' };
  };

  const parsed = parse(value);
  const [localLeft,  setLocalLeft]  = React.useState(parsed.left);
  const [localRight, setLocalRight] = React.useState(parsed.right);

  React.useEffect(() => {
    const p = parse(value);
    setLocalLeft(p.left);
    setLocalRight(p.right);
  }, [value]);

  const isSet = !!value && value !== '';

  const handleLeftChange = (v) => {
    const clean = v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setLocalLeft(clean);
    if (clean && localRight) onChange(`${clean}:${localRight}`);
  };

  const handleRightChange = (v) => {
    const clean = v.replace(/[^0-9]/g, '');
    setLocalRight(clean);
    if (localLeft && clean) onChange(`${localLeft}:${clean}`);
  };

  const inputStyle = (hasVal) => [
    styles.ratioNumericInput,
    !hasVal && styles.ratioNumericInputUnset,
  ];

  return (
    <View style={styles.ratioWheelRow}>
      <Text style={styles.ratioLabel}>{label}</Text>
      <View style={styles.ratioWheelPair}>
        <View style={styles.ratioWheelBlock}>
          <Text style={styles.ratioWheelColLabel}>{t('settingsColInsulin')}</Text>
          <TextInput
            style={inputStyle(!!localLeft)}
            value={localLeft}
            onChangeText={handleLeftChange}
            keyboardType="decimal-pad"
            maxLength={4}
            placeholder="1"
            placeholderTextColor="#aaa"
          />
        </View>
        <Text style={styles.ratioDropdownColon}>:</Text>
        <View style={styles.ratioWheelBlock}>
          <Text style={styles.ratioWheelColLabel}>{t('settingsColCarbs')}</Text>
          <TextInput
            style={inputStyle(!!localRight)}
            value={localRight}
            onChangeText={handleRightChange}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="10"
            placeholderTextColor="#aaa"
          />
        </View>
      </View>
    </View>
  );
};

// ── Confidence slider — 5 discrete stops, draggable ─────────────────────────
// Stored as '1'–'5'. Snaps to nearest stop — no analogue in-between.

const CONFIDENCE_LABELS = [
  { val: '1', tip: 'Still finding my feet' },
  { val: '2', tip: 'Learning the ropes' },
  { val: '3', tip: 'Getting there' },
  { val: '4', tip: 'Pretty confident' },
  { val: '5', tip: "I've got this" },
];

const normaliseConfidence = (v) => {
  if (!v) return null;
  if (['1','2','3','4','5'].includes(String(v))) return String(v);
  const legacy = {
    'No clue yet':           '1',
    'Still finding my feet': '2',
    'Getting there':         '3',
    'Pretty confident':      '4',
    "I've got this":         '5',
  };
  return legacy[v] || null;
};

const ConfidenceSlider = ({ value, onChange }) => {
  const current    = normaliseConfidence(value);
  const idx        = current ? parseInt(current, 10) - 1 : -1;
  const trackWidth = React.useRef(0);
  const dragIdx    = React.useRef(idx);

  const xToIdx = (x, w) => Math.round(Math.max(0, Math.min(4, (x / w) * 4)));

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (evt) => {
        const i = xToIdx(evt.nativeEvent.locationX, trackWidth.current);
        dragIdx.current = i;
        onChange(String(i + 1));
      },
      onPanResponderMove: (evt) => {
        const i = xToIdx(evt.nativeEvent.locationX, trackWidth.current);
        if (i !== dragIdx.current) { dragIdx.current = i; onChange(String(i + 1)); }
      },
    })
  ).current;

  const tip      = idx >= 0 ? CONFIDENCE_LABELS[idx]?.tip : 'Drag to set your experience level';
  const fillPct  = idx >= 0 ? `${(idx / 4) * 100}%` : '0%';
  const thumbPct = idx >= 0 ? `${(idx / 4) * 100}%` : null;

  return (
    <View style={cs.wrapper}>
      <View
        style={cs.trackRow}
        onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
      >
        <View style={cs.track} />
        <View style={[cs.trackFill, { width: fillPct }]} pointerEvents="none" />

        {CONFIDENCE_LABELS.map((item, i) => (
          <View
            key={item.val}
            pointerEvents="none"
            style={[
              cs.stop,
              idx >= 0 && i <= idx && cs.stopActive,
              { left: `${(i / 4) * 100}%` },
            ]}
          />
        ))}

        {thumbPct !== null && (
          <View pointerEvents="none" style={[cs.thumb, { left: thumbPct }]} />
        )}
      </View>

      <View style={cs.endLabels}>
        <Text style={cs.endLabel}>{'Little to no\nexperience'}</Text>
        <Text style={[cs.endLabel, { textAlign: 'right' }]}>{'Experienced\nT1D'}</Text>
      </View>

      <View style={cs.tipRow}>
        <View style={[cs.tipBadge, idx < 0 && cs.tipBadgeUnset]}>
          <Text style={[cs.tipText, idx < 0 && cs.tipTextUnset]}>{tip}</Text>
        </View>
      </View>
    </View>
  );
};


const cs = StyleSheet.create({
  wrapper:      { paddingVertical: 8 },
  trackRow: {
    height: 44, justifyContent: 'center',
    position: 'relative', marginHorizontal: 14,
  },
  track:        { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },
  trackFill:    { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: COLORS.primary },
  stop: {
    position: 'absolute', width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#D1D5DB', borderWidth: 2, borderColor: '#fff',
    top: 16, marginLeft: -6,
  },
  stopActive:    { backgroundColor: COLORS.primary },
  thumb: {
    position: 'absolute', width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary, borderWidth: 3, borderColor: '#fff',
    top: 8, marginLeft: -14,
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.20, shadowRadius: 3,
  },
  endLabels:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginHorizontal: 4 },
  endLabel:      { fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },
  tipRow:        { alignItems: 'center', marginTop: 12 },
  tipBadge:      { backgroundColor: COLORS.accentLight, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  tipBadgeUnset: { backgroundColor: '#FFF0F0' },
  tipText:       { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  tipTextUnset:  { color: '#F87171', fontWeight: '400', fontStyle: 'italic' },
});


// ── Main settings screen ──────────────────────────────────

export default function SettingsScreen({ onClose }) {
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);

  // Dismiss any keyboard carried over from previous screen
  useEffect(() => { Keyboard.dismiss(); }, []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      // Split target_range "5-8" into low/high if stored as combined string
      if (profile.target_range && !profile.target_range_low) {
        const parts = profile.target_range.toString().split(/[-–]/);
        if (parts.length === 2) {
          profile.target_range_low = parts[0].trim();
          profile.target_range_high = parts[1].trim();
        }
      }
      // Session 27 P2: convert target range to mg/dL for display if unit is mgdl.
      // Values are always stored internally in mmol/L — convert for display only.
      if ((profile.glucose_unit || 'mmol') === 'mgdl') {
        const MMOL_TO_MGDL = 18.0182;
        if (profile.target_range_low)
          profile.target_range_low = String(Math.round(parseFloat(profile.target_range_low) * MMOL_TO_MGDL));
        if (profile.target_range_high)
          profile.target_range_high = String(Math.round(parseFloat(profile.target_range_high) * MMOL_TO_MGDL));
      }
      setValues(profile);
      setLoading(false);
    })();
  }, []);

  const setValue = (field, val) => setValues((prev) => ({ ...prev, [field]: val }));

  const handleSave = async () => {
    // Combine low/high back into target_range for storage.
    // Session 27 P2: values are displayed in the user's chosen unit but always
    // stored in mmol/L — convert back before saving if unit is mg/dL.
    const toSave = { ...values };
    const isMgdl = (values.glucose_unit || 'mmol') === 'mgdl';
    const MGDL_TO_MMOL = 1 / 18.0182;
    const unitLabel = isMgdl ? 'mg/dL' : 'mmol/L';

    let low  = parseFloat(values.target_range_low);
    let high = parseFloat(values.target_range_high);
    if (isMgdl) {
      low  = low  ? parseFloat((low  * MGDL_TO_MMOL).toFixed(1)) : low;
      high = high ? parseFloat((high * MGDL_TO_MMOL).toFixed(1)) : high;
    }
    if (values.target_range_low || values.target_range_high) {
      toSave.target_range_low  = isNaN(low)  ? values.target_range_low  : String(low);
      toSave.target_range_high = isNaN(high) ? values.target_range_high : String(high);
      toSave.target_range = `${toSave.target_range_low || '?'}–${toSave.target_range_high || '?'} ${unitLabel}`;
    }
    setSaving(true);
    try {
      await saveProfile(toSave);
      Alert.alert(t('settingsSaved'), t('settingsSavedMsg'), [
        { text: t('ok'), onPress: onClose },
      ]);
    } catch {
      Alert.alert(t('settingsSaveError'), t('settingsSaveErrorMsg'));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.flex, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton} activeOpacity={0.7}>
          <Text style={styles.backText}>{t('back')}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('settingsTitle')}</Text>
          <Text style={styles.headerSub}>{t('settingsSubtitle')}</Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Delivery method — hidden from beta Settings but value retained for ICR overnight logic */}
        <View style={[styles.qBlock, { display: 'none' }]}>
          <Text style={styles.qLabel}>{t('settingsLabelDelivery')}</Text>
          <View style={styles.choiceRow}>
            {[t('settingsDeliveryPump'), t('settingsDeliveryInj')].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.choiceButton, (values.delivery_method?.toLowerCase() === opt.toLowerCase()) && styles.choiceButtonSelected]}
                onPress={() => setValue('delivery_method', opt)}
                activeOpacity={0.7}
              >
                <Text style={[styles.choiceText, (values.delivery_method?.toLowerCase() === opt.toLowerCase()) && styles.choiceTextSelected]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* IC Ratios */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>{t('settingsLabelICRatios')}</Text>
          <Text style={styles.qHint}>{t('settingsHintICRatios')}</Text>
          {[
            { field: 'ic_ratio_breakfast', label: t('settingsICBreakfast') },
            { field: 'ic_ratio_lunch',     label: t('settingsICLunch') },
            { field: 'ic_ratio_evening',   label: t('settingsICEvening') },
            { field: 'ic_ratio_overnight', label: t('settingsICOvernight') },
          ].map(({ field, label }) => (
            <RatioRow
              key={field}
              label={label}
              value={values[field]}
              onChange={(v) => setValue(field, v)}
            />
          ))}
        </View>

        {/* Glucose display unit */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>{t('settingsLabelGlucoseUnit')}</Text>
          <Text style={styles.qHint}>{t('settingsHintGlucoseUnit')}</Text>
          <View style={styles.choiceRow}>
            {[
              { label: 'mmol/L', value: 'mmol' },
              { label: 'mg/dL',  value: 'mgdl' },
            ].map(({ label, value }) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.choiceButton,
                  (values.glucose_unit || 'mmol') === value && styles.choiceButtonSelected,
                ]}
                onPress={() => setValue('glucose_unit', value)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.choiceText,
                  (values.glucose_unit || 'mmol') === value && styles.choiceTextSelected,
                ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Target glucose range */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>{t('settingsLabelTargetRange')}</Text>
          <Text style={styles.qHint}>
            {(values.glucose_unit || 'mmol') === 'mmol'
              ? t('settingsHintTargetMmol')
              : t('settingsHintTargetMgdl')}
          </Text>
          <View style={styles.rangeRow}>
            <View style={styles.rangeWheelBlock}>
              <Text style={styles.ratioWheelColLabel}>{t('settingsColLow')}</Text>
              <TextInput
                style={[styles.rangeTextInput, !values.target_range_low && styles.rangeTextInputUnset]}
                value={values.target_range_low || ''}
                onChangeText={(v) => {
                  const clean = v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                  setValue('target_range_low', clean);
                }}
                keyboardType="decimal-pad"
                maxLength={5}
                placeholder={(values.glucose_unit || 'mmol') === 'mmol' ? '5.0' : '90'}
                placeholderTextColor="#aaa"
              />
            </View>
            <Text style={styles.rangeSeparator}>–</Text>
            <View style={styles.rangeWheelBlock}>
              <Text style={styles.ratioWheelColLabel}>{t('settingsColHigh')}</Text>
              <TextInput
                style={[styles.rangeTextInput, !values.target_range_high && styles.rangeTextInputUnset]}
                value={values.target_range_high || ''}
                onChangeText={(v) => {
                  const clean = v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                  setValue('target_range_high', clean);
                }}
                keyboardType="decimal-pad"
                maxLength={5}
                placeholder={(values.glucose_unit || 'mmol') === 'mmol' ? '8.0' : '144'}
                placeholderTextColor="#aaa"
              />
            </View>
            <Text style={styles.rangeUnit}>
              {(values.glucose_unit || 'mmol') === 'mmol' ? 'mmol/L' : 'mg/dL'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={styles.saveButtonText}>{saving ? t('settingsSaving') : t('settingsSaveBtn')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resetButton}
          onPress={() => {
            Alert.alert(
              t('settingsResetTitle'),
              t('settingsResetMsg'),
              [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('reset'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await clearProfileFields([]);
                      setValues({});
                    } catch {
                      Alert.alert(t('settingsSaveError'), t('settingsResetError'));
                    }
                  },
                },
              ],
            );
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.resetButtonText}>{t('settingsResetBtn')}</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 48 : 52,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backButton: { width: 64 },
  backText: { color: COLORS.accentMid, fontSize: 15, fontWeight: '500' },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  headerSub: { color: COLORS.accentMid, fontSize: 11, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  qBlock: { marginBottom: 24 },
  qLabel: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 8 },
  qHint: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 10 },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.accentMid,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: COLORS.textPrimary,
  },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderWidth: 1.5, borderColor: COLORS.accentMid, borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 14, backgroundColor: COLORS.surface,
  },
  pillSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '500' },
  pillTextSelected: { color: '#FFFFFF', fontWeight: '700' },
  choiceRow: { flexDirection: 'row', gap: 10 },
  choiceButton: {
    flex: 1, borderWidth: 1.5, borderColor: COLORS.accentMid,
    borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: COLORS.surface,
  },
  choiceButtonSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  choiceText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '500' },
  choiceTextSelected: { color: '#FFFFFF', fontWeight: '700' },

  // ── WheelPicker styles ───────────────────────────────────────────────────
  wheelRow:             { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  wheelCheckbox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: COLORS.accentMid, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  wheelCheckboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  wheelCheckboxTick:    { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  wheelLabel:           { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.textPrimary },
  wheelLabelUnset:      { color: COLORS.textSecondary, opacity: 0.5 },
  wheelPickerWrap:      { borderWidth: 1.5, borderColor: COLORS.accentMid, borderRadius: 10, backgroundColor: COLORS.surface, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  wheelPickerWrapUnset: { backgroundColor: '#F5F5F5', borderColor: '#DDD', opacity: 0.5 },
  wheelPicker:          { width: 100, height: 44, color: COLORS.textPrimary },
  wheelSuffix:          { fontSize: 12, color: COLORS.textSecondary, marginRight: 8 },

  // Ratio TextInput styles (replaces Picker)
  ratioNumericInput: {
    width: 80, height: 44, paddingHorizontal: 12, fontSize: 16,
    color: COLORS.textPrimary, textAlign: 'center',
    borderWidth: 1.5, borderColor: COLORS.accentMid, borderRadius: 10,
    backgroundColor: COLORS.surface,
  },
  ratioNumericInputUnset: {
    backgroundColor: '#FFF0F0', borderColor: '#FFBBBB',
  },

  // Range TextInput styles
  rangeTextInput: {
    width: 80, height: 44, paddingHorizontal: 12, fontSize: 16,
    color: COLORS.textPrimary, textAlign: 'center',
    borderWidth: 1.5, borderColor: COLORS.accentMid, borderRadius: 10,
    backgroundColor: COLORS.surface,
  },
  rangeTextInputUnset: {
    backgroundColor: '#FFF0F0', borderColor: '#FFBBBB',
  },

  // Ratio wheel row
  ratioWheelRow:        { marginBottom: 14 },
  ratioWheelPair:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  ratioWheelBlock:      { alignItems: 'center' },
  ratioWheelColLabel:   { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 0.5, marginBottom: 2 },
  ratioWheelPicker:     { width: 90, height: 44, color: COLORS.textPrimary },
  ratioTextInput:       { width: 90, height: 44, paddingHorizontal: 12, fontSize: 16, color: COLORS.textPrimary, textAlign: 'center' },

  // Target range wheel row
  rangeWheelRow:        { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  rangeWheelBlock:      { alignItems: 'center' },

  // Ratio row
  ratioRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  ratioLabel: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '500', width: 130 },

  // Ratio dropdown pair
  ratioColLabels:         { flexDirection: 'row', alignItems: 'center', marginBottom: 4, paddingLeft: 2 },
  ratioColLabel:          { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, minWidth: 56, textAlign: 'center' },
  ratioDropdownRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ratioDropdownBox:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: COLORS.accentMid, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.surface, minWidth: 56, justifyContent: 'center' },
  ratioDropdownValue:        { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  ratioDropdownBoxUnset:     { backgroundColor: '#FFF0F0' },
  ratioDropdownValueUnset:   { color: '#E53E3E', opacity: 0.6 },
  ratioDropdownCaret:     { fontSize: 12, color: COLORS.textSecondary, marginLeft: 2 },
  ratioDropdownColon:     { fontSize: 18, fontWeight: '700', color: COLORS.textSecondary },
  ratioPickerOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 60 },
  ratioPickerBox:         { backgroundColor: '#fff', borderRadius: 16, padding: 8, maxHeight: 320, width: '100%', elevation: 8 },
  ratioPickerTitle:       { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 10, fontWeight: '600' },
  ratioPickerRow:         { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, marginVertical: 1 },
  ratioPickerRowActive:   { backgroundColor: COLORS.primary },
  ratioPickerRowText:     { fontSize: 16, color: COLORS.textPrimary, textAlign: 'center' },
  ratioPickerRowTextActive: { color: '#fff', fontWeight: '700' },
  // Aliases used by RatioDropdown modals
  ratioModalOverlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 60 },
  ratioModalBox:              { backgroundColor: '#fff', borderRadius: 16, padding: 8, maxHeight: 320, width: '100%', elevation: 8 },
  ratioModalTitle:            { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 10, fontWeight: '600' },
  ratioModalOption:           { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, marginVertical: 1 },
  ratioModalOptionText:       { fontSize: 16, color: COLORS.textPrimary, textAlign: 'center' },
  ratioModalOptionSelected:   { color: COLORS.primary, fontWeight: '700' },

  ratioInputWrapper: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.accentMid,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
  },
  ratioPrefix: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600', marginRight: 2 },
  ratioInput: { flex: 1, fontSize: 15, color: COLORS.textPrimary, padding: 0 },

  // Numeric input with suffix
  numericWrapperUnset: {
    backgroundColor: '#FFF0F0',
    borderRadius: 10,
  },
  numericWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.accentMid,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
  },
  numericInput: { fontSize: 15, color: COLORS.textPrimary, padding: 0, minWidth: 60 },
  numericSuffix: { color: COLORS.textSecondary, fontSize: 13, marginLeft: 8 },

  // Target range row
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeSeparator: { color: COLORS.textSecondary, fontSize: 18, fontWeight: '300' },
  rangeUnit: { color: COLORS.textSecondary, fontSize: 13, marginLeft: 4 },

  resetButton: {
    borderWidth: 1.5,
    borderColor: '#CC3333',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  resetButtonText: { color: '#CC3333', fontSize: 15, fontWeight: '600' },

  saveButton: {
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 8,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  // ── Feedback button (Session 8) ──────────────────────────────────────────
  feedbackButton: {
    borderWidth: 1.5,
    borderColor: '#003DA5',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#FFFFFF',
  },
  feedbackButtonText: {
    color: '#003DA5',
    fontSize: 15,
    fontWeight: '600',
  },

  // ── Battery optimisation button (Session 17) ─────────────────────────────
  batteryBtn: {
    borderWidth: 1.5,
    borderColor: '#003DA5',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: 4,
  },
  batteryBtnText: {
    color: '#003DA5',
    fontSize: 15,
    fontWeight: '600',
  },

  // ── Feedback modal (Session 8) ───────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  modalHint: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
  },
  modalTypeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  modalTypeButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#BBCFFF',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
  },
  modalTypeButtonSelected: {
    backgroundColor: '#003DA5',
    borderColor: '#003DA5',
  },
  modalTypeText: {
    color: '#1A1A2E',
    fontSize: 14,
    fontWeight: '500',
  },
  modalTypeTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalInput: {
    backgroundColor: '#F5F7FA',
    borderWidth: 1,
    borderColor: '#BBCFFF',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1A1A2E',
    minHeight: 110,
    marginBottom: 16,
  },
  dawnTimeRow:            { marginTop: 12 },
  dawnTimePicker:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  dawnTimeBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.accentMid, backgroundColor: COLORS.surface,
  },
  dawnTimeBtnSelected:     { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dawnTimeBtnText:         { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  dawnTimeBtnTextSelected: { color: '#fff', fontWeight: '700' },
});
