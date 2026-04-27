// Music theory: notes, chord formulas, conversions.
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const NOTE_DISPLAY = {
  'C': 'C', 'C#': 'C♯', 'D': 'D', 'D#': 'E♭', 'E': 'E', 'F': 'F',
  'F#': 'F♯', 'G': 'G', 'G#': 'A♭', 'A': 'A', 'A#': 'B♭', 'B': 'B'
};

export const CHORD_FORMULAS = {
  'maj':  { intervals: [0, 4, 7],     suffix: '',      name: 'Major' },
  'min':  { intervals: [0, 3, 7],     suffix: 'm',     name: 'Minor' },
  'dim':  { intervals: [0, 3, 6],     suffix: '°',     name: 'Diminished' },
  'aug':  { intervals: [0, 4, 8],     suffix: '+',     name: 'Augmented' },
  'maj7': { intervals: [0, 4, 7, 11], suffix: 'M7',    name: 'Major 7th' },
  'min7': { intervals: [0, 3, 7, 10], suffix: 'm7',    name: 'Minor 7th' },
  'dom7': { intervals: [0, 4, 7, 10], suffix: '7',     name: 'Dominant 7th' },
  'm7b5': { intervals: [0, 3, 6, 10], suffix: 'ø',     name: 'Half-diminished' },
  'mMaj7':{ intervals: [0, 3, 7, 11], suffix: 'mM7',   name: 'Minor major 7th' }
};

export function noteToPitchClass(name) {
  return NOTE_NAMES.indexOf(name);
}

export function pitchClassToDisplay(pc) {
  return NOTE_DISPLAY[NOTE_NAMES[pc]];
}

// Interval-aware chord-tone spelling: each chord-tone's letter comes from its
// position in the formula (root + n diatonic steps), and the accidental is
// derived from the pc difference vs. that letter's natural pc. Guarantees,
// e.g. C♯m/G♯ (not C♯m/A♭) and G minor → G, B♭, D (not G, A♯, D).
const LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PCS = [0, 2, 4, 5, 7, 9, 11];
// Diatonic-letter offset from the root for each chromatic interval our chord
// formulas use. m3/M3 → +2, d5/P5/#5 all → +4 (the 5th is always on the 5th
// letter, even when augmented), m7/M7 → +6, etc.
const INTERVAL_LETTERS = [0, 1, 1, 2, 2, 3, 4, 4, 4, 5, 6, 6];
const ACC_CHARS = { '-2': '\u{1D12B}', '-1': '\u266D', '0': '', '1': '\u266F', '2': '\u{1D12A}' };

// Returns one entry per orderedNotes position, with both the letter/octave
// info needed by sheet-music rendering and a `display` string (e.g. 'B♭')
// used by chord-name and chip rendering.
export function spellChordTones(chord) {
  const formula = CHORD_FORMULAS[chord.quality];
  const intervals = formula.intervals;
  const len = intervals.length;
  const inv = chord.inversion || 0;
  const rootDisplay = NOTE_DISPLAY[chord.root];
  const rootLetter = LETTER_NAMES.indexOf(rootDisplay[0]);
  return chord.orderedNotes.map((pc, i) => {
    const interval = intervals[(i + inv) % len];
    const letter = (rootLetter + INTERVAL_LETTERS[interval]) % 7;
    const naturalPc = LETTER_PCS[letter];
    let diff = (pc - naturalPc + 24) % 12;
    if (diff > 6) diff -= 12;
    const accidental = ACC_CHARS[diff] || '';
    // octShift is ±1 when the accidental crosses the C boundary (C♭ sounds as
    // B in the octave below — its letter octave is one *above* the pc octave;
    // B♯ likewise has letter octave one below). 0 for normal cases.
    const octShift = (pc - naturalPc - diff) / 12;
    return { letter, accidental, octShift, display: LETTER_NAMES[letter] + accidental };
  });
}

// HTML rendering helpers for chord names — shared by chord display + generator.
export function formatRootHtml(rootDisplay) {
  const match = rootDisplay.match(/^([A-G])([\u266F\u266D])$/);
  if (match) {
    const variant = match[2] === '\u266D' ? 'flat' : 'sharp';
    return `${match[1]}<span class="accidental accidental-${variant}">${match[2]}</span>`;
  }
  return rootDisplay;
}

export function formatChordHtml(chord) {
  const formula = CHORD_FORMULAS[chord.quality];
  const rootDisplay = NOTE_DISPLAY[chord.root];
  const suffix = formula.suffix;
  // Bass is the chord's own spelling of the inverted note, so e.g. C♯m/G♯
  // never displays as C♯m/A♭.
  const bassHtml = chord.orderedNotes[0] !== noteToPitchClass(chord.root)
    ? '/' + formatRootHtml(spellChordTones(chord)[0].display)
    : '';
  return `${formatRootHtml(rootDisplay)}<span class="accent">${suffix}</span>${bassHtml ? '<span class="accent">' + bassHtml + '</span>' : ''}`;
}

// Standard piano fingerings (right hand / left hand) per chord quality.
// Numbering: 1 = thumb, 2 = index, 3 = middle, 4 = ring, 5 = pinky.
//
// Sourced by spot-checking pianochord.org pages: triads use 1-3-5 / 5-3-1 and
// 7th chords use 1-2-3-5 / 5-3-2-1 across all roots and (with the same pattern
// applied to the bass-up voicing) inversions. Exception: augmented triads use
// 5-3-2 in the LH because the M3+M3 stretch makes the thumb on the top note
// unreliable.
//
// orderedNotes is bass→top, so we return RH fingers in the same order.
const FINGERINGS_RH = {
  3: [1, 3, 5],
  4: [1, 2, 3, 5]
};
const FINGERINGS_LH = {
  3: [5, 3, 1],
  4: [5, 3, 2, 1]
};
const FINGERING_OVERRIDES_LH = {
  aug: [5, 3, 2]
};

// Returns { rh, lh } where each is an array of finger numbers indexed by
// orderedNotes (bass = index 0, top = last).
export function getFingering(chord) {
  const n = chord.orderedNotes.length;
  const lh = FINGERING_OVERRIDES_LH[chord.quality] || FINGERINGS_LH[n] || [];
  const rh = FINGERINGS_RH[n] || [];
  return { rh, lh };
}

// Pick an inversion index for a chord with `numNotes` notes. With probability
// `freqPct` (0–100) returns a non-root inversion uniformly in 1..numNotes-1;
// otherwise returns 0 (root position). Shared by random + progression generators
// so the "% of chords inverted" semantics stay aligned.
export function pickInversion(numNotes, useInversions, freqPct) {
  if (!useInversions || numNotes <= 1) return 0;
  if (Math.random() * 100 >= freqPct) return 0;
  return 1 + Math.floor(Math.random() * (numNotes - 1));
}

export function buildChord(root, quality, inversion = 0) {
  const formula = CHORD_FORMULAS[quality];
  const rootPc = noteToPitchClass(root);
  const pcs = formula.intervals.map(i => (rootPc + i) % 12);

  const inversionNotes = [...pcs];
  for (let i = 0; i < inversion; i++) {
    inversionNotes.push(inversionNotes.shift());
  }

  return {
    root,
    quality,
    inversion,
    pitchClasses: new Set(pcs),
    orderedNotes: inversionNotes,
    symbol: NOTE_DISPLAY[root] + formula.suffix +
            (inversion > 0 ? '/' + pitchClassToDisplay(inversionNotes[0]) : '')
  };
}
