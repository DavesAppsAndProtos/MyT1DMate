/**
 * My T1D Mate — SplitScreen
 * Session 11:
 *   - Drawer lifted here — works from all screens
 *   - Last known glucoData cached — no more blank number on remount
 *   - Compact strip shows number + arrow + freshness when tile is open
 *   - Stable useCallback handlers throughout
 *
 * Session 14:
 *   - Split position restore fix — no more jump to top on reopen
 *   - Snap-to-slim only fires when actually leaving dashboard, not on load
 *   - Privacy Notice added to hamburger menu
 */

import React, {
  useEffect, useState, useCallback, useRef, useMemo,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
  AppState,
  useWindowDimensions,
  BackHandler,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import GlucosePanel         from './GlucosePanel';
import ChatScreen           from './ChatScreen';
import DashboardScreen      from './DashboardScreen';
import WeightScreen         from './WeightScreen';
import PremiumTeaserScreen  from './PremiumTeaserScreen';
import { getProfile, getGlucoseHistory }  from '../database/db';
import { getGlucoseColor } from './GlucosePanel';
import { t } from '../i18n/en';

const COLORS = { primary: '#003DA5', diabetesBlue: '#003DA5' };

const MAX_HISTORY = 360; // 6 hours at 1 reading/min
const DEFAULT_THRESHOLDS = { critLow: 3.0, warnLow: 3.9, warnHigh: 10.0, critHigh: 13.9 };

const TREND_ARROWS = {
  1: '↓↓', 2: '↓', 3: '↘', 4: '→', 5: '↗', 6: '↑', 7: '↑↑', // Abbott 1-7 scale
};

const getFreshnessLabel = (timestampMs) => {
  if (!timestampMs) return '';
  const diffMins = Math.floor((Date.now() - timestampMs) / 60000);
  if (diffMins < 1)   return 'now';
  if (diffMins === 1) return '1m';
  if (diffMins < 60)  return `${diffMins}m`;
  return `${Math.floor(diffMins / 60)}h`;
};

// Session 14: Privacy Notice added
const DRAWER_ITEMS = [
  { id: 'settings',    label: () => t('menuSettings'),    emoji: '⚙️' },
  { id: 'notifs',      label: () => t('menuNotifs'),      emoji: '🔔' },
  { id: 'access',      label: () => t('menuAccess'),      emoji: '♿' },
  { id: 'customise',   label: () => t('menuCustomise'),   emoji: '🎛️' },
  { id: 'privacy',     label: () => t('menuPrivacy'),     emoji: '🔒' },
  { id: 'terms',       label: () => t('menuTerms'),       emoji: '📋' },
  { id: 'replay_tour', label: () => t('menuReplayTour'),  emoji: '👋' },
  { id: 'about',       label: () => t('menuAbout'),       emoji: 'ℹ️' },
];

export default function SplitScreen({
  userName,
  onOpenSettings,
  messages,
  setMessages,
  routerState,
  setRouterState,
  glucoData,
  backfillTick,
  settingsTick,
  freshnessMs,
  onOpenTerms,
  onReplayTour,
}) {
  const { height: screenHeight } = useWindowDimensions();
  const [history,        setHistory]        = useState([]);
  const [thresholds,     setThresholds]     = useState(DEFAULT_THRESHOLDS);
  const [isMgdl,         setIsMgdl]         = useState(false); // Session 27 P2
  const [bottomView,     setBottomView]     = useState('dashboard');
  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);

  // ── Cache last known glucoData — never render blank after remount ──────────
  const lastGlucoRef = useRef(null);
  if (glucoData?.glucose > 0) lastGlucoRef.current = glucoData;
  const stableGluco = glucoData?.glucose > 0 ? glucoData : lastGlucoRef.current;

  // ── Load thresholds from profile ──────────────────────────────────────────
  // reloadThresholds is called on mount and on every glucoData tick so changes
  // saved in Settings take effect within one poll cycle (~1 min).

  // ── Load thresholds from profile ──────────────────────────────────────────
  // Session 27 P1: colour thresholds are now hardcoded to match LibreLink exactly.
  // critLow: 3.1, warnLow: 3.9, warnHigh: 10.0, critHigh: 13.9
  // The previous offset calculation (warnLow - 0.9, warnHigh + 3.9) produced
  // thresholds that diverged from LibreLink as users changed their target range.
  // Target range (warnLow/warnHigh) still comes from Settings — it controls the
  // green graph band only, not the colour thresholds.
  const FIXED_THRESHOLDS = {
    critLow:  3.1,
    warnLow:  3.9,
    warnHigh: 10.0,
    critHigh: 13.9,
  };

  const reloadThresholds = useCallback(async () => {
    try {
      const profile  = await getProfile();
      const warnLow  = parseFloat(profile.target_range_low)  || DEFAULT_THRESHOLDS.warnLow;
      const warnHigh = parseFloat(profile.target_range_high) || DEFAULT_THRESHOLDS.warnHigh;
      setThresholds({
        ...FIXED_THRESHOLDS,
        // warnLow/warnHigh from Settings — controls graph green band only
        warnLow,
        warnHigh,
      });
      // Session 27 P2: reload display unit at same time as thresholds
      setIsMgdl((profile.glucose_unit || 'mmol') === 'mgdl');
    } catch { /* keep current thresholds */ }
  }, []);

  useEffect(() => { reloadThresholds(); }, []);

  // Reload thresholds immediately when returning from Settings
  useEffect(() => {
    if (!settingsTick) return;
    reloadThresholds();
  }, [settingsTick]);

  // ── Build history from DB on every poll tick ──────────────────────────────
  // backfillTick fires on every successful LLU poll (foreground or background).
  // Reloading from SQLite means the graph always has the full picture including
  // readings saved while the app was not the active window.
  //
  // Session 25 RCA: backfillTick now fires unconditionally on every successful
  // poll (not just new timestamps) so this always runs after a resume poll
  // even if LLU returned a duplicate reading.
  const loadHistory = useCallback(async () => {
    const rows = await getGlucoseHistory(8);
    if (rows.length > 0) setHistory(rows);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [backfillTick]);

  // Safety net: also reload history on foreground resume in case backfillTick
  // somehow doesn't fire (e.g. poll in flight at exact moment of resume).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadHistory();
    });
    return () => sub.remove();
  }, [loadHistory]);

  // ── Layout ────────────────────────────────────────────────────────────────
  // Session 16: drag handle removed for beta — top panel fixed at 58% screen height
  const fixedTopHeight = useMemo(() => Math.floor(screenHeight * 0.58), [screenHeight]);
  const slimTopHeight  = 52;
  const onDashboard    = bottomView === 'dashboard';
  const topHeight      = onDashboard ? fixedTopHeight : slimTopHeight;

  // ── Android back button ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (privacyVisible) { setPrivacyVisible(false); return true; }
      if (drawerOpen)     { setDrawerOpen(false);     return true; }
      if (bottomView !== 'dashboard') { setBottomView('dashboard'); return true; }
      return false;
    });
    return () => handler.remove();
  }, [bottomView, drawerOpen, privacyVisible]);

  // ── Stable handlers ───────────────────────────────────────────────────────
  const customiseRef = useRef(null);
  const onCustomiseDashboard = useCallback(() => customiseRef.current?.(), []);

  const openDrawer          = useCallback(() => setDrawerOpen(true),             []);
  const closeDrawer         = useCallback(() => setDrawerOpen(false),            []);
  const goBack              = useCallback(() => setBottomView('dashboard'),      []);
  const goToChat            = useCallback(() => setBottomView('chat'),           []);
  const goToWeight          = useCallback(() => setBottomView('weight'),         []);
  const goToPremiumTeaser   = useCallback(() => setBottomView('premiumteaser'),  []);

  const handleOpenSettings = useCallback(() => {
    setBottomView('dashboard');
    onOpenSettings();
  }, [onOpenSettings]);

  // Reload thresholds on each poll tick so changes saved in Settings
  // take effect within one minute without needing App.js wiring.
  useEffect(() => {
    reloadThresholds();
  }, [glucoData?.timestamp]);

  const handleDrawerItem = useCallback((id) => {
    closeDrawer();
    switch (id) {
      case 'settings':    handleOpenSettings(); break;
      case 'notifs':      Alert.alert(t('comingSoon'), t('comingSoonNotifs')); break;
      case 'access':      Alert.alert(t('comingSoon'), t('comingSoonAccess')); break;
      case 'customise':   onCustomiseDashboard?.(); break;
      case 'privacy':     setTimeout(() => setPrivacyVisible(true), 300); break;
      case 'terms':       onOpenTerms?.(); break;
      case 'replay_tour': onReplayTour?.(); break;
      case 'about':
        Alert.alert(t('aboutTitle'), `${t('version')}\n\n${t('contactEmail')}`, [{ text: t('ok') }]);
        break;
    }
  }, [onOpenSettings, onOpenTerms, onReplayTour, closeDrawer]);

  // ── Compact strip content ─────────────────────────────────────────────────
  const MMOL_TO_MGDL = 18.0182;
  const stripContent = useMemo(() => {
    if (!stableGluco?.glucose) return { value: '--.-', arrow: '→', freshness: '', color: '#64748B' };
    const rawVal = stableGluco.glucose;
    return {
      value:     isMgdl ? String(Math.round(rawVal * MMOL_TO_MGDL)) : rawVal.toFixed(1),
      arrow:     TREND_ARROWS[stableGluco.trend ?? 4] || '→',
      freshness: getFreshnessLabel(stableGluco.timestamp),
      color:     getGlucoseColor(stableGluco.glucose, thresholds),
    };
  }, [stableGluco, thresholds, isMgdl]);

  return (
    <View style={styles.root}>

      {/* ── APP BAR ──────────────────────────────────────────────────────── */}
      <View style={styles.appBar}>
        <TouchableOpacity
          style={styles.hamburger}
          onPress={openDrawer}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 16 }}
          activeOpacity={0.7}
        >
          <View style={styles.hLine} />
          <View style={styles.hLine} />
          <View style={styles.hLine} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>{t('appName')}</Text>
        <View style={styles.appBarSpacer} />
      </View>

      {/* ── TOP HALF ─────────────────────────────────────────────────────── */}
      <View style={{ height: topHeight, overflow: 'hidden' }}>
        {onDashboard ? (
          <GlucosePanel glucoData={stableGluco} thresholds={thresholds} freshnessMs={freshnessMs} backfillTick={backfillTick} />
        ) : (
          <View style={[styles.strip, { backgroundColor: stripContent.color }]}>
            <Text style={styles.stripValue}>{stripContent.value}</Text>
            <Text style={styles.stripArrow}>{stripContent.arrow}</Text>
            <Text style={styles.stripUnit}>{isMgdl ? 'mg/dL' : 'mmol/L'}</Text>
            {stripContent.freshness ? (
              <Text style={styles.stripFreshness}>{stripContent.freshness}</Text>
            ) : null}
          </View>
        )}
      </View>

      {/* ── DRAG HANDLE removed for beta ─────────────────────────────────── */}

      {/* ── DIVIDER ──────────────────────────────────────────────────────── */}
      <View style={styles.divider} />

      {/* ── BOTTOM HALF ──────────────────────────────────────────────────── */}
      <View style={styles.bottomHalf}>
        {bottomView === 'dashboard' && (
          <DashboardScreen
            onOpenPremiumTeaser={goToPremiumTeaser}
            onOpenWeight={goToWeight}
            onOpenSettings={handleOpenSettings}
            glucoData={stableGluco}
            customiseRef={customiseRef}
          />
        )}
        {bottomView === 'chat' && (
          <ChatScreen
            userName={userName}
            onOpenSettings={handleOpenSettings}
            onBack={goBack}
            messages={messages}
            setMessages={setMessages}
            routerState={routerState}
            setRouterState={setRouterState}
            glucoData={stableGluco}
            compact
          />
        )}
        {bottomView === 'premiumteaser' && (
          <PremiumTeaserScreen onBack={goBack} />
        )}
        {bottomView === 'weight' && (
          <WeightScreen onBack={goBack} glucoData={stableGluco} />
        )}
      </View>

      {/* ── DRAWER ───────────────────────────────────────────────────────── */}
      <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={closeDrawer}>
        <TouchableWithoutFeedback onPress={closeDrawer}>
          <View style={styles.drawerOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.drawer}>
                <Text style={styles.drawerTitle}>{t('menuTitle')}</Text>
                {DRAWER_ITEMS.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.drawerItem}
                    onPress={() => handleDrawerItem(item.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.drawerItemEmoji}>{item.emoji}</Text>
                    <Text style={styles.drawerItemLabel}>{item.label()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── PRIVACY NOTICE ───────────────────────────────────────────────── */}
      <Modal visible={privacyVisible} animationType="slide" onRequestClose={() => setPrivacyVisible(false)}>
        <View style={styles.privacyRoot}>
          <View style={styles.privacyHeader}>
            <TouchableOpacity onPress={() => setPrivacyVisible(false)} style={styles.privacyBack} activeOpacity={0.7}>
              <Text style={styles.privacyBackText}>{t('privacyBack')}</Text>
            </TouchableOpacity>
            <Text style={styles.privacyTitle}>{t('privacyTitle')}</Text>
            <View style={styles.privacyBack} />
          </View>
          <ScrollView style={styles.privacyScroll} contentContainerStyle={styles.privacyContent}>
            <Text style={styles.privacyDate}>{t('privacyDate')}</Text>
            <Text style={styles.privacyHeading}>{t('privacyH1')}</Text>
            <Text style={styles.privacyBody}>{t('privacyB1')}</Text>
            <Text style={styles.privacyHeading}>{t('privacyH3')}</Text>
            <Text style={styles.privacyBody}>{t('privacyB3')}</Text>
            <Text style={styles.privacyHeading}>{t('privacyH4')}</Text>
            <Text style={styles.privacyBody}>{t('privacyB4')}</Text>
            <Text style={styles.privacyHeading}>{t('privacyH5')}</Text>
            <Text style={styles.privacyBody}>{t('privacyB5')}</Text>
            <Text style={styles.privacyHeading}>{t('privacyH6')}</Text>
            <Text style={styles.privacyBody}>{t('privacyB6')}</Text>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: COLORS.diabetesBlue,
  },

  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  appBarTitle:   { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: 0.3 },
  appBarSpacer:  { width: 30 },
  hamburger:     { gap: 5, justifyContent: 'center', paddingVertical: 4, width: 30 },
  hLine:         { width: 22, height: 2, borderRadius: 1, backgroundColor: '#fff' },

  strip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  stripValue:     { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  stripArrow:     { fontSize: 20, color: '#fff', fontWeight: '700' },
  stripUnit:      { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  stripFreshness: { fontSize: 12, color: 'rgba(255,255,255,0.70)', marginLeft: 4 },

  dragHandle: {
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4FF',
  },
  dragPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#BBCFFF',
  },
  divider:    { height: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  bottomHalf: { flex: 1 },

  // Drawer
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-start',
  },
  drawer: {
    backgroundColor: '#fff',
    width: 280,
    paddingTop: 56,
    paddingBottom: 40,
    paddingHorizontal: 20,
    minHeight: '100%',
    elevation: 16,
  },
  drawerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  drawerItemEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  drawerItemLabel: { fontSize: 16, color: '#1A1A2E', fontWeight: '500' },

  // Privacy modal
  privacyRoot: { flex: 1, backgroundColor: '#F5F7FA' },
  privacyHeader: {
    backgroundColor: '#003DA5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 12 : 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  privacyBack:     { width: 64 },
  privacyBackText: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '500' },
  privacyTitle:    { color: '#fff', fontSize: 17, fontWeight: '700' },
  privacyScroll:   { flex: 1 },
  privacyContent:  { padding: 20 },
  privacyDate:     { fontSize: 12, color: '#9CA3AF', marginBottom: 20 },
  privacyHeading:  { fontSize: 15, fontWeight: '700', color: '#1A1A2E', marginTop: 20, marginBottom: 6 },
  privacyBody:     { fontSize: 14, color: '#6B7280', lineHeight: 22 },
});
