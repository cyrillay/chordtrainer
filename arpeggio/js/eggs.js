// Easter eggs: little melodies and gestures hidden in the raw note stream.
// Pure functions over the recent note history so they can be unit-tested.
//
// history: array of { midi, t } note-ons, oldest first.
// held:    Set of MIDI notes currently held down.

const intervalsOf = (notes) => notes.slice(1).map((n, i) => n.midi - notes[i].midi);

function tailMatches(history, intervals) {
  const n = intervals.length + 1;
  if (history.length < n) return false;
  const tail = history.slice(-n);
  const got = intervalsOf(tail);
  return got.every((v, i) => v === intervals[i]);
}

const pcsOf = (history, n) => history.slice(-n).map(x => ((x.midi % 12) + 12) % 12);

// Melodies matched by interval shape, so any transposition counts.
export const MELODIES = {
  // E D♯ E D♯ E B D C A
  furElise: [-1, 1, -1, 1, -5, 3, -2, -3],
  // E E F G G F E D C C D E
  odeToJoy: [0, 1, 2, 0, -2, -1, -2, -2, 0, 2, 2],
  // D E C C(8vb) G — the five-tone greeting
  closeEncounters: [2, -4, -12, 7],
  // E E E C E G … G(8vb)
  oneUp: [0, 0, -4, 4, 3, -12],
};

export function detectMelody(history) {
  for (const [id, shape] of Object.entries(MELODIES)) {
    if (tailMatches(history, shape)) return id;
  }
  return null;
}

// B♭ A C B — Bach's own signature, exact pitch classes.
export function detectBach(history) {
  if (history.length < 4) return false;
  const pcs = pcsOf(history, 4);
  return pcs[0] === 10 && pcs[1] === 9 && pcs[2] === 0 && pcs[3] === 11;
}

// F B D♯ G♯ held together, F in the bass.
export function detectTristan(held) {
  if (held.size !== 4) return false;
  const notes = [...held].sort((a, b) => a - b);
  const pcs = new Set(notes.map(n => n % 12));
  return notes[0] % 12 === 5 && [5, 11, 3, 8].every(pc => pcs.has(pc));
}

// Semitone ostinato down low: E F E F E F (any pair a half step apart,
// bottom note below C3).
export function detectJaws(history) {
  if (history.length < 6) return false;
  const tail = history.slice(-6);
  if (!tailMatches(tail, [1, -1, 1, -1, 1])) return false;
  return tail[0].midi < 48;
}

// Thirteen consecutive ascending semitones (a full chromatic octave).
export function detectChromatic(history) {
  return tailMatches(history, new Array(12).fill(1)) || tailMatches(history, new Array(12).fill(-1));
}

const WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);

// Eight or more white keys swept in one direction in under 600 ms.
export function detectGlissando(history) {
  const n = 8;
  if (history.length < n) return false;
  const tail = history.slice(-n);
  if (tail[n - 1].t - tail[0].t > 600) return false;
  if (!tail.every(x => WHITE.has(x.midi % 12))) return false;
  const iv = intervalsOf(tail);
  return iv.every(v => v > 0 && v <= 2) || iv.every(v => v < 0 && v >= -2);
}

// Ten or more keys down at once.
export function detectCluster(held) {
  return held.size >= 10;
}

// A pitch palindrome of at least 7 notes that goes up then comes back down
// (or the mirror), e.g. C E G B G E C.
export function detectPalindrome(history, len = 7) {
  if (history.length < len) return false;
  const tail = history.slice(-len).map(x => x.midi);
  for (let i = 0; i < len / 2; i++) if (tail[i] !== tail[len - 1 - i]) return false;
  const mid = Math.floor(len / 2);
  const firstHalf = intervalsOf(tail.slice(0, mid + 1).map(midi => ({ midi })));
  return firstHalf.every(v => v > 0) || firstHalf.every(v => v < 0);
}

// ---- Gesture checks on a single completed arpeggio ----

export function isCrescendo(notes) {
  if (notes.length < 4) return false;
  for (let i = 1; i < notes.length; i++) if (notes[i].velocity <= notes[i - 1].velocity) return false;
  return notes[notes.length - 1].velocity - notes[0].velocity >= 30;
}

export function isDiminuendo(notes) {
  if (notes.length < 4) return false;
  for (let i = 1; i < notes.length; i++) if (notes[i].velocity >= notes[i - 1].velocity) return false;
  return notes[0].velocity - notes[notes.length - 1].velocity >= 30;
}

export function isFeather(notes) {
  return notes.length >= 3 && notes.every(n => n.velocity < 35);
}

export function isThunder(notes) {
  return notes.length >= 3 && notes.every(n => n.velocity >= 115);
}

// Inter-onset intervals within ±7% of their mean.
export function isMetronomic(gaps) {
  if (gaps.length < 3) return false;
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean < 80) return false;
  return gaps.every(g => Math.abs(g - mean) / mean <= 0.07);
}

// Fibonacci-ish: each gap at least 1.4× the previous — a ritardando.
export function isRitardando(gaps) {
  if (gaps.length < 3) return false;
  for (let i = 1; i < gaps.length; i++) if (gaps[i] < gaps[i - 1] * 1.4) return false;
  return true;
}
