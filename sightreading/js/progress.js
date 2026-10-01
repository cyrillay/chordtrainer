// Persistent progress: stars per level, lifetime counters for achievements
// and per-note error stats (fed back into the generator to drill weak notes).
// Everything lives in localStorage — no account.

import { LEVELS } from './levels.js';

const KEY = 'readTrainer.progress';

const fresh = () => ({
  levels: {},        // id → { stars, bestWait, bestTempo, plays }
  notes: {},         // midi → { seen, errors }
  counters: {},      // lifetime counters (exercises, notes, cleanRuns…)
  excerpts: {},      // excerpt id → best stars
  settings: {},      // mode, readAhead, tempo per level
});

let data = fresh();

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = { ...fresh(), ...JSON.parse(raw) };
  } catch { data = fresh(); }
  return data;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ }
}

export function resetProgress() {
  data = fresh();
  save();
}

export const progress = () => data;

export function levelStars(id) { return data.levels[id]?.stars || 0; }

export function totalStars() {
  return LEVELS.reduce((s, l) => s + levelStars(l.id), 0);
}

export function isUnlocked(index) {
  if (index <= 0) return true;
  return levelStars(LEVELS[index - 1].id) >= 1;
}

export function getSetting(name, fallback) {
  return data.settings[name] ?? fallback;
}

export function setSetting(name, value) {
  data.settings[name] = value;
  save();
}

export function bump(name, by = 1) {
  data.counters[name] = (data.counters[name] || 0) + by;
}

export function counter(name) { return data.counters[name] || 0; }

// Records a finished run. Returns { stars, prevStars, unlockedNext }.
export function recordRun(levelId, result, { excerptId } = {}) {
  const lv = data.levels[levelId] ||= { stars: 0, bestWait: 0, bestTempo: 0, plays: 0 };
  const prevStars = lv.stars;
  lv.plays++;
  lv.stars = Math.max(lv.stars, result.stars);
  if (result.mode === 'wait') lv.bestWait = Math.max(lv.bestWait, result.accuracy);
  else lv.bestTempo = Math.max(lv.bestTempo, result.accuracy);
  if (excerptId) data.excerpts[excerptId] = Math.max(data.excerpts[excerptId] || 0, result.stars);

  for (const [midi, n] of Object.entries(result.seen)) {
    const s = data.notes[midi] ||= { seen: 0, errors: 0 };
    s.seen += n;
  }
  for (const [midi, n] of Object.entries(result.errorsByMidi)) {
    const s = data.notes[midi] ||= { seen: 0, errors: 0 };
    s.errors += n;
  }

  bump('exercises');
  bump('notes', result.correct);
  if (result.mode === 'tempo') bump('tempoRuns');
  if (result.wrong === 0 && result.correct === result.total) bump('cleanRuns');

  const idx = LEVELS.findIndex((l) => l.id === levelId);
  const unlockedNext = prevStars === 0 && lv.stars > 0 && idx < LEVELS.length - 1;
  save();
  return { stars: lv.stars, prevStars, unlockedNext };
}

// midi → 0..1, how much more often than average this note goes wrong.
export function focusMap() {
  const out = {};
  for (const [midi, s] of Object.entries(data.notes)) {
    if (s.seen + s.errors < 4) continue;
    const rate = s.errors / (s.seen + s.errors);
    if (rate > 0.08) out[midi] = Math.min(1, rate * 3);
  }
  return out;
}

export function weakestNotes(limit = 3) {
  return Object.entries(data.notes)
    .filter(([, s]) => s.errors >= 2)
    .map(([midi, s]) => ({ midi: Number(midi), rate: s.errors / (s.seen + s.errors) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, limit);
}
