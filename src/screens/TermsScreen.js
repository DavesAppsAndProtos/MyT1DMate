/**
 * My T1D Mate — TermsScreen
 * Session 10: Terms & Conditions screen.
 *
 * Shown on first launch (before onboarding tour) if toc_agreed !== 'true'.
 * Accessible any time via hamburger menu → "View Terms".
 *
 * viewOnly prop:
 *   false (default) — first-launch flow: checkbox + Agree button, stores agreement
 *   true            — read-only view from hamburger, no checkbox/button
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { setProfileField } from '../database/db';

const COLORS = {
  primary:       '#003DA5',
  background:    '#F5F7FA',
  surface:       '#FFFFFF',
  textPrimary:   '#1A1A2E',
  textSecondary: '#6B7280',
  border:        'rgba(0,0,0,0.10)',
  accent:        '#E8EFFF',
  accentMid:     '#BBCFFF',
};

const TERMS = [
  {
    heading: 'About this app',
    body: 'My T1D Mate is a companion app designed to support people living with Type 1 Diabetes. It is not a medical device and is not intended to replace the advice of your diabetes healthcare team.',
  },
  {
    heading: 'Not medical advice',
    body: 'Nothing in this app constitutes medical advice, diagnosis, or treatment. Dose calculations are estimates based on information you provide and should always be confirmed with your diabetes team before acting on them.',
  },
  {
    heading: 'CGM data',
    body: 'Glucose readings displayed in this app are retrieved from Abbott\'s LibreLinkUp cloud service using your LibreLinkUp account credentials. My T1D Mate does not calibrate, validate, or guarantee the accuracy of these readings. Always refer to your CGM device or the LibreLink app for clinical decisions.',
  },
  {
    heading: 'Your data',
    body: 'All personal data entered into My T1D Mate (profile, glucose history, pins, weight logs) is stored locally on your device. It is not transmitted to any server or third party by this app.',
  },
  {
    heading: 'Beta software',
    body: 'This is pre-release (beta) software. Features may change, and the app may contain bugs. Please report anything unexpected to myt1dmate@gmail.com.',
  },
  {
    heading: 'Liability',
    body: 'The developers of My T1D Mate accept no liability for clinical decisions made on the basis of information provided by this app. Use this app as a tool to support — not replace — your own judgement and that of your healthcare team.',
  },
  {
    heading: 'Contact',
    body: 'Questions or concerns? Email us at myt1dmate@gmail.com.',
  },
];

export default function TermsScreen({ onAgree, onClose, viewOnly = false }) {
  const [checked, setChecked] = useState(false);
  const [saving,  setSaving]  = useState(false);

  const handleAgree = async () => {
    if (!checked || saving) return;
    setSaving(true);
    try {
      await setProfileField('toc_agreed', 'true');
      onAgree?.();
    } catch (e) {
      console.warn('[TermsScreen] Could not save agreement', e);
      onAgree?.(); // still proceed
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={styles.header}>
        {viewOnly && (
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 16 }}
            style={styles.backBtn}
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Terms & Conditions</Text>
        {viewOnly && <View style={styles.headerSpacer} />}
      </View>

      {/* Scrollable terms body */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Please read these terms before using My T1D Mate.
        </Text>

        {TERMS.map(({ heading, body }) => (
          <View key={heading} style={styles.section}>
            <Text style={styles.sectionHeading}>{heading}</Text>
            <Text style={styles.sectionBody}>{body}</Text>
          </View>
        ))}

        <Text style={styles.lastUpdated}>Last updated: June 2026 · v0.19 beta</Text>
      </ScrollView>

      {/* Agreement footer — only on first-launch flow */}
      {!viewOnly && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setChecked((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>
              I have read and agree to these terms
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.agreeBtn, (!checked || saving) && styles.agreeBtnDisabled]}
            onPress={handleAgree}
            disabled={!checked || saving}
            activeOpacity={0.85}
          >
            <Text style={styles.agreeBtnText}>
              {saving ? 'Saving…' : 'Agree & Continue'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  backBtn:       { paddingVertical: 4, paddingRight: 8 },
  backBtnText:   { color: '#fff', fontSize: 14, fontWeight: '500' },
  headerSpacer:  { width: 60 }, // mirror back button width to keep title centred

  scroll:        { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 32 },

  intro: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 21,
  },

  lastUpdated: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },

  // Footer (first-launch only)
  footer: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 14,
  },

  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  checkLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 21,
  },

  agreeBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  agreeBtnDisabled: { backgroundColor: '#ccc' },
  agreeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
