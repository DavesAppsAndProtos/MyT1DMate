/**
 * My T1D Mate — OnboardingTourScreen
 * Session 9: First-launch tour. One tile per screen. Skippable at any point.
 * Copy is stub — WorkshopDave rewrites before beta.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { t } from '../i18n/en';
import { Image } from 'react-native';

// Scales icon — CC0 asset from svgrepo.com (Sarah)
const SCALES_ASSET = require('../assets/scales.png');
function ScalesIcon({ size = 72 }) {
  return <Image source={SCALES_ASSET} style={{ width: size, height: size }} resizeMode="contain" />;
}

const COLORS = {
  primary:      '#003DA5',
  background:   '#F5F7FA',
  surface:      '#FFFFFF',
  textPrimary:  '#1A1A2E',
  textSecondary:'#6B7280',
  accent:       '#E8EFFF',
};

const SLIDES = [
  { emoji: '👋', titleKey: 'tourSlide1Title', bodyKey: 'tourSlide1Body' },
  { emoji: '📊', titleKey: 'tourSlide2Title', bodyKey: 'tourSlide2Body' },
  { emoji: '📌', titleKey: 'tourSlide3Title', bodyKey: 'tourSlide3Body' },
  { emoji: '💉', titleKey: 'tourSlide4Title', bodyKey: 'tourSlide4Body' },
  { emoji: null, svgIcon: 'scales', titleKey: 'tourSlide5Title', bodyKey: 'tourSlide5Body' },
  { emoji: '🚗', titleKey: 'tourSlide6Title', bodyKey: 'tourSlide6Body' },
  { emoji: '💬', titleKey: 'tourSlide7Title', bodyKey: 'tourSlide7Body' },
  { emoji: '☀️', titleKey: 'tourSlide8Title', bodyKey: 'tourSlide8Body' },
];

export default function OnboardingTourScreen({ onDone }) {
  const [index, setIndex] = useState(0);

  const slide      = SLIDES[index];
  const isLast     = index === SLIDES.length - 1;
  const isFirst    = index === 0;
  const progress   = (index + 1) / SLIDES.length;

  const next = () => {
    if (isLast) { onDone(); return; }
    setIndex((i) => i + 1);
  };

  const back = () => {
    if (isFirst) return;
    setIndex((i) => i - 1);
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* App bar */}
      <View style={styles.appBar}>
        <Text style={styles.appBarTitle}>{t('appName')}</Text>
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={onDone}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.skipText}>{t('skip')}</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Slide */}
      <View style={styles.slideArea}>
        {slide.svgIcon === 'scales'
          ? <ScalesIcon size={72} color={COLORS.primary} />
          : <Text style={styles.slideEmoji}>{slide.emoji}</Text>
        }
        <Text style={styles.slideTitle}>{t(slide.titleKey)}</Text>
        <Text style={styles.slideBody}>{t(slide.bodyKey)}</Text>
      </View>

      {/* Step dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>

      {/* Nav buttons */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navBack, isFirst && styles.navBackHidden]}
          onPress={back}
          disabled={isFirst}
        >
          <Text style={styles.navBackText}>{t('back')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navNext} onPress={next}>
          <Text style={styles.navNextText}>
            {isLast ? t('letsGo') : t('next')}
          </Text>
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
  appBarTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  skipBtn:  { paddingHorizontal: 4, paddingVertical: 4 },
  skipText: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },

  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(0,61,165,0.12)',
  },
  progressFill: {
    height: 3,
    backgroundColor: COLORS.primary,
  },

  slideArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 20,
  },
  slideEmoji: { fontSize: 72 },
  slideTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: 32,
  },
  slideBody: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,61,165,0.2)',
  },
  dotActive: {
    backgroundColor: COLORS.primary,
    width: 20,
  },

  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  navBack: { paddingVertical: 12, paddingHorizontal: 8 },
  navBackHidden: { opacity: 0 },
  navBackText: { fontSize: 15, color: COLORS.textSecondary },
  navNext: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  navNextText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
