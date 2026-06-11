/**
 * My T1D Mate — GlucoService (Session 6b)
 *
 * Switched from broadcast receiver to HTTP polling via GDH's Pebble endpoint.
 * The native GlucoseForegroundService does the actual polling in Kotlin
 * (keeps working even when the JS thread is frozen by Android Doze).
 *
 * This JS layer:
 *   - Starts/stops the native foreground service
 *   - Listens for GlucoUpdate events emitted by GlucoModule
 *   - Provides formatGluco() for display
 *
 * iOS note: when porting, replace startForegroundService() with a JS-side
 * fetch() polling loop against http://127.0.0.1:17580/pebble — same endpoint,
 * same JSON shape, no native module needed.
 *
 * Data flow:
 *   GDH HTTP server → GlucoseForegroundService (Kotlin, polls every 60s)
 *     → GlucoModule.emitGlucoseUpdate() → NativeEventEmitter → onGlucoUpdate()
 *
 * Units:
 *   GDH Pebble endpoint returns sgv in mg/dL.
 *   GlucoseForegroundService converts to mmol/L before emitting.
 *   All values in this layer are therefore mmol/L.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { GlucoModule } = NativeModules;

const isSupported = Platform.OS === 'android' && !!GlucoModule;

let emitter = null;
if (isSupported) {
  emitter = new NativeEventEmitter(GlucoModule);
}

export const TREND_ARROWS = {
  1: '↑↑',
  2: '↑',
  3: '↗',
  4: '→',
  5: '↘',
  6: '↓',
  7: '↓↓',
};

// Direction string → trend int (for iOS fallback using direction field)
export const DIRECTION_TO_TREND = {
  DoubleUp:      1,
  SingleUp:      2,
  FortyFiveUp:   3,
  Flat:          4,
  FortyFiveDown: 5,
  SingleDown:    6,
  DoubleDown:    7,
};

/**
 * Start the native foreground service which runs the HTTP poller.
 * Safe to call multiple times — native side guards against double-start.
 */
export const startGlucoService = () => {
  if (!isSupported) {
    console.warn('[GlucoService] GlucoModule not available — GDH integration inactive');
    return;
  }
  GlucoModule.startForegroundService();
  console.log('[GlucoService] GlucoseForegroundService started');
};

/**
 * Stop the foreground service.
 * Note: intentionally NOT called on app unmount — service should persist.
 * Only call this if the user explicitly disables CGM integration.
 */
export const stopGlucoService = () => {
  if (!isSupported) return;
  GlucoModule.stopListening();
  console.log('[GlucoService] Stopped');
};

/**
 * Subscribe to glucose updates emitted by the native poller.
 * Returns an unsubscribe function.
 *
 * @param {(data: { glucose: number, trend: number, timestamp: number }) => void} callback
 * @returns {() => void} unsubscribe
 */
export const onGlucoUpdate = (callback) => {
  if (!isSupported || !emitter) {
    console.warn('[GlucoService] Cannot subscribe — GlucoModule not available');
    return () => {};
  }
  const sub = emitter.addListener('GlucoUpdate', callback);
  return () => sub.remove();
};

/**
 * Format a glucose value for display.
 * glucose is always mmol/L from our native layer.
 * e.g. formatGluco(6.7, 4) → "6.7 →"
 */
export const formatGluco = (glucose, trend) => {
  if (glucose == null || glucose < 0) return '---';
  const arrow = TREND_ARROWS[trend] || '';
  return `${glucose.toFixed(1)} ${arrow}`.trim();
};
