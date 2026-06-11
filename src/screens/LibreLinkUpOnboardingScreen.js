/**
 * My T1D Mate — LibreLinkUpOnboardingScreen
 * Session 18: Replaces GDHOnboardingScreen.
 *
 * Shown on first launch when LibreLinkUp credentials are not yet stored,
 * or when triggered from Settings.
 *
 * Flow:
 *   1. 'intro'     — explain what LibreLinkUp is, button to continue
 *   2. 'form'      — email + password entry, "Connect" button
 *   3. 'checking'  — spinner while we test the login
 *   4. 'connected' — success card, "Let's go" button
 *   5. 'error'     — friendly error with specific message, Try again
 *
 * On success: credentials + token stored in SQLite, onConnected() called.
 *
 * All strings via t().
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Linking,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { setProfileField } from '../database/db';
import { t } from '../i18n/en';

// ── Constants ─────────────────────────────────────────────────────────────────
const LLU_BASE_DEFAULT = 'https://api.libreview.io';
const LLU_VERSION      = '4.16.0';
const LLU_PRODUCT      = 'llu.android';
const FETCH_TIMEOUT    = 10_000;
const LLU_APP_URL      = 'https://play.google.com/store/apps/details?id=org.nativescript.LibreLinkUp';

const COLORS = {
  primary:    '#003DA5',
  success:    '#10B981',
  error:      '#EF4444',
  background: '#F5F7FA',
  surface:    '#FFFFFF',
  text:       '#1A1A2E',
  hint:       '#6B7280',
  accentMid:  '#BBCFFF',
  accentLight:'#E8EFFF',
  unset:      '#FFF0F0',
};

// ── Inline pure-JS SHA-256 (same as LibreLinkUpService) ───────────────────────
const sha256 = (() => {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,
    0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
    0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,
    0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,
    0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
    0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,
    0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,
    0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
    0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const H0 = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  return (str) => {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 128) { bytes.push(c); }
      else if (c < 2048) { bytes.push((c >> 6) | 192, (c & 63) | 128); }
      else { bytes.push((c >> 12) | 224, ((c >> 6) & 63) | 128, (c & 63) | 128); }
    }
    const l = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    bytes.push(0,0,0,0,(l>>>24)&0xff,(l>>>16)&0xff,(l>>>8)&0xff,l&0xff);
    let [h0,h1,h2,h3,h4,h5,h6,h7] = H0.slice();
    for (let i = 0; i < bytes.length; i += 64) {
      const w = new Array(64);
      for (let j = 0; j < 16; j++)
        w[j] = (bytes[i+j*4]<<24)|(bytes[i+j*4+1]<<16)|(bytes[i+j*4+2]<<8)|bytes[i+j*4+3];
      for (let j = 16; j < 64; j++) {
        const s0 = rotr(w[j-15],7)^rotr(w[j-15],18)^(w[j-15]>>>3);
        const s1 = rotr(w[j-2],17)^rotr(w[j-2],19)^(w[j-2]>>>10);
        w[j] = (w[j-16]+s0+w[j-7]+s1)>>>0;
      }
      let [a,b,c,d,e,f,g,h] = [h0,h1,h2,h3,h4,h5,h6,h7];
      for (let j = 0; j < 64; j++) {
        const S1=(rotr(e,6)^rotr(e,11)^rotr(e,25));
        const ch=(e&f)^(~e&g);
        const t1=(h+S1+ch+K[j]+w[j])>>>0;
        const S0=(rotr(a,2)^rotr(a,13)^rotr(a,22));
        const maj=(a&b)^(a&c)^(b&c);
        const t2=(S0+maj)>>>0;
        [h,g,f,e,d,c,b,a]=[g,f,e,(d+t1)>>>0,c,b,a,(t1+t2)>>>0];
      }
      h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;
      h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
    }
    return [h0,h1,h2,h3,h4,h5,h6,h7].map(n=>n.toString(16).padStart(8,'0')).join('');
  };
})();

// ── Auth test (same logic as LibreLinkUpService.authenticate) ─────────────────
const testLogin = async (email, password) => {
  let baseUrl = LLU_BASE_DEFAULT;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      const controller = { aborted: false };
      const timer = setTimeout(() => { controller.aborted = true; }, FETCH_TIMEOUT);
      res = await fetch(`${baseUrl}/llu/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'version':      LLU_VERSION,
          'product':      LLU_PRODUCT,
          'Cache-Control':'no-cache',
        },
        body: JSON.stringify({ email, password }),
      });
      clearTimeout(timer);
    } catch {
      return { error: 'network' };
    }

    if (!res.ok) return { error: 'network' };

    let data;
    try { data = await res.json(); } catch { return { error: 'network' }; }

    if (data.status === 4)  return { error: 'tos' };

    // Step challenges — email verification, privacy policy etc
    const stepType = data.data?.step?.type;
    if (stepType === 'verifyEmail') return { error: 'verify' };
    if (stepType === 'pp')         return { error: 'tos' };
    if (stepType === 'tou')        return { error: 'tos' };

    // Abbott redirect — can appear at data.data level OR top-level data
    const redirectRegion = data.data?.region || data.region;
    const isRedirect     = data.data?.redirect || data.redirect;
    if (isRedirect && redirectRegion) {
      baseUrl = `https://api-${redirectRegion}.libreview.io`;
      continue;
    }

    if (data.status !== 0 || !data.data?.authTicket?.token) {
      console.warn('[LLU Onboarding] Unexpected response status:', data.status, 'step:', data.data?.step, 'redirect:', data.data?.redirect || data.redirect);
      return { error: 'credentials' };
    }

    const token     = data.data.authTicket.token;
    const userId    = data.data.user?.id ?? '';
    const accountId = userId ? sha256(userId) : '';
    const expiresAt = (data.data.authTicket.expires ?? 0) * 1000;

    // Get patientId
    let patientId = null;
    try {
      const connRes = await fetch(`${baseUrl}/llu/connections`, {
        method: 'GET',
        headers: {
          'Content-Type':  'application/json',
          'version':       LLU_VERSION,
          'product':       LLU_PRODUCT,
          'Authorization': `Bearer ${token}`,
          'Account-Id':    accountId,
          'Cache-Control': 'no-cache',
        },
      });
      if (connRes.ok) {
        const connData = await connRes.json();
        patientId = connData.data?.[0]?.patientId ?? null;
      }
    } catch { /* patientId stays null */ }

    if (!patientId) return { error: 'noconnection' };

    return { token, userId, accountId, patientId, baseUrl, expiresAt };
  }
  return { error: 'network' };
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function LibreLinkUpOnboardingScreen({ onConnected }) {
  const [stage,    setStage]    = useState('intro');
  // 'intro' | 'form' | 'checking' | 'connected' | 'error'
  const [errorKey, setErrorKey] = useState(null);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const passwordRef = useRef(null);

  const handleConnect = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorKey('llupErrorEmpty');
      setStage('error');
      return;
    }

    setStage('checking');
    const result = await testLogin(trimmedEmail, password);

    if (result.error) {
      setErrorKey(
        result.error === 'tos'          ? 'llupErrorTos'
        : result.error === 'credentials' ? 'llupErrorCreds'
        : result.error === 'noconnection'? 'llupErrorNoConn'
        : result.error === 'verify'      ? 'llupErrorVerify'
        : 'llupErrorNetwork'
      );
      setStage('error');
      return;
    }

    // Persist credentials and session
    try {
      await setProfileField('llup_email',          trimmedEmail);
      await setProfileField('llup_password',       password);
      await setProfileField('llup_token',          result.token);
      await setProfileField('llup_token_expires',  String(result.expiresAt));
      await setProfileField('llup_patient_id',     result.patientId);
      await setProfileField('llup_user_id',        result.userId);
      await setProfileField('llup_base_url',       result.baseUrl);
      await setProfileField('llup_confirmed',      'true');
    } catch (e) {
      console.warn('[LLU Onboarding] DB write failed', e);
    }

    setStage('connected');
  };

  const handleTryAgain = () => {
    setErrorKey(null);
    setStage('form');
  };

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (stage === 'intro') {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('llupOnboardingTitle')}</Text>
          <Text style={styles.headerSub}>{t('llupOnboardingSub')}</Text>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('llupWhatTitle')}</Text>
            <Text style={styles.cardBody}>{t('llupWhatBody')}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('llupSetupTitle')}</Text>

            <View style={styles.stepRow}>
              <Text style={styles.stepNum}>1</Text>
              <View style={styles.stepBody}>
                <Text style={styles.stepHead}>{t('llupStep1Head')}</Text>
                <Text style={styles.stepText}>{t('llupStep1Body')}</Text>
                <TouchableOpacity onPress={() => Linking.openURL(LLU_APP_URL).catch(() => {})} activeOpacity={0.75}>
                  <Text style={styles.stepLink}>{t('llupStep1Link')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.stepRow}>
              <Text style={styles.stepNum}>2</Text>
              <View style={styles.stepBody}>
                <Text style={styles.stepHead}>{t('llupStep2Head')}</Text>
                <Text style={styles.stepText}>{t('llupStep2Body')}</Text>
              </View>
            </View>

            <View style={styles.stepRow}>
              <Text style={styles.stepNum}>3</Text>
              <View style={styles.stepBody}>
                <Text style={styles.stepHead}>{t('llupStep3Head')}</Text>
                <Text style={styles.stepText}>{t('llupStep3Body')}</Text>
              </View>
            </View>

            <View style={styles.stepRow}>
              <Text style={styles.stepNum}>4</Text>
              <View style={styles.stepBody}>
                <Text style={styles.stepHead}>{t('llupStep4Head')}</Text>
                <Text style={styles.stepText}>{t('llupStep4Body')}</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.primaryButton}
            onPress={() => setStage('form')} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>{t('llupContinueBtn')}</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  // ── Checking ───────────────────────────────────────────────────────────────
  if (stage === 'checking') {
    return (
      <View style={styles.centred}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.checkingLabel}>{t('llupChecking')}</Text>
      </View>
    );
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  if (stage === 'connected') {
    return (
      <View style={styles.centred}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <View style={styles.successCard}>
          <Text style={styles.successEmoji}>🟢</Text>
          <Text style={styles.successTitle}>{t('llupConnectedTitle')}</Text>
          <Text style={styles.successBody}>{t('llupConnectedBody')}</Text>
          <TouchableOpacity style={[styles.primaryButton, { alignSelf: 'stretch' }]}
            onPress={onConnected} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>{t('letsGo')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (stage === 'error') {
    return (
      <View style={styles.centred}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <View style={styles.errorCard}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>{t('llupErrorTitle')}</Text>
          <Text style={styles.errorBody}>{t(errorKey ?? 'llupErrorNetwork')}</Text>
          {errorKey === 'llupErrorTos' && (
            <TouchableOpacity style={[styles.secondaryButton, { marginBottom: 12 }]}
              onPress={() => Linking.openURL(LLU_APP_URL).catch(() => {})}
              activeOpacity={0.75}>
              <Text style={styles.secondaryButtonText}>{t('llupOpenApp')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.primaryButton}
            onPress={handleTryAgain} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>{t('llupTryAgain')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('llupFormTitle')}</Text>
        <Text style={styles.headerSub}>{t('llupFormSub')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('llupEmailLabel')}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t('llupEmailPlaceholder')}
            placeholderTextColor={COLORS.hint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('llupPasswordLabel')}</Text>
          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder={t('llupPasswordPlaceholder')}
              placeholderTextColor={COLORS.hint}
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleConnect}
            />
            <TouchableOpacity style={styles.showPassBtn}
              onPress={() => setShowPass(v => !v)} activeOpacity={0.7}>
              <Text style={styles.showPassText}>{showPass ? t('llupHide') : t('llupShow')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldHint}>{t('llupCredHint')}</Text>
        </View>

        <TouchableOpacity style={styles.primaryButton}
          onPress={handleConnect} activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>{t('llupConnectBtn')}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },

  centred: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },

  header: {
    backgroundColor: COLORS.primary,
    paddingTop: Platform.OS === 'android' ? 52 : 56,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  headerSub:   { color: COLORS.accentMid, fontSize: 13, textAlign: 'center' },

  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  cardBody:  { fontSize: 14, color: COLORS.hint, lineHeight: 21 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.hint, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldHint:  { fontSize: 12, color: COLORS.hint, marginTop: 10, lineHeight: 17 },

  input: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.accentMid,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 15,
    color: COLORS.text,
    flex: 1,
  },
  passwordRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordInput:{ flex: 1 },
  showPassBtn:  { paddingHorizontal: 10, paddingVertical: 11 },
  showPassText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },

  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  secondaryButton: {
    borderWidth: 1.5,
    borderColor: COLORS.accentMid,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginBottom: 12,
  },
  secondaryButtonText: { color: COLORS.primary, fontSize: 15, fontWeight: '600' },

  checkingLabel: { marginTop: 16, color: COLORS.hint, fontSize: 15 },

  successCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  successEmoji: { fontSize: 48, marginBottom: 12 },
  successTitle: { fontSize: 24, fontWeight: '800', color: COLORS.success, marginBottom: 10 },
  successBody:  { fontSize: 15, color: COLORS.hint, textAlign: 'center', lineHeight: 22, marginBottom: 24 },

  errorCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  errorEmoji: { fontSize: 40, marginBottom: 12 },
  errorTitle: { fontSize: 20, fontWeight: '800', color: COLORS.error, marginBottom: 10 },
  errorBody:  { fontSize: 14, color: COLORS.hint, textAlign: 'center', lineHeight: 21, marginBottom: 20 },

  stepRow:  { flexDirection: 'row', marginTop: 14, gap: 12 },
  stepNum:  { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 24, overflow: 'hidden' },
  stepBody: { flex: 1 },
  stepHead: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  stepText: { fontSize: 13, color: COLORS.hint, lineHeight: 19 },
  stepLink: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 5, textDecorationLine: 'underline' },
});
