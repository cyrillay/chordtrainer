// Chord progression library + roman-numeral parser + progression stream.
//
// A progression is a sequence of roman-numeral tokens like "ii V7 IΔ".
// We parse each token into (degree, accidental, case, suffix), apply it
// to a key, and produce a concrete chord via theory.buildChord().
//
// "Smart pivots" picks the next progression's key from a closely-related
// key (V, IV, relative minor/major, parallel) instead of a random key,
// which makes the modulation feel like a natural pivot.

import { NOTE_NAMES, noteToPitchClass, buildChord } from './theory.js';

// All progressions transcribed verbatim from the user's reference.
export const PROGRESSIONS = [
  // Basic triadic pop/rock progressions (major & minor triads only)
  { name: 'I–vi–IV–V (50s)',      tokens: ['I', 'vi', 'IV', 'V'] },
  { name: 'I–IV–vi–V',            tokens: ['I', 'IV', 'vi', 'V'] },
  { name: 'vi–IV–I–V',            tokens: ['vi', 'IV', 'I', 'V'] },
  { name: 'I–V–vi–IV (axis)',     tokens: ['I', 'V', 'vi', 'IV'] },
  { name: 'I–ii–V–I',             tokens: ['I', 'ii', 'V', 'I'] },
  { name: 'I–IV–V–IV',            tokens: ['I', 'IV', 'V', 'IV'] },
  { name: 'I–vi–ii–V',            tokens: ['I', 'vi', 'ii', 'V'] },
  { name: 'vi–V–IV–V',            tokens: ['vi', 'V', 'IV', 'V'] },
  { name: 'I–IV–I–V',             tokens: ['I', 'IV', 'I', 'V'] },
  { name: 'ii–V–I–vi',            tokens: ['ii', 'V', 'I', 'vi'] },
  { name: 'I–iii–vi–IV',          tokens: ['I', 'iii', 'vi', 'IV'] },
  { name: 'I–IV–ii–V',            tokens: ['I', 'IV', 'ii', 'V'] },
  { name: 'vi–IV–I–ii',           tokens: ['vi', 'IV', 'I', 'ii'] },
  { name: 'I–V–IV–V',             tokens: ['I', 'V', 'IV', 'V'] },

  // Long progressions
  { name: 'Amen',                 tokens: ['IVΔ', 'IΔ'] },
  { name: 'Autumnal',             tokens: ['ii', 'V7', 'viiø', 'III7', 'viΔ'] },
  { name: 'Body & Soul',          tokens: ['ii', 'VI7', 'ii', 'V7', 'IΔ', 'IΔ'] },
  { name: 'Dizzy',                tokens: ['bvi', 'bII7', 'IΔ', 'IΔ'] },
  { name: 'Dogleg',               tokens: ['vi', 'ii7', 'ii', 'V7', 'IΔ'] },
  { name: '7-chord Dropback',     tokens: ['ii', 'V7', 'IΔ', 'VI7', 'ii', 'V7', 'IΔ'] },
  { name: 'Extended',             tokens: ['vi', 'ii', 'V7', 'IΔ'] },
  { name: 'Happenstance',         tokens: ['#iv', 'VII7', 'IΔ', 'IΔ'] },
  { name: 'Long',                 tokens: ['iii', 'VI7', 'ii', 'V7', 'IΔ'] },
  { name: 'Overrun',              tokens: ['ii', 'V7', 'IΔ', 'IVΔ'] },
  { name: "Moment's",             tokens: ['#i', '#IV7', 'ii', 'V7', 'IΔ', 'IΔ'] },
  { name: 'Night & Day',          tokens: ['bVIΔ', 'V7', 'IΔ', 'IΔ'] },
  { name: "Nobody's",             tokens: ['IΔ', 'III7', 'viΔ'] },
  { name: 'Nowhere',              tokens: ['bVI7', 'V7', 'IΔ', 'IΔ'] },
  { name: '7-chord Pullback',     tokens: ['ii', 'V7', 'iii', 'VI7', 'ii', 'V7', 'IΔ'] },
  { name: 'Rainbow',              tokens: ['IΔ', 'III7', 'IVΔ', 'IVΔ'] },
  { name: 'Rainy',                tokens: ['iii', 'bIIIø', 'ii', 'V7', 'IΔ', 'IΔ'] },
  { name: 'Satin',                tokens: ['vi', 'ii7', 'bvi', 'bII7', 'IΔ', 'IΔ'] },
  { name: 'Spring',               tokens: ['VIIø', 'III7', 'ii', 'V7', 'IΔ', 'IΔ'] },
  { name: 'Stablemates',          tokens: ['biii', 'bVI7', 'ii', 'V7', 'IΔ', 'IΔ'] },
  { name: 'Starlight',            tokens: ['#IVø', 'VII7', 'iii', 'VI7', 'ii', 'V7', 'IΔ'] },
  { name: 'Starlight N&D Variant',tokens: ['#IVø', 'vi', 'biiio', 'VI7', 'ii', 'V7', 'IΔ'] },
  { name: 'Regular',              tokens: ['ii', 'V7', 'IΔ'] },
  { name: 'Regular (minor)',      tokens: ['iiø', 'V7+9', 'IΔ', 'IΔ'] },
  { name: 'Tension Ending',       tokens: ['ii', 'V7', 'I7', 'I7'] },
  { name: 'Tritone Substitution', tokens: ['ii', 'bII7', 'IΔ', 'IΔ'] },
  { name: 'Two-Goes',             tokens: ['ii', 'V7', 'ii', 'V7', 'IΔ'] },
  { name: 'Yardbird',             tokens: ['iv', 'bVII7', 'IΔ', 'IΔ'] },

  // Short / turnarounds
  { name: 'Foggy',                tokens: ['IΔ', 'bIII7', 'ii', 'V7'] },
  { name: "II 'n' Back",          tokens: ['ii', '#iio', 'iii'] },
  { name: 'Ladybird',             tokens: ['IΔ', 'bIII7', 'bVIΔ', 'bII7'] },
  { name: 'Nowhere (turnaround)', tokens: ['IΔ', 'VI7', 'bVI7', 'V7'] },
  { name: 'Pennies',              tokens: ['IΔ', 'ii', 'iii', 'bIIIø', 'ii', 'V7'] },
  { name: 'POT',                  tokens: ['IΔ', 'VI7', 'ii', 'V7'] },
  { name: 'POT (minor)',          tokens: ['iΔ', 'viø', 'iiø', 'V7+9'] },
  { name: 'Rhythm',               tokens: ['IΔ', 'bIIo', 'ii', 'bIIIo'] },
  { name: 'SPOT',                 tokens: ['iii', 'VI7', 'ii', 'V7'] },
  { name: "To IV 'n' Back",       tokens: ['IΔ', 'I7', 'IVΔ', '#IVo', 'IΔ'] },
  { name: "To IV 'n' Hack",       tokens: ['IΔ', 'I7', 'IVΔ', 'VII7', 'IΔ'] },
  { name: "To IV 'n' Mack",       tokens: ['IΔ', 'I7', 'IVΔ', 'ivΔ', 'IΔ'] },
  { name: "To IV 'n' Yak",        tokens: ['IΔ', 'I7', 'IVΔ', 'bVII7', 'IΔ'] },
  { name: 'Whoopee',              tokens: ['IΔ', 'bIIo', 'ii', 'V7'] },

  // Bridges / endings
  { name: 'Autumn Leaves Opening',tokens: ['ii', 'V7', 'IΔ', 'IVΔ', 'viiø', 'III7', 'viΔ', 'VI7'] },
  { name: 'Four-Star Ending',     tokens: ['IVΔ', '#iv', 'VII7', 'iii', 'VI7', 'ii', 'V7', 'IΔ', 'IΔ'] },
  { name: 'Honeysuckle Bridge',   tokens: ['v', 'I7', 'IVΔ', 'IVΔ', 'vi', 'II7', 'ii', 'V7'] },
  { name: 'ITCHY Opening',        tokens: ['IΔ', 'iii', 'VI7', 'ii', '#iv', 'VII7'] },
  { name: 'On-Off-On Dropback',   tokens: ['IΔ', 'III7', 'IΔ', 'VI7'] },
  { name: 'Pennies Ending',       tokens: ['IVΔ', '#ivo', 'IΔ', 'iii', 'VI7', 'ii', 'V7', 'IΔ', 'IΔ'] },
  { name: 'Rhythm Bridge',        tokens: ['vii', 'III7', 'iii', 'VI7', 'iv', 'II7', 'ii', 'V7'] },
  { name: 'Sharp Fourpenny Ending',tokens:['#ivø', 'iv', 'bVII7', 'IΔ', 'iii', 'VI7', 'ii', 'V7', 'IΔ', 'IΔ'] },
  { name: 'Sixpenny Ending',      tokens: ['vi', 'iv', 'bVII7', 'IΔ', 'iii', 'VI7', 'ii', 'V7', 'IΔ', 'IΔ'] },
  { name: "To IV 'n' Bird SPOT",  tokens: ['IΔ', 'I7', 'IVΔ', 'bVII7', 'iii', 'VI7', 'ii', 'V7'] },
  { name: 'Twopenny Ending',      tokens: ['ii', 'iv', 'bVII7', 'IΔ', 'iii', 'VI7', 'ii', 'V7', 'IΔ'] },

  // Dropbacks
  { name: 'Chromatic Dropback',   tokens: ['IΔ', 'VII7', 'bVII7', 'VI7', 'ii'] },
  { name: 'Dogleg (dropback)',    tokens: ['ii', 'V7', 'v', 'I7', 'i'] },
  { name: 'Dropback',             tokens: ['IΔ', 'VI7', 'ii'] },
  { name: 'Raindrop',             tokens: ['iii', 'bIIIo', 'ii'] },
  { name: 'Starlight Dropback',   tokens: ['#iv', 'VII7', 'iii', 'VI7', 'ii'] },
  { name: 'TINGLe Dropback',      tokens: ['IΔ', 'IV7', 'bVII7', 'VI7', 'ii'] },
  { name: 'TTFA Dropback',        tokens: ['IΔ', 'IV7', 'iii', 'VI7', 'ii'] }
];

// Major-scale degree intervals (semitones from tonic).
const SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

// Roman numerals ordered longest-first so prefix matching is greedy.
const ROMAN_TOKENS = [
  ['VII', 7, true],  ['vii', 7, false],
  ['III', 3, true],  ['iii', 3, false],
  ['VI',  6, true],  ['vi',  6, false],
  ['IV',  4, true],  ['iv',  4, false],
  ['II',  2, true],  ['ii',  2, false],
  ['V',   5, true],  ['v',   5, false],
  ['I',   1, true],  ['i',   1, false]
];

function parseRoman(token) {
  let i = 0;
  let accidental = 0;
  if (token[i] === 'b') { accidental = -1; i++; }
  else if (token[i] === '#') { accidental = 1; i++; }

  let degree = 0, isUpper = false, romanLen = 0;
  for (const [r, d, up] of ROMAN_TOKENS) {
    if (token.startsWith(r, i)) {
      degree = d; isUpper = up; romanLen = r.length;
      break;
    }
  }
  const suffix = token.substring(i + romanLen);
  return { accidental, degree, isUpper, suffix };
}

function suffixToQuality(suffix, isUpper) {
  // Order matters: check multi-char suffixes first.
  if (suffix === 'Δ')   return isUpper ? 'maj7' : 'mMaj7';
  if (suffix === 'ø')   return 'm7b5';
  if (suffix === 'o')   return 'dim';
  if (suffix === '7')   return isUpper ? 'dom7' : 'min7';
  if (suffix === '7+9' || suffix === '+9') return 'dom7';
  // Empty or unknown suffix → plain triad.
  return isUpper ? 'maj' : 'min';
}

// Quality produced by a token, independent of key — used to pre-filter
// progressions against the user's enabled chord-quality set.
export function tokenQuality(token) {
  const parsed = parseRoman(token);
  if (!parsed.degree) return null;
  return suffixToQuality(parsed.suffix, parsed.isUpper);
}

export function progressionQualities(prog) {
  const qs = new Set();
  for (const t of prog.tokens) {
    const q = tokenQuality(t);
    if (q) qs.add(q);
  }
  return qs;
}

export function getUsableProgressions(enabledQualities) {
  if (!enabledQualities || enabledQualities.length === 0) return [];
  const enabled = new Set(enabledQualities);
  return PROGRESSIONS.filter(prog => {
    for (const q of progressionQualities(prog)) {
      if (!enabled.has(q)) return false;
    }
    return true;
  });
}

export function romanToChord(token, keyRoot) {
  const { accidental, degree, isUpper, suffix } = parseRoman(token);
  if (!degree) return null;
  const keyPc = noteToPitchClass(keyRoot);
  const pc = (keyPc + SCALE_INTERVALS[degree - 1] + accidental + 12) % 12;
  const root = NOTE_NAMES[pc];
  const quality = suffixToQuality(suffix, isUpper);
  return buildChord(root, quality, 0); // root position keeps progressions clear
}

function pickRandomKey(allowedRoots) {
  const pool = (allowedRoots && allowedRoots.length > 0) ? allowedRoots : NOTE_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Smart-pivot key selection: pick a closely-related key via common modulations
// (V/IV by a 5th, relative major/minor by a third, parallel = same).
function pickRelatedKey(currentKey, allowedRoots) {
  const pool = (allowedRoots && allowedRoots.length > 0) ? allowedRoots : NOTE_NAMES;
  const currentPc = noteToPitchClass(currentKey);
  const candidatePcs = [
    currentPc,                     // parallel (same tonic, different mode)
    (currentPc + 7) % 12,          // up a 5th (V)
    (currentPc + 5) % 12,          // down a 5th (IV)
    (currentPc + 9) % 12,          // relative minor / down a minor third
    (currentPc + 3) % 12           // relative major / up a minor third
  ];
  const valid = candidatePcs
    .map(pc => NOTE_NAMES[pc])
    .filter(name => pool.includes(name));
  if (valid.length === 0) return pickRandomKey(allowedRoots);
  return valid[Math.floor(Math.random() * valid.length)];
}

// Stateful stream: pulls one chord at a time, advances progressions/keys as needed.
export class ProgressionStream {
  constructor() {
    this.smartPivots = false;
    this.allowedRoots = null;
    this.enabledQualities = null;
    this.usable = PROGRESSIONS;
    this.currentKey = pickRandomKey(null);
    this.currentProgression = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
    this.position = 0;
  }

  setSmartPivots(on) { this.smartPivots = on; }
  setAllowedRoots(roots) { this.allowedRoots = roots; }
  setEnabledQualities(qualities) {
    this.enabledQualities = qualities;
    this.usable = getUsableProgressions(qualities);
  }

  usableCount() { return this.usable.length; }

  advanceProgression() {
    this.position = 0;
    this.currentKey = this.smartPivots
      ? pickRelatedKey(this.currentKey, this.allowedRoots)
      : pickRandomKey(this.allowedRoots);
    // Fall back to full list if the filter left us empty — caller should have
    // prevented this, but we never want to crash mid-stream.
    const pool = this.usable.length > 0 ? this.usable : PROGRESSIONS;
    let next;
    let tries = 0;
    do {
      next = pool[Math.floor(Math.random() * pool.length)];
      tries++;
    } while (next === this.currentProgression && tries < 5);
    this.currentProgression = next;
  }

  next() {
    if (this.position >= this.currentProgression.tokens.length) {
      this.advanceProgression();
    }
    const token = this.currentProgression.tokens[this.position];
    const chord = romanToChord(token, this.currentKey);
    const meta = {
      progression: this.currentProgression.name,
      key: this.currentKey,
      token,
      position: this.position,
      total: this.currentProgression.tokens.length
    };
    this.position++;
    if (chord) chord.meta = meta;
    return chord;
  }
}
