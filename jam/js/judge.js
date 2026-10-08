// Ghost Jam: what counts as "playing the chord", and how each chord is graded.
// Pure logic, no DOM and no audio, so it can be unit tested.
//
// The band's bass already plays the root, so the root is optional for you.
// What you must hold are the chord's defining tones: the 3rd and 5th of a
// triad, the 3rd and 7th of a seventh chord (plus the 5th when it is altered,
// as in ø or dim). Extensions (9ths, 11ths, 13ths, altered tones on a
// dominant) are "colour": never wrong, worth a small bonus.
//
// Times are in milliseconds on one clock (the caller converts MIDI and audio
// times to it). A chord "slot" runs from `start` to `end`; you may anticipate
// it by up to half a beat, as pianists do, so a note-on belongs to the slot
// whose window [start - antic, end - antic) contains it.

import { CHORD_FORMULAS, noteToPitchClass } from '../../js/core/theory.js';

// Extensions allowed on top of each quality, as semitones above the root.
const COLOURS = {
  maj:   [2, 9, 11],          // add9, 6, maj7
  min:   [2, 5, 9, 10],       // 9, 11, 13, b7
  dim:   [9],                 // dim7
  aug:   [2, 10, 11],
  maj7:  [2, 6, 9],           // 9, #11, 13
  min7:  [2, 5, 9],           // 9, 11, 13
  dom7:  [1, 2, 3, 6, 8, 9],  // b9, 9, #9, #11, b13, 13
  m7b5:  [2, 5, 8],           // 9, 11, b13
  mMaj7: [2, 5, 9],
};

// Fifths that define the chord's sound and so are required.
const ALTERED_FIFTH = new Set(['dim', 'aug', 'm7b5']);

export function chordTargets(chord) {
  const rootPc = noteToPitchClass(chord.root);
  const intervals = CHORD_FORMULAS[chord.quality].intervals;
  const pc = (i) => (rootPc + i) % 12;
  const tones = new Set(intervals.map(pc));
  const required = new Set();
  intervals.forEach((iv, idx) => {
    if (idx === 0) return;                                   // root: the bass has it
    const isFifth = iv === 6 || iv === 7 || iv === 8;
    if (isFifth && intervals.length === 4 && !ALTERED_FIFTH.has(chord.quality)) return;
    required.add(pc(iv));
  });
  const colours = new Set((COLOURS[chord.quality] || []).map(pc).filter((p) => !tones.has(p)));
  return { root: rootPc, tones, required, colours };
}

// Classify one pitch class against a chord.
export function toneRole(targets, pc) {
  if (targets.tones.has(pc)) return 'tone';
  if (targets.colours.has(pc)) return 'colour';
  return 'wrong';
}

export const GRADES = ['perfect', 'good', 'late', 'miss'];
export const POINTS = { perfect: 300, good: 150, late: 50, miss: 0 };
export const COLOUR_BONUS = 25;

// Timing windows, in beats from the chord's downbeat.
export const WINDOW = { antic: 0.5, perfect: 0.25, good: 1 };

// Where a hit lands on the timing gauge, in beats from the downbeat.
// Anything before -antic belongs to the previous chord.
export function timingZone(offsetBeats) {
  const o = offsetBeats;
  if (o === null || o === undefined) return null;
  if (Math.abs(o) <= WINDOW.perfect) return 'perfect';
  if (o < 0) return 'early';
  if (o <= WINDOW.good) return 'good';
  return 'late';
}

export class SlotJudge {
  constructor({ chord, start, end, beatMs }) {
    this.chord = chord;
    this.targets = chordTargets(chord);
    this.start = start;
    this.end = end;
    this.beatMs = beatMs;
    this.hitAt = null;
    this.wrong = 0;
    this.notes = 0;
    this.colours = new Set();
    this.done = false;
  }

  get windowStart() { return this.start - WINDOW.antic * this.beatMs; }
  get windowEnd() { return this.end - WINDOW.antic * this.beatMs; }
  owns(t) { return t >= this.windowStart && t < this.windowEnd; }

  // A key went down at time t; `held` is every pitch class held right now
  // (including this one). Returns the note's role for live feedback.
  noteOn(pc, t, held) {
    this.notes++;
    const role = toneRole(this.targets, pc);
    if (role === 'wrong') this.wrong++;
    if (role === 'colour') this.colours.add(pc);
    if (this.hitAt === null && [...this.targets.required].every((p) => held.has(p))) this.hitAt = t;
    return role;
  }

  // Offset of the hit from the downbeat, in beats (negative = anticipated).
  get offsetBeats() {
    return this.hitAt === null ? null : (this.hitAt - this.start) / this.beatMs;
  }

  result() {
    this.done = true;
    const off = this.offsetBeats;
    let grade;
    if (off === null || this.wrong >= 3) grade = 'miss';
    else if (Math.abs(off) <= WINDOW.perfect && this.wrong === 0) grade = 'perfect';
    else if (off <= WINDOW.good && this.wrong <= 1) grade = 'good';
    else grade = 'late';
    const bonus = grade === 'miss' ? 0 : Math.min(3, this.colours.size) * COLOUR_BONUS;
    return { grade, offsetBeats: off, wrong: this.wrong, colours: this.colours.size, base: POINTS[grade], bonus };
  }
}

// ---- Scoring across a set ----

export function multiplier(combo) {
  return Math.min(8, 1 + Math.floor(combo / 4));
}

// Band energy 0..5 (see TIERS in styles.js). Starts at 1 (drums, bass,
// keys); every 4 chords in a row brings one more player in, a miss sends
// one home.
export const ENERGY_STEP = 4;
export function nextEnergy(energy, grade, combo) {
  if (grade === 'miss') return Math.max(0, energy - 1);
  const earned = Math.min(5, 1 + Math.floor(combo / ENERGY_STEP));
  return Math.max(energy, earned);
}

export class Scorer {
  constructor() {
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.energy = 1;
    this.counts = { perfect: 0, good: 0, late: 0, miss: 0 };
  }

  add(res) {
    this.counts[res.grade]++;
    if (res.grade === 'miss') this.combo = 0;
    else if (res.grade !== 'late') this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const gained = (res.base + res.bonus) * multiplier(this.combo);
    this.score += gained;
    this.energy = nextEnergy(this.energy, res.grade, this.combo);
    return gained;
  }

  get total() { return Object.values(this.counts).reduce((a, b) => a + b, 0); }

  // Share of chords landed (anything but a miss), weighted like a rhythm game.
  get accuracy() {
    const n = this.total;
    if (!n) return 0;
    const c = this.counts;
    return (c.perfect + c.good * 0.75 + c.late * 0.4) / n;
  }

  // Letter rank for the results screen.
  get rank() {
    const a = this.accuracy;
    if (this.counts.miss === 0 && this.counts.late === 0 && this.total > 0 && this.counts.good === 0) return 'S';
    if (a >= 0.9) return 'A';
    if (a >= 0.75) return 'B';
    if (a >= 0.55) return 'C';
    return 'D';
  }
}
