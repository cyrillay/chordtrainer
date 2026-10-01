// Ghost Jam: the six grooves. Each style turns one bar of one chord into
// note events for the drums, the bass and the keys. Pure data and functions,
// no audio: band.js plays whatever these return.
//
// A bar is split into `steps` (16 sixteenths, or 12 triplet eighths for the
// swing feel). Drum patterns are strings, one character per step:
// 'x' hit, 'o' soft hit, '.' rest. Patterns can differ per band energy
// (0 thin, 1 normal, 2 busy, 3 everything).

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
    sounds: { bass: 'upright', keys: 'epiano' },
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
    sounds: { bass: 'round', keys: 'nylon' },
    drums: {
      kick:  ['x.......x.......', 'x..xx..xx..xx..x', 'x..xx..xx..xx..x', 'x..xx..xx..xx..x'],
      rim:   ['x..x..x...x..x..', 'x..x..x...x..x..', 'x..x..x...x..x..', 'x..x..x...x..x..'],
      hat:   ['................', 'o.o.o.o.o.o.o.o.', 'oooooooooooooooo', 'oxooxooxoxooxooo'],
    },
  },
  lofi: {
    name: 'Lo-fi', blurb: 'Lazy boom bap, dusty keys, vinyl crackle.',
    steps: 16, shuffle: 0.22, tempo: { min: 65, max: 95, def: 80 },
    sounds: { bass: 'sub', keys: 'dusty' }, crackle: true,
    drums: {
      kick:  ['x.........x.....', 'x.........x.....', 'x......x..x.....', 'x......x.xx...x.'],
      snare: ['....x.......x...', '....x.......x...', '....x.......x..o', '....x..o....x.o.'],
      hat:   ['x...x...x...x...', 'x.x.x.x.x.x.x.x.', 'x.xox.x.x.xox.x.', 'xoxoxoxoxoxoxoxo'],
    },
  },
  ballad: {
    name: 'Ballad', blurb: 'Brushes, long bass notes, a warm pad.',
    steps: 16, shuffle: 0, tempo: { min: 50, max: 80, def: 66 },
    sounds: { bass: 'round', keys: 'pad' },
    drums: {
      brush: ['x...x...x...x...', 'x...x...x...x...', 'x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.x.x.'],
      rim:   ['................', '....x.......x...', '....x.......x...', '....x.......x...'],
      kick:  ['................', 'x...............', 'x.......x.......', 'x.......x.....o.'],
    },
  },
  funk: {
    name: 'Funk', blurb: 'Sixteenth hats, ghost notes, slap bass, clav.',
    steps: 16, shuffle: 0.06, tempo: { min: 85, max: 120, def: 102 },
    sounds: { bass: 'slap', keys: 'clav' },
    drums: {
      kick:  ['x.........x.....', 'x.....x...x..x..', 'x.x...x...x..x..', 'x.x...x..xx..x..'],
      snare: ['....x.......x...', '....x.......x...', '....x..o.o..x..o', '.o..x..o.o..x.oo'],
      hat:   ['x.x.x.x.x.x.x.x.', 'xoxoxoxoxoxoxoxo', 'xoxoxoxoxoxoxoxo', 'xoxoxoxoxoxoxoxx'],
    },
  },
  reggae: {
    name: 'Reggae', blurb: 'One drop, skank on the offbeats, deep bass.',
    steps: 16, shuffle: 0.12, tempo: { min: 66, max: 90, def: 76 },
    sounds: { bass: 'sub', keys: 'organ' },
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

// Everything one bar needs. energy 0..3; keys sit out at energy 0, a bell
// line joins at 3.
export function barEvents(styleId, { chord, next, energy = 1, rng = Math.random }) {
  const style = STYLES[styleId];
  const e = Math.max(0, Math.min(3, energy));
  const drums = [];
  for (const [voice, levels] of Object.entries(style.drums)) {
    const pattern = levels[e];
    for (let s = 0; s < pattern.length; s++) {
      const ch = pattern[s];
      if (ch === 'x') drums.push({ step: s, voice, vel: 1 });
      else if (ch === 'o') drums.push({ step: s, voice, vel: 0.45 });
    }
  }
  const bass = BASS[styleId](chord, next || chord, rng);
  const voicing = keysVoicing(chord);
  const keys = e === 0 ? [] : KEYS[styleId](rng).map(([step, dur]) => ({ step, dur, notes: voicing }));
  const lead = [];
  if (e === 3) {
    const tones = voicing.map((m) => m + 12);
    for (let s = 0; s < style.steps; s += style.steps / 8) {
      if (rng() < 0.55) lead.push({ step: s, midi: pick(tones, rng), dur: style.steps / 8 });
    }
  }
  return { steps: style.steps, drums, bass, keys, lead };
}

// Four stick clicks before the band comes in.
export function countIn(styleId) {
  const steps = STYLES[styleId].steps;
  const beat = steps / 4;
  return [0, 1, 2, 3].map((b) => ({ step: b * beat, voice: 'sticks', vel: b === 0 ? 1 : 0.7 }));
}
