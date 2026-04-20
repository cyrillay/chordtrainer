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
