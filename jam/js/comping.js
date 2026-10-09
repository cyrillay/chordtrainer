// Ghost Jam spike: comping on a rhythm instead of one chord on the one.
//
// A comp is the rhythm you play each chord on, written on a two bar cycle
// of sixteenths (16 steps a bar), since the clave takes two bars. `push` is
// the anticipation, in steps: a stab that falls `push` steps or less before
// a chord change already belongs to the next chord. That is how a montuno
// or a bossa comp lands the new chord on the "and of 4" before its bar.
//
// Pure logic, no audio and no DOM, like judge.js: the prototype page in
// docs/mockups/ plays the band and draws the grid.

import { chordTargets, toneRole, COLOUR_BONUS, POINTS } from './judge.js';

export const STEPS = 16;

// Windows around each stab, in beats. Tighter than the single hit of
// judge.js: stabs can be an eighth apart.
const TIGHT = { early: 0.25, perfect: 0.125, late: 0.25 };
const LOOSE = { early: 0.5, perfect: 0.25, late: 1 };

// The comps of each groove, easiest first.
export const COMPS = {
  bossa: [
    { id: 'one', name: 'On the one', blurb: 'One chord, on the downbeat. Today\'s game.',
      bars: [[0], [0]], push: 0, window: LOOSE },
    { id: 'tresillo', name: 'Tresillo', blurb: '3 + 3 + 2. The cell under every Latin groove.',
      bars: [[0, 6, 12], [0, 6, 12]], push: 0, window: TIGHT },
    { id: 'pushed', name: 'Anticipated', blurb: 'The chord lands on the and of 4, before its bar.',
      bars: [[6, 14], [6, 14]], push: 2, window: TIGHT },
    { id: 'clave', name: 'Bossa clave', blurb: 'With the rim: 3 + 3 + 4 + 3 + 3.',
      bars: [[0, 3, 6, 10, 13], [0, 3, 6, 10, 13]], push: 0, window: TIGHT },
  ],
  salsa: [
    { id: 'one', name: 'On the one', blurb: 'One chord, on the downbeat. Today\'s game.',
      bars: [[0], [0]], push: 0, window: LOOSE },
    { id: 'clave', name: 'Son clave 2-3', blurb: 'Two strokes, then three. Play with the clave.',
      bars: [[4, 8], [0, 6, 12]], push: 0, window: TIGHT },
    { id: 'montuno', name: 'Montuno', blurb: 'Every and. The new chord comes on the and of 4.',
      bars: [[2, 6, 10, 14], [2, 6, 10, 14]], push: 2, window: TIGHT },
  ],
};

export const compById = (style, id) => COMPS[style].find((c) => c.id === id) || COMPS[style][0];

// The stabs of chord slot k, in beats from the slot's downbeat (negative
// when pushed into the bar before). Bar 0 is the slot 0 downbeat; the
// count-in bar is -1, so slot 0 can be anticipated too.
export function stabsFor(comp, k, barsPerChord = 1) {
  const span = STEPS * barsPerChord;
  const out = [];
  for (let bar = k * barsPerChord - 1; bar < (k + 1) * barsPerChord; bar++) {
    for (const p of comp.bars[((bar % 2) + 2) % 2]) {
      const s = bar * STEPS + p;
      if (Math.floor((s + comp.push) / span) === k) out.push((s - k * span) / 4);
    }
  }
  return out;
}

// Every stab of the first `slots` slots, in beats from the slot 0 downbeat,
// with the slot it belongs to. Sorted by time.
export function stabTimeline(comp, slots, barsPerChord = 1) {
  const out = [];
  for (let k = 0; k < slots; k++) {
    for (const b of stabsFor(comp, k, barsPerChord)) out.push({ slot: k, beat: k * barsPerChord * 4 + b });
  }
  return out.sort((a, b) => a.beat - b.beat);
}

// Which stab a moment belongs to: the nearest one whose window holds it.
// `beat` is in beats from the slot 0 downbeat. Returns an index or -1.
export function stabAt(timeline, beat, window) {
  let best = -1;
  let dist = Infinity;
  timeline.forEach((s, i) => {
    const off = beat - s.beat;
    if (off < -window.early || off > window.late) return;
    if (Math.abs(off) < dist) { dist = Math.abs(off); best = i; }
  });
  return best;
}

// Note-ons closer than this are one chord, rolled or not.
const CLUSTER_MS = 70;

// Grades one chord played on a comp. Same result shape as SlotJudge, so the
// Scorer, the HUD and the achievements keep working, plus `stabs`.
export class CompJudge {
  constructor({ chord, prevChord = null, start, beatMs, stabs, window = TIGHT }) {
    this.chord = chord;
    this.targets = chordTargets(chord);
    this.prevTargets = prevChord ? chordTargets(prevChord) : null;
    this.start = start;            // ms of the slot's downbeat
    this.beatMs = beatMs;
    this.window = window;
    this.stabs = stabs.map((beat) => ({ beat, attackAt: null, landed: null }));
    this.wrong = 0;
    this.stray = 0;
    this.notes = 0;
    this.colours = new Set();
    this.lastNoteAt = -Infinity;
    this.done = false;
  }

  // Index of the stab whose window holds time t (ms), or -1.
  stabIndex(t) {
    const beat = (t - this.start) / this.beatMs;
    return stabAt(this.stabs, beat, this.window);
  }

  // A key went down at time t (ms); `held` is every pitch class held now.
  // Returns { role, stab, landed } for live feedback: stab is -1 off the
  // pattern, landed true when this note completed the stab.
  noteOn(pc, t, held) {
    this.notes++;
    let role = toneRole(this.targets, pc);
    if (role === 'wrong' && this.prevTargets && t < this.start + this.stabs[0].beat * this.beatMs) {
      const prev = toneRole(this.prevTargets, pc);
      if (prev !== 'wrong') role = prev;          // still on the previous chord
    }
    if (role === 'wrong') this.wrong++;
    if (role === 'colour') this.colours.add(pc);
    const i = this.stabIndex(t);
    const fresh = t - this.lastNoteAt > CLUSTER_MS;
    this.lastNoteAt = t;
    if (i < 0) {
      if (fresh) this.stray++;
      return { role, stab: -1, landed: false };
    }
    const s = this.stabs[i];
    if (s.attackAt === null || fresh && s.landed === null) s.attackAt = t;
    let landed = false;
    if (s.landed === null && [...this.targets.required].every((p) => held.has(p))) {
      s.landed = (s.attackAt - this.start) / this.beatMs - s.beat;
      landed = true;
    }
    return { role, stab: i, landed };
  }

  // Mean offset of the landed stabs, in beats (negative = ahead).
  get offsetBeats() {
    const offs = this.stabs.filter((s) => s.landed !== null).map((s) => s.landed);
    return offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : null;
  }

  result() {
    this.done = true;
    const landed = this.stabs.filter((s) => s.landed !== null);
    const share = landed.length / this.stabs.length;
    const tight = landed.every((s) => Math.abs(s.landed) <= this.window.perfect);
    let grade;
    if (!landed.length || this.wrong >= 3) grade = 'miss';
    else if (share === 1 && tight && this.wrong === 0 && this.stray === 0) grade = 'perfect';
    else if (share >= 0.75 && this.wrong <= 1) grade = 'good';
    else if (share >= 0.4) grade = 'late';
    else grade = 'miss';
    const bonus = grade === 'miss' ? 0 : Math.min(3, this.colours.size) * COLOUR_BONUS;
    return {
      grade, offsetBeats: this.offsetBeats, wrong: this.wrong, stray: this.stray,
      colours: this.colours.size, base: POINTS[grade], bonus,
      stabs: this.stabs.map((s) => ({ beat: s.beat, offset: s.landed })),
    };
  }
}
