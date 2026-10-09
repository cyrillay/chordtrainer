// Achievements: pun-driven badges that unlock as you play. The rules live
// here; the store, toasts and case come from js/ux/achievementKit.js.
//
// Visibility tiers:
//   visible — shown greyed with progress bar while locked
//   secret  — shown as "???" while locked; name/desc revealed on unlock
//   ultra   — a locked riddle until unlocked
//
// Metric formats (used by simple counter-style achievements):
//   'quality.<q>'  — counter, +1 each successful chord of quality q
//   'preset.<p>'   — counter, +1 each successful chord while preset p active
//   'time.expert'  — seconds of "active" expert practice (success-pumped)
//   'rootSet.<q>'  — set cardinality of distinct roots played for quality q
//   'event.<id>'   — boolean (1 once a window-style condition triggers)
//
// Window-style achievements declare a `window: { preset, count, ms }` and the
// engine flips their `event.<id>` counter to 1 once `count` successes within
// `preset` (or any preset, when `preset === 'any'`) land in `ms` milliseconds.

import { state } from '../core/state.js';
import { onSuccess } from './feedback.js';
import { LS } from '../core/constants.js';
import { createAchievements } from './achievementKit.js';

export const ACH = [
  // ---- Beginner journey ----
  { id: 'firstTimer5', vis: 'visible', icon: '\u{1F476}', name: 'Hello, World',          desc: 'Validate 5 chords in First Timer',         target: 5,  metric: 'preset.firstTimer' },
  { id: 'beginner10',  vis: 'visible', icon: '\u{1F6B6}', name: 'Walking Bass',          desc: 'Validate 10 chords in Beginner',           target: 10, metric: 'preset.beginner' },

  // ---- Intermediate ----
  { id: 'inter15',     vis: 'visible', icon: '\u{1F3B9}', name: 'Mezzo Piano',           desc: 'Validate 15 chords in Intermediate',       target: 15, metric: 'preset.intermediate' },
  { id: 'inter30',     vis: 'visible', icon: '\u{1F3B9}', name: 'Mezzo Forte',           desc: 'Validate 30 chords in Intermediate',       target: 30, metric: 'preset.intermediate' },

  // ---- Advanced ----
  { id: 'adv20',       vis: 'visible', icon: '\u{1F3BC}', name: 'Off-Book',              desc: 'Validate 20 chords in Advanced',           target: 20, metric: 'preset.advanced' },
  { id: 'adv40',       vis: 'visible', icon: '\u{1F3BC}', name: 'Magna Cum Laude',       desc: 'Validate 40 chords in Advanced',           target: 40, metric: 'preset.advanced' },

  // ---- Expert (cumulative) ----
  { id: 'expert5',     vis: 'visible', icon: '\u{1F9EA}', name: 'Welcome to the Lab',    desc: 'Validate 5 chords in Expert',              target: 5,  metric: 'preset.expert' },
  { id: 'expert15c',   vis: 'visible', icon: '\u{1F9EA}', name: 'Knee Deep',             desc: 'Validate 15 chords in Expert',             target: 15, metric: 'preset.expert' },
  { id: 'expert30',    vis: 'visible', icon: '\u{1F9EA}', name: 'Hand of Liszt',         desc: 'Validate 30 chords in Expert',             target: 30, metric: 'preset.expert' },

  // ---- Triad volume ----
  { id: 'major50',     vis: 'visible', icon: '\u{1F3BC}', name: 'Major League',          desc: '50 major chords played',                   target: 50, metric: 'quality.maj' },
  { id: 'minor50',     vis: 'visible', icon: '\u{1F305}', name: 'Minor Threat',          desc: '50 minor chords played',                   target: 50, metric: 'quality.min' },

  // ---- Sevenths intro ----
  { id: 'dom7_5',      vis: 'visible', icon: '\u{1F3B7}', name: 'Blues Brother',         desc: '5 dominant 7th chords',                    target: 5,  metric: 'quality.dom7' },
  { id: 'maj7_5',      vis: 'visible', icon: '\u{1F378}', name: 'Smooth Operator',       desc: '5 major 7th chords',                       target: 5,  metric: 'quality.maj7' },
  { id: 'min7_5',      vis: 'visible', icon: '\u{2615}',  name: 'Caf\u00e9 au Lait',     desc: '5 minor 7th chords',                       target: 5,  metric: 'quality.min7' },

  // ---- Half-diminished progression ----
  { id: 'm7b5_1',      vis: 'visible', icon: '\u{1F940}', name: 'Half Empty',            desc: 'First half-diminished chord',              target: 1,  metric: 'quality.m7b5' },
  { id: 'm7b5_5',      vis: 'visible', icon: '\u{1F940}', name: 'Tristan Was Right',     desc: '5 half-diminished chords',                 target: 5,  metric: 'quality.m7b5' },
  { id: 'm7b5_10',     vis: 'visible', icon: '\u{1F940}', name: 'ii\u2013V\u2013Cry',    desc: '10 half-diminished chords',                target: 10, metric: 'quality.m7b5' },
  { id: 'm7b5_20',     vis: 'visible', icon: '\u{1F940}', name: 'Diminishing Returns',   desc: '20 half-diminished chords',                target: 20, metric: 'quality.m7b5' },
  { id: 'm7b5_50',     vis: 'visible', icon: '\u{1F940}', name: 'The Half Truth',        desc: '50 half-diminished chords',                target: 50, metric: 'quality.m7b5' },

  // ---- Augmented progression ----
  { id: 'aug_1',       vis: 'visible', icon: '\u{1F4C8}', name: 'Going Up?',             desc: 'First augmented chord',                    target: 1,  metric: 'quality.aug' },
  { id: 'aug_5',       vis: 'visible', icon: '\u{1F4C8}', name: 'Augmented Reality',     desc: '5 augmented chords',                       target: 5,  metric: 'quality.aug' },
  { id: 'aug_10',      vis: 'visible', icon: '\u{1F4C8}', name: 'Whole-Tone Mood',       desc: '10 augmented chords',                      target: 10, metric: 'quality.aug' },
  { id: 'aug_20',      vis: 'visible', icon: '\u{1F4C8}', name: 'Liszt Move',            desc: '20 augmented chords',                      target: 20, metric: 'quality.aug' },
  { id: 'aug_50',      vis: 'visible', icon: '\u{1F4C8}', name: 'Debussy on Speed Dial', desc: '50 augmented chords',                      target: 50, metric: 'quality.aug' },

  // ---- Minor major 7 (the Bond chord) ----
  { id: 'mMaj7_1',     vis: 'visible', icon: '\u{1F574}', name: 'Bond. Chord, Bond.',    desc: 'First minor-major 7th',                    target: 1,  metric: 'quality.mMaj7' },
  { id: 'mMaj7_5',     vis: 'visible', icon: '\u{1F574}', name: 'Shaken, Not Stirred',   desc: '5 minor-major 7th',                        target: 5,  metric: 'quality.mMaj7' },
  { id: 'mMaj7_10',    vis: 'visible', icon: '\u{1F574}', name: 'Licensed to Trill',     desc: '10 minor-major 7th',                       target: 10, metric: 'quality.mMaj7' },
  { id: 'mMaj7_20',    vis: 'visible', icon: '\u{1F574}', name: 'The Spy Who Voiced Me', desc: '20 minor-major 7th',                       target: 20, metric: 'quality.mMaj7' },
  { id: 'mMaj7_50',    vis: 'visible', icon: '\u{1F574}', name: 'Goldfinger Position',   desc: '50 minor-major 7th',                       target: 50, metric: 'quality.mMaj7' },

  // ---- Secret — shown as ??? while locked, with a playful hint ----
  { id: 'expert15min', vis: 'secret',  icon: '\u{1F9D8}', name: 'Iron Pianist',          desc: '15 minutes of active practice in Expert',  hint: 'Pull up a chair. The hardest sessions run the longest.', target: 15 * 60, metric: 'time.expert', unit: 'sec' },
  { id: 'speed4',      vis: 'secret',  icon: '\u{26A1}',  name: 'Allegro Furioso',       desc: '4 chords validated within 10 seconds',     hint: 'Quick fingers. Quick wins.',                            target: 1,  metric: 'event.speed4',     window: { preset: 'any',          count: 4,  ms: 10 * 1000 } },
  { id: 'rushInter',   vis: 'secret',  icon: '\u{1F4A8}', name: 'Caffeine Spike',        desc: '8 chords within 30 s in Intermediate',     hint: 'A thirty-second espresso, served at the midpoint.',     target: 1,  metric: 'event.rushInter',  window: { preset: 'intermediate', count: 8,  ms: 30 * 1000 } },
  { id: 'rushAdv',     vis: 'secret',  icon: '\u{2615}',  name: 'Espresso Shot',         desc: '25 chords within 2 minutes in Advanced',   hint: 'Strong, dense, gone in two minutes.',             target: 1,  metric: 'event.rushAdv',    window: { preset: 'advanced',     count: 25, ms: 2 * 60 * 1000 } },
  { id: 'midiConnect', vis: 'secret',  icon: '\u{1F50C}', name: 'Plug & Play',           desc: 'Successfully connect a MIDI device',       hint: 'A keyboard speaks. The computer understands.',               target: 1,  metric: 'action.midiConnect' },

  // ---- Exploration / non-performance actions ----
  { id: 'expertOpen',    vis: 'visible', icon: '\u{1F3AF}', name: 'Bold Move',            desc: 'Open the Expert preset for the first time', target: 1,  metric: 'action.expertOpen' },
  { id: 'noFingerings',  vis: 'visible', icon: '\u{1F441}', name: 'By Ear',               desc: 'Turn off fingerings and trust your hands',  target: 1,  metric: 'action.fingeringsOff' },
  { id: 'themeChange1',  vis: 'visible', icon: '\u{1F3AD}', name: 'Costume Drama',        desc: 'Change the visual theme for the first time', target: 1,  metric: 'action.themeChange' },
  { id: 'themeChange10', vis: 'visible', icon: '\u{1F58C}',  name: 'Style Council',        desc: 'Change theme 10 times', target: 10, metric: 'action.themeChange' },

  // ---- Metronome ----
  { id: 'metroStart1',   vis: 'visible', icon: '\u{23F1}',  name: 'Tick Tock',            desc: 'Start the metronome for the first time',    target: 1,  metric: 'action.metroStart' },
  { id: 'metroSucc20',   vis: 'visible', icon: '\u{1F941}', name: 'In the Pocket',        desc: 'Validate 20 chords with the metronome on',  target: 20, metric: 'metro.success' },
  { id: 'metroSucc60',   vis: 'visible', icon: '\u{1F941}', name: 'Locked In',            desc: 'Validate 60 chords with the metronome on',  target: 60, metric: 'metro.success' },

  // ---- Streaks ----
  { id: 'streak50',      vis: 'visible', icon: '\u{1F3AF}', name: "Maestro's Run",        desc: 'Reach a 50-chord streak',                   target: 50,  metric: 'streak.best' },
  { id: 'streak100',     vis: 'secret',  icon: '\u{1F4AF}', name: 'Centurion',            desc: 'Reach a 100-chord streak',                  hint: 'A hundred clean takes. No flinches.',                   target: 100, metric: 'streak.best' },

  // ---- Ultra — placeholder tile shows only a cryptic riddle ----
  { id: 'allRootsMmaj7', vis: 'ultra', icon: '\u{1F31A}', name: 'Lunar Alignment',       desc: 'Play mMaj7 on all 12 roots',               hint: 'Twelve gates. One agent.',                              target: 12, metric: 'rootSet.mMaj7' },
  { id: 'expert100',     vis: 'ultra', icon: '\u{1F393}', name: 'Tenured at Juilliard',  desc: 'Validate 100 chords in Expert',            hint: 'In the deepest pool, count to a hundred.',              target: 100, metric: 'preset.expert' },
  { id: 'horowitz',      vis: 'ultra', icon: '\u{1F3A9}', name: 'The Horowitz',          desc: '150 chords within 10 minutes in Expert',   hint: 'Sprint the marathon \u2014 in the deep end.',           target: 1,  metric: 'event.horowitz',   window: { preset: 'expert',       count: 150, ms: 10 * 60 * 1000 } },
];

// ---- Per-preset window cap (largest window any achievement needs) ----
// We keep just enough timestamps in memory to evaluate every window-style
// achievement; older entries get pruned on each tick.

const MAX_WINDOW_MS = (() => {
  const m = { any: 0 };
  for (const a of ACH) {
    if (!a.window) continue;
    const k = a.window.preset;
    if (!(k in m) || m[k] < a.window.ms) m[k] = a.window.ms;
  }
  return m;
})();

// ---- Storage ----

const EXPERT_ACTIVE_GAP_MS = 30000; // count time only between successes ≤30s apart
const TIMES_HARD_CAP = 1000;        // safety cap on stored timestamps per series

const DEFAULT_STORE = () => ({
  unlocked: {},       // id -> timestamp
  counters: {},       // metric -> number
  rootSets: {},       // quality -> array of root strings
  windowTimes: {},    // preset key (or 'any') -> array of recent success ms
  lastSuccessAt: 0,
});

// ---- Metric reads ----

function metricValue(metric, store) {
  if (metric.startsWith('rootSet.')) {
    const q = metric.slice('rootSet.'.length);
    return (store.rootSets?.[q] || []).length;
  }
  return store.counters[metric] || 0;
}

export const SECTIONS = [
  { vis: 'visible', label: 'Common',     blurb: 'Earned through steady practice.' },
  { vis: 'secret',  label: 'Rare',       blurb: 'Trigger conditions are hidden. Some things you stumble on.' },
  { vis: 'ultra',   label: 'Ultra-rare', blurb: 'Reserved for those who go truly far. Even their existence is a clue.' },
];

export { metricValue as chordsMetricValue };

const kit = createAchievements({
  list: ACH,
  key: LS.ACHIEVEMENTS,
  sections: SECTIONS,
  fresh: DEFAULT_STORE,
  metricValue,
  ids: { modal: 'achModalOverlay', close: 'achModalClose' },
  resetLabel: 'Reset all achievements',
});

// The kit's store, with the fields older saves may lack.
function ensureStore() {
  const s = kit.store;
  s.rootSets    ||= {};
  s.windowTimes ||= {};
  return s;
}

// ---- Counter / set helpers ----

function bump(metric, delta = 1) {
  const s = ensureStore();
  s.counters[metric] = (s.counters[metric] || 0) + delta;
}

function addRoot(quality, root) {
  const arr = ensureStore().rootSets[quality] ||= [];
  if (!arr.includes(root)) arr.push(root);
}

function activePresetName() {
  const btn = document.querySelector('.preset-btn.active');
  return btn ? btn.dataset.preset : null;
}

// ---- Window-density evaluator ----
// Returns true if the most-recent `count` entries in `series` all sit within
// the last `ms` milliseconds, anchored at `now`.

function seriesHasDensity(series, count, ms, now) {
  if (series.length < count) return false;
  const idx = series.length - count;
  return now - series[idx] <= ms;
}

function pruneWindows(now) {
  const store = ensureStore();
  for (const key of Object.keys(store.windowTimes)) {
    const max = MAX_WINDOW_MS[key] ?? 0;
    const arr = store.windowTimes[key];
    while (arr.length && now - arr[0] > max) arr.shift();
    while (arr.length > TIMES_HARD_CAP) arr.shift();
  }
}

// ---- Success handler ----

function handleSuccess() {
  const chord = state.currentChord;
  if (!chord) return;
  const store = ensureStore();
  const now = Date.now();

  // Per-quality counter + per-quality root-set
  bump(`quality.${chord.quality}`);
  addRoot(chord.quality, chord.root);

  // Per-preset counter (only counted if the user is on a named preset)
  const preset = activePresetName();
  if (preset) bump(`preset.${preset}`);

  // Metronome-active successes (separate counter so a player who only ever
  // plays freeform doesn't get random metronome unlocks).
  if (state.dynamic?.running) bump('metro.success');

  // Expert active time — accumulate the gap between consecutive successes,
  // but only if it was a "live" gap (≤30s). Naturally pauses on idle.
  if (preset === 'expert' && store.lastSuccessAt) {
    const gap = now - store.lastSuccessAt;
    if (gap > 0 && gap <= EXPERT_ACTIVE_GAP_MS) {
      bump('time.expert', Math.round(gap / 1000));
    }
  }
  store.lastSuccessAt = now;

  // Window timestamps: always log into 'any', and into the active preset's
  // own series when the window cap mentions it.
  (store.windowTimes.any ||= []).push(now);
  if (preset && preset in MAX_WINDOW_MS) {
    (store.windowTimes[preset] ||= []).push(now);
  }
  pruneWindows(now);

  // Evaluate every window-style achievement and flip its event counter.
  for (const a of ACH) {
    if (!a.window) continue;
    if (store.unlocked[a.id]) continue;
    const series = store.windowTimes[a.window.preset] || [];
    if (seriesHasDensity(series, a.window.count, a.window.ms, now)) {
      store.counters[a.metric] = 1;
    }
  }

  kit.commit();
}

// ---- Public API for non-success events ----

// Generic "the user did X" hook for things like changing theme, opening Expert,
// or starting the metronome. Increments a counter and re-checks unlocks.
export function recordAction(actionId) {
  if (!actionId) return;
  bump(`action.${actionId}`);
  kit.commit();
}

// Streak high-water mark, fed by rewards.js so streak achievements unlock
// without each module duplicating the streak counter.
export function recordStreak(value) {
  kit.setMax('streak.best', value);
}

// ---- Init ----

export function initAchievements() {
  const mystery = document.getElementById('achMystery');
  if (mystery) mystery.style.display = 'none';
  kit.init();

  // Allow non-module callers (e.g. the inline theme switcher in index.html)
  // to record an action without needing an import.
  document.addEventListener('etude:action', e => {
    const id = e?.detail?.id;
    if (id) recordAction(id);
  });

  onSuccess(handleSuccess);
}
