/**
 * My T1D Mate — PremiumTeaserScreen
 * Session 16: Stub — content TBD with Dave.
 * Accessed via Chat tile on dashboard.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';

const COLORS = {
  primary:     '#003DA5',
  background:  '#F5F7FA',
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  accentLight: '#E8EFFF',
};

export default function PremiumTeaserScreen({ onBack }) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My T1D Mate</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.body}>
        <Text style={styles.emoji}>💬</Text>
        <Text style={styles.title}>Chat is coming soon</Text>
        <Text style={styles.subtitle}>
          Content TBD — watch this space.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 64 },
  backText:    { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '500' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  body: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emoji:    { fontSize: 48, marginBottom: 16 },
  title:    { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
});
