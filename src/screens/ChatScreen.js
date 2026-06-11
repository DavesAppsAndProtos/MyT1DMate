/**
 * My T1D Mate — Chat Screen
 * Session 10:
 *   - GDH / GDA installation assistant added as a mode alongside main chat
 *   - Mode switcher: T1D Chat | Install Help
 *   - Install Help: numbered steps, video placeholders, email fallback
 *   - All existing chat functionality unchanged
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Clipboard,
  Alert,
  Modal,
  Linking,
  Keyboard,
} from 'react-native';
import { routeMessage } from '../engine/intentRouter';
import { t } from '../i18n/en';
import { formatGluco } from '../services/GlucoService';

const COLORS = {
  primary:       '#003DA5',
  background:    '#F5F7FA',
  surface:       '#FFFFFF',
  textPrimary:   '#1A1A2E',
  textSecondary: '#6B7280',
  accentLight:   '#E8EFFF',
  accentMid:     '#BBCFFF',
  success:       '#10B981',
  border:        'rgba(0,0,0,0.08)',
};

const nextId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const buildMsg = (text, from) => ({ id: nextId(), text, from, ts: Date.now() });

// ── GDH / GDA Install Steps ───────────────────────────────────────────────────
// Video links: placeholders — replace URLs before beta launch
const GDH_STEPS = [
  {
    step: 1,
    title: 'Install Glucose Data Hub (GDH)',
    body:  'GDH reads your LibreLink or Dexcom CGM data and makes it available to other apps on your phone. Install it from the Play Store.',
    videoLabel: 'Watch: Installing GDH',
    videoUrl:   'https://www.youtube.com/watch?v=PLACEHOLDER_GDH_INSTALL',
    playStore:  'https://play.google.com/store/apps/details?id=com.diabetestechnology.glucosedatahub',
  },
  {
    step: 2,
    title: 'Open GDH and connect your CGM app',
    body:  'Launch GDH and follow the in-app setup to connect LibreLink (or Dexcom). Grant any permissions it asks for.',
    videoLabel: 'Watch: Connecting LibreLink to GDH',
    videoUrl:   'https://www.youtube.com/watch?v=PLACEHOLDER_GDH_LIBRELINK',
  },
  {
    step: 3,
    title: 'Enable the Nightscout Pebble endpoint',
    body:  'In GDH settings, turn on the Nightscout Pebble endpoint. This is how My T1D Mate reads your glucose. Port 17580 must be enabled.',
    videoLabel: 'Watch: Enabling the Pebble endpoint',
    videoUrl:   'https://www.youtube.com/watch?v=PLACEHOLDER_GDH_PEBBLE',
  },
  {
    step: 4,
    title: 'Return to My T1D Mate',
    body:  'Come back here. Your glucose reading should appear in the panel above within a minute or two. If not, check GDH is running in the background and battery optimisation is disabled for both apps.',
    videoLabel: null,
    videoUrl:   null,
  },
];

const GDA_STEPS = [
  {
    step: 1,
    title: 'Install Glucose Data Adapter (GDA)',
    body:  'GDA is an alternative to GDH. It supports a slightly different set of CGM apps. Install it from the Play Store.',
    videoLabel: 'Watch: Installing GDA',
    videoUrl:   'https://www.youtube.com/watch?v=PLACEHOLDER_GDA_INSTALL',
    playStore:  'https://play.google.com/store/apps/details?id=com.mmindset.glucosedataadapter',
  },
  {
    step: 2,
    title: 'Connect your CGM app in GDA',
    body:  'Open GDA and follow the setup wizard to connect to your CGM source. Grant all requested permissions.',
    videoLabel: 'Watch: Setting up GDA',
    videoUrl:   'https://www.youtube.com/watch?v=PLACEHOLDER_GDA_SETUP',
  },
  {
    step: 3,
    title: 'Enable the HTTP broadcast',
    body:  'In GDA settings, enable the HTTP server / broadcast on port 17580. My T1D Mate polls this to receive your glucose readings.',
    videoLabel: 'Watch: GDA HTTP broadcast',
    videoUrl:   'https://www.youtube.com/watch?v=PLACEHOLDER_GDA_HTTP',
  },
  {
    step: 4,
    title: 'Return to My T1D Mate',
    body:  'Your reading should appear in the panel above within a minute. If nothing shows, make sure GDA is running and that battery optimisation is off for both apps.',
    videoLabel: null,
    videoUrl:   null,
  },
];

// ── Install assistant component ───────────────────────────────────────────────
function InstallAssistant({ onBack, onBackToDashboard }) {
  const [source, setSource] = useState(null); // null | 'gdh' | 'gda'
  const steps = source === 'gdh' ? GDH_STEPS : source === 'gda' ? GDA_STEPS : [];

  const openLink = (url) => {
    if (!url || url.includes('PLACEHOLDER')) {
      Alert.alert(
        t('chatVideoSoon'),
        t('chatVideoSoonMsg'),
        [
          { text: t('emailSupport'), onPress: () => Linking.openURL('mailto:myt1dmate@gmail.com?subject=CGM%20setup%20help') },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }
    Linking.openURL(url).catch(() =>
      Alert.alert(t('chatCouldNotOpen'), t('chatCouldNotOpenMsg'))
    );
  };

  return (
    <View style={styles.flex}>
      {/* Back to chat */}
      <View style={styles.installHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 16 }}>
          <Text style={styles.installBack}>{t('backChat')}</Text>
        </TouchableOpacity>
        <Text style={styles.installTitle}>{t('cgmTitle')}</Text>
        <TouchableOpacity onPress={onBackToDashboard} hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}>
          <Text style={styles.installBack}>{t('backDashboard')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.installScroll} showsVerticalScrollIndicator={false}>

        {/* Intro */}
        <View style={styles.installIntro}>
          <Text style={styles.installIntroTitle}>{t('cgmIntroTitle')}</Text>
          <Text style={styles.installIntroBody}>
            My T1D Mate reads your glucose from a local helper app — either{' '}
            <Text style={styles.bold}>GDH (Glucose Data Hub)</Text> or{' '}
            <Text style={styles.bold}>GDA (Glucose Data Adapter)</Text>.{'\n\n'}
            Both are free. GDH works with LibreLink and Dexcom. GDA is an alternative if GDH doesn't support your CGM.
          </Text>
        </View>

        {/* Source picker */}
        {!source && (
          <>
            <Text style={styles.installPickLabel}>{t('chatPickLabel')}</Text>
            <View style={styles.installPickRow}>
              <TouchableOpacity
                style={styles.installPickBtn}
                onPress={() => setSource('gdh')}
                activeOpacity={0.8}
              >
                <Text style={styles.installPickEmoji}>📡</Text>
                <Text style={styles.installPickName}>{t('cgmGDHName')}</Text>
                <Text style={styles.installPickSub}>{t('cgmGDHFull')}</Text>
                <Text style={styles.installPickSub}>{t('cgmGDHSub')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.installPickBtn}
                onPress={() => setSource('gda')}
                activeOpacity={0.8}
              >
                <Text style={styles.installPickEmoji}>🔌</Text>
                <Text style={styles.installPickName}>{t('cgmGDAName')}</Text>
                <Text style={styles.installPickSub}>{t('cgmGDAFull')}</Text>
                <Text style={styles.installPickSub}>{t('cgmGDASub')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.installUnsure}>
              {t('chatUnsure')}
            </Text>
          </>
        )}

        {/* Steps */}
        {source && (
          <>
            <View style={styles.installSourceHeader}>
              <Text style={styles.installSourceTitle}>
                {source === 'gdh' ? '📡 GDH Setup' : '🔌 GDA Setup'}
              </Text>
              <TouchableOpacity onPress={() => setSource(null)}>
                <Text style={styles.installSwitch}>{t('chatSwitchSource')}</Text>
              </TouchableOpacity>
            </View>

            {steps.map(({ step, title, body, videoLabel, videoUrl, playStore }) => (
              <View key={step} style={styles.step}>
                <View style={styles.stepNumCol}>
                  <View style={styles.stepCircle}>
                    <Text style={styles.stepNum}>{step}</Text>
                  </View>
                  {step < steps.length && <View style={styles.stepLine} />}
                </View>

                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{title}</Text>
                  <Text style={styles.stepBody}>{body}</Text>

                  {playStore && (
                    <TouchableOpacity
                      style={styles.playStoreBtn}
                      onPress={() => openLink(playStore)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.playStoreBtnText}>▶ Open Play Store</Text>
                    </TouchableOpacity>
                  )}

                  {videoLabel && (
                    <TouchableOpacity
                      style={styles.videoBtn}
                      onPress={() => openLink(videoUrl)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.videoBtnIcon}>▶</Text>
                      <View>
                        <Text style={styles.videoBtnLabel}>{videoLabel}</Text>
                        <Text style={styles.videoBtnSub}>Video walkthrough · coming soon</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {/* Email fallback */}
            <View style={styles.emailFallback}>
              <Text style={styles.emailFallbackTitle}>{t('chatEmailFallback')}</Text>
              <Text style={styles.emailFallbackBody}>
                Email us and we'll walk you through it personally.
              </Text>
              <TouchableOpacity
                style={styles.emailFallbackBtn}
                onPress={() => Linking.openURL('mailto:myt1dmate@gmail.com?subject=CGM%20setup%20help&body=Hi%2C%20I%20need%20help%20setting%20up%20my%20CGM%20connection.')}
                activeOpacity={0.8}
              >
                <Text style={styles.emailFallbackBtnText}>✉ Email support</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Always-visible email fallback when picking */}
        {!source && (
          <View style={[styles.emailFallback, { marginTop: 8 }]}>
            <Text style={styles.emailFallbackTitle}>Need help choosing?</Text>
            <Text style={styles.emailFallbackBody}>We're happy to advise — just email us.</Text>
            <TouchableOpacity
              style={styles.emailFallbackBtn}
              onPress={() => Linking.openURL('mailto:myt1dmate@gmail.com?subject=CGM%20setup%20help')}
              activeOpacity={0.8}
            >
              <Text style={styles.emailFallbackBtnText}>✉ Email support</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// ── Main Chat Screen ──────────────────────────────────────────────────────────
export default function ChatScreen({
  userName,
  onOpenSettings,
  onBack,
  messages,
  setMessages,
  routerState,
  setRouterState,
  glucoData,
  compact = false,
}) {
  const [input,           setInput]           = useState('');
  const [loading,         setLoading]         = useState(false);
  const [mode,            setMode]            = useState('chat'); // 'chat' | 'install'
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((prev) => [...prev, buildMsg(text, 'user')]);
    setLoading(true);
    scrollToBottom();
    try {
      const { response, newState } = await routeMessage(text, routerState);
      setRouterState(newState);
      setMessages((prev) => [...prev, buildMsg(response, 'mate')]);
    } catch {
      setMessages((prev) => [
        ...prev,
        buildMsg('Something went wrong on my end. Try again in a moment.', 'mate'),
      ]);
    }
    setLoading(false);
    scrollToBottom();
  }, [input, loading, routerState]);


  const handleLongPress = (text) => {
    Alert.alert('Message', undefined, [
      { text: 'Copy', onPress: () => Clipboard.setString(text) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderBubble = ({ item }) => {
    const isUser = item.from === 'user';
    return (
      <TouchableOpacity
        onLongPress={() => handleLongPress(item.text)}
        activeOpacity={1}
        style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowMate]}
      >
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleMate]}>
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextMate]} selectable>
            {item.text}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Install assistant mode ─────────────────────────────────────────────────
  if (mode === 'install') {
    return <InstallAssistant onBack={() => setMode('chat')} onBackToDashboard={onBack} />;
  }

  // ── Chat mode ──────────────────────────────────────────────────────────────
  const chatBody = (
    <View style={styles.flex}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderBubble}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={scrollToBottom}
        onLayout={scrollToBottom}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      />

      {loading && (
        <View style={styles.typingRow}>
          <View style={styles.typingBubble}>
            <Text style={styles.typingText}>Thinking…</Text>
          </View>
        </View>
      )}

      {/* Mode switcher pill — hidden while keyboard is open */}
      {!keyboardVisible && (
        <View style={styles.modeBar}>
          <View style={styles.modePills}>
            <TouchableOpacity style={[styles.modePill, styles.modePillActive]} activeOpacity={1}>
              <Text style={[styles.modePillText, styles.modePillTextActive]}>💬 {t('chatTabChat')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modePill}
              onPress={() => setMode('install')}
              activeOpacity={0.8}
            >
              <Text style={styles.modePillText}>📶 {t('chatTabCGM')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.inputField}
          placeholder={t('chatPlaceholder')}
          placeholderTextColor={COLORS.textSecondary}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={send}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendButton, loading && styles.sendButtonDisabled]}
          onPress={send}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.sendIcon}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {compact && onBack && (
        <View style={styles.backBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 16 }}
          >
            <Text style={styles.backButtonText}>← Dashboard</Text>
          </TouchableOpacity>
        </View>
      )}

      {!compact && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconLetter}>M</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>My T1D Mate</Text>
              <Text style={styles.headerSub}>
                {glucoData
                  ? `CGM: ${formatGluco(glucoData.glucose, glucoData.trend)}`
                  : 'Free · Private'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={onOpenSettings}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      )}

      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {chatBody}
        </KeyboardAvoidingView>
      ) : (
        chatBody
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },

  backBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 12, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: COLORS.accentMid,
  },
  backButton:     { paddingVertical: 4, paddingHorizontal: 4 },
  backButtonText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },

  header: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 48 : 52,
    paddingBottom: 14, paddingHorizontal: 16,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  iconCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#FFFFFF22', borderWidth: 1.5, borderColor: '#FFFFFF44',
    alignItems: 'center', justifyContent: 'center',
  },
  iconLetter:     { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  headerTitle:    { color: '#FFFFFF', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  headerSub:      { color: COLORS.accentMid, fontSize: 10, marginTop: 2 },
  settingsButton: { paddingLeft: 12 },
  settingsIcon:   { fontSize: 22 },

  messageList: { padding: 16, paddingBottom: 8 },

  bubbleRow:     { marginVertical: 4, flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowMate: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: COLORS.accentLight, borderBottomRightRadius: 4 },
  bubbleMate: {
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.accentMid, borderBottomLeftRadius: 4,
  },
  bubbleText:     { fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: COLORS.textPrimary },
  bubbleTextMate: { color: COLORS.textPrimary },

  typingRow:    { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 16, paddingVertical: 4 },
  typingBubble: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.accentMid,
    borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 8,
  },
  typingText: { color: COLORS.textSecondary, fontSize: 14, fontStyle: 'italic' },

  // Mode switcher
  modeBar: {
    paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: COLORS.background,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  modePills: {
    flexDirection: 'row',
    backgroundColor: COLORS.accentLight,
    borderRadius: 20, padding: 3, gap: 2,
  },
  modePill: {
    flex: 1, paddingVertical: 7, borderRadius: 18,
    alignItems: 'center',
  },
  modePillActive:     { backgroundColor: COLORS.primary },
  modePillText:       { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  modePillTextActive: { color: '#FFFFFF' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: COLORS.accentMid,
    backgroundColor: COLORS.surface, gap: 8,
  },
  scanButton:        { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  scanIcon:          { fontSize: 22 },
  inputField: {
    flex: 1, borderWidth: 1, borderColor: COLORS.accentMid,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 15, color: COLORS.textPrimary,
    backgroundColor: COLORS.background, maxHeight: 100,
  },
  sendButton: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendIcon:           { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },

  // Scanner modal
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlay:   { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scannerFrame:     { width: 260, height: 160, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 12, backgroundColor: 'transparent' },
  scannerHint:      { color: '#FFFFFF', fontSize: 14, marginTop: 20, textAlign: 'center', paddingHorizontal: 32, opacity: 0.85 },
  scannerClose: {
    position: 'absolute', bottom: 48, alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 24, paddingVertical: 12, paddingHorizontal: 36,
  },
  scannerCloseText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },

  // ── Install assistant ─────────────────────────────────────────────────────
  installHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  installBack:  { color: '#fff', fontSize: 14, fontWeight: '500' },
  installTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },

  installScroll: { padding: 16, paddingBottom: 48 },

  installIntro: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: COLORS.border,
  },
  installIntroTitle: { fontSize: 16, fontWeight: '700', color: COLORS.primary, marginBottom: 8 },
  installIntroBody:  { fontSize: 14, color: COLORS.textPrimary, lineHeight: 21 },
  bold:              { fontWeight: '700' },

  installPickLabel: {
    fontSize: 13, color: COLORS.textSecondary, fontWeight: '600',
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  installPickRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  installPickBtn: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 16, alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: COLORS.accentMid,
  },
  installPickEmoji: { fontSize: 28, marginBottom: 4 },
  installPickName:  { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  installPickSub:   { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' },
  installUnsure:    { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 16, lineHeight: 19 },

  installSourceHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  installSourceTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  installSwitch:      { fontSize: 13, color: COLORS.primary, fontWeight: '600' },

  // Steps
  step: { flexDirection: 'row', marginBottom: 4, gap: 12 },

  stepNumCol:  { alignItems: 'center', width: 28 },
  stepCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  stepNum:  { color: '#fff', fontSize: 13, fontWeight: '700' },
  stepLine: { width: 2, flex: 1, backgroundColor: COLORS.accentMid, marginTop: 4, marginBottom: 4, minHeight: 16 },

  stepContent: { flex: 1, paddingBottom: 20 },
  stepTitle:   { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
  stepBody:    { fontSize: 14, color: COLORS.textSecondary, lineHeight: 21, marginBottom: 10 },

  playStoreBtn: {
    backgroundColor: COLORS.success, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 16,
    alignSelf: 'flex-start', marginBottom: 8,
  },
  playStoreBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  videoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.accentLight, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: COLORS.accentMid,
  },
  videoBtnIcon:  { fontSize: 20, color: COLORS.primary },
  videoBtnLabel: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  videoBtnSub:   { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  // Email fallback
  emailFallback: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, marginTop: 24, alignItems: 'center',
  },
  emailFallbackTitle:   { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
  emailFallbackBody:    { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 14 },
  emailFallbackBtn:     { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  emailFallbackBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
