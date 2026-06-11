/**
 * My T1D Mate — LibreLinkUpService
 * Session 18: Replaces GDHService. Polls Abbott's LibreLinkUp cloud API.
 *
 * Auth flow:
 *   1. POST /llu/auth/login → JWT token + user.id + possible region redirect
 *   2. GET  /llu/connections → patientId
 *   3. GET  /llu/connections/<patientId>/graph → latest glucoseMeasurement
 *
 * Token is cached in SQLite (llup_token, llup_token_expires, llup_patient_id,
 * llup_user_id, llup_base_url). Re-auth only when expired or on 401.
 *
 * Account-Id header (required since ~Oct 2025): SHA256 hex of user.id UUID.
 * Implemented in pure JS below — no native crypto module needed.
 *
 * Credentials (llup_email, llup_password) stored in SQLite by
 * LibreLinkUpOnboardingScreen on first login.
 *
 * Hook interface is intentionally identical to the old useGDHService so
 * App.js changes are minimal:
 *   const { glucoData, llupOnline, llupOutage, freshnessMs } =
 *     useLibreLinkUpService({ onRecovery });
 *
 * glucoData shape (same as before):
 *   { glucose, trend, direction, delta, timestamp, datetime }
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, NativeModules, NativeEventEmitter } from 'react-native';
import { getProfile, setProfileField, saveGlucoseReading } from '../database/db';

const { GlucoModule } = NativeModules;

// ── Constants ─────────────────────────────────────────────────────────────────
const LLU_BASE_DEFAULT  = 'https://api.libreview.io';
const LLU_VERSION       = '4.16.0';
const LLU_PRODUCT       = 'llu.android';
const POLL_INTERVAL     = 300_000;   // 5 mins
const FETCH_TIMEOUT     = 10_000;   // 10 s
const OUTAGE_AFTER      = 2;        // consecutive failures before declaring outage
const FRESHNESS_TICK    = 1_000;    // 1 s independent tick

// LibreLinkUp cloud API TrendArrow is a 1-5 scale (NOT 1-7):
//   1=SingleDown  2=FortyFiveDown  3=Flat  4=FortyFiveUp  5=SingleUp
//   6=NotComputable  7=RateOutOfRange  (error states — treated as Flat)
// GlucosePanel uses 1-7 scale. Map LLU 1-5 → GlucosePanel 1-7.
const TREND_MAP = {
  1: 2,  // SingleDown      → ↓  (GlucosePanel: Falling)
  2: 3,  // FortyFiveDown   → ↘  (GlucosePanel: FallingSlowly)
  3: 4,  // Flat            → →  (GlucosePanel: Stable)
  4: 5,  // FortyFiveUp     → ↗  (GlucosePanel: RisingSlowly)
  5: 6,  // SingleUp        → ↑  (GlucosePanel: Rising)
  6: 4,  // NotComputable   → →  (treat as Stable)
  7: 4,  // RateOutOfRange  → →  (treat as Stable)
};

const DIRECTION_MAP = {
  1: 'SingleDown',
  2: 'FortyFiveDown',
  3: 'Flat',
  4: 'FortyFiveUp',
  5: 'SingleUp',
  6: 'Flat',  // NotComputable
  7: 'Flat',  // RateOutOfRange
};

// ── Pure-JS SHA-256 ───────────────────────────────────────────────────────────
// Required for Account-Id header (SHA256 hex of user UUID string).
// No native module needed.
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
  const H0 = [
    0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
    0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19,
  ];
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
        const s0 = rotr(w[j-15],7) ^ rotr(w[j-15],18) ^ (w[j-15]>>>3);
        const s1 = rotr(w[j-2],17) ^ rotr(w[j-2],19)  ^ (w[j-2]>>>10);
        w[j] = (w[j-16]+s0+w[j-7]+s1) >>> 0;
      }
      let [a,b,c,d,e,f,g,h] = [h0,h1,h2,h3,h4,h5,h6,h7];
      for (let j = 0; j < 64; j++) {
        const S1  = rotr(e,6)^rotr(e,11)^rotr(e,25);
        const ch  = (e&f)^(~e&g);
        const t1  = (h+S1+ch+K[j]+w[j]) >>> 0;
        const S0  = rotr(a,2)^rotr(a,13)^rotr(a,22);
        const maj = (a&b)^(a&c)^(b&c);
        const t2  = (S0+maj) >>> 0;
        [h,g,f,e,d,c,b,a] = [g,f,e,(d+t1)>>>0,c,b,a,(t1+t2)>>>0];
      }
      h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
      h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
    }
    return [h0,h1,h2,h3,h4,h5,h6,h7]
      .map(n => n.toString(16).padStart(8,'0')).join('');
  };
})();

// ── HTTP helpers ──────────────────────────────────────────────────────────────
const baseHeaders = (token, accountId) => {
  const h = {
    'Content-Type':  'application/json',
    'version':       LLU_VERSION,
    'product':       LLU_PRODUCT,
    'Cache-Control': 'no-cache',
    'Pragma':        'no-cache',
  };
  if (token)     h['Authorization'] = `Bearer ${token}`;
  if (accountId) h['Account-Id']    = accountId;
  return h;
};

const fetchWithTimeout = (url, options, timeout = FETCH_TIMEOUT) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, _timedOut: true }), timeout);
    fetch(url, options)
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch(() => { clearTimeout(timer); resolve({ ok: false }); });
  });

// ── Auth ──────────────────────────────────────────────────────────────────────
/**
 * Log in to LibreLinkUp. Handles region redirect automatically.
 * Returns { token, userId, accountId, patientId, baseUrl, expiresAt } or null on failure.
 */
const authenticate = async (email, password) => {
  let baseUrl = LLU_BASE_DEFAULT;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchWithTimeout(
      `${baseUrl}/llu/auth/login`,
      {
        method:  'POST',
        headers: baseHeaders(),
        body:    JSON.stringify({ email, password }),
      },
      FETCH_TIMEOUT,
    );

    if (!res.ok) {
      console.warn('[LLU] Login HTTP error');
      return null;
    }

    let data;
    try { data = await res.json(); } catch { return null; }

    // Status 4 = ToS not accepted in LibreLink app
    if (data.status === 4) {
      console.warn('[LLU] ToS not accepted');
      return { error: 'tos' };
    }
    // Step challenges — email verification, privacy policy etc
    const stepType = data.data?.step?.type;
    if (stepType) {
      console.warn('[LLU] Step challenge:', stepType);
      return { error: 'tos' };
    }

    // Region redirect — Abbott returns this at top-level data OR data.data
    const redirectRegion = data.data?.region || data.region;
    const isRedirect     = data.data?.redirect || data.redirect;
    if (isRedirect && redirectRegion) {
      baseUrl = `https://api-${redirectRegion}.libreview.io`;
      console.log(`[LLU] Redirected to ${baseUrl}`);
      continue;
    }

    if (data.status !== 0 || !data.data?.authTicket?.token) {
      console.warn('[LLU] Login failed, status:', data.status);
      return null;
    }

    const token     = data.data.authTicket.token;
    const userId    = data.data.user?.id ?? '';
    const accountId = userId ? sha256(userId) : '';
    const expiresAt = (data.data.authTicket.expires ?? 0) * 1000;

    console.log('[LLU] Login OK');
    console.log('[LLU] userId:', userId ? userId.substring(0, 8) + '...' : 'EMPTY');
    console.log('[LLU] accountId:', accountId ? accountId.substring(0, 8) + '...' : 'EMPTY');
    console.log('[LLU] baseUrl:', baseUrl);
    console.log('[LLU] token present:', !!token);

    // Get patient (connection) ID
    const patientId = await getPatientId(baseUrl, token, accountId);
    if (!patientId) {
      console.warn('[LLU] Could not get patientId');
      return null;
    }

    return { token, userId, accountId, patientId, baseUrl, expiresAt };
  }
  return null;
};

/**
 * Fetch /llu/connections and return first patientId.
 */
const getPatientId = async (baseUrl, token, accountId) => {
  const res = await fetchWithTimeout(
    `${baseUrl}/llu/connections`,
    { method: 'GET', headers: baseHeaders(token, accountId) },
    FETCH_TIMEOUT,
  );
  console.log('[LLU] /connections HTTP status:', res.ok ? 'OK' : (res.status ?? 'failed'));
  if (!res.ok) return null;
  try {
    const data = await res.json();
    console.log('[LLU] /connections status field:', data.status);
    console.log('[LLU] /connections data length:', Array.isArray(data.data) ? data.data.length : typeof data.data);
    if (Array.isArray(data.data) && data.data.length > 0) {
      console.log('[LLU] first connection keys:', Object.keys(data.data[0]).join(', '));
    }
    const patientId = data.data?.[0]?.patientId ?? null;
    console.log('[LLU] patientId:', patientId ? patientId.substring(0, 8) + '...' : 'NULL');
    return patientId;
  } catch (e) {
    console.warn('[LLU] /connections parse error:', String(e));
    return null;
  }
};

/**
 * Fetch the latest glucose reading from /llu/connections/<patientId>/graph.
 * Also backfills SQLite from the graphData array (up to 12 hrs of history).
 * Returns parsed glucoData for the latest reading, or null / { error } on failure.
 */
const fetchReading = async (baseUrl, token, accountId, patientId) => {
  const res = await fetchWithTimeout(
    `${baseUrl}/llu/connections/${patientId}/graph`,
    { method: 'GET', headers: baseHeaders(token, accountId) },
    FETCH_TIMEOUT,
  );
  if (!res.ok) {
    // 401 signals token expiry — caller handles re-auth
    if (res.status === 401) return { error: 'auth' };
    return null;
  }
  try {
    const data = await res.json();

    // ── Backfill historical readings from graphData array ──────────────────
    // Abbott returns up to 12 hrs of 5-min interval readings.
    // INSERT OR IGNORE means duplicates are silently dropped — safe on every poll.
    const graphData = data.data?.graphData;
    if (Array.isArray(graphData) && graphData.length > 0) {
      for (const m of graphData) {
        const reading = parseLLU(m);
        if (reading) {
          await saveGlucoseReading(reading);
        }
      }
      console.log(`[LLU] backfilled ${graphData.length} graphData readings`);
    }

    // ── Latest reading from glucoseMeasurement ─────────────────────────────
    return parseLLU(data.data?.connection?.glucoseMeasurement);
  } catch { return null; }
};

// ── Parse Abbott response → internal glucoData shape ─────────────────────────
/**
 * Abbott glucoseMeasurement fields:
 *   ValueInMgPerDl  — number, mg/dL
 *   TrendArrow      — 1-5
 *   Timestamp       — "5/21/2022 3:38:50 PM" (local time string)
 *   FactoryTimestamp— same but factory/UTC
 *   isHigh / isLow  — booleans
 */
const parseLLU = (m) => {
  if (!m || typeof m.ValueInMgPerDl !== 'number') return null;

  const glucose = Math.round((m.ValueInMgPerDl / 18.0) * 10) / 10;
  if (glucose <= 0 || glucose > 35) return null;

  // Parse Abbott's MM/DD/YYYY HH:MM:SS AM/PM timestamp
  const timestamp = parseAbbottTimestamp(m.Timestamp) ?? Date.now();
  const trendRaw  = m.TrendArrow ?? 3;

  return {
    glucose,
    trend:     TREND_MAP[trendRaw]  ?? 4,
    direction: DIRECTION_MAP[trendRaw] ?? 'Flat',
    delta:     0,           // Abbott doesn't give delta directly
    timestamp,
    datetime:  new Date(timestamp).toISOString(),
  };
};

/**
 * Parse Abbott's "M/D/YYYY H:MM:SS AM/PM" → epoch ms.
 * Falls back to Date.parse for anything it can't handle.
 */
const parseAbbottTimestamp = (str) => {
  if (!str) return null;
  try {
    // e.g. "5/21/2022 3:38:50 PM" or "5/21/2022 15:38:50"
    const m = str.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i
    );
    if (!m) return Date.parse(str) || null;
    let [,mo,day,yr,hr,min,sec,ampm] = m;
    hr = parseInt(hr, 10);
    if (ampm) {
      const ap = ampm.toUpperCase();
      if (ap === 'AM' && hr === 12) hr = 0;
      if (ap === 'PM' && hr !== 12) hr += 12;
    }
    return new Date(
      parseInt(yr,10),
      parseInt(mo,10) - 1,
      parseInt(day,10),
      hr,
      parseInt(min,10),
      parseInt(sec,10),
    ).getTime();
  } catch { return null; }
};

// ── Hook ──────────────────────────────────────────────────────────────────────
/**
 * useLibreLinkUpService
 *
 * Drop-in replacement for useGDHService. Same return shape.
 * Reads credentials from SQLite on mount. If not present, stays offline
 * silently (LibreLinkUpOnboardingScreen handles initial setup).
 *
 * @param {{ onRecovery?: () => void }} options
 * @returns {{
 *   glucoData:    object|null,
 *   llupOnline:   boolean,
 *   llupOutage:   boolean,
 *   freshnessMs:  number,
 * }}
 */
export const useLibreLinkUpService = ({ onRecovery } = {}) => {
  const [glucoData,    setGlucoData]    = useState(null);
  const [llupOnline,   setLlupOnline]   = useState(true);
  const [llupOutage,   setLlupOutage]   = useState(false);
  const [freshnessMs,  setFreshnessMs]  = useState(0);
  const [backfillTick, setBackfillTick] = useState(0); // increments after each backfill

  const failCount      = useRef(0);
  const wasOutage      = useRef(false);
  const lastTimestamp  = useRef(null);
  const onRecoveryRef  = useRef(onRecovery);
  const sessionRef     = useRef(null); // { token, accountId, patientId, baseUrl, expiresAt }

  useEffect(() => { onRecoveryRef.current = onRecovery; }, [onRecovery]);

  // ── Ensure we have a valid session ─────────────────────────────────────────
  const ensureSession = useCallback(async () => {
    // Re-use cached session if token is still valid (with 5 min buffer)
    if (sessionRef.current) {
      const { expiresAt } = sessionRef.current;
      if (!expiresAt || expiresAt - Date.now() > 5 * 60 * 1000) {
        return sessionRef.current;
      }
    }

    // Try to reload from SQLite (persisted across app restarts)
    try {
      const profile = await getProfile();
      const token      = profile.llup_token;
      const expiresAt  = parseInt(profile.llup_token_expires ?? '0', 10);
      const patientId  = profile.llup_patient_id;
      const userId     = profile.llup_user_id ?? '';
      const baseUrl    = profile.llup_base_url ?? LLU_BASE_DEFAULT;
      const accountId  = userId ? sha256(userId) : '';

      if (token && patientId && expiresAt - Date.now() > 5 * 60 * 1000) {
        sessionRef.current = { token, accountId, patientId, baseUrl, expiresAt };
        return sessionRef.current;
      }

      // Token missing or expired — re-authenticate
      const email    = profile.llup_email;
      const password = profile.llup_password;
      if (!email || !password) return null; // credentials not set up yet

      const auth = await authenticate(email, password);
      if (!auth || auth.error) return null;

      // Persist refreshed session
      await setProfileField('llup_token',          auth.token);
      await setProfileField('llup_token_expires',  String(auth.expiresAt));
      await setProfileField('llup_patient_id',     auth.patientId);
      await setProfileField('llup_user_id',        auth.userId);
      await setProfileField('llup_base_url',       auth.baseUrl);

      sessionRef.current = auth;
      return auth;
    } catch (e) {
      console.warn('[LLU] ensureSession error', e);
      return null;
    }
  }, []);

  // ── Poll ───────────────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    // Session 26 RCA: schedulePollAlarm() was only called on specific success/
    // failure branches inside poll(). If ensureSession() returned null (no
    // credentials, token refresh failed, or any unexpected throw), the function
    // returned early and schedulePollAlarm() was never called — killing the
    // AlarmManager chain until the app was foregrounded again.
    //
    // Fix: wrap the entire poll body in try/finally so schedulePollAlarm()
    // fires unconditionally on every exit path, regardless of outcome.
    // The chain must never die — even if we have nothing to poll right now,
    // we need to wake up again in 5 minutes and try again.
    try {
    const session = await ensureSession();
    if (!session) {
      // No credentials configured yet — stay quiet, don't set outage
      return;
    }

    const result = await fetchReading(
      session.baseUrl,
      session.token,
      session.accountId,
      session.patientId,
    );

    // 401 → force re-auth on next poll
    if (result?.error === 'auth') {
      sessionRef.current = null;
      await setProfileField('llup_token_expires', '0');
      failCount.current += 1;
      // Still schedule next alarm — we want to retry re-auth
      GlucoModule.schedulePollAlarm();
    } else if (result) {
      // Success
      failCount.current = 0;
      const wasDown = wasOutage.current;
      wasOutage.current = false;

      setLlupOnline(true);
      setLlupOutage(false);

      // Session 26 RCA: setGlucoData now fires unconditionally on every successful
      // poll — same fix applied to backfillTick in S25.
      // Previously gated on new timestamp: if LLU returned a duplicate reading,
      // glucoData state didn't change, App.js notification effect didn't re-run,
      // and the status bar stayed stale. Unconditional means App.js always gets
      // a fresh object reference, so the notification effect always fires.
      // The timestamp guard is kept only to avoid moving lastTimestamp backwards.
      if (!lastTimestamp.current || result.timestamp > lastTimestamp.current) {
        lastTimestamp.current = result.timestamp;
      }
      setGlucoData(result);
      // Session 25 RCA: tick unconditionally on every successful poll — not just
      // when timestamp changes. LLU can return the same reading for several polls
      // (sensor only updates every ~5 min). If we only tick on new timestamps,
      // SplitScreen won't reload history after a resume if the first post-resume
      // poll returns a duplicate. History must reload regardless.
      setBackfillTick((n) => n + 1);

      if (wasDown && onRecoveryRef.current) onRecoveryRef.current();

      // Chain the next Doze-safe alarm
      GlucoModule.schedulePollAlarm();
    } else {
      // Network/parse failure — still schedule next attempt
      failCount.current += 1;
      GlucoModule.schedulePollAlarm();
    }

    if (failCount.current >= OUTAGE_AFTER) {
      setLlupOnline(false);
      if (!wasOutage.current) {
        wasOutage.current = true;
        setLlupOutage(true);
      }
    }
    } catch (e) {
      // Unexpected throw — log and ensure chain continues
      console.warn('[LLU] poll() unexpected error', e);
    } finally {
      // Guarantee the alarm chain never dies, regardless of outcome above.
      // The individual branches above also call schedulePollAlarm() on their
      // known paths — this finally is the safety net for anything unexpected.
      GlucoModule.schedulePollAlarm();
    }
  }, [ensureSession]);

  useEffect(() => {
    // ── Session 25: AlarmManager-driven poll cadence ───────────────────────
    // setInterval is NOT used for polling. Android Doze mode throttles JS
    // timers even with a foreground service running — readings go stale
    // overnight when the screen is off.
    //
    // Instead: JS calls GlucoModule.schedulePollAlarm() after each successful
    // poll. AlarmManager fires PollAlarmReceiver via setExactAndAllowWhileIdle
    // (Doze-safe). The receiver emits "TriggerPoll" → JS runs poll() → repeat.
    //
    // The AppState 'active' listener (below) handles foreground resume gaps.

    const emitter = new NativeEventEmitter(GlucoModule);
    const sub = emitter.addListener('TriggerPoll', () => {
      console.log('[LLU] TriggerPoll received from AlarmManager — polling');
      poll();
    });

    // Fire immediately on mount, then let the alarm chain take over.
    poll();

    return () => {
      sub.remove();
      GlucoModule.cancelPollAlarm();
    };
  }, [poll]);

  // ── Re-poll immediately on foreground resume ───────────────────────────────
  // Android can throttle/kill setInterval while the screen is off even with
  // a foreground service running. Firing poll() on AppState 'active' ensures
  // we get a fresh reading the moment the user picks up the phone, and
  // resets the interval cadence from that point.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        console.log('[LLU] App resumed — polling immediately');
        poll();
      }
    });
    return () => sub.remove();
  }, [poll]);

  // ── Freshness counter — independent 1 s tick ───────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      if (lastTimestamp.current) {
        setFreshnessMs(Date.now() - lastTimestamp.current);
      }
    }, FRESHNESS_TICK);
    return () => clearInterval(tick);
  }, []);

  return { glucoData, llupOnline, llupOutage, freshnessMs, backfillTick };
};
