// Public-domain excerpts for the repertoire levels, written in the compact
// notation from notation.js (rh = treble staff, lh = bass staff). "arr."
// marks pieces whose left hand is a simple accompaniment added here rather
// than the original part.

export const EXCERPTS = [
  // ---- Repertoire I: folk tunes, whole/half/quarter notes, C major ---------
  {
    id: 'au-clair', level: 'rep1',
    title: 'Au clair de la lune', subtitle: 'Trad. French, the tune in each hand',
    key: 'C', time: '4/4', tempo: 80,
    rh: 'c4:q c4 c4 d4 | e4:h d4 | c4:q e4 d4 d4 | c4:w | r:w | r | r | r',
    lh: 'r:w | r | r | r | c3:q c3 c3 d3 | e3:h d3 | c3:q e3 d3 d3 | c3:w',
  },
  {
    id: 'mary-lamb', level: 'rep1',
    title: 'Mary Had a Little Lamb', subtitle: 'Trad. American, arr.',
    key: 'C', time: '4/4', tempo: 84,
    rh: 'e4:q d4 c4 d4 | e4 e4 e4:h | d4:q d4 d4:h | e4:q g4 g4:h | e4:q d4 c4 d4 | e4 e4 e4 e4 | d4 d4 e4 d4 | c4:w',
    lh: 'c3:w | c3 | g2 | c3 | c3 | c3 | g2 | c3',
  },
  {
    id: 'hanschen-klein', level: 'rep1',
    title: 'Hänschen klein', subtitle: 'Trad. German, arr.',
    key: 'C', time: '4/4', tempo: 84,
    rh: 'g4:q e4 e4:h | f4:q d4 d4:h | c4:q d4 e4 f4 | g4 g4 g4:h | g4:q e4 e4:h | f4:q d4 d4:h | c4:q e4 g4 g4 | c4:w',
    lh: 'c3:w | g2 | c3 | c3 | c3 | g2 | c3:h g2 | c3:w',
  },
  {
    id: 'frere-jacques-short', level: 'rep1',
    title: 'Frère Jacques', subtitle: 'Trad. French, canon, left hand enters in bar 3',
    key: 'C', time: '4/4', tempo: 80,
    rh: 'c4:q d4 e4 c4 | c4 d4 e4 c4 | e4 f4 g4:h | e4:q f4 g4:h',
    lh: 'r:w | r | c3:q d3 e3 c3 | c3 d3 e3 c3',
  },

  // ---- Repertoire II: eighths, dotted rhythms, G and F major ---------------
  {
    id: 'ode-to-joy', level: 'rep2',
    title: 'Ode to Joy', subtitle: 'Beethoven, Symphony No. 9, arr.',
    key: 'C', time: '4/4', tempo: 96,
    rh: 'e4:q e4 f4 g4 | g4 f4 e4 d4 | c4 c4 d4 e4 | e4:q. d4:8 d4:h | e4:q e4 f4 g4 | g4 f4 e4 d4 | c4 c4 d4 e4 | d4:q. c4:8 c4:h',
    lh: 'c3:w | g2 | c3 | g2 | c3 | g2 | c3 | g2:h c3:h',
  },
  {
    id: 'mozart-k265', level: 'rep2',
    title: 'Ah, vous dirai-je, maman', subtitle: 'Mozart, K. 265, theme, mm. 1–8',
    key: 'C', time: '2/4', tempo: 92,
    rh: 'c5:q c5 | g5 g5 | a5 a5 | g5:h | f5:q f5 | e5 e5 | d5 d5 | c5:h',
    lh: 'c3:q c4 | e4 c4 | f4 c4 | e4 c4 | d4 b3 | c4 a3 | f3 g3 | c3:h',
  },
  {
    id: 'frere-jacques-canon', level: 'rep2',
    title: 'Frère Jacques', subtitle: 'Trad. French, two-part canon in F',
    key: 'F', time: '4/4', tempo: 88,
    rh: 'f4:q g4 a4 f4 | f4 g4 a4 f4 | a4 bb4 c5:h | a4:q bb4 c5:h | c5:8 d5 c5 bb4 a4:q f4 | c5:8 d5 c5 bb4 a4:q f4 | f4 c4 f4:h | f4:q c4 f4:h',
    lh: 'r:w | r | f3:q g3 a3 f3 | f3 g3 a3 f3 | a3 bb3 c4:h | a3:q bb3 c4:h | c4:8 d4 c4 bb3 a3:q f3 | c4:8 d4 c4 bb3 a3:q f3',
  },
  {
    id: 'petzold-minuet-g', level: 'rep2',
    title: 'Minuet in G', subtitle: 'Petzold, BWV Anh. 114, mm. 1–8',
    key: 'G', time: '3/4', tempo: 100,
    rh: 'd5:q g4:8 a4 b4 c5 | d5:q g4 g4 | e5:q c5:8 d5 e5 f#5 | g5:q g4 g4 | c5:q d5:8 c5 b4 a4 | b4:q c5:8 b4 a4 g4 | f#4:q g4:8 a4 b4 g4 | a4:h.',
    lh: '(g3 b3 d4):h a3:q | b3:h. | c4 | b3 | a3 | g3 | d4:q b3 g3 | d4 d3 c4',
  },

  // ---- Repertoire III: sixteenths, ties, two voices, key signatures --------
  {
    id: 'pachelbel-canon', level: 'rep3',
    title: 'Canon in D', subtitle: 'Pachelbel, mm. 1–6, arr.',
    key: 'D', time: '4/4', tempo: 66,
    rh: 'r:w | r | f#5:q e5 d5 c#5 | b4 a4 b4 c#5 | d5 c#5 b4 a4 | g4 f#4 g4 e4',
    lh: 'd3:q a2 b2 f#2 | g2 d2 g2 a2 | d3 a2 b2 f#2 | g2 d2 g2 a2 | d3 a2 b2 f#2 | g2 d2 g2 a2',
  },
  {
    id: 'fur-elise', level: 'rep3',
    title: 'Für Elise', subtitle: 'Beethoven, WoO 59, opening',
    key: 'Am', time: '3/8', tempo: 120,
    rh: 'e5:16 d#5 | e5 d#5 e5 b4 d5 c5 | a4:8 r:16 c4 e4 a4 | b4:8 r:16 e4 g#4 b4 | c5:8 r:16 e4 e5 d#5 | e5 d#5 e5 b4 d5 c5 | a4:8 r:16 c4 e4 a4 | b4:8 r:16 e4 c5 b4 | a4:q r:8',
    lh: 'r:8 | r:q. | a2:16 e3 a3 r r:8 | e2:16 e3 g#3 r r:8 | a2:16 e3 a3 r r:8 | r:q. | a2:16 e3 a3 r r:8 | e2:16 e3 g#3 r r:8 | a2:16 e3 a3 r r:8',
  },
  {
    id: 'bach-prelude-c', level: 'rep3',
    title: 'Prelude in C', subtitle: 'J. S. Bach, BWV 846, mm. 1–4',
    key: 'C', time: '4/4', tempo: 60,
    rh: 'r:8 g4:16 c5 e5 g4 c5 e5 r:8 g4:16 c5 e5 g4 c5 e5 | r:8 a4:16 d5 f5 a4 d5 f5 r:8 a4:16 d5 f5 a4 d5 f5 | r:8 g4:16 d5 f5 g4 d5 f5 r:8 g4:16 d5 f5 g4 d5 f5 | r:8 g4:16 c5 e5 g4 c5 e5 r:8 g4:16 c5 e5 g4 c5 e5',
    lh: [
      'r:16 e4:8.~ e4:q r:16 e4:8.~ e4:q | r:16 d4:8.~ d4:q r:16 d4:8.~ d4:q | r:16 d4:8.~ d4:q r:16 d4:8.~ d4:q | r:16 e4:8.~ e4:q r:16 e4:8.~ e4:q',
      'c4:h c4 | c4 c4 | b3 b3 | c4 c4',
    ],
  },
];
