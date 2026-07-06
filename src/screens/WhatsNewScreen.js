/**
 * My T1D Mate — WhatsNewScreen
 * Session 9: Shown once after each update. Skippable.
 * Jim populates. WorkshopDave refines copy before beta.
 *
 * v1.1.0: Content replaced — previous Session 9 items (dashboard, hamburger
 * menu, dose calc, HTT, etc.) have long since shipped and are stale here.
 * Re-enabled in App.js (was suppressed for beta v1) with fresh content for
 * this release: Android Auto support.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Linking,
} from 'react-native';

import { AUTO_GITHUB_RELEASE_URL } from '../config/autoRelease';

const COLORS = {
  primary:      '#003DA5',
  background:   '#F5F7FA',
  surface:      '#FFFFFF',
  textPrimary:  '#1A1A2E',
  textSecondary:'#6B7280',
  accent:       '#E8EFFF',
  border:       'rgba(0,0,0,0.08)',
};

// v1.1.0 — Jim populates, Dave refines
const WHATS_NEW_ITEMS = [
  {
    emoji: '🚗',
    title: 'Android Auto support',
    body:  'My T1D Mate now connects to Android Auto. Install My T1D Mate Auto and plug in — your glucose reading appears right on your car\'s dashboard, no separate login needed.',
    link:  { label: 'Get it here', url: AUTO_GITHUB_RELEASE_URL },
  },
];

export default function WhatsNewScreen({ onDone }) {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* App bar */}
      <View style={styles.appBar}>
        <Text style={styles.appBarTitle}>My T1D Mate</Text>
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={onDone}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.skipText}>⏩ Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🎉</Text>
        <Text style={styles.headerTitle}>What's new in this update</Text>
        <Text style={styles.headerSub}>v1.1.0 — July 2026</Text>
      </View>

      {/* Items */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {WHATS_NEW_ITEMS.map((item, i) => (
          <View key={i} style={styles.item}>
            <Text style={styles.itemEmoji}>{item.emoji}</Text>
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemBody}>{item.body}</Text>
              {item.link ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(item.link.url)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.itemLink}>{item.link.label} →</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* CTA */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.doneBtn} onPress={onDone}>
          <Text style={styles.doneBtnText}>Let's go →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  appBarTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  skipBtn:     { paddingHorizontal: 4, paddingVertical: 4 },
  skipText:    { color: 'rgba(255,255,255,0.85)', fontSize: 14 },

  header: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 4,
  },
  headerEmoji: { fontSize: 40, marginBottom: 8 },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  headerSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, gap: 2 },

  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    gap: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  itemEmoji: { fontSize: 28, marginTop: 2 },
  itemText:  { flex: 1, gap: 2 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  itemBody:  { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },
  itemLink:  { fontSize: 14, color: COLORS.primary, fontWeight: '700', marginTop: 8 },

  footer: {
    padding: 24,
    paddingBottom: 32,
  },
  doneBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
});
