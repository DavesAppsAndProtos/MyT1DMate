/**
 * My T1D Mate — WhatsNewScreen
 * Session 9: Shown once after each update. Skippable.
 * Jim populates. WorkshopDave refines copy before beta.
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
} from 'react-native';

const COLORS = {
  primary:      '#003DA5',
  background:   '#F5F7FA',
  surface:      '#FFFFFF',
  textPrimary:  '#1A1A2E',
  textSecondary:'#6B7280',
  accent:       '#E8EFFF',
  border:       'rgba(0,0,0,0.08)',
};

// Session 9 — Jim populates, Dave refines
const WHATS_NEW_ITEMS = [
  {
    emoji: '🏠',
    title: 'Dashboard is here',
    body:  'Chat was the whole app. Now it\'s one tile among many. The dashboard is your new home.',
  },
  {
    emoji: '☰',
    title: 'Hamburger menu',
    body:  'Settings, feedback, and more live in the menu top-left. The cog is gone.',
  },
  {
    emoji: '💉',
    title: 'Dose calculator',
    body:  'Enter your carbs, get your units. Uses the ratio from your Settings. Free. Always.',
  },
  {
    emoji: '📌',
    title: 'Hold That Thought — simplified',
    body:  'Pin anything in seconds. Categories gone for now — just pin it and find it later.',
  },
  {
    emoji: '🚗',
    title: 'Android Auto — coming soon',
    body:  'Glucose on your dashboard while you drive. It\'s coming.',
  },
  {
    emoji: '🎛️',
    title: 'Customise your dashboard',
    body:  'Hide tiles you don\'t use. Show the ones you do. Your call.',
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
        <Text style={styles.headerSub}>Session 9 — May 2026</Text>
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
