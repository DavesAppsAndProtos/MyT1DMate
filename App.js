/**
 * My T1D Mate — App Root
 * Session 18: GDH replaced with LibreLinkUp cloud API.
 *             Boot sequence simplified per session 18 plan.
 * Session 23: Foreground service wired for Option A.
 *             - POST_NOTIFICATIONS permission requested on Android 13+
 *             - GlucoseForegroundService started after permission granted
 *             - GlucoModule.updateGlucoseNotification() called on every
 *               poll tick so the persistent notification stays current
 * Session 25: Sentry crash reporting integrated (manual config).
 *             - Automatic JS + unhandled promise rejection capture
 *             - User feedback prompt shown on crash-restart
 *             - captureException() exported for use across the app
 *             - Breadcrumbs added to key LLU + boot events
 *
 * Boot sequence:
 *   1. TOC  (TermsScreen    — if toc_agreed !== 'true')
 *   2. Tour (OnboardingTour — if tour_done  !== 'true')
 *   3. LibreLinkUp setup (LibreLinkUpOnboardingScreen — if llup_confirmed !== 'true')
 *   4. What's New (whats_new_seen_v1_1_0 !== 'true' AND tour already done)
 *      v1.1.0: re-enabled — was suppressed for beta v1 pending updated
 *      content. Flag renamed from whats_new_seen_v9 so it fires again for
 *      existing users on this release (old v9 flag is now dead/ignored).
 *   5. Main app (SplitScreen)
 *
 * TOC and Tour show ONCE only on genuine first install.
 * OnboardingScreen RETIRED — not imported here.
 * GDHOnboardingScreen RETIRED — replaced by LibreLinkUpOnboardingScreen.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
  Linking,
  AppState,
  NativeModules,
  PermissionsAndroid,
} from 'react-native';
import * as Sentry from '@sentry/react-native';
import { getProfile, setProfileField } from './src/database/db';
import LibreLinkUpOnboardingScreen from './src/screens/LibreLinkUpOnboardingScreen';
import SplitScreen                 from './src/screens/SplitScreen';
import SettingsScreen              from './src/screens/SettingsScreen';
import OnboardingTourScreen        from './src/screens/OnboardingTourScreen';
import WhatsNewScreen              from './src/screens/WhatsNewScreen';
import TermsScreen                 from './src/screens/TermsScreen';
import { useLibreLinkUpService }   from './src/services/LibreLinkUpService';

const { GlucoModule } = NativeModules;

// ── Sentry — crash reporting & user feedback ──────────────────────────────────
Sentry.init({
  dsn: 'https://68bf3ffc0e7f25e0f06ce31badd7a456@o4511534705344512.ingest.de.sentry.io/4511534713929808',
  environment: __DEV__ ? 'development' : 'production',

  // Capture unhandled JS exceptions and unhandled promise rejections
  enableNative: true,

  // Breadcrumb trail — shows what happened before the crash
  maxBreadcrumbs: 50,

  // Don't send crashes during dev unless you want the noise
  enabled: !__DEV__,

  // Called before every event is sent — good place to scrub sensitive data
  beforeSend(event) {
    // Strip any accidental glucose values from exception messages
    // (they shouldn't be there, but just in case)
    if (event.exception?.values) {
      event.exception.values.forEach((ex) => {
        if (ex.value) ex.value = ex.value.replace(/\b\d+\.\d+\s*mmol/gi, '[glucose]');
      });
    }
    return event;
  },
});

/**
 * Capture an exception and send it to Sentry.
 * Use this anywhere in the app instead of console.warn for real errors:
 *   import { captureException } from './App';
 *   captureException(e, { context: 'fetchReading', patientId: '...' });
 */
export const captureException = (error, extras = {}) => {
  Sentry.withScope((scope) => {
    Object.entries(extras).forEach(([k, v]) => scope.setExtra(k, v));
    Sentry.captureException(error);
  });
};

/**
 * Add a breadcrumb — call this at key points so Sentry shows the trail
 * leading up to a crash, not just the crash itself.
 * Levels: 'debug' | 'info' | 'warning' | 'error'
 */
export const addBreadcrumb = (message, category = 'app', level = 'info') => {
  Sentry.addBreadcrumb({ message, category, level });
};

const COLORS = {
  primary:    '#003DA5',
  background: '#F5F7FA',
};

const DEFAULT_THRESHOLDS = { critLow: 3.0, warnLow: 3.9, warnHigh: 10.0, critHigh: 13.9 };

// ── Message helpers ───────────────────────────────────────────────────────────
let msgId = 0;
const nextId = () => String(++msgId);
export const buildMsg = (text, from) => ({ id: nextId(), text, from, ts: Date.now() });

// ── Foreground service helpers ────────────────────────────────────────────────

/**
 * Request POST_NOTIFICATIONS permission (Android 13+) then start the
 * foreground service. Safe to call multiple times — the service is
 * START_STICKY and handles duplicate starts gracefully.
 */
const startGlucoseService = async () => {
  if (Platform.OS !== 'android') return;
  if (!GlucoModule?.startForegroundService) return;

  try {
    // Android 13+ (API 33) requires runtime permission for notifications
    if (Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        {
          title:   'Keep glucose on your screen',
          message: 'My T1D Mate needs permission to show your glucose reading on the lock screen and in the notification bar.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.log('[App] POST_NOTIFICATIONS not granted — service will start without notification');
      }
    }
    GlucoModule.startForegroundService();
    console.log('[App] GlucoseForegroundService started');
  } catch (e) {
    console.warn('[App] Failed to start foreground service', e);
  }
};

/**
 * Push the latest glucose reading into the persistent notification.
 * Called on every poll tick from the glucoData / backfillTick effect.
 *
 * Reads thresholds from the profile so the notification colour matches
 * the panel — same values that SplitScreen passes to GlucosePanel.
 */
const updateGlucoseNotification = async (glucoData, profile) => {
  if (Platform.OS !== 'android') return;
  if (!GlucoModule?.updateGlucoseNotification) return;
  if (!glucoData?.glucose) return;

  try {
    const warnLow  = parseFloat(profile?.target_range_low)  || DEFAULT_THRESHOLDS.warnLow;
    const warnHigh = parseFloat(profile?.target_range_high) || DEFAULT_THRESHOLDS.warnHigh;
    const displayMmol = (profile?.glucose_unit ?? 'mmol') !== 'mgdl';

    GlucoModule.updateGlucoseNotification({
      glucose:     glucoData.glucose,
      trend:       glucoData.trend     ?? 4,
      direction:   glucoData.direction ?? 'Flat',
      displayMmol,
      critLow:  Math.max(1.0, warnLow - 0.9),
      warnLow,
      warnHigh,
      critHigh: warnHigh + 3.9,
    });
  } catch (e) {
    console.warn('[App] updateGlucoseNotification failed', e);
  }
};

// ── Battery optimisation prompt ───────────────────────────────────────────────
const promptBatteryOptimisation = async () => {
  if (Platform.OS !== 'android') return;
  try {
    const profile = await getProfile();
    if (profile.battery_opt_prompted === 'true') return;

    Alert.alert(
      'Keep My T1D Mate running',
      'My T1D Mate needs the same unrestricted battery access as your LibreLink app to keep glucose readings flowing in the background.\n\nTap Open Settings, then:\n\nApp battery usage → Allow background usage → Unrestricted',
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: async () => { await setProfileField('battery_opt_prompted', 'true'); },
        },
        {
          text: 'Open settings',
          onPress: async () => {
            await setProfileField('battery_opt_prompted', 'true');
            Linking.openSettings();
          },
        },
      ],
    );
  } catch (e) {
    console.warn('[App] Battery optimisation prompt failed', e);
  }
};

// ── Root component ────────────────────────────────────────────────────────────
export default function App() {
  // 'loading' | 'llup_onboarding' | 'toc' | 'tour' | 'whats_new' | 'chat' | 'settings' | 'terms_view'
  const [screen, setScreen] = useState('loading');
  const [userName, setUserName] = useState('');

  const [messages,    setMessages]    = useState([]);
  const [routerState, setRouterState] = useState({});
  const chatInitialised = useRef(false);

  const [glucoData, setGlucoData] = useState(null);
  const [freshnessMs, setFreshnessMs] = useState(0);
  const [settingsTick, setSettingsTick] = useState(0);

  // Cache latest profile for notification threshold updates
  const profileRef = useRef(null);

  // ── LibreLinkUp Service ────────────────────────────────────────────────────
  const { glucoData: llupGlucoData, freshnessMs: llupFreshnessMs, backfillTick } = useLibreLinkUpService({
    onRecovery: () => console.log('[App] LibreLinkUp recovered'),
  });

  useEffect(() => {
    if (llupGlucoData) setGlucoData(llupGlucoData);
  }, [llupGlucoData]);

  useEffect(() => {
    setFreshnessMs(llupFreshnessMs);
  }, [llupFreshnessMs]);

  // ── Push notification update on every poll tick ────────────────────────────
  // Fires whenever a new reading arrives or backfillTick increments.
  // Reads profile from SQLite each time so display unit + thresholds are
  // always current without needing a separate Settings → App.js prop thread.
  //
  // Session 26 fix: dependency changed from llupGlucoData?.timestamp to
  // llupGlucoData (the full object). LibreLinkUpService now calls setGlucoData
  // unconditionally on every poll (S26 fix), so a new object reference is
  // always produced — React will re-run this effect even when the timestamp
  // hasn't changed, which is exactly what we need for stale-on-resume.
  useEffect(() => {
    if (!llupGlucoData?.glucose) return;
    (async () => {
      try {
        const profile = await getProfile();
        profileRef.current = profile;
        await updateGlucoseNotification(llupGlucoData, profile);
      } catch (e) {
        console.warn('[App] Notification update effect failed', e);
      }
    })();
  }, [llupGlucoData, backfillTick]);

  // ── Safety net: re-push notification immediately on foreground resume ───────
  // Session 26: mirrors the AppState listener in SplitScreen that calls
  // loadHistory() on resume. Without this, the status bar can show a stale
  // reading until the next AlarmManager tick (up to 65 s away) if the poll
  // that fetched the new reading fired while the JS bridge was backgrounded
  // and the effect above ran with a stale llupGlucoData reference.
  //
  // On resume: push whatever is currently in llupGlucoData + profileRef
  // immediately, without waiting for the next poll.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!llupGlucoData?.glucose) return;
      (async () => {
        try {
          const profile = profileRef.current ?? await getProfile();
          await updateGlucoseNotification(llupGlucoData, profile);
          console.log('[App] Notification refreshed on resume');
        } catch (e) {
          console.warn('[App] Resume notification update failed', e);
        }
      })();
    });
    return () => sub.remove();
  }, [llupGlucoData]);

  // ── Boot sequence ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const profile = await getProfile();
        profileRef.current = profile;
        const name = profile.name || 'there';
        setUserName(name);

        // Tag this user in Sentry so crash reports show who was affected.
        // We use name only — no email or medical data ever sent to Sentry.
        Sentry.setUser({ username: name });
        Sentry.setTag('llup_confirmed', profile.llup_confirmed ?? 'false');
        addBreadcrumb('Boot sequence started', 'boot');

        // Step 1: TOC — must agree before anything else
        if (profile.toc_agreed !== 'true') {
          addBreadcrumb('Showing TOC screen', 'boot');
          setScreen('toc');
          return;
        }

        // Step 2: first-launch tour
        if (profile.tour_done !== 'true') {
          addBreadcrumb('Showing tour screen', 'boot');
          setScreen('tour');
          return;
        }

        // Step 3: LibreLinkUp setup — if never confirmed
        if (profile.llup_confirmed !== 'true') {
          addBreadcrumb('Showing LLU onboarding', 'boot');
          setScreen('llup_onboarding');
          return;
        }

        // Step 4: What's New — v1.1.0: re-enabled with updated content
        // (Android Auto). Flag renamed from whats_new_seen_v9 so this
        // fires once for every user, including those who already saw the
        // old v9 content pre-beta.
        if (profile.whats_new_seen_v1_1_0 !== 'true' && profile.tour_done === 'true') {
          initChat(name);
          setScreen('whats_new');
          return;
        }

        // Step 5: all good — start the foreground service now that
        // onboarding is complete and we have credentials
        addBreadcrumb('Boot complete — starting foreground service', 'boot');
        await startGlucoseService();
        initChat(name);
        setScreen('chat');

      } catch (e) {
        captureException(e, { context: 'boot_sequence' });
        setScreen('toc');
      }
    })();
  }, []);

  // ── Sentry: show user feedback prompt if app restarted after a crash ─────
  // Sentry.lastEventId() returns an ID only when the previous session crashed.
  // We show a friendly prompt so users know their report helped, and optionally
  // let them add a comment. This fires once per crash-restart.
  useEffect(() => {
    const lastId = Sentry.lastEventId();
    if (!lastId) return;

    Alert.alert(
      "Oops — something went wrong 🙏",
      "My T1D Mate crashed last time. A report was sent automatically.\n\nWant to add a quick note about what you were doing? It really helps us fix it faster.",
      [
        {
          text: "No thanks",
          style: 'cancel',
        },
        {
          text: "Add a note",
          onPress: () => {
            // S26 RCA: Sentry.showReportDialog() was throwing
            // "undefined is not a function" at bundle:1:615646, crashing
            // the JS bundle and killing the poll chain overnight.
            // The crash recovery dialog fires on next open after any crash —
            // Android can also interact with it overnight via notification
            // actions, triggering this onPress without user involvement.
            // Fix: guard with typeof check + try/catch so a missing or
            // broken showReportDialog can never crash the bundle.
            try {
              if (typeof Sentry.showReportDialog === 'function') {
                Sentry.showReportDialog({
                  eventId: lastId,
                  title: "Tell us what happened",
                  subtitle: "Your note goes straight to the dev team.",
                  subtitle2: "",
                  labelName: "Your name (optional)",
                  labelEmail: "Email (optional)",
                  labelComments: "What were you doing when it crashed?",
                  labelClose: "Cancel",
                  labelSubmit: "Send",
                  successMessage: "Thanks — this really helps! 💙",
                });
              } else {
                console.warn('[App] Sentry.showReportDialog not available — skipping');
              }
            } catch (e) {
              console.warn('[App] Sentry.showReportDialog threw:', e?.message);
            }
          },
        },
      ],
    );
  }, []);
  const initChat = (name) => {
    if (chatInitialised.current) return;
    chatInitialised.current = true;
    addBreadcrumb('Chat initialised', 'chat');
    const greeting = `Hey ${name}! 👋\n\nI can look up carbs, guide you on your dose, or tell you what I know about you. What do you need?`;
    setMessages([buildMsg(greeting, 'mate')]);
  };

  const handleTOCAgree = () => {
    addBreadcrumb('TOC agreed', 'boot');
    setScreen('tour');
  };

  const handleReplayTour = () => setScreen('tour');
  const handleOpenTermsView = () => setScreen('terms_view');

  const handleLLUPConnected = async () => {
    addBreadcrumb('LLU onboarding complete — CGM connected', 'llu');
    Sentry.setTag('llup_confirmed', 'true');
    // Battery prompt fires here — user has just confirmed CGM is connected
    promptBatteryOptimisation();
    // Start foreground service now that credentials are confirmed
    await startGlucoseService();
    initChat(userName);
    setScreen('chat');
  };

  const handleTourDone = async () => {
    await setProfileField('tour_done', 'true');
    const profile = await getProfile();
    if (profile.llup_confirmed !== 'true') {
      setScreen('llup_onboarding');
      return;
    }
    await startGlucoseService();
    initChat(userName);
    setScreen('chat');
  };

  const handleWhatsNewDone = async () => {
    await setProfileField('whats_new_seen_v1_1_0', 'true');
    // v1.1.0: this path was unreachable while What's New was suppressed,
    // so the missing startGlucoseService() call here was never exercised.
    // Added to match handleTourDone/handleLLUPConnected — without it, a
    // user landing on What's New during boot would reach 'chat' with the
    // foreground service never started for that session.
    await startGlucoseService();
    initChat(userName);
    setScreen('chat');
  };

  const handleSettingsClosed = async () => {
    const profile = await getProfile();
    const name = profile.name || userName;
    setUserName(name);
    setSettingsTick(t => t + 1);
    setScreen('chat');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (screen === 'llup_onboarding') {
    return <LibreLinkUpOnboardingScreen onConnected={handleLLUPConnected} />;
  }

  if (screen === 'toc') {
    return <TermsScreen onAgree={handleTOCAgree} viewOnly={false} />;
  }

  if (screen === 'tour') {
    return <OnboardingTourScreen onDone={handleTourDone} />;
  }

  if (screen === 'whats_new') {
    return <WhatsNewScreen onDone={handleWhatsNewDone} />;
  }

  if (screen === 'terms_view') {
    return <TermsScreen viewOnly onClose={() => setScreen('chat')} />;
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.flex, screen !== 'chat' && styles.hidden]}>
        <SplitScreen
          userName={userName}
          onOpenSettings={() => setScreen('settings')}
          messages={messages}
          setMessages={setMessages}
          routerState={routerState}
          setRouterState={setRouterState}
          glucoData={glucoData}
          backfillTick={backfillTick}
          settingsTick={settingsTick}
          freshnessMs={freshnessMs}
          onOpenTerms={handleOpenTermsView}
          onReplayTour={handleReplayTour}
        />
      </View>

      {screen === 'settings' && (
        <View style={StyleSheet.absoluteFillObject}>
          <SettingsScreen onClose={handleSettingsClosed} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: COLORS.background },
  loading: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: { opacity: 0, pointerEvents: 'none' },
});

// Wrap with Sentry so native crashes and JS boundary errors are captured
// with a full component stack trace, not just a bare exception.

