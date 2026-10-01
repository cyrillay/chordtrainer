// Level path + task generation. Levels only decide the *pattern*
// (direction and starting tone); the chord pool comes from the player's
// settings, so the same path works for triads-in-C or every 7th in 12 keys.

import { NOTE_NAMES } from '../../js/core/theory.js';
import { buildTask, parseWeakKey } from './engine.js';

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

export const LEVELS = [
  { id: 1,  name: 'Ascent',          blurb: 'Ascending, from the root.',                  directions: ['up'],          starts: ['root'] },
  { id: 2,  name: 'Descent',         blurb: 'Descending, from the root.',                 directions: ['down'],        starts: ['root'] },
  { id: 3,  name: 'Tides',           blurb: 'Up, then down, then up again — alternating.', directions: ['up', 'down'], alternate: true, starts: ['root'] },
  { id: 4,  name: 'Second Floor',    blurb: 'Ascending, from the 3rd.',                   directions: ['up'],          starts: ['third'] },
  { id: 5,  name: 'Mezzanine',       blurb: 'Ascending, from the 5th.',                   directions: ['up'],          starts: ['fifth'] },
  { id: 6,  name: 'Rooftop',         blurb: 'Ascending, from the top tone (7th, or 5th on triads).', directions: ['up'], starts: ['top'] },
  { id: 7,  name: 'Rappel',          blurb: 'Descending, from the 3rd, 5th or top.',     directions: ['down'],        starts: ['third', 'fifth', 'top'] },
  { id: 8,  name: 'Kaleidoscope',    blurb: 'Any direction, any starting tone.',          directions: ['up', 'down'],  starts: ['root', 'third', 'fifth', 'top'] },
  { id: 9,  name: 'Against the Clock', blurb: 'Kaleidoscope, with a timer on every chord.', directions: ['up', 'down'], starts: ['root', 'third', 'fifth', 'top'], timed: true },
  { id: 10, name: 'Round Trip',      blurb: 'Up and straight back down, without stopping.', directions: ['updown'],    starts: ['root', 'third', 'fifth', 'top'], length: 8 },
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
