/**
 * My T1D Mate — Onboarding Screen (Session 3 fix)
 *
 * Changes:
 * - IC ratio fields: numeric-only, "1:N" format enforced
 * - Correction factor: numeric decimal only, mmol/L suffix
 * - Target glucose range: two numeric fields (low / high)
 * - Bolus "Other" placeholder: "Type your insulin name…" (matches basal)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import { saveProfile } from '../database/db';
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
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                {opt}
              </Text>
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

// ── Numeric IC ratio field ────────────────────────────────

const RatioInput = ({ value, onChange, placeholder }) => {
  const displayVal = () => {
    if (!value) return '';
    const parts = value.toString().split(':');
    return parts.length === 2 ? parts[1] : value.toString();
  };

  return (
    <View style={styles.ratioInputWrapper}>
      <Text style={styles.ratioPrefix}>1 : </Text>
      <TextInput
        style={styles.ratioInput}
        placeholder={placeholder || '10'}
        placeholderTextColor={COLORS.textSecondary}
        value={displayVal()}
        onChangeText={(t) => {
          const clean = t.replace(/[^0-9]/g, '');
          onChange(clean ? `1:${clean}` : '');
        }}
        keyboardType="number-pad"
        maxLength={3}
        autoCorrect={false}
      />
    </View>
  );
};

// ── Numeric input with optional suffix ───────────────────

const NumericInput = ({ value, onChange, placeholder, suffix, decimal, style }) => (
  <View style={[styles.numericWrapper, style]}>
    <TextInput
      style={styles.numericInput}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textSecondary}
      value={value ? value.toString() : ''}
      onChangeText={(t) => {
        const clean = decimal
          ? t.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
          : t.replace(/[^0-9]/g, '');
        onChange(clean);
      }}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      maxLength={6}
      autoCorrect={false}
    />
    {suffix ? <Text style={styles.numericSuffix}>{suffix}</Text> : null}
  </View>
);

// ── Main onboarding ───────────────────────────────────────

export default function OnboardingScreen({ onComplete }) {
  const [page, setPage] = useState('questions');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  const setValue = (field, val) => setValues((prev) => ({ ...prev, [field]: val }));

  const handleQuestionsNext = () => {
    if (!values.name || values.name.trim() === '') {
      Alert.alert(t('onboardingNoName'), t('onboardingNoNameMsg'));
      return;
    }
    setPage('disclaimer');
  };

  const handleDisclaimerAccepted = async () => {
    setSaving(true);
    try {
      const toSave = { ...values };
      // Combine target range into single string for storage
      if (values.target_range_low || values.target_range_high) {
        toSave.target_range = `${values.target_range_low || '?'}–${values.target_range_high || '?'} mmol/L`;
      }
      toSave.disclaimer_accepted = 'true';
      await saveProfile(toSave);
      onComplete(toSave.name.trim());
    } catch (e) {
      Alert.alert(t('onboardingSaveError'), t('onboardingSaveErrorMsg'));
      setSaving(false);
    }
  };

  // ── Disclaimer screen ─────────────────────────────────

  if (page === 'disclaimer') {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconLetter}>M</Text>
          </View>
          <Text style={styles.appName}>{t('onboardingAppName')}</Text>
          <Text style={styles.subtitle}>{t('onboardingSubtitle')}</Text>
        </View>
        <ScrollView contentContainerStyle={[styles.scrollContent, { flexGrow: 1, justifyContent: 'center' }]}>
          <View style={styles.disclaimerCard}>
            <Text style={styles.disclaimerTitle}>{t('disclaimerTitle')}</Text>

            <View style={styles.disclaimerSection}>
              <Text style={styles.disclaimerHeading}>{t('disclaimerMedical')}</Text>
              <Text style={styles.disclaimerBody}>
                {t('disclaimerMedBody')}
              </Text>
            </View>

            <View style={styles.disclaimerDivider} />

            <View style={styles.disclaimerSection}>
              <Text style={styles.disclaimerHeading}>{t('disclaimerNotAI')}</Text>
              <Text style={styles.disclaimerBody}>
                {t('disclaimerNotAIBody')}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.doneButton, saving && styles.doneButtonDisabled]}
              onPress={handleDisclaimerAccepted}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Text style={styles.doneButtonText}>
                {saving ? t('settingsSaving') : t('disclaimerAgreeBtn')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Questions screen ──────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconLetter}>M</Text>
        </View>
        <Text style={styles.appName}>{t('onboardingAppName')}</Text>
        <Text style={styles.subtitle}>{t('onboardingSubtitle')}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          {t('onboardingIntro')}
        </Text>

        {/* Q1 — Name */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>1. {t('onboardingQ1')}<Text style={styles.mandatory}> *</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="First name is fine"
            placeholderTextColor={COLORS.textSecondary}
            value={values.name || ''}
            onChangeText={(v) => setValue('name', v)}
            autoCorrect={false}
          />
        </View>

        {/* Q2 — How long with T1D */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>{t('onboardingQ2')}</Text>
          <PillSelect
            options={['Less than 6 months', '6 months – 2 years', '2 – 10 years', '10+ years']}
            value={values.years_since_dx}
            onChange={(v) => setValue('years_since_dx', v)}
          />
        </View>

        {/* Q3 — Confidence */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>3. How confident are you managing your T1D day to day?</Text>
          <PillSelect
            options={['No clue yet', 'Still finding my feet', 'Getting there', 'Pretty confident', "I've got this"]}
            value={values.confidence_level}
            onChange={(v) => setValue('confidence_level', v)}
          />
        </View>

        {/* Q4 — Bolus insulin */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>{t('onboardingQ3')}</Text>
          <PillSelect
            options={['NovoRapid', 'Humalog', 'Fiasp', 'Lyumjev', 'Other']}
            value={values.insulin_type}
            onChange={(v) => setValue('insulin_type', v)}
            otherPlaceholder="Type your insulin name…"
          />
        </View>

        {/* Q5 — Basal insulin */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>{t('onboardingQ4')}</Text>
          <PillSelect
            options={['No basal', 'Lantus', 'Abasaglar', 'Levemir', 'Toujeo', 'Tresiba', 'Other']}
            value={values.basal_insulin}
            onChange={(v) => setValue('basal_insulin', v)}
            otherPlaceholder="Type your basal insulin name…"
          />
        </View>

        {/* Q6 — Delivery method */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>{t('onboardingQ5')}</Text>
          <View style={styles.choiceRow}>
            {['Pump', 'Injections'].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.choiceButton, values.delivery_method?.toLowerCase() === opt.toLowerCase() && styles.choiceButtonSelected]}
                onPress={() => setValue('delivery_method', opt)}
                activeOpacity={0.7}
              >
                <Text style={[styles.choiceText, values.delivery_method?.toLowerCase() === opt.toLowerCase() && styles.choiceTextSelected]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Q7 — CGM */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>{t('onboardingQ6')}</Text>
          <PillSelect
            options={['Freestyle Libre 2', 'Freestyle Libre 3', 'Dexcom G6', 'Dexcom G7', 'None', 'Other']}
            value={values.cgm}
            onChange={(v) => setValue('cgm', v)}
            otherPlaceholder="Type your CGM name…"
          />
        </View>

        {/* Q8 — IC ratios — numeric only */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>{t('onboardingQ7')}</Text>
          <Text style={styles.qHint}>{t('onboardingHintIC')}</Text>
          {[
            { field: 'ic_ratio_breakfast', label: '🌅 Breakfast', placeholder: '8' },
            { field: 'ic_ratio_lunch', label: '☀️ Lunch', placeholder: '10' },
            { field: 'ic_ratio_evening', label: '🌙 Evening meal', placeholder: '10' },
            { field: 'ic_ratio_overnight', label: '💤 Overnight', placeholder: '12' },
          ].map(({ field, label, placeholder }) => (
            <View key={field} style={styles.ratioRow}>
              <Text style={styles.ratioLabel}>{label}</Text>
              <RatioInput
                value={values[field]}
                onChange={(v) => setValue(field, v)}
                placeholder={placeholder}
              />
            </View>
          ))}
        </View>

        {/* Q9 — Correction factor — numeric */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>{t('onboardingQ8')}</Text>
          <Text style={styles.qHint}>{t('onboardingHintCF')}</Text>
          <NumericInput
            value={values.correction_factor}
            onChange={(v) => setValue('correction_factor', v)}
            placeholder="3"
            suffix="mmol/L per unit"
            decimal
          />
        </View>

        {/* Q10 — Target range — two numeric fields */}
        <View style={styles.qBlock}>
          <Text style={styles.qLabel}>{t('onboardingQ9')}</Text>
          <Text style={styles.qHint}>{t('onboardingHintRange')}</Text>
          <View style={styles.rangeRow}>
            <NumericInput
              value={values.target_range_low}
              onChange={(v) => setValue('target_range_low', v)}
              placeholder="5"
              decimal
              style={{ flex: 1 }}
            />
            <Text style={styles.rangeSeparator}>–</Text>
            <NumericInput
              value={values.target_range_high}
              onChange={(v) => setValue('target_range_high', v)}
              placeholder="8"
              decimal
              style={{ flex: 1 }}
            />
            <Text style={styles.rangeUnit}>mmol/L</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.doneButton} onPress={handleQuestionsNext} activeOpacity={0.85}>
          <Text style={styles.doneButtonText}>{t('onboardingNextBtn')}</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>{t('onboardingFooter')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 28,
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#FFFFFF22', borderWidth: 2, borderColor: '#FFFFFF44',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  iconLetter: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', letterSpacing: 1 },
  appName: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', letterSpacing: 0.5 },
  subtitle: { color: COLORS.accentMid, fontSize: 14, marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  intro: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 24, textAlign: 'center' },
  qBlock: { marginBottom: 24 },
  qLabel: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 8, lineHeight: 20 },
  qHint: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 18 },
  mandatory: { color: COLORS.primary },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.accentMid,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: COLORS.textPrimary,
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

  ratioRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  ratioLabel: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '500', width: 130 },
  ratioInputWrapper: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.accentMid,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
  },
  ratioPrefix: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600', marginRight: 2 },
  ratioInput: { flex: 1, fontSize: 15, color: COLORS.textPrimary, padding: 0 },

  numericWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.accentMid,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
  },
  numericInput: { fontSize: 15, color: COLORS.textPrimary, padding: 0, minWidth: 60 },
  numericSuffix: { color: COLORS.textSecondary, fontSize: 13, marginLeft: 8 },

  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeSeparator: { color: COLORS.textSecondary, fontSize: 18, fontWeight: '300' },
  rangeUnit: { color: COLORS.textSecondary, fontSize: 13, marginLeft: 4 },

  disclaimerCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: COLORS.accentMid, margin: 20,
  },
  disclaimerTitle: { color: COLORS.primary, fontSize: 20, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  disclaimerSection: { marginBottom: 16 },
  disclaimerHeading: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  disclaimerBody: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21 },
  disclaimerDivider: { height: 1, backgroundColor: COLORS.accentMid, marginVertical: 16 },
  doneButton: {
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', marginTop: 12, marginBottom: 16,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  doneButtonDisabled: { opacity: 0.6 },
  doneButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  footer: { color: COLORS.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 4 },
});
