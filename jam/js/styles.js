// Ghost Jam: the six grooves. Each style turns one bar of one chord into
// note events for the drums, the bass and the keys. Pure data and functions,
// no audio: band.js plays whatever these return.
//
// A bar is split into `steps` (16 sixteenths, or 12 triplet eighths for the
// swing feel). Drum patterns are strings, one character per step:
// 'x' hit, 'o' soft hit, '.' rest. Patterns can differ per band energy
// (0 thin, 1 normal, 2 busy, 3 everything).
//
// anchor: where in the bar you play each chord, in beats from the downbeat.
// Reggae is 0.5: the skank sits on the off-beat, not on the one.
// accent: the drums that answer a chord you nail.

import { noteToPitchClass, CHORD_FORMULAS } from '../../js/core/theory.js';

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// ---- Pitch helpers ----

const BASS_LOW = 28;  // E1
const KEYS_LOW = 53;  // F3

function chordPcs(chord) {
  const root = noteToPitchClass(chord.root);
  return CHORD_FORMULAS[chord.quality].intervals.map((i) => (root + i) % 12);
}

// Root of the chord in the bass register (E1 to D#2).
export function bassRoot(chord) {
  const pc = noteToPitchClass(chord.root);
  return BASS_LOW + ((pc - (BASS_LOW % 12) + 12) % 12);
}

// The chord tone `interval` semitones above the root, in the bass register.
function bassTone(chord, interval) {
  return bassRoot(chord) + interval;
}

// The fifth just below the root when it fits in the register, else above.
function lowFifth(chord) {
  const m = bassTone(chord, fifthOf(chord));
  return m - 12 >= BASS_LOW ? m - 12 : m;
}

function fifthOf(chord) {
  const iv = CHORD_FORMULAS[chord.quality].intervals;
  return iv.find((i) => i >= 6 && i <= 8) ?? 7;
}
function thirdOf(chord) {
  return CHORD_FORMULAS[chord.quality].intervals[1];
}
function seventhOf(chord) {
  const iv = CHORD_FORMULAS[chord.quality].intervals;
  return iv.length > 3 ? iv[3] : 12;
}

// Close-position voicing between F3 and E4. Rootless when the chord has a
// 7th (the bass has the root), which is how a band keyboard player comps.
export function keysVoicing(chord) {
  let pcs = chordPcs(chord);
  if (pcs.length === 4) pcs = pcs.slice(1);
  return pcs.map((pc) => KEYS_LOW + ((pc - (KEYS_LOW % 12) + 12) % 12)).sort((a, b) => a - b);
}

// ---- Styles ----
// tempo: { min, max, def } in BPM. shuffle: delay of every second sixteenth,
// as a fraction of a step (0 = straight). sounds: which synth patches play.

export const STYLES = {
  swing: {
    name: 'Swing', blurb: 'Walking bass, ride cymbal, comping on the and.',
    steps: 12, shuffle: 0, tempo: { min: 90, max: 200, def: 132 },
    sounds: { bass: 'upright', keys: 'epiano' }, anchor: 0, accent: ['kick', 'snare'],
    drums: {
      ride:  ['x..x.xx..x.x', 'x..x.xx..x.x', 'x..x.xx..x.x', 'x..x.xx..x.x'],
      hat:   ['...x.....x..', '...x.....x..', '...x.....x..', '...x.....x..'],
      kick:  ['............', 'o.....o.....', 'o..o..o..o..', 'o..o..o..o.o'],
      snare: ['............', '............', '.....o.....o', '..o..o..o..o'],
    },
  },
  bossa: {
    name: 'Bossa', blurb: 'Surdo kick, clave on the rim, nylon guitar.',
    steps: 16, shuffle: 0, tempo: { min: 100, max: 160, def: 128 },
    sounds: { bass: 'round', keys: 'nylon' }, anchor: 0, accent: ['kick', 'rim'],
    drums: {
      kick:  ['x.......x.......', 'x..xx..xx..xx..x', 'x..xx..xx..xx..x', 'x..xx..xx..xx..x'],
      rim:   ['x..x..x...x..x..', 'x..x..x...x..x..', 'x..x..x...x..x..', 'x..x..x...x..x..'],
      hat:   ['................', 'o.o.o.o.o.o.o.o.', 'oooooooooooooooo', 'oxooxooxoxooxooo'],
    },
  },
  lofi: {
    name: 'Lo-fi', blurb: 'Lazy boom bap, dusty keys, vinyl crackle.',
    steps: 16, shuffle: 0.22, tempo: { min: 65, max: 95, def: 80 },
    sounds: { bass: 'sub', keys: 'dusty' }, crackle: true, anchor: 0, accent: ['kick', 'snare'],
    drums: {
      kick:  ['x.........x.....', 'x.........x.....', 'x......x..x.....', 'x......x.xx...x.'],
      snare: ['....x.......x...', '....x.......x...', '....x.......x..o', '....x..o....x.o.'],
      hat:   ['x...x...x...x...', 'x.x.x.x.x.x.x.x.', 'x.xox.x.x.xox.x.', 'xoxoxoxoxoxoxoxo'],
    },
  },
  ballad: {
    name: 'Ballad', blurb: 'Brushes, long bass notes, a warm pad.',
    steps: 16, shuffle: 0, tempo: { min: 50, max: 80, def: 66 },
    sounds: { bass: 'round', keys: 'pad' }, anchor: 0, accent: ['kick', 'brush'],
    drums: {
      brush: ['x...x...x...x...', 'x...x...x...x...', 'x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.x.x.'],
      rim:   ['................', '....x.......x...', '....x.......x...', '....x.......x...'],
      kick:  ['................', 'x...............', 'x.......x.......', 'x.......x.....o.'],
    },
  },
  funk: {
    name: 'Funk', blurb: 'Sixteenth hats, ghost notes, slap bass, clav.',
    steps: 16, shuffle: 0.06, tempo: { min: 85, max: 120, def: 102 },
    sounds: { bass: 'slap', keys: 'clav' }, anchor: 0, accent: ['kick', 'snare'],
    drums: {
      kick:  ['x.........x.....', 'x.....x...x..x..', 'x.x...x...x..x..', 'x.x...x..xx..x..'],
      snare: ['....x.......x...', '....x.......x...', '....x..o.o..x..o', '.o..x..o.o..x.oo'],
      hat:   ['x.x.x.x.x.x.x.x.', 'xoxoxoxoxoxoxoxo', 'xoxoxoxoxoxoxoxo', 'xoxoxoxoxoxoxoxx'],
    },
  },
  reggae: {
    name: 'Reggae', blurb: 'One drop, skank on the offbeats, deep bass.',
    steps: 16, shuffle: 0.12, tempo: { min: 66, max: 90, def: 76 },
    sounds: { bass: 'sub', keys: 'organ' }, anchor: 0.5, accent: ['kick', 'rim'],
    drums: {
      kick:  ['........x.......', '........x.......', '........x.......', '........x.......'],
      rim:   ['........x.......', '........x.......', '........x.......', '....o...x.....o.'],
      hat:   ['..x...x...x...x.', 'x.x.x.x.x.x.x.x.', 'x.xxx.x.x.xxx.x.', 'xoxxxoxoxoxxxoxo'],
    },
  },
};

export const STYLE_ORDER = ['swing', 'bossa', 'lofi', 'ballad', 'funk', 'reggae'];

// ---- Bass lines ----
// Each returns [{ step, midi, dur }] for one bar. `next` is the chord after
// this bar (the same chord when it lasts several bars).

function walkingBass(chord, next, rng) {
  const root = bassRoot(chord);
  const second = root + pick([thirdOf(chord), fifthOf(chord)], rng);
  const third = root + pick([fifthOf(chord), seventhOf(chord) === 12 ? 12 : seventhOf(chord), thirdOf(chord)], rng);
  // Beat four leans into the next root from a semitone above or below.
  const target = bassRoot(next);
  const approach = [target - 1, target + 1, target + 13, target + 11]
    .sort((a, b) => Math.abs(a - third) - Math.abs(b - third))[0];
  return [
    { step: 0, midi: root, dur: 3 },
    { step: 3, midi: second, dur: 3 },
    { step: 6, midi: third, dur: 3 },
    { step: 9, midi: approach, dur: 3 },
  ];
}

const BASS = {
  swing: (c, n, rng) => walkingBass(c, n, rng),
  bossa: (c) => [
    { step: 0, midi: bassRoot(c), dur: 6 },
    { step: 6, midi: lowFifth(c), dur: 2 },
    { step: 8, midi: lowFifth(c), dur: 6 },
    { step: 14, midi: bassRoot(c), dur: 2 },
  ],
  lofi: (c, n, rng) => [
    { step: 0, midi: bassRoot(c), dur: 7 },
    { step: 10, midi: bassRoot(c), dur: 3 },
    { step: 14, midi: pick([lowFifth(c), bassRoot(n) - 1 + (rng() < 0.5 ? 0 : 2)], rng), dur: 2 },
  ],
  ballad: (c) => [
    { step: 0, midi: bassRoot(c), dur: 8 },
    { step: 8, midi: lowFifth(c), dur: 8 },
  ],
  funk: (c, n, rng) => [
    { step: 0, midi: bassRoot(c), dur: 2 },
    { step: 3, midi: bassRoot(c) + 12, dur: 1 },
    { step: 6, midi: bassRoot(c), dur: 1 },
    { step: 7, midi: bassRoot(c), dur: 1 },
    { step: 10, midi: bassTone(c, pick([seventhOf(c) === 12 ? 10 : seventhOf(c), fifthOf(c)], rng)), dur: 1 },
    { step: 11, midi: bassRoot(c) + 12, dur: 1 },
    { step: 14, midi: bassTone(c, fifthOf(c)), dur: 1 },
  ],
  reggae: (c) => [
    { step: 2, midi: bassRoot(c), dur: 2 },
    { step: 4, midi: bassRoot(c), dur: 2 },
    { step: 6, midi: lowFifth(c), dur: 3 },
    { step: 10, midi: bassTone(c, thirdOf(c)), dur: 2 },
    { step: 12, midi: bassRoot(c), dur: 3 },
  ],
};

// ---- Keys rhythms: [step, dur] pairs per bar ----

const KEYS = {
  swing:  (rng) => pick([[[0, 4], [5, 1]], [[2, 1], [5, 3]], [[0, 2], [8, 1], [11, 1]], [[5, 1], [8, 3]]], rng),
  bossa:  () => [[0, 2], [3, 2], [6, 2], [10, 2], [12, 2]],
  lofi:   () => [[0, 14]],
  ballad: () => [[0, 16]],
  funk:   (rng) => pick([[[2, 1], [7, 1], [10, 1], [15, 1]], [[3, 1], [6, 1], [11, 1], [14, 1]]], rng),
  reggae: () => [[2, 1], [6, 1], [10, 1], [14, 1]],
};

// ---- Band tiers ----
// Drums, bass and keys, then one guest who depends on the groove. Landed
// chords light the ghosts up one by one (see HEAT in judge.js): the keys,
// then the guest, with the band heating up on the way. Tier 1 is where a
// set starts.

export const TIERS = [
  { part: null, name: 'Drums and bass' },
  { part: 'keys', name: 'Keys', plural: true },
  { part: null, heat: true, name: 'The band' },
  { part: 'guest', name: 'Guest' },
];
export const MAX_ENERGY = TIERS.length - 1;

// Who plays at a tier.
export function partsAt(energy) {
  const e = Math.max(0, Math.min(MAX_ENERGY, energy));
  return new Set(['drums', 'bass', ...TIERS.slice(1, e + 1).map((t) => t.part).filter(Boolean)]);
}

// ---- Guests: one per groove, with a part written for it ----
// kind 'line' plays one note at a time in `range`, 'chord' plays the
// chord. Each groove has a few one-bar rhythms ([step, dur]) to pick from.

export const GUESTS = {
  swing: {
    name: 'Sax', patch: 'sax', kind: 'line', range: [58, 74],
    rhythms: [
      [[0, 2], [2, 1], [3, 2], [5, 1], [6, 5]],
      [[2, 1], [3, 2], [5, 1], [6, 3], [9, 2], [11, 1]],
      [[0, 6], [8, 1], [9, 3]],
    ],
  },
  bossa: {
    name: 'Trumpet', patch: 'trumpet', kind: 'line', range: [62, 76],
    rhythms: [
      [[0, 6], [6, 2], [8, 8]],
      [[2, 4], [6, 2], [10, 6]],
      [[0, 3], [3, 3], [6, 10]],
    ],
  },
  lofi: {
    name: 'Vibes', patch: 'vibes', kind: 'line', range: [67, 82],
    rhythms: [
      [[0, 4], [6, 2], [10, 6]],
      [[4, 4], [10, 2], [12, 4]],
      [[0, 8]],
    ],
  },
  ballad: {
    name: 'Strings', patch: 'strings', kind: 'chord', octave: 12,
    rhythms: [[[0, 16]]],
  },
  funk: {
    name: 'Horns', patch: 'horns', kind: 'chord', octave: 12,
    rhythms: [
      [[0, 1], [3, 1], [10, 1], [14, 2]],
      [[6, 1], [7, 1], [10, 2]],
      [[0, 2], [11, 1], [14, 1]],
    ],
  },
  reggae: {
    name: 'Melodica', patch: 'melodica', kind: 'line', range: [67, 81],
    rhythms: [
      [[2, 2], [6, 2], [10, 4]],
      [[0, 6], [8, 2], [10, 2], [14, 2]],
      [[2, 1], [3, 1], [6, 6], [14, 2]],
    ],
  },
};

// Every chord tone between lo and hi, low to high.
function tonesIn(chord, [lo, hi]) {
  const pcs = new Set(chordPcs(chord));
  const out = [];
  for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) out.push(m);
  return out;
}

// The 3rd or 7th nearest to `near`: the notes that spell the chord.
function guideTone(chord, range, near) {
  const root = noteToPitchClass(chord.root);
  const guides = new Set([(root + thirdOf(chord)) % 12, (root + seventhOf(chord)) % 12]);
  const pool = tonesIn(chord, range).filter((m) => guides.has(m % 12));
  return pool.sort((a, b) => Math.abs(a - near) - Math.abs(b - near))[0];
}

// One bar of the guest's part.
export function guestEvents(styleId, { chord, next, rng = Math.random }) {
  const g = GUESTS[styleId];
  const rhythm = pick(g.rhythms, rng);
  if (g.kind === 'chord') {
    const notes = [bassRoot(chord) + 24, ...keysVoicing(chord)].map((m) => m + g.octave);
    return rhythm.map(([step, dur]) => ({ step, dur, notes }));
  }
  // A line: start on a guide tone mid-range, wander by small steps through
  // the chord tones, and lead into the next chord when the bar ends on it.
  const pool = tonesIn(chord, g.range);
  const mid = (g.range[0] + g.range[1]) / 2;
  let note = guideTone(chord, g.range, mid);
  const steps = STYLES[styleId].steps;
  return rhythm.map(([step, dur], i) => {
    if (i > 0) {
      const last = i === rhythm.length - 1;
      if (last && next && next !== chord && step + dur >= steps) {
        note = guideTone(next, g.range, note);
      } else {
        const at = pool.indexOf(note);
        const move = pick([-2, -1, 1, 1, 2], rng) * (note > mid + 4 ? -1 : 1);
        note = pool[Math.max(0, Math.min(pool.length - 1, at + move))];
      }
    }
    return { step, dur, notes: [note] };
  });
}

// Drum pattern level (0..3 in STYLES) for each tier.
const DRUM_LEVEL = [0, 1, 2, 3];

// Everything one bar needs. energy 0..MAX_ENERGY, see TIERS.
export function barEvents(styleId, { chord, next, energy = 1, rng = Math.random }) {
  const style = STYLES[styleId];
  const e = Math.max(0, Math.min(MAX_ENERGY, energy));
  const parts = partsAt(e);
  const drums = [];
  for (const [voice, levels] of Object.entries(style.drums)) {
    pushHits(drums, levels[DRUM_LEVEL[e]], voice);
  }
  const bass = BASS[styleId](chord, next || chord, rng);
  const voicing = keysVoicing(chord);
  const keys = parts.has('keys') ? KEYS[styleId](rng).map(([step, dur]) => ({ step, dur, notes: voicing })) : [];
  const guest = parts.has('guest') ? guestEvents(styleId, { chord, next, rng }) : [];
  return { steps: style.steps, drums, bass, keys, guest };
}

function pushHits(out, pattern, voice) {
  for (let s = 0; s < pattern.length; s++) {
    const ch = pattern[s];
    if (ch === 'x') out.push({ step: s, voice, vel: 1 });
    else if (ch === 'o') out.push({ step: s, voice, vel: 0.45 });
  }
}

// Four stick clicks before the band comes in.
export function countIn(styleId) {
  const steps = STYLES[styleId].steps;
  const beat = steps / 4;
  return [0, 1, 2, 3].map((b) => ({ step: b * beat, voice: 'sticks', vel: b === 0 ? 1 : 0.7 }));
}
