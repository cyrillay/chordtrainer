// Level path + task generation. Each level sets the pattern (direction and
// starting tone) *and* its chord pool: chord qualities widen and key
// signatures gain sharps/flats as the path goes on. Free practice uses the
// player's own pool from the settings instead.

import { NOTE_NAMES } from '../../js/core/theory.js';
import { buildTask, parseWeakKey } from './engine.js';

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

const MAJ_MIN = ['maj', 'min'];
const TRIADS = ['maj', 'min', 'dim', 'aug'];
const SEVENTHS = ['maj7', 'min7', 'dom7'];
const ALL_SEVENTHS = ['maj7', 'min7', 'dom7', 'm7b5'];
const EVERYTHING = ['maj', 'min', 'dim', 'aug', 'maj7', 'min7', 'dom7', 'm7b5'];
const ANY_START = ['root', 'third', 'fifth', 'top'];

// keys: highest number of sharps/flats in the key signature of the roots
// (see ROOTS_BY_ACCIDENTALS below; 6 = all twelve roots).
export const LEVELS = [
  { id: 1,  name: 'Ascent',       blurb: 'Ascending, from the root.',                 qualities: ['maj'],  keys: 1, directions: ['up'],   starts: ['root'] },
  { id: 2,  name: 'Descent',      blurb: 'Descending, from the root.',                qualities: ['maj'],  keys: 1, directions: ['down'], starts: ['root'] },
  { id: 3,  name: 'Light & Shade', blurb: 'Minor chords join in, up or down.',        qualities: MAJ_MIN,  keys: 1, directions: ['up', 'down'], starts: ['root'] },
  { id: 4,  name: 'Tides',        blurb: 'Up, then down, then up again — alternating.', qualities: MAJ_MIN, keys: 2, directions: ['up', 'down'], alternate: true, starts: ['root'] },
  { id: 5,  name: 'Second Floor', blurb: 'Ascending, from the 3rd.',                  qualities: MAJ_MIN,  keys: 2, directions: ['up'],   starts: ['third'] },
  { id: 6,  name: 'Mezzanine',    blurb: 'Ascending, from the 5th.',                  qualities: MAJ_MIN,  keys: 3, directions: ['up'],   starts: ['fifth'] },
  { id: 7,  name: 'Rappel',       blurb: 'Descending, from the 3rd or the 5th.',      qualities: MAJ_MIN,  keys: 3, directions: ['down'], starts: ['third', 'fifth'] },
  { id: 8,  name: 'Twilight',     blurb: 'Diminished and augmented triads.',          qualities: TRIADS,   keys: 3, directions: ['up', 'down'], starts: ['root'] },
  { id: 9,  name: 'Every Key',    blurb: 'All twelve roots, any triad tone.',         qualities: MAJ_MIN,  keys: 6, directions: ['up', 'down'], starts: ['root', 'third', 'fifth'] },
  { id: 10, name: 'Sevenths',     blurb: 'Four-note chords: maj7, m7 and 7.',         qualities: SEVENTHS, keys: 2, directions: ['up', 'down'], starts: ['root'] },
  { id: 11, name: 'Rooftop',      blurb: 'Ascending, from the 7th. Half-diminished too.', qualities: ALL_SEVENTHS, keys: 3, directions: ['up'], starts: ['top'] },
  { id: 12, name: 'Freefall',     blurb: 'Descending sevenths, from the 3rd, 5th or 7th.', qualities: ALL_SEVENTHS, keys: 4, directions: ['down'], starts: ['third', 'fifth', 'top'] },
  { id: 13, name: 'Kaleidoscope', blurb: 'Any chord, any direction, any starting tone.', qualities: EVERYTHING, keys: 5, directions: ['up', 'down'], starts: ANY_START },
  { id: 14, name: 'Against the Clock', blurb: 'Kaleidoscope in every key, with a timer.', qualities: EVERYTHING, keys: 6, directions: ['up', 'down'], starts: ANY_START, timed: true },
  { id: 15, name: 'Round Trip',   blurb: 'Up and straight back down, without stopping.', qualities: EVERYTHING, keys: 6, directions: ['updown'], starts: ANY_START, length: 8 },
];

export const LEVEL_LENGTH = 12;

export function levelById(id) {
  return LEVELS.find(l => l.id === id) || null;
}

export function levelLength(level) {
  return level.length || LEVEL_LENGTH;
}

// Time allowed per arpeggio on timed levels: a reaction allowance plus a
// per-note budget.
export function timeLimitMs(task) {
  return 2500 + task.steps.length * 900;
}

// ---- Chord pool ----

// A level's own chord pool.
export function levelPool(level) {
  return { roots: rootsUpTo(level.keys), qualities: level.qualities.slice() };
}

export function poolFrom(settings) {
  const roots = settings.roots.filter(r => NOTE_NAMES.includes(r));
  const qualities = settings.qualities.slice();
  return { roots, qualities };
}

function pickChord(pool, prev, rng) {
  let root, quality, tries = 0;
  do {
    root = pick(pool.roots, rng);
    quality = pick(pool.qualities, rng);
    tries++;
  } while (prev && prev.root === root && prev.quality === quality && tries < 8);
  return { root, quality };
}

// Pattern for task #k of a level/free session.
function pickPattern(spec, k, prev, rng) {
  const direction = spec.alternate
    ? spec.directions[k % spec.directions.length]
    : pick(spec.directions, rng);
  const start = pick(spec.starts, rng);
  return { direction, start };
}

// spec: a level, or a free-practice spec { directions, starts }.
export function makeTask(spec, pool, k, prev, rng = Math.random) {
  const { root, quality } = pickChord(pool, prev, rng);
  const { direction, start } = pickPattern(spec, k, prev, rng);
  return buildTask({ root, quality, direction, start });
}

// ---- Weak spots ----
// Stats per weakKey: { tries, clean, mistakes, ms }. A pattern's weakness
// blends its miss rate (smoothed so one fluke doesn't dominate) with how slow
// it is relative to a comfortable tempo.

export function weaknessScore(s) {
  if (!s || !s.tries) return 0;
  const missRate = (s.tries - s.clean + 0.5) / (s.tries + 2);
  const mistakesPer = s.mistakes / s.tries;
  const avgMs = s.ms / s.tries;
  const slowness = Math.max(0, Math.min(1, (avgMs - 1500) / 4000));
  return missRate * 0.6 + Math.min(1, mistakesPer / 3) * 0.3 + slowness * 0.1;
}

export function weakList(stats, limit = 10) {
  return Object.entries(stats)
    .filter(([, s]) => s.tries > 0 && (s.tries - s.clean) > 0)
    .map(([key, s]) => ({ key, ...parseWeakKey(key), stats: s, score: weaknessScore(s) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Weighted pick among the weakest patterns, never the same one twice in a row.
export function makeWeakTask(weak, prev, rng = Math.random) {
  if (!weak.length) return null;
  const options = weak.length > 1 && prev ? weak.filter(w => w.key !== prev.key) : weak;
  const total = options.reduce((s, w) => s + w.score + 0.05, 0);
  let r = rng() * total;
  let chosen = options[0];
  for (const w of options) {
    r -= w.score + 0.05;
    if (r <= 0) { chosen = w; break; }
  }
  return buildTask(chosen);
}

export function recordWeak(stats, result) {
  const key = result.task.key;
  const s = stats[key] ||= { tries: 0, clean: 0, mistakes: 0, ms: 0 };
  s.tries++;
  if (result.clean) s.clean++;
  s.mistakes += result.mistakes;
  s.ms += Math.min(result.durationMs || 0, 20000);
  // Recovery: a run of clean takes gradually forgives old misses so a
  // conquered pattern drops out of the list.
  if (result.clean && s.tries > 6) {
    s.tries = Math.max(s.clean, s.tries - 1);
    s.mistakes = Math.max(0, s.mistakes - 1);
  }
  return s;
}

// ---- Key-signature root presets ----
// Roots grouped by how many accidentals their major key signature has.
export const ROOTS_BY_ACCIDENTALS = [
  ['C'],
  ['G', 'F'],
  ['D', 'A#'],
  ['A', 'D#'],
  ['E', 'G#'],
  ['B', 'C#'],
  ['F#'],
];

export function rootsUpTo(n) {
  return ROOTS_BY_ACCIDENTALS.slice(0, n + 1).flat();
}
