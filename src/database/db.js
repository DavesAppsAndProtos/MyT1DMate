/**
 * My T1D Mate — Database Layer
 * SQLite via react-native-sqlite-storage
 *
 * Tables:
 *   mate_profile      — user profile fields (key-value store)
 *   exit_interview    — session notes
 *   glucose_readings  — CGM history (Session 7b, 90-day retention)
 *
 * glucose_readings schema:
 *   id          INTEGER PK AUTOINCREMENT
 *   timestamp   INTEGER  — epoch ms from LLU datetime field
 *   glucose     REAL     — mmol/L (converted from mg/dL by LibreLinkUpService)
 *   trend       INTEGER  — 1-7 (mapped from LLU 1-5 via TREND_MAP)
 *   direction   TEXT     — "Flat", "SingleUp" etc
 *   delta       REAL     — always 0.0 (Abbott doesn't expose delta)
 *   recorded_at TEXT     — ISO8601 wall clock when row was written
 *
 * Session 26 — poll chain forensic profile keys (written by LibreLinkUpService):
 *   last_poll_timestamp  — ISO string, written on every successful poll.
 *                          Read by the staleness watchdog on AppState 'active'.
 *   last_poll_error      — string (exception message + stack), or absent/null.
 *                          Written on every poll failure; cleared on success.
 *                          If null when watchdog fires → async/finally bug confirmed.
 *   last_poll_error_ts   — ISO string, timestamp of the last recorded error.
 *                          Written alongside last_poll_error; cleared on success.
 *
 * Retention: rows older than 90 days are pruned on every write.
 * No fabrication: if data is absent, queries return empty arrays.
 */

import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

let db = null;

export const getDB = async () => {
  if (db) return db;
  db = await SQLite.openDatabase({ name: 'T1DMate.db', location: 'default' });
  await initSchema(db);
  return db;
};

const initSchema = async (database) => {
  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS mate_profile (
      id INTEGER PRIMARY KEY,
      field TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS exit_interview (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT NOT NULL,
      author TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      priority TEXT DEFAULT 'normal'
    );
  `);

  // Session 7b: CGM history table
  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS glucose_readings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   INTEGER NOT NULL UNIQUE,
      glucose     REAL    NOT NULL,
      trend       INTEGER NOT NULL DEFAULT 4,
      direction   TEXT    NOT NULL DEFAULT 'Flat',
      delta       REAL    NOT NULL DEFAULT 0.0,
      recorded_at TEXT    NOT NULL
    );
  `);

  // Index for fast time-range queries
  await database.executeSql(`
    CREATE INDEX IF NOT EXISTS idx_glucose_timestamp
    ON glucose_readings (timestamp DESC);
  `);

  // Session 9: pins table (HTT — Hold That Thought)
  await database.executeSql(`
    CREATE TABLE IF NOT EXISTS pins (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      content    TEXT    NOT NULL,
      created_at TEXT    NOT NULL
    );
  `);
};

// ── Profile helpers ──────────────────────────────────────────────────────────

export const getProfile = async () => {
  const database = await getDB();
  const [results] = await database.executeSql(
    'SELECT field, value FROM mate_profile'
  );
  const profile = {};
  for (let i = 0; i < results.rows.length; i++) {
    const row = results.rows.item(i);
    profile[row.field] = row.value;
  }
  return profile;
};

export const setProfileField = async (field, value) => {
  const database = await getDB();
  const now = new Date().toISOString();
  await database.executeSql('DELETE FROM mate_profile WHERE field = ?', [field]);
  await database.executeSql(
    'INSERT INTO mate_profile (field, value, updated_at) VALUES (?, ?, ?)',
    [field, value, now]
  );
};

export const saveProfile = async (profileObj) => {
  for (const [field, value] of Object.entries(profileObj)) {
    await setProfileField(field, String(value));
  }
};

export const clearProfileFields = async (fieldsToKeep = []) => {
  const database = await getDB();
  if (fieldsToKeep.length === 0) {
    await database.executeSql('DELETE FROM mate_profile');
  } else {
    const placeholders = fieldsToKeep.map(() => '?').join(', ');
    await database.executeSql(
      `DELETE FROM mate_profile WHERE field NOT IN (${placeholders})`,
      fieldsToKeep,
    );
  }
};

export const isProfileEmpty = async () => {
  const database = await getDB();
  const [results] = await database.executeSql(
    'SELECT COUNT(*) as count FROM mate_profile'
  );
  return results.rows.item(0).count === 0;
};

// ── Exit interview helpers ───────────────────────────────────────────────────

export const writeExitNote = async ({ author, category, content, priority = 'normal' }) => {
  const database = await getDB();
  const sessionDate = new Date().toISOString();
  await database.executeSql(
    'INSERT INTO exit_interview (session_date, author, category, content, priority) VALUES (?, ?, ?, ?, ?)',
    [sessionDate, author, category, content, priority]
  );
};

// ── Glucose readings helpers ─────────────────────────────────────────────────

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Write a single glucose reading.
 * Uses INSERT OR IGNORE so duplicate timestamps are silently dropped.
 * Prunes readings older than 90 days on every write.
 * Never fabricates — only writes what GDH actually sends.
 *
 * @param {{ timestamp, glucose, trend, direction, delta }} reading
 */
export const saveGlucoseReading = async ({ timestamp, glucose, trend, direction, delta }) => {
  if (!timestamp || !glucose || glucose <= 0) return; // never write invalid data

  try {
    const database = await getDB();
    const now = new Date().toISOString();

    await database.executeSql(
      `INSERT OR IGNORE INTO glucose_readings
         (timestamp, glucose, trend, direction, delta, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [timestamp, glucose, trend ?? 4, direction ?? 'Flat', delta ?? 0.0, now]
    );

    // Prune old readings (90-day retention)
    const cutoff = Date.now() - NINETY_DAYS_MS;
    await database.executeSql(
      'DELETE FROM glucose_readings WHERE timestamp < ?',
      [cutoff]
    );
  } catch (e) {
    console.warn('[db] saveGlucoseReading failed:', e.message);
  }
};

/**
 * Get glucose readings for the last N hours.
 * Returns array of { timestamp, glucose, trend, direction, delta },
 * oldest first. Returns [] if no data — never fabricates.
 *
 * @param {number} hours — default 3
 * @returns {Promise<Array>}
 */
export const getGlucoseHistory = async (hours = 3) => {
  try {
    const database = await getDB();
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const [results] = await database.executeSql(
      `SELECT timestamp, glucose, trend, direction, delta
       FROM glucose_readings
       WHERE timestamp >= ?
       ORDER BY timestamp ASC`,
      [cutoff]
    );
    const readings = [];
    for (let i = 0; i < results.rows.length; i++) {
      readings.push(results.rows.item(i));
    }
    return readings;
  } catch (e) {
    console.warn('[db] getGlucoseHistory failed:', e.message);
    return []; // empty — never fabricate
  }
};

/**
 * Get glucose readings for a custom time range.
 * Used by Dave's historical view.
 *
 * @param {number} fromMs — epoch ms start
 * @param {number} toMs   — epoch ms end
 * @returns {Promise<Array>}
 */
export const getGlucoseRange = async (fromMs, toMs) => {
  try {
    const database = await getDB();
    const [results] = await database.executeSql(
      `SELECT timestamp, glucose, trend, direction, delta
       FROM glucose_readings
       WHERE timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
      [fromMs, toMs]
    );
    const readings = [];
    for (let i = 0; i < results.rows.length; i++) {
      readings.push(results.rows.item(i));
    }
    return readings;
  } catch (e) {
    console.warn('[db] getGlucoseRange failed:', e.message);
    return [];
  }
};
