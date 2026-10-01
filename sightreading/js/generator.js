// Generates short sight-reading exercises from a level description (see
// levels.js). The music is built bottom-up from a harmonic plan so it sounds
// like music rather than random notes:
//   1. pick a key, a meter and a chord progression ending on I
//   2. pick a rhythm pattern per bar from a meter-specific library
//   3. walk a melody through the scale — mostly steps, chord tones on strong
//      beats, ending on the tonic — biased toward notes the player misses
//   4. add the left-hand texture (held roots, bass line, fifths, triads, Alberti)
// Pure: pass `rng` for deterministic output in tests.

import {
  keyInfo, degreeToKey, keyToMidi, timeSignature, beatsToDuration,
} from './notation.js';

// ---- Rhythm library (durations in quarter notes) ---------------------------

const PATTERNS = {
  '4/4': [
    [4], [2, 2], [3, 1], [1, 3], [2, 1, 1], [1, 1, 2], [1, 2, 1], [1, 1, 1, 1],
    [1, 1, 1, 0.5, 0.5], [0.5, 0.5, 1, 1, 1], [1, 0.5, 0.5, 1, 1], [1, 1, 0.5, 0.5, 1],
    [0.5, 0.5, 0.5, 0.5, 1, 1], [1, 1, 0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 1, 0.5, 0.5, 1],
    [2, 0.5, 0.5, 1], [0.5, 0.5, 0.5, 0.5, 2],
    [1.5, 0.5, 1, 1], [1, 1, 1.5, 0.5], [1.5, 0.5, 2], [2, 1.5, 0.5], [1.5, 0.5, 1.5, 0.5],
    [0.25, 0.25, 0.25, 0.25, 1, 1, 1], [1, 1, 0.25, 0.25, 0.25, 0.25, 1],
    [0.5, 0.25, 0.25, 1, 1, 1], [1, 0.25, 0.25, 0.5, 1, 1],
    [0.75, 0.25, 1, 1, 1], [1, 1, 0.75, 0.25, 1], [0.75, 0.25, 0.75, 0.25, 2],
  ],
  '3/4': [
    [3], [2, 1], [1, 2], [1, 1, 1],
    [1, 1, 0.5, 0.5], [0.5, 0.5, 1, 1], [1, 0.5, 0.5, 1], [2, 0.5, 0.5],
    [0.5, 0.5, 0.5, 0.5, 1], [1.5, 0.5, 1],
    [0.25, 0.25, 0.25, 0.25, 1, 1], [1, 0.25, 0.25, 0.25, 0.25, 1], [0.75, 0.25, 1, 1],
  ],
  '6/8': [
    [3], [1.5, 1.5], [1, 0.5, 1.5], [1.5, 1, 0.5], [1, 0.5, 1, 0.5],
    [0.5, 0.5, 0.5, 1.5], [1.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    [1, 0.5, 0.5, 0.5, 0.5], [0.75, 0.25, 0.5, 1.5],
  ],
};

// Beats where a new beat group starts (used for "strong beat" and to keep
// generated rhythms from tying across the middle of a 4/4 bar).
function strongBeats(time) {
  if (time === '4/4') return [0, 2];
  if (time === '3/4') return [0];
  if (time === '6/8') return [0, 1.5];
  return [0];
}

function allowedPatterns(time, rhythms) {
  const allowed = new Set(rhythms);
  return (PATTERNS[time] || []).filter((p) => p.every((d) => allowed.has(d)));
}

// ---- Harmony ---------------------------------------------------------------

const PROGRESSIONS = {
  4: [[0, 3, 4, 0], [0, 5, 4, 0], [0, 4, 4, 0], [0, 3, 0, 0], [0, 1, 4, 0], [0, 4, 3, 0]],
  8: [
    [0, 3, 0, 4, 0, 3, 4, 0], [0, 5, 3, 4, 0, 5, 4, 0], [0, 4, 5, 3, 0, 3, 4, 0],
    [0, 0, 3, 4, 5, 1, 4, 0], [0, 3, 4, 0, 5, 3, 4, 0],
  ],
};
// ii° in minor sounds odd in this context; swap it for iv.
const minorSafe = (prog) => prog.map((d) => (d === 1 ? 3 : d));

function chordTones(root) {
  return [root % 7, (root + 2) % 7, (root + 4) % 7];
}

// Harmonic minor: raise the leading tone inside the dominant chord.
function alterFor(info, chordRoot, degree) {
  const d = ((degree % 7) + 7) % 7;
  return info.minor && chordRoot === 4 && d === 6 ? 1 : 0;
}

// ---- Random helpers --------------------------------------------------------

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function weightedPick(rng, items, weightOf) {
  let total = 0;
  const ws = items.map((it) => { const w = Math.max(0, weightOf(it)); total += w; return w; });
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ---- Pitch helpers ---------------------------------------------------------

function degMidi(info, degree, alter = 0) {
  return keyToMidi(degreeToKey(info, degree, alter));
}

function degreesInRange(info, [lo, hi]) {
  const out = [];
  for (let d = -28; d <= 21; d++) {
    const m = degMidi(info, d);
    if (m >= lo && m <= hi) out.push(d);
  }
  return out;
}

const STEP_WEIGHT = [0.5, 6, 2.6, 1.3, 0.9, 0.6, 0.4, 0.3];

// ---- Melody ----------------------------------------------------------------

function makeWalker(info, spec, ctx) {
  const degrees = degreesInRange(info, spec.range);
  const center = (degrees[0] + degrees[degrees.length - 1]) / 2;
  const half = Math.max(1, (degrees[degrees.length - 1] - degrees[0]) / 2);
  const maxLeap = spec.maxLeap ?? 2;
  let cur = null;
  let lastMove = 0;

  function weight(d, chordRoot, strong) {
    const step = Math.abs(d - cur);
    if (step > maxLeap) return 0;
    let w = STEP_WEIGHT[Math.min(step, STEP_WEIGHT.length - 1)];
    if (strong && chordTones(chordRoot).includes(((d % 7) + 7) % 7)) w *= 3;
    // After a leap, step back the other way.
    if (Math.abs(lastMove) >= 3 && Math.sign(d - cur) === -Math.sign(lastMove)) w *= 2.5;
    // Gentle pull toward the middle of the range.
    w *= 1 - 0.55 * Math.min(1, Math.abs(d - center) / half);
    const midi = degMidi(info, d, alterFor(info, chordRoot, d));
    w *= 1 + 1.5 * (ctx.focus[midi] || 0);
    return w;
  }

  return {
    degrees,
    next(chordRoot, strong) {
      let d;
      if (cur === null) {
        const tones = chordTones(chordRoot);
        d = weightedPick(ctx.rng, degrees, (x) =>
          (tones.includes(((x % 7) + 7) % 7) ? 3 : 0.2) * (1 - 0.8 * Math.min(1, Math.abs(x - center) / half)));
      } else {
        d = weightedPick(ctx.rng, degrees, (x) => weight(x, chordRoot, strong));
      }
      lastMove = cur === null ? 0 : d - cur;
      cur = d;
      return d;
    },
    // Closest tonic to the current note.
    finish() {
      const tonics = degrees.filter((x) => ((x % 7) + 7) % 7 === 0);
      if (!tonics.length) return this.next(0, true);
      const d = tonics.reduce((a, b) => (Math.abs(b - (cur ?? center)) < Math.abs(a - (cur ?? center)) ? b : a));
      cur = d;
      return d;
    },
  };
}

// One bar of melody for one hand: [{ beats, degree, alter, rest }]
function melodyBar(ctx, walker, chordRoot, pattern, { isFirst, isLast }) {
  const strong = strongBeats(ctx.time);
  const notes = [];
  let t = 0;
  pattern.forEach((beats, i) => {
    const lastNote = isLast && i === pattern.length - 1;
    const isStrong = strong.some((s) => Math.abs(s - t) < 1e-6);
    const degree = lastNote ? walker.finish() : walker.next(chordRoot, isStrong);
    notes.push({ beats, degree, alter: alterFor(ctx.info, chordRoot, degree), rest: false, strong: isStrong, start: t });
    t += beats;
  });
  // Rests: never the first note of the piece, the final note, or two in a row.
  if (ctx.spec.restProb) {
    for (let i = 0; i < notes.length; i++) {
      if ((isFirst && i === 0) || (isLast && i === notes.length - 1)) continue;
      if (i > 0 && notes[i - 1].rest) continue;
      if (ctx.rng() < ctx.spec.restProb) notes[i].rest = true;
    }
  }
  return notes;
}

// Chromatic passing tones: split a note that moves by a whole step into the
// note + the chromatic note between (C–D → C C♯ D, D–C → D D♭ C).
function addChromatics(ctx, notes, allowed) {
  const out = [];
  for (let i = 0; i < notes.length; i++) {
    const a = notes[i], b = notes[i + 1];
    const half = a.beats / 2;
    if (b && !a.rest && !b.rest && a.alter === 0 && b.alter === 0 && allowed.has(half)
        && Math.abs(a.degree - b.degree) === 1
        && Math.abs(degMidi(ctx.info, a.degree) - degMidi(ctx.info, b.degree)) === 2
        && ctx.rng() < ctx.spec.chromatic) {
      const up = b.degree > a.degree;
      // Sharps going up, flats going down — unless that spells E♯, F♭,
      // a double accidental…, in which case respell from the target note.
      const options = [
        { degree: a.degree, alter: up ? 1 : -1 },
        { degree: b.degree, alter: up ? -1 : 1 },
      ];
      const awkward = (o) => {
        const name = degreeToKey(ctx.info, o.degree, o.alter).split('/')[0];
        return name.length > 2 || ['e#', 'b#', 'cb', 'fb'].includes(name);
      };
      const chosen = options.find((o) => !awkward(o)) || options[0];
      out.push({ ...a, beats: half });
      out.push({ ...a, ...chosen, beats: half, strong: false, start: a.start + half, chromatic: true });
      continue;
    }
    out.push(a);
  }
  return out;
}

// ---- Left-hand textures ----------------------------------------------------

function bassDegree(info, root, range, prefer) {
  const options = degreesInRange(info, range).filter((d) => ((d % 7) + 7) % 7 === root);
  if (!options.length) return null;
  const target = prefer ?? (range[0] + (range[1] - range[0]) * 0.35);
  return options.reduce((a, b) =>
    (Math.abs(degMidi(info, b) - target) < Math.abs(degMidi(info, a) - target) ? b : a));
}

function longPatterns(time, rhythms) {
  const pats = allowedPatterns(time, rhythms);
  const longest = pats.filter((p) => p.length <= 2);
  return longest.length ? longest : pats;
}

function lhBar(ctx, chordRoot, prevVoicing, isLast) {
  const { info, spec, rng, time } = ctx;
  const range = spec.lh.range;
  const texture = spec.lhTexture;
  const mBeats = timeSignature(time).measureBeats;
  const root = bassDegree(info, chordRoot, range);
  const al = (d) => alterFor(info, chordRoot, d);
  const note = (beats, degrees) => ({ beats, degrees, alters: degrees.map(al) });

  if (texture === 'alberti') {
    // Close-position triad broken low–high–middle–high.
    const r = root, third = root + 2, fifth = root + 4;
    const cell = time === '6/8' ? [r, fifth, third, fifth, third, fifth] : [r, fifth, third, fifth];
    const count = Math.round(mBeats / 0.5);
    const seq = [];
    for (let i = 0; i < count; i++) seq.push(cell[i % cell.length]);
    if (isLast) return { notes: [note(mBeats, [r, third, fifth])], voicing: null };
    return { notes: seq.map((d) => note(0.5, [d])), voicing: null };
  }

  if (texture === 'bassline') {
    const pattern = isLast ? [mBeats] : weightedPick(rng, allowedPatterns(time, spec.lh.rhythms),
      (p) => (p.length <= 3 ? 1 : 0.4));
    const tones = degreesInRange(info, range).filter((d) => chordTones(chordRoot).includes(((d % 7) + 7) % 7));
    let cur = root;
    const notes = pattern.map((beats, i) => {
      if (i > 0) {
        const near = tones.filter((d) => d !== cur && Math.abs(d - cur) <= 4);
        cur = near.length ? pick(rng, near) : cur;
      }
      return note(beats, [cur]);
    });
    return { notes, voicing: null };
  }

  const pats = longPatterns(time, spec.lh.rhythms);
  const pattern = isLast ? [mBeats] : pick(rng, pats.length ? pats : [[mBeats]]);

  if (texture === 'triads') {
    // Pick the inversion closest to the previous chord (smooth voice leading).
    const candidates = [];
    for (const base of degreesInRange(info, range)) {
      const pcs = ((base % 7) + 7) % 7;
      const tones = chordTones(chordRoot);
      const idx = tones.indexOf(pcs);
      if (idx < 0) continue;
      const upper = [1, 2].map((k) => {
        let d = base;
        const want = tones[(idx + k) % 3];
        do { d++; } while (((d % 7) + 7) % 7 !== want);
        return d;
      });
      const voicing = [base, ...upper];
      if (degMidi(info, voicing[2]) <= range[1] + 2) candidates.push(voicing);
    }
    const center = (range[0] + range[1]) / 2;
    const score = (v) => prevVoicing
      ? v.reduce((s, d, i) => s + Math.abs(d - prevVoicing[i]), 0)
      : Math.abs(degMidi(info, v[0]) - center);
    const voicing = candidates.length
      ? candidates.reduce((a, b) => (score(b) < score(a) ? b : a))
      : [root, root + 2, root + 4];
    return { notes: pattern.map((beats) => note(beats, voicing)), voicing };
  }

  // 'sustain' and 'dyads': root, alternating with the fifth when the bar has
  // two notes; dyads stack root + fifth (or root + tenth for variety).
  const notes = pattern.map((beats, i) => {
    if (texture === 'dyads') {
      const top = i % 2 === 0 ? root + 4 : root + 2 + 7;
      const fits = degMidi(info, top) <= range[1] + 4;
      return note(beats, fits ? [root, top] : [root, root + 4]);
    }
    if (i % 2 === 1) {
      const fifthBelow = root - 3;
      const d = degMidi(info, fifthBelow) >= range[0] ? fifthBelow : root + 4;
      return note(beats, [d]);
    }
    return note(beats, [root]);
  });
  return { notes, voicing: null };
}

// ---- Event construction ----------------------------------------------------

function toEvent(info, beats, degrees, alters, rest) {
  const { dur, dots } = beatsToDuration(beats);
  if (rest) return { keys: [], rest: true, dur, dots, beats, tie: false };
  const keys = degrees
    .map((d, i) => degreeToKey(info, d, alters[i] || 0))
    .sort((a, b) => keyToMidi(a) - keyToMidi(b));
  return { keys: [...new Set(keys)], rest: false, dur, dots, beats, tie: false };
}

function barRest(measureBeats) {
  const { dur, dots } = beatsToDuration(measureBeats);
  return [{ keys: [], rest: true, dur, dots, beats: measureBeats, tie: false }];
}

const KEY_NAMES = {
  C: 'C major', G: 'G major', D: 'D major', A: 'A major', E: 'E major', F: 'F major',
  Bb: 'B♭ major', Eb: 'E♭ major', Ab: 'A♭ major',
  Am: 'A minor', Em: 'E minor', Bm: 'B minor', Dm: 'D minor', Gm: 'G minor', Cm: 'C minor',
};

// ---- Public API ------------------------------------------------------------

export function generateExercise(level, { rng = Math.random, focus = {} } = {}) {
  const key = pick(rng, level.keys);
  const time = pick(rng, level.times);
  const info = keyInfo(key);
  const { measureBeats } = timeSignature(time);
  const bars = level.bars;
  let prog = pick(rng, PROGRESSIONS[bars] || PROGRESSIONS[4]);
  if (info.minor) prog = minorSafe(prog);
  const ctx = { info, spec: level, rng, time, focus };

  const rhWalker = level.rh ? makeWalker(info, level.rh, ctx) : null;
  const lhWalker = level.lh && level.lhTexture === 'melody' ? makeWalker(info, level.lh, ctx) : null;

  // Who plays the melody in each bar.
  const melodyHand = (bar) => {
    if (level.hands === 'R' || level.hands === 'both') return 'rh';
    if (level.hands === 'L') return 'lh';
    return Math.floor(bar / (level.altEvery || 1)) % 2 === 0 ? 'rh' : 'lh';
  };

  const melodyFor = (hand) => (hand === 'rh' ? level.rh : level.lh);
  const measures = [];
  let prevVoicing = null;
  let firstMelodyBar = true;

  for (let bar = 0; bar < bars; bar++) {
    const chordRoot = prog[bar];
    const isLast = bar === bars - 1;
    const hand = melodyHand(bar);
    const spec = melodyFor(hand);
    const walker = hand === 'rh' ? rhWalker : lhWalker;
    const measure = {};

    // Melody bar.
    let patterns = allowedPatterns(time, spec.rhythms);
    if (isLast) {
      const endings = patterns.filter((p) => p[p.length - 1] >= Math.min(2, measureBeats / 2));
      patterns = endings.length ? endings : [[measureBeats]];
    }
    if (!patterns.length) patterns = [[measureBeats]];
    const pattern = weightedPick(rng, patterns, (p) => Math.sqrt(p.length));
    let notes = melodyBar(ctx, walker, chordRoot, pattern, { isFirst: firstMelodyBar, isLast });
    firstMelodyBar = false;
    if (level.chromatic) notes = addChromatics(ctx, notes, new Set(spec.rhythms));
    const melodyEvents = notes.map((n) => {
      const degrees = [n.degree];
      const alters = [n.alter];
      if (hand === 'rh' && level.rhDyads && n.strong && !n.rest && !n.chromatic && rng() < level.rhDyads) {
        const below = n.degree - 2;
        if (degMidi(info, below) >= spec.range[0]) {
          degrees.push(below);
          alters.push(alterFor(info, chordRoot, below));
        }
      }
      return toEvent(info, n.beats, degrees, alters, n.rest);
    });

    if (level.hands === 'both') {
      measure.treble = [melodyEvents];
      const lh = lhBar(ctx, chordRoot, prevVoicing, isLast);
      prevVoicing = lh.voicing;
      measure.bass = [lh.notes.map((n) => toEvent(info, n.beats, n.degrees, n.alters, false))];
    } else {
      for (const clef of level.staves) {
        const owns = (clef === 'treble') === (hand === 'rh');
        measure[clef] = [owns ? melodyEvents : barRest(measureBeats)];
      }
    }
    measures.push(measure);
  }

  return {
    id: `gen-${Math.floor(rng() * 1e9).toString(36)}`,
    title: `Study in ${KEY_NAMES[key] || key}`,
    subtitle: `${time} · generated`,
    kind: 'generated',
    key,
    time,
    tempo: level.tempo,
    staves: level.staves,
    measures,
  };
}

// Small deterministic PRNG for tests and "retry the same exercise".
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
