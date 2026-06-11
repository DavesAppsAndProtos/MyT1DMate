/**
 * My T1D Mate — DashboardScreen
 * Session 9c fixes:
 *   - App bar moved to SplitScreen (above glucose panel) — this file no longer renders it
 *   - HTT My Pins back → reopens HTT modal (not dashboard)
 *   - Dose calc: full-height bottom sheet, not a small centred modal
 *   - TouchableWithoutFeedback render error in Settings fixed (separate file)
 *   - Weight tracker wired to WeightScreen
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  SafeAreaView,
  Alert,
  Linking,
  TextInput,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Switch,
} from 'react-native';
import SQLite from 'react-native-sqlite-storage';
import { getProfile, setProfileField } from '../database/db';
import Svg, { Circle, Rect, Line, Ellipse, Path } from 'react-native-svg';
import { Image } from 'react-native';
import { t } from '../i18n/en';

SQLite.enablePromise(true);

// ── Scales icon — CC0 asset from svgrepo.com (Sarah) ─────────────────────────
const SCALES_ASSET = require('../assets/scales.png');
function ScalesIcon({ size = 28 }) {
  return <Image source={SCALES_ASSET} style={{ width: size, height: size }} resizeMode="contain" />;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const formatPinDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const COLORS = {
  primary:      '#003DA5',
  background:   '#F5F7FA',
  surface:      '#FFFFFF',
  textPrimary:  '#1A1A2E',
  textSecondary:'#6B7280',
  border:       'rgba(0,0,0,0.08)',
  accent:       '#E8EFFF',
  accentMid:    '#BBCFFF',
  danger:       '#E53E3E',
};

const ALL_TILES = [
  { id: 'chat',     emoji: '💬',      label: () => t('tileChat') },
  { id: 'htt',      emoji: '📌',      label: () => t('tileHTT') },
  { id: 'dose',     emoji: '💉',      label: () => t('tileDose') },
  { id: 'weight',   svgIcon: true,    label: () => t('tileWeight') },
  { id: 'exercise', emoji: '🏃',      label: () => t('tileExercise') },
  { id: 'morning',  emoji: '☀️',      label: () => t('tileMorning') },
  { id: 'auto',     emoji: '🚗',      label: () => t('tileAuto') },
  { id: 'suggest',  emoji: '💡',      label: () => t('tileSuggest') },
];

// ── Slim glucose strip ────────────────────────────────────────────────────────
function GlucoseStrip({ glucoData }) {
  if (!glucoData) {
    return (
      <View style={styles.glucoStrip}>
        <Text style={styles.glucoNoData}>No CGM data yet</Text>
      </View>
    );
  }
  const { glucose, trend, timestamp } = glucoData;
  const ARROWS = { 1:'↓↓', 2:'↓', 3:'↘', 4:'→', 5:'↗', 6:'↑', 7:'↑↑' }; // Abbott 1-7 scale
  const arrow = ARROWS[trend] || '→';
  const ageSec = timestamp ? Math.floor((Date.now() - timestamp) / 1000) : null;
  const freshness = ageSec === null ? ''
    : ageSec < 70   ? 'just now'
    : ageSec < 3600 ? `${Math.floor(ageSec / 60)} min ago`
    : 'older data';
  return (
    <View style={styles.glucoStrip}>
      <Text style={styles.glucoValue}>{typeof glucose === 'number' ? glucose.toFixed(1) : '--'}</Text>
      <Text style={styles.glucoArrow}>{arrow}</Text>
      <Text style={styles.glucoUnit}>mmol/L</Text>
      {freshness ? <Text style={styles.glucoFresh}>{freshness}</Text> : null}
    </View>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function DashboardScreen({
  onOpenPremiumTeaser,
  onOpenSettings,
  onOpenWeight,
  glucoData,
  customiseRef,
}) {
  const [httVisible,    setHttVisible]    = useState(false);
  const [doseVisible,   setDoseVisible]   = useState(false);
  const [customVisible, setCustomVisible] = useState(false);
  const [fbVisible,      setFbVisible]     = useState(false);
  const [fbType,         setFbType]        = useState(null);
  const [fbText,         setFbText]        = useState('');
  const [suggestVisible, setSuggestVisible]= useState(false);

  // Expose setCustomVisible to SplitScreen via ref
  useEffect(() => {
    if (customiseRef) customiseRef.current = () => setCustomVisible(true);
  }, [customiseRef]);

  // Default visibility: Morning and Exercise hidden; Timer removed entirely
  const DEFAULT_VISIBILITY = {
    chat: true, htt: true, dose: true, weight: true,
    exercise: false, morning: false, auto: true, suggest: true,
  };

  const [tileVisibility, setTileVisibility] = useState(DEFAULT_VISIBILITY);

  // Load tile visibility from SQLite on mount
  useEffect(() => {
    (async () => {
      try {
        const profile = await getProfile();
        if (profile?.tile_visibility) {
          const saved = JSON.parse(profile.tile_visibility);
          // Merge with defaults so any new tiles get their default value
          setTileVisibility({ ...DEFAULT_VISIBILITY, ...saved });
        }
      } catch (e) {
        console.warn('[Dashboard] Could not load tile visibility', e);
      }
    })();
  }, []);

  // Save tile visibility to SQLite whenever it changes
  const handleTileVisibilityChange = useCallback((id, value) => {
    setTileVisibility((prev) => {
      const next = { ...prev, [id]: value };
      setProfileField('tile_visibility', JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const visibleTiles = ALL_TILES.filter((tile) => tileVisibility[tile.id]);

  const handleTile = (id) => {
    switch (id) {
      case 'chat':     onOpenPremiumTeaser(); break;
      case 'htt':      setHttVisible(true); break;
      case 'dose':     setDoseVisible(true); break;
      case 'weight':   onOpenWeight(); break;
      case 'suggest':  setSuggestVisible(true); break;
      case 'auto':
        Alert.alert(t('androidAutoTitle'), t('androidAutoBody'));
        break;
      case 'exercise':
      case 'morning':
        Alert.alert(t('comingSoon'), `${ALL_TILES.find(tile => tile.id === id)?.label()} is on the way.`);
        break;
    }
  };

  const openFeedback = () => { setFbType(null); setFbText(''); setFbVisible(true); };
  const sendFeedback = () => {
    if (!fbType)       { Alert.alert(t('feedbackPickType'), t('feedbackPickTypeMsg')); return; }
    if (!fbText.trim()){ Alert.alert(t('feedbackNeedDetail'), t('feedbackDetailMsg')); return; }
    const subject = fbType === 'bug' ? t('feedbackEmailSubjectBug') : t('feedbackEmailSubjectSug');
    const mailto  = `mailto:myt1dmate@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fbText.trim())}`;
    Linking.openURL(mailto)
      .then(() => setFbVisible(false))
      .catch(() => Alert.alert(t('feedbackNoEmail'), t('feedbackNoEmailMsg')));
  };

  return (
    <View style={styles.root}>

      {/* Slim glucose strip — only shown on tile screens; full panel shows on dashboard */}
      {/* Slim strip now rendered by SplitScreen — removed from here */}

      {/* Tile grid */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {visibleTiles.map((tile) => (
          <TouchableOpacity
            key={tile.id}
            style={styles.tile}
            onPress={() => handleTile(tile.id)}
            activeOpacity={0.75}
          >
            {tile.svgIcon
              ? (
                // Session 27 P9: ScalesIcon (Image) sits higher than emoji tiles because
                // <Image> has no implicit line-height padding that <Text> gets from font metrics.
                // Wrap in a View matching the emoji text height (fontSize 28 → ~34px with lineHeight)
                // so the icon is vertically centred in the same space as other tile icons.
                <View style={styles.tileIconWrap}>
                  <ScalesIcon size={28} color={COLORS.primary} />
                </View>
              )
              : <Text style={styles.tileEmoji}>{tile.emoji}</Text>
            }
            <Text style={styles.tileLabel}>{tile.label()}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Customise Dashboard ───────────────────────────────────────────── */}
      <Modal visible={customVisible} transparent animationType="slide" onRequestClose={() => setCustomVisible(false)}>
        <View style={styles.fullScreen}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('customiseTitle')}</Text>
              <TouchableOpacity onPress={() => setCustomVisible(false)}>
                <Text style={styles.sheetDone}>{t('done')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.customiseHint}>{t('customiseHint')}</Text>
            <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
              {ALL_TILES.map((tile) => (
                <View key={tile.id} style={styles.customiseRow}>
                  {tile.svgIcon
                    ? <View style={styles.customiseTileEmoji}><ScalesIcon size={22} color={COLORS.primary} /></View>
                    : <Text style={styles.customiseTileEmoji}>{tile.emoji}</Text>
                  }
                  <Text style={styles.customiseTileLabel}>{tile.label()}</Text>
                  <Switch
                    value={tileVisibility[tile.id]}
                    onValueChange={(v) => handleTileVisibilityChange(tile.id, v)}
                    trackColor={{ false: '#ccc', true: COLORS.accentMid }}
                    thumbColor={tileVisibility[tile.id] ? COLORS.primary : '#fff'}
                  />
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ── HTT Modal ────────────────────────────────────────────────────── */}
      <HTTModal visible={httVisible} onClose={() => setHttVisible(false)} />

      {/* ── Dose Calc — bottom sheet ──────────────────────────────────────── */}
      <DoseCalcSheet visible={doseVisible} onClose={() => setDoseVisible(false)} onOpenSettings={onOpenSettings} />

      {/* ── Shape This App Modal ────────────────────────────────────────── */}
      <SuggestModal
        visible={suggestVisible}
        onClose={() => setSuggestVisible(false)}
      />

      {/* ── Feedback Modal ───────────────────────────────────────────────── */}
      <Modal visible={fbVisible} transparent animationType="fade" onRequestClose={() => setFbVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setFbVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.modalBox}>
                  <Text style={styles.modalTitle}>{t('feedbackTitle')}</Text>
                  <View style={styles.fbTypeRow}>
                    {['bug', 'suggestion'].map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[styles.fbPill, fbType === type && styles.fbPillActive]}
                        onPress={() => setFbType(type)}
                      >
                        <Text style={[styles.fbPillText, fbType === type && styles.fbPillTextActive]}>
                          {type === 'bug' ? t('feedbackBug') : t('feedbackSuggestion')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.fbInput}
                    placeholder={t('feedbackPlaceholder')}
                    placeholderTextColor="#aaa"
                    value={fbText}
                    onChangeText={setFbText}
                    multiline
                    textAlignVertical="top"
                  />
                  <View style={styles.modalButtons}>
                    <TouchableOpacity onPress={() => setFbVisible(false)} style={styles.backLink}>
                      <Text style={styles.backLinkText}>{t('backDashboard')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, !fbType && styles.primaryBtnDisabled]}
                      onPress={sendFeedback}
                      disabled={!fbType}
                    >
                      <Text style={styles.primaryBtnText}>{t('send')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </View>
  );
}

// ── HTT Modal ─────────────────────────────────────────────────────────────────
const getDB = async () => SQLite.openDatabase({ name: 'T1DMate.db', location: 'default' });

function HTTModal({ visible, onClose }) {
  const [pinText,     setPinText]     = useState('');
  const [managerOpen, setManagerOpen] = useState(false);
  const [pins,        setPins]        = useState([]);
  const [editingPin,  setEditingPin]  = useState(null);
  const [editText,    setEditText]    = useState('');

  const savePin = async () => {
    if (!pinText.trim()) return;
    try {
      const db = await getDB();
      await db.executeSql(
        'INSERT INTO pins (content, created_at) VALUES (?, ?)',
        [pinText.trim(), new Date().toISOString()]
      );
      setPinText('');
      onClose();
    } catch {
      Alert.alert(t('httCouldNotSave'), t('httSaveError'));
    }
  };

  const loadPins = useCallback(async () => {
    try {
      const db = await getDB();
      const [results] = await db.executeSql('SELECT * FROM pins ORDER BY created_at DESC');
      const rows = [];
      for (let i = 0; i < results.rows.length; i++) rows.push(results.rows.item(i));
      setPins(rows);
    } catch (e) { console.warn('[HTT] loadPins failed', e); }
  }, []);

  const deletePin = (pin) => {
    const preview = pin.content.length > 40 ? pin.content.slice(0, 40) + '…' : pin.content;
    Alert.alert(t('httDeleteTitle'), `"${preview}"${t('httDeleteSuffix')}`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          try {
            const db = await getDB();
            await db.executeSql('DELETE FROM pins WHERE id = ?', [pin.id]);
            loadPins();
          } catch { console.warn('[HTT] deletePin failed'); }
        },
      },
    ]);
  };

  const saveEdit = async () => {
    if (!editText.trim() || !editingPin) return;
    try {
      const db = await getDB();
      await db.executeSql('UPDATE pins SET content = ? WHERE id = ?', [editText.trim(), editingPin.id]);
      setEditingPin(null);
      loadPins();
    } catch { console.warn('[HTT] saveEdit failed'); }
  };

  // Open manager: close add modal, open manager, when manager closes reopen add modal
  const openManager = () => {
    setPinText('');
    onClose();
    setTimeout(() => { loadPins(); setManagerOpen(true); }, 120);
  };

  // Done in manager → close manager and reopen HTT add modal
  const closeManager = () => {
    setManagerOpen(false);
    setEditingPin(null);
    setTimeout(() => { onClose(); /* parent will re-show via tile */ }, 50);
    // Actually we want to reopen HTT — signal parent
    setTimeout(() => _reopenHTT && _reopenHTT(), 200);
  };

  // Reopen HTT from manager Done button — call onClose then re-show
  // We achieve this by NOT calling onClose — instead we swap modals directly
  const doneInManager = () => {
    setManagerOpen(false);
    setEditingPin(null);
    // HTT add modal was closed when we opened manager.
    // Re-show it by calling the parent's open function indirectly:
    // parent visibility is controlled by httVisible state.
    // We use a small hack: fire onClose on manager, then signal reopen via prop.
    // Simpler: just call onClose from here which is actually the setter for httVisible(false)
    // But we want true. So we need the parent to expose onReopen.
    // Actually the cleanest solution: keep managerOpen and httVisible both in this component.
    // httVisible (the add-pin modal) is already controlled here via the `visible` prop.
    // We need parent to flip it back to true. Since we don't have that,
    // the simplest fix is to keep a local "showAdd" state that overrides:
    setShowAdd(true);
  };

  const [showAdd, setShowAdd] = useState(false);
  // showAdd supplements the parent's `visible` prop
  const addVisible = visible || showAdd;

  return (
    <>
      {/* Add pin modal */}
      <Modal visible={addVisible} transparent animationType="fade" onRequestClose={() => { setShowAdd(false); onClose(); }}>
        <TouchableWithoutFeedback onPress={() => { setShowAdd(false); onClose(); }}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.modalBox}>
                  <Text style={styles.modalTitle}>{t('httTitle')}</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder={t('httPlaceholder')}
                    placeholderTextColor="#aaa"
                    value={pinText}
                    onChangeText={setPinText}
                    multiline
                    autoFocus
                  />
                  <View style={styles.modalButtons}>
                    <TouchableOpacity style={styles.myPinsBtn} onPress={openManager}>
                      <Text style={styles.myPinsBtnText}>{t('httMyPins')}</Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      <TouchableOpacity onPress={() => { setShowAdd(false); onClose(); }}>
                        <Text style={styles.backLinkText}>{t('backDashboard')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.primaryBtn, !pinText.trim() && styles.primaryBtnDisabled]}
                        onPress={savePin}
                        disabled={!pinText.trim()}
                      >
                        <Text style={styles.primaryBtnText}>{t('save')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Pin manager */}
      <Modal
        visible={managerOpen}
        transparent={false}
        animationType="slide"
        onRequestClose={doneInManager}
      >
        <SafeAreaView style={styles.fullScreen}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={doneInManager} hitSlop={{top:8,bottom:8,left:8,right:16}}>
              <Text style={styles.dashLinkText}>{t('backHTT')}</Text>
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>{t('httManagerTitle')}</Text>
            <TouchableOpacity onPress={() => { setManagerOpen(false); setEditingPin(null); setShowAdd(false); onClose(); }} hitSlop={{top:8,bottom:8,left:8,right:8}}>
              <Text style={styles.dashLinkText}>{t('backDashboard')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 16, paddingTop: 12 }}>
            {pins.length === 0 && (
              <Text style={styles.managerEmpty}>{t('httEmpty')}</Text>
            )}
            {pins.map((pin) => (
              <View key={pin.id} style={styles.managerRow}>
                {editingPin?.id === pin.id ? (
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={styles.editInput}
                      value={editText}
                      onChangeText={setEditText}
                      multiline
                      autoFocus
                    />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                      <TouchableOpacity onPress={() => setEditingPin(null)}>
                        <Text style={{ color: '#888', fontSize: 14, paddingVertical: 6 }}>{t('cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.editSave} onPress={saveEdit}>
                        <Text style={styles.editSaveText}>{t('save')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => { setEditingPin(pin); setEditText(pin.content); }}
                    >
                      <Text style={styles.pinContentText}>{pin.content}</Text>
                      <Text style={styles.pinMeta}>{formatPinDate(pin.created_at)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deletePin(pin)}>
                      <Text style={{ fontSize: 22, paddingLeft: 12, paddingTop: 2 }}>🗑️</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

// ── Dose Calc — full bottom sheet ─────────────────────────────────────────────
const PERIODS = [
  { id: 'breakfast', label: () => t('dosePeriodBreakfast'), emoji: '🌅', field: 'ic_ratio_breakfast' },
  { id: 'lunch',     label: () => t('dosePeriodLunch'),     emoji: '☀️', field: 'ic_ratio_lunch'     },
  { id: 'evening',   label: () => t('dosePeriodEvening'),   emoji: '🌙', field: 'ic_ratio_evening'   },
  { id: 'overnight', label: () => t('dosePeriodOvernight'), emoji: '💤', field: 'ic_ratio_overnight' },
];

function DoseCalcSheet({ visible, onClose, onOpenSettings }) {
  const [ratios,     setRatios]     = useState({});
  const [mealPeriod, setMealPeriod] = useState('breakfast');
  const [carbs,      setCarbs]      = useState('');
  const [result,     setResult]     = useState(null);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const profile = await getProfile();
        const r = {};
        PERIODS.forEach(({ id, field }) => {
          const raw = profile[field];
          if (raw) {
            const parts = raw.toString().split(':');
            if (parts.length === 2) {
              r[id] = { insulin: parseFloat(parts[0]) || 1, carbs: parseFloat(parts[1]) || 10 };
            } else {
              r[id] = { insulin: 1, carbs: parseFloat(raw) || 10 };
            }
          } else {
            r[id] = null;
          }
        });
        setRatios(r);
        setCarbs('');
        setResult(null);
      } catch (e) { console.warn('[DoseCalc] profile load failed', e); }
    })();
  }, [visible]);

  const currentRatio = ratios[mealPeriod];
  const periodLabel  = PERIODS.find(p => p.id === mealPeriod)?.label() ?? '';
  const ratioIsSet   = currentRatio !== null && currentRatio !== undefined;

  const goToSettings = () => { onClose(); setTimeout(onOpenSettings, 150); };

  const calculate = () => {
    const carbVal = parseFloat(carbs);
    if (!carbVal || carbVal <= 0) { Alert.alert(t('doseEnterCarbs'), t('doseEnterCarbsMsg')); return; }
    if (!ratioIsSet) {
      Alert.alert(
        t('doseNoRatioTitle'),
        t('doseNoRatioMsg').replace('%period%', periodLabel),
        [
          { text: t('goToSettings'), onPress: goToSettings },
          { text: t('notNow'), style: 'cancel' },
        ]
      );
      return;
    }
    setResult((parseFloat(carbs) / currentRatio.carbs) * currentRatio.insulin);
    Keyboard.dismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.sheetDismissArea} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetBigTitle}>{t('doseTitle')}</Text>

            {/* Meal period */}
            <View style={styles.periodRow}>
              {PERIODS.map(({ id, emoji, label }) => (
                <TouchableOpacity
                  key={id}
                  style={[styles.periodBtn, mealPeriod === id && styles.periodBtnActive]}
                  onPress={() => { setMealPeriod(id); setResult(null); }}
                >
                  <Text style={styles.periodEmoji}>{emoji}</Text>
                  <Text style={[styles.periodLabel, mealPeriod === id && styles.periodLabelActive]}>{label()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Ratio */}
            <View style={styles.doseRatioRow}>
              <Text style={styles.doseRatioLbl}>{t('doseRatioFor')} {periodLabel}</Text>
              {ratioIsSet ? (
                <View style={styles.ratioSetBadge}>
                  <Text style={styles.ratioSetText}>{currentRatio.insulin} : {currentRatio.carbs}</Text>
                </View>
              ) : (
                <TouchableOpacity onPress={goToSettings} style={styles.ratioNotSetBadge}>
                  <Text style={styles.ratioNotSetText}>{t('doseRatioNotSet')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Carb input */}
            <View style={styles.doseInputRow}>
              <TextInput
                style={[styles.doseInput, !ratioIsSet && styles.doseInputMuted]}
                placeholder={t('doseCarbsLabel')}
                placeholderTextColor="#aaa"
                value={carbs}
                onChangeText={(v) => { setCarbs(v); setResult(null); }}
                keyboardType="decimal-pad"
                editable={ratioIsSet}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, { paddingHorizontal: 28 }, !ratioIsSet && styles.primaryBtnDisabled]}
                onPress={calculate}
                disabled={!ratioIsSet}
              >
                <Text style={styles.primaryBtnText}>{t('doseCalcBtn')}</Text>
              </TouchableOpacity>
            </View>

            {/* Result */}
            {result !== null && (
              <View style={styles.doseResult}>
                <Text style={styles.doseResultLabel}>{t('doseSuggested')}</Text>
                <Text style={styles.doseResultValue}>{parseFloat(result).toFixed(1)} {t('doseUnits')}</Text>
                <Text style={styles.doseResultDisclaimer}>{t('doseDisclaimer')}</Text>
              </View>
            )}

            <TouchableOpacity onPress={onClose} style={[styles.backLink, { marginTop: 16 }]}>
              <Text style={styles.backLinkText}>{t('backDashboard')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── SuggestModal ─────────────────────────────────────────────────────────────
function SuggestModal({ visible, onClose }) {
  const [text, setText] = useState('');

  const send = () => {
    if (!text.trim()) {
      Alert.alert(t('suggestErrorTitle'), t('suggestErrorBody'));
      return;
    }
    const mailto = `mailto:myt1dmate@gmail.com?subject=${encodeURIComponent(t('suggestEmailSubject'))}&body=${encodeURIComponent(text.trim())}`;
    Linking.openURL(mailto)
      .then(() => { setText(''); onClose(); })
      .catch(() => Alert.alert(t('feedbackNoEmail'), t('suggestErrorEmail')));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={styles.modalBox}>
                <Text style={styles.modalTitle}>{t('suggestTitle')}</Text>
                <Text style={styles.suggestIntro}>{t('suggestIntro')}</Text>
                <TextInput
                  style={[styles.fbInput, { minHeight: 120 }]}
                  placeholder={t('suggestPlaceholder')}
                  placeholderTextColor="#aaa"
                  value={text}
                  onChangeText={setText}
                  multiline
                  textAlignVertical="top"
                  autoFocus
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity onPress={onClose} style={styles.backLink}>
                    <Text style={styles.backLinkText}>{t('backDashboard')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryBtn, !text.trim() && styles.primaryBtnDisabled]}
                    onPress={send}
                    disabled={!text.trim()}
                  >
                    <Text style={styles.primaryBtnText}>{t('send')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  // Glucose strip
  glucoStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  glucoValue:  { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  glucoArrow:  { fontSize: 18, color: COLORS.primary },
  glucoUnit:   { fontSize: 13, color: COLORS.textSecondary, marginRight: 6 },
  glucoFresh:  { fontSize: 12, color: COLORS.textSecondary },
  glucoNoData: { fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic' },

  // Tile grid
  scroll: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  tile: {
    width: '30%', aspectRatio: 1,
    backgroundColor: COLORS.surface, borderRadius: 16,
    alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 6,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  tileEmoji: { fontSize: 28 },
  tileIconWrap: {
    // Height matches the implicit line-height of a fontSize-28 emoji Text node
    // so ScalesIcon aligns consistently with emoji icons on other tiles.
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel:  { fontSize: 11, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center' },

  // Drawer
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', flexDirection: 'row' },
  drawer: { width: 260, backgroundColor: COLORS.surface, paddingTop: 48, elevation: 8 },
  drawerTitle: {
    fontSize: 20, fontWeight: '700', color: COLORS.textPrimary,
    paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 8,
  },
  drawerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  drawerItemEmoji: { fontSize: 20, width: 28 },
  drawerItemLabel: { fontSize: 16, color: COLORS.textPrimary },

  // Full screen modal (customise, pin manager)
  fullScreen: { flex: 1, backgroundColor: COLORS.background },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 14,
  },
  sheetTitle: { fontSize: 17, fontWeight: '600', color: '#fff' },
  sheetDone:  { fontSize: 16, color: '#fff', fontWeight: '600' },

  customiseHint: { fontSize: 13, color: COLORS.textSecondary, paddingHorizontal: 16, paddingVertical: 12 },
  customiseRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12,
  },
  customiseTileEmoji: { fontSize: 22, width: 32 },
  customiseTileLabel: { flex: 1, fontSize: 16, color: COLORS.textPrimary },

  // Bottom sheet (dose calc)
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetDismissArea: { flex: 1 },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 36, paddingTop: 12,
    elevation: 16,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#ccc', alignSelf: 'center', marginBottom: 20,
  },
  sheetBigTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 18 },

  // Period selector
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  periodBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderWidth: 1.5, borderColor: '#ddd',
    borderRadius: 14, gap: 4,
  },
  periodBtnActive:   { borderColor: COLORS.primary, backgroundColor: COLORS.accent },
  periodEmoji:       { fontSize: 20 },
  periodLabel:       { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  periodLabelActive: { color: COLORS.primary, fontWeight: '700' },

  // Ratio
  doseRatioRow:     { marginBottom: 16 },
  doseRatioLbl:     { fontSize: 13, color: COLORS.textSecondary, marginBottom: 8 },
  ratioSetBadge:    { backgroundColor: COLORS.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignSelf: 'flex-start' },
  ratioSetText:     { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  ratioNotSetBadge: { borderWidth: 1.5, borderColor: COLORS.danger, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignSelf: 'flex-start' },
  ratioNotSetText:  { fontSize: 14, color: COLORS.danger, fontWeight: '600' },

  // Carb input
  doseInputRow: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'center' },
  doseInput: {
    flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#000',
  },
  doseInputMuted: { borderColor: '#eee', backgroundColor: '#fafafa' },

  // Result
  doseResult: {
    marginTop: 16, alignItems: 'center', backgroundColor: COLORS.accent,
    borderRadius: 16, padding: 20, gap: 4,
  },
  doseResultLabel:      { fontSize: 13, color: COLORS.textSecondary },
  doseResultValue:      { fontSize: 42, fontWeight: '800', color: COLORS.primary },
  doseResultDisclaimer: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center', marginTop: 6 },

  // Generic modal (centred — feedback)
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  modalBox: { width: '100%', backgroundColor: '#fff', borderRadius: 18, padding: 20, elevation: 8 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 16 },
  modalInput: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, minHeight: 80, textAlignVertical: 'top', color: '#000',
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },

  // Shared buttons
  primaryBtn:         { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  primaryBtnDisabled: { backgroundColor: '#ccc' },
  primaryBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  backLink:           { paddingVertical: 8, paddingHorizontal: 4 },
  suggestIntro:       { fontSize: 14, color: COLORS.textSecondary, marginBottom: 14, lineHeight: 20 },
  dashLinkText:       { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  backLinkText:       { fontSize: 14, color: COLORS.primary, fontWeight: '600' },

  // Pin manager
  managerEmpty: { color: '#aaa', textAlign: 'center', marginTop: 48, fontSize: 15, lineHeight: 22 },
  managerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee',
    backgroundColor: COLORS.surface, paddingHorizontal: 4,
    marginBottom: 2, borderRadius: 10,
  },
  pinContentText: { fontSize: 15, color: '#000', marginBottom: 4 },
  pinMeta:        { fontSize: 12, color: '#999' },
  editInput: {
    borderWidth: 1, borderColor: COLORS.primary, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 15, color: '#000', minHeight: 60, textAlignVertical: 'top', marginBottom: 8,
  },
  editSave:     { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6 },
  editSaveText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // HTT
  myPinsBtn:     { paddingVertical: 8, paddingHorizontal: 4 },
  myPinsBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },

  // Feedback
  fbTypeRow:        { flexDirection: 'row', gap: 10, marginBottom: 14 },
  fbPill:           { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  fbPillActive:     { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  fbPillText:       { fontSize: 14, color: '#555' },
  fbPillTextActive: { color: '#fff', fontWeight: '600' },
  fbInput: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, minHeight: 100, textAlignVertical: 'top', color: '#000',
  },
});
