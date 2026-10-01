// Score model shared by the generator, the excerpt library, the scoring
// engine and the renderer. Pure — no DOM, so it runs under `node --test`.
//
// Exercise = {
//   id, title, subtitle, kind: 'generated' | 'excerpt',
//   key: 'G' | 'Em' | …          (VexFlow key spec)
//   time: '3/4',
//   tempo: 80,                   (suggested bpm, in beat units — see beatUnit)
//   staves: ['treble', 'bass'],  (subset, top to bottom)
//   measures: [{ treble: [voice, …], bass: [voice, …] }],
// }
// voice = [Event], Event = { keys: ['c#/4', …], rest, dur: 'q', dots, beats, tie }
// `beats` is always in quarter notes. A first measure shorter than the time
// signature is a pickup (anacrusis).

export const LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const ACC_OFFSET = { '': 0, n: 0, '#': 1, '##': 2, b: -1, bb: -2 };

const DUR_BEATS = { w: 4, h: 2, q: 1, 8: 0.5, 16: 0.25, 32: 0.125 };

export function durationBeats(dur, dots = 0) {
  const base = DUR_BEATS[dur];
  if (base === undefined) throw new Error(`Unknown duration "${dur}"`);
  let total = base, add = base;
  for (let i = 0; i < dots; i++) { add /= 2; total += add; }
  return total;
}

// Inverse of durationBeats for the values the generator produces.
const BEATS_DUR = [
  [4, 'w', 0], [3, 'h', 1], [2, 'h', 0], [1.5, 'q', 1], [1, 'q', 0],
  [0.75, '8', 1], [0.5, '8', 0], [0.25, '16', 0],
];
export function beatsToDuration(beats) {
  const hit = BEATS_DUR.find(([b]) => Math.abs(b - beats) < 1e-6);
  if (!hit) throw new Error(`No single duration lasts ${beats} beats`);
  return { dur: hit[1], dots: hit[2] };
}

// 'c#4' → { letter: 'c', acc: '#', octave: 4 }
const PITCH_RE = /^([a-g])(##|#|bb|b|n)?(-?\d)$/;
export function parsePitch(str) {
  const m = PITCH_RE.exec(str);
  if (!m) throw new Error(`Bad pitch "${str}"`);
  return { letter: m[1], acc: m[2] || '', octave: Number(m[3]) };
}

export function pitchToKey({ letter, acc, octave }) {
  return `${letter}${acc === 'n' ? '' : acc}/${octave}`;
}

// 'c#/4' → 61 (MIDI, C4 = 60)
export function keyToMidi(key) {
  const [name, oct] = key.split('/');
  const letter = name[0];
  const acc = name.slice(1);
  return (Number(oct) + 1) * 12 + LETTER_PC[LETTERS.indexOf(letter)] + ACC_OFFSET[acc];
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export function midiName(midi) {
  return `${SHARP_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function timeSignature(time) {
  const [num, den] = time.split('/').map(Number);
  const measureBeats = num * (4 / den);
  // Compound meters count in dotted quarters, 3/8 in eighths, the rest in quarters.
  let beatUnit = 4 / den;
  if (den === 8 && num % 3 === 0 && num > 3) beatUnit = 1.5;
  return { num, den, measureBeats, beatUnit };
}

// ---- Keys ---------------------------------------------------------------

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

// 'Bb' → tonic info + diatonic spelling helpers.
export function keyInfo(key) {
  const minor = key.endsWith('m');
  const tonicName = minor ? key.slice(0, -1) : key;
  const letter = tonicName[0].toLowerCase();
  const acc = tonicName.slice(1);
  const letterIdx = LETTERS.indexOf(letter);
  const tonicPc = (LETTER_PC[letterIdx] + ACC_OFFSET[acc] + 12) % 12;
  return { key, minor, letterIdx, tonicPc, steps: minor ? MINOR : MAJOR };
}

// Diatonic degree index → spelled VexFlow key. Degree 0 is the tonic in
// octave 4 (the tonic of A minor is A4, of C major C4). `alter` raises or
// lowers by semitones (harmonic-minor leading tone, chromatic notes).
export function degreeToKey(info, degree, alter = 0) {
  const d = ((degree % 7) + 7) % 7;
  const octShift = Math.floor(degree / 7);
  const letterIdx = (info.letterIdx + d) % 7;
  // Octave of the tonic is 4; letters that wrap past B land an octave up.
  const octave = 4 + octShift + Math.floor((info.letterIdx + d) / 7);
  const pc = (info.tonicPc + info.steps[d] + alter + 12) % 12;
  let accSemis = pc - LETTER_PC[letterIdx];
  if (accSemis > 6) accSemis -= 12;
  if (accSemis < -6) accSemis += 12;
  const acc = { 0: '', 1: '#', 2: '##', [-1]: 'b', [-2]: 'bb' }[accSemis];
  if (acc === undefined) throw new Error(`Cannot spell degree ${degree} in ${info.key}`);
  return `${LETTERS[letterIdx]}${acc}/${octave}`;
}

// ---- Compact text notation (used by the excerpt library) ------------------
//
// Measures separated by "|", events by whitespace:
//   e5:8        pitch + duration (w h q 8 16 32, "." per dot)
//   (c4 e4 g4)  chord           r  rest
//   d5~         tie into the next event of the same voice
// Durations are sticky: an event without ":dur" reuses the previous one.

const TOKEN_RE = /^(\([^)]*\)|r|[a-g](?:##|#|bb|b|n)?-?\d)(?::(w|h|q|8|16|32)(\.*))?(~)?$/;

export function parseVoice(src) {
  let dur = 'q', dots = 0;
  return src.split('|').map((measureSrc) => {
    const events = [];
    for (const tok of measureSrc.match(/\([^)]*\)\S*|\S+/g) || []) {
      const m = TOKEN_RE.exec(tok);
      if (!m) throw new Error(`Bad token "${tok}"`);
      if (m[2]) { dur = m[2]; dots = m[3].length; }
      const head = m[1];
      const rest = head === 'r';
      const pitches = rest ? [] : head.startsWith('(')
        ? head.slice(1, -1).trim().split(/\s+/)
        : [head];
      events.push({
        keys: pitches.map((p) => pitchToKey(parsePitch(p))),
        rest,
        dur,
        dots,
        beats: durationBeats(dur, dots),
        tie: !!m[4],
      });
    }
    return events;
  });
}

// Builds an Exercise from { rh, lh } sources. Each hand is either a string
// (one voice) or an array of strings (several voices on the same staff).
export function exerciseFromText(def) {
  const staves = [];
  const perStaff = {};
  for (const [hand, clef] of [['rh', 'treble'], ['lh', 'bass']]) {
    if (!def[hand]) continue;
    const sources = Array.isArray(def[hand]) ? def[hand] : [def[hand]];
    perStaff[clef] = sources.map(parseVoice);
    staves.push(clef);
  }
  const count = Math.max(...staves.map((c) => perStaff[c][0].length));
  const measures = [];
  for (let i = 0; i < count; i++) {
    const m = {};
    for (const c of staves) m[c] = perStaff[c].map((voice) => voice[i] || []);
    measures.push(m);
  }
  return {
    id: def.id,
    title: def.title,
    subtitle: def.subtitle || '',
    kind: 'excerpt',
    key: def.key || 'C',
    time: def.time || '4/4',
    tempo: def.tempo || 80,
    staves,
    measures,
  };
}

export function voiceBeats(voice) {
  return voice.reduce((s, e) => s + e.beats, 0);
}

// Length of a measure as written (the longest voice — a pickup is shorter
// than the time signature, the rest match it).
export function measureLength(measure) {
  let max = 0;
  for (const voices of Object.values(measure)) {
    for (const v of voices) max = Math.max(max, voiceBeats(v));
  }
  return max;
}
