// The linear level path. Generated levels describe what the generator may
// use; repertoire levels draw from the excerpt library instead. Each level
// unlocks once the previous one has at least one star.
//
// Generator params:
//   staves       which staves are shown
//   hands        'R' | 'L' (one staff), 'alt' (hands take turns), 'both'
//   altEvery     bars per turn when hands alternate
//   rh / lh      { range: [lowMidi, highMidi], rhythms: [...beats], maxLeap }
//                maxLeap is in scale steps (1 = steps only, 2 = thirds…)
//   lhTexture    'melody' | 'sustain' | 'bassline' | 'dyads' | 'triads' | 'alberti'
//   keys, times  pools picked at random per exercise
//   bars         4 or 8
//   restProb     chance to turn a melody note into a rest
//   chromatic    chance of a chromatic passing note
//   rhDyads      chance to add a third under a strong-beat melody note

const W = 4, HD = 3, H = 2, QD = 1.5, Q = 1, ED = 0.75, E = 0.5, S = 0.25;

export const LEVELS = [
  {
    id: 'l1', name: 'First Notes', blurb: 'Right hand, middle C to G. Whole and half notes.',
    staves: ['treble'], hands: 'R',
    rh: { range: [60, 67], rhythms: [W, H], maxLeap: 1 },
    keys: ['C'], times: ['4/4'], bars: 4, tempo: 60,
  },
  {
    id: 'l2', name: 'Bass Clef', blurb: 'Left hand, C3 to G3. Same rhythms, new clef.',
    staves: ['bass'], hands: 'L',
    lh: { range: [48, 55], rhythms: [W, H], maxLeap: 1 }, lhTexture: 'melody',
    keys: ['C'], times: ['4/4'], bars: 4, tempo: 60,
  },
  {
    id: 'l3', name: 'Quarter Notes', blurb: 'A full octave in the right hand, quarter notes and thirds.',
    staves: ['treble'], hands: 'R',
    rh: { range: [60, 72], rhythms: [W, H, Q], maxLeap: 2 },
    keys: ['C'], times: ['4/4'], bars: 4, tempo: 72,
  },
  {
    id: 'l4', name: 'Two Clefs', blurb: 'Grand staff — the hands take turns, one bar each.',
    staves: ['treble', 'bass'], hands: 'alt', altEvery: 1,
    rh: { range: [60, 72], rhythms: [W, H, Q], maxLeap: 2 },
    lh: { range: [48, 60], rhythms: [W, H, Q], maxLeap: 2 }, lhTexture: 'melody',
    keys: ['C'], times: ['4/4'], bars: 4, tempo: 72,
  },
  {
    id: 'l5', name: 'Rests & Waltz Time', blurb: '3/4, dotted halves, rests, leaps up to a fourth.',
    staves: ['treble', 'bass'], hands: 'alt', altEvery: 2,
    rh: { range: [60, 74], rhythms: [HD, H, Q], maxLeap: 3 },
    lh: { range: [45, 60], rhythms: [HD, H, Q], maxLeap: 3 }, lhTexture: 'melody',
    keys: ['C'], times: ['3/4', '4/4'], bars: 4, restProb: 0.12, tempo: 80,
  },
  {
    id: 'l6', name: 'Hands Together', blurb: 'Melody on top, held bass notes below.',
    staves: ['treble', 'bass'], hands: 'both',
    rh: { range: [60, 72], rhythms: [H, Q, HD], maxLeap: 2 },
    lh: { range: [43, 55], rhythms: [W, HD, H] }, lhTexture: 'sustain',
    keys: ['C'], times: ['4/4', '3/4'], bars: 4, tempo: 66,
  },
  {
    id: 'rep1', name: 'Repertoire I', blurb: 'Folk tunes you may already know — in both clefs.',
    repertoire: true, tempo: 80,
  },
  {
    id: 'l7', name: 'G & F Major', blurb: 'First key signatures, ledger lines above and below.',
    staves: ['treble', 'bass'], hands: 'both',
    rh: { range: [57, 77], rhythms: [W, HD, H, Q], maxLeap: 3 },
    lh: { range: [40, 57], rhythms: [W, HD, H, Q] }, lhTexture: 'bassline',
    keys: ['G', 'F', 'C'], times: ['4/4', '3/4'], bars: 8, restProb: 0.06, tempo: 76,
  },
  {
    id: 'l8', name: 'Eighth Notes', blurb: 'Eighths and dotted quarters in the right hand.',
    staves: ['treble', 'bass'], hands: 'both',
    rh: { range: [60, 76], rhythms: [H, QD, Q, E], maxLeap: 3 },
    lh: { range: [40, 57], rhythms: [W, HD, H, Q] }, lhTexture: 'bassline',
    keys: ['C', 'G', 'F'], times: ['4/4', '3/4'], bars: 8, restProb: 0.05, tempo: 72,
  },
  {
    id: 'rep2', name: 'Repertoire II', blurb: 'Beethoven, Mozart, Petzold — and a canon.',
    repertoire: true, tempo: 90,
  },
  {
    id: 'l9', name: 'Accidentals & Minor', blurb: 'Sharps, flats and naturals; D, B♭, A minor, E minor. Fifths in the left hand.',
    staves: ['treble', 'bass'], hands: 'both',
    rh: { range: [60, 77], rhythms: [H, QD, Q, E], maxLeap: 3 },
    lh: { range: [40, 57], rhythms: [W, HD, H] }, lhTexture: 'dyads',
    keys: ['D', 'Bb', 'Am', 'Em', 'Dm', 'G', 'F'], times: ['4/4', '3/4'], bars: 8,
    chromatic: 0.12, restProb: 0.05, tempo: 72,
  },
  {
    id: 'l10', name: 'Compound Time', blurb: '6/8 — the beat is a dotted quarter.',
    staves: ['treble', 'bass'], hands: 'both',
    rh: { range: [60, 77], rhythms: [HD, QD, Q, E], maxLeap: 3 },
    lh: { range: [40, 57], rhythms: [HD, QD] }, lhTexture: 'dyads',
    keys: ['C', 'G', 'F', 'D', 'Am'], times: ['6/8'], bars: 8, restProb: 0.05, tempo: 56,
  },
  {
    id: 'l11', name: 'Chords', blurb: 'Left-hand triads, thirds in the right hand, up to 3 sharps or flats.',
    staves: ['treble', 'bass'], hands: 'both',
    rh: { range: [60, 79], rhythms: [H, QD, Q, E], maxLeap: 4 },
    lh: { range: [43, 60], rhythms: [W, HD, H, Q] }, lhTexture: 'triads',
    keys: ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'Am', 'Em', 'Dm', 'Gm'], times: ['4/4', '3/4'], bars: 8,
    chromatic: 0.08, rhDyads: 0.2, tempo: 66,
  },
  {
    id: 'rep3', name: 'Repertoire III', blurb: 'Pachelbel, Für Elise, the C major Prelude.',
    repertoire: true, tempo: 66,
  },
  {
    id: 'l12', name: 'Prima Vista', blurb: 'Everything: sixteenths, Alberti bass, four sharps or flats.',
    staves: ['treble', 'bass'], hands: 'both',
    rh: { range: [57, 81], rhythms: [H, QD, Q, ED, E, S], maxLeap: 5 },
    lh: { range: [40, 60], rhythms: [E] }, lhTexture: 'alberti',
    keys: ['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb', 'E', 'Ab', 'Am', 'Em', 'Dm', 'Gm', 'Bm', 'Cm'],
    times: ['4/4', '3/4', '6/8'], bars: 8, chromatic: 0.1, rhDyads: 0.15, restProb: 0.04, tempo: 72,
  },
];

export function levelById(id) {
  return LEVELS.find((l) => l.id === id);
}

export function levelIndex(id) {
  return LEVELS.findIndex((l) => l.id === id);
}
