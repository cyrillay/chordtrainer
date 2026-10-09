// Everything the site remembers lives in the browser's localStorage, under
// one prefix per app. This module is the only door to it: safe reads and
// writes (private mode, quota, bad JSON never throw), the registry of every
// key, and the backup file that saves a whole practice history to disk and
// brings it back.
//
// Pure apart from localStorage, so it runs under `node --test` with a stub.

// Every key the site writes, by app. Each app reads its keys from here, and
// the Statistics page and the backup use the same list.
export const KEYS = {
  site: {
    THEME: 'etude.theme',
    STATS: 'etude.stats',
  },
  chords: {
    SENSITIVITY: 'chordTrainer.sensitivity',
    INSTRUMENT: 'chordTrainer.instrument',
    REWARDS: 'chordTrainer.rewards',
    REWARDS_ENABLED: 'chordTrainer.rewardsEnabled',
    DISABLED_PROGS: 'chordTrainer.disabledProgressions',
    CUSTOM_PROGS: 'chordTrainer.customProgressions',
    ONBOARDED: 'chordTrainer.onboarded',
    INVERSION_FREQ: 'chordTrainer.inversionFrequency',
    ACHIEVEMENTS: 'chordTrainer.achievements',
    DAILY_GOAL: 'chordTrainer.dailyGoal',
    SHEET_MUSIC: 'chordTrainer.sheetMusic',
  },
  sightreading: {
    PROGRESS: 'readTrainer.progress',
    ACHIEVEMENTS: 'readTrainer.achievements',
  },
  arpeggio: {
    SETTINGS: 'arpeggioTrainer.settings',
    PROGRESS: 'arpeggioTrainer.progress',
    WEAK: 'arpeggioTrainer.weak',
    ACHIEVEMENTS: 'arpeggioTrainer.achievements',
  },
  repertoire: {
    MARKINGS: 'scoretrainer.markings',
    RECENT: 'scoretrainer.recent',
    CONFIG: 'scoretrainer.config',
  },
  jam: {
    SETTINGS: 'ghostJam.settings',
    SCORES: 'ghostJam.scores',
    GUESTS: 'ghostJam.guestsMet',
    FAVOURITES: 'ghostJam.favourites',
    ACHIEVEMENTS: 'ghostJam.achievements',
  },
  audio: {
    // Audio sync offsets measured by Ghost Jam's tap test, per output.
    SYNC: 'etude.audioSync',
  },
  midi: {
    // Set once the browser has granted MIDI, so the next visit can
    // reconnect without a click. Shared by every app.
    GRANTED: 'etude.midiGranted',
  },
};

// Every prefix the site owns. Anything else in localStorage (another site on
// the same origin in development, browser extensions) is left alone.
export const PREFIXES = ['etude.', 'chordTrainer.', 'readTrainer.', 'arpeggioTrainer.', 'scoretrainer.', 'ghostJam.'];
export const isOurs = (key) => PREFIXES.some((p) => key.startsWith(p));

const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };

// Raw strings, for the few keys that are not JSON ('1', 'piano', 'urtext').
export function readRaw(key, fallback = null) {
  try { const v = ls()?.getItem(key); return v ?? fallback; } catch { return fallback; }
}
export function writeRaw(key, value) {
  try { ls()?.setItem(key, String(value)); return true; } catch { return false; }
}
export function remove(key) {
  try { ls()?.removeItem(key); } catch { /* ignore */ }
}

// JSON values. A missing key, null, or broken JSON all give the fallback.
export function read(key, fallback) {
  try {
    const raw = ls()?.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch { return fallback; }
}
export function write(key, value) {
  try { ls()?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// ---- Backup ----
// A backup is one JSON file: { format, v, exported, data: { key: rawString } }.
// Values stay the raw strings localStorage holds, so a restore is exact,
// whatever each app stores under its key. Scores loaded in Repertoire are in
// IndexedDB and stay out of it (they can weigh megabytes); their markings
// and the recent list are in.

export const BACKUP_FORMAT = 'etude-backup';
export const BACKUP_VERSION = 1;

export function ourKeys() {
  const store = ls();
  if (!store) return [];
  const keys = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && isOurs(k)) keys.push(k);
    }
  } catch { /* ignore */ }
  return keys.sort();
}

export function exportBackup(now = new Date()) {
  const data = {};
  for (const k of ourKeys()) {
    const v = readRaw(k);
    if (v != null) data[k] = v;
  }
  return { format: BACKUP_FORMAT, v: BACKUP_VERSION, exported: now.toISOString(), data };
}

export const backupFileName = (now = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `etude-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
};

// Older backup versions are upgraded here, one step at a time, before a
// restore. Version 1 is the first, so there is nothing to do yet.
const MIGRATIONS = {
  // 1: (backup) => ({ ...backup, v: 2, data: { ... } }),
};

// Checks a parsed backup file. Returns { ok, backup } or { ok: false, error }
// with an error a person can act on.
export function parseBackup(json) {
  let b = json;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { return { ok: false, error: 'This file is not a backup. It is not valid JSON.' }; }
  }
  if (!b || b.format !== BACKUP_FORMAT || typeof b.data !== 'object' || b.data === null) {
    return { ok: false, error: 'This file is not an Étude backup.' };
  }
  if (!Number.isInteger(b.v) || b.v < 1) return { ok: false, error: 'This backup has no version number.' };
  if (b.v > BACKUP_VERSION) return { ok: false, error: 'This backup comes from a newer version of the site. Reload the page and try again.' };
  while (b.v < BACKUP_VERSION) b = MIGRATIONS[b.v](b);
  const data = {};
  for (const [k, v] of Object.entries(b.data)) {
    if (isOurs(k) && typeof v === 'string') data[k] = v;
  }
  return { ok: true, backup: { ...b, data } };
}

// Replaces everything the site remembers with the backup: our keys that the
// backup does not have are removed, so the result is exactly the backup.
export function restoreBackup(backup) {
  const keep = new Set(Object.keys(backup.data));
  for (const k of ourKeys()) if (!keep.has(k)) remove(k);
  let written = 0;
  for (const [k, v] of Object.entries(backup.data)) if (writeRaw(k, v)) written++;
  return written;
}

// A short description of what a backup holds, for the confirmation step.
export function describeBackup(backup) {
  const apps = [];
  for (const [app, keys] of Object.entries(KEYS)) {
    if (Object.values(keys).some((k) => k in backup.data)) apps.push(app);
  }
  return { keys: Object.keys(backup.data).length, apps, exported: backup.exported };
}
