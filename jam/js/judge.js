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
//
// The old chord still rings until the next downbeat, so in that half beat a
// note that fits the previous chord is not held against the new one: you can
// keep improvising on the current chord right up to beat 1.

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

// What a pitch class does in a chord, for the colour code on the keys:
// root, major or minor 3rd, 5th, major or minor 7th, another allowed
// extension, or wrong. A 7th you add to a triad still counts as a 7th.
export const DEGREES = ['root', 'M3', 'm3', 'P5', 'M7', 'm7', 'ext', 'wrong'];
const DEGREE_OF = { 0: 'root', 3: 'm3', 4: 'M3', 6: 'P5', 7: 'P5', 8: 'P5', 10: 'm7', 11: 'M7' };
export function toneDegree(chord, pc) {
  const t = chordTargets(chord);
  const role = toneRole(t, pc);
  if (role === 'wrong') return 'wrong';
  const iv = (pc - t.root + 12) % 12;
  if (role === 'colour') return iv === 10 || iv === 11 ? DEGREE_OF[iv] : 'ext';
  return DEGREE_OF[iv] || 'ext';
}

// Where to put your hands for a chord: close position from the root, the
// root in the octave from C3, so the hint sits around middle C.
export const HINT_LOW = 48;
export function hintVoicing(chord) {
  const root = HINT_LOW + noteToPitchClass(chord.root);
  return CHORD_FORMULAS[chord.quality].intervals.map((iv) => root + iv);
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
  constructor({ chord, start, end, beatMs, prevChord = null }) {
    this.chord = chord;
    this.targets = chordTargets(chord);
    this.prevTargets = prevChord ? chordTargets(prevChord) : null;
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
    if (role === 'wrong' && t < this.start && this.prevTargets) {
      const prev = toneRole(this.prevTargets, pc);
      if (prev !== 'wrong') return prev;   // still on the previous chord
    }
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

// Band heat, counted in chords. It fills the ghosts left to right: drums
// and bass are always lit, then the keys over HEAT.ghost chords, then the
// guest over as many again. Each chord landed in time adds one, a late one
// adds nothing, a miss drains HEAT.miss. A ghost joins once it is fully lit
// and leaves only once it is fully dark, so a half lit ghost keeps doing
// what it was doing. The band heats up halfway through the guest.
export const HEAT = { ghost: 8, miss: 4, start: 8 };
export const HEAT_MAX = 2 * HEAT.ghost;

export function nextHeat(heat, grade) {
  if (grade === 'miss') return Math.max(0, heat - HEAT.miss);
  if (grade === 'late') return heat;
  return Math.min(HEAT_MAX, heat + 1);
}

// How lit each ghost is, 0..1.
export function ghostFill(heat) {
  const part = (i) => Math.max(0, Math.min(1, (heat - i * HEAT.ghost) / HEAT.ghost));
  return { drums: 1, bass: 1, keys: part(0), guest: part(1) };
}

// Band energy 0..3 (see TIERS in styles.js) from the heat, given the
// energy before: that is who is on stage now.
export function energyAt(heat, prev) {
  const keysIn = prev >= 1 ? heat > 0 : heat >= HEAT.ghost;
  const guestIn = prev >= 3 ? heat > HEAT.ghost : heat >= HEAT_MAX;
  if (guestIn) return 3;
  if (!keysIn) return 0;
  return heat >= HEAT.ghost * 1.5 ? 2 : 1;
}

export class Scorer {
  constructor() {
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.heat = HEAT.start;
    this.energy = energyAt(this.heat, 1);
    this.counts = { perfect: 0, good: 0, late: 0, miss: 0 };
  }

  add(res) {
    this.counts[res.grade]++;
    if (res.grade === 'miss') this.combo = 0;
    else if (res.grade !== 'late') this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const gained = (res.base + res.bonus) * multiplier(this.combo);
    this.score += gained;
    this.heat = nextHeat(this.heat, res.grade);
    this.energy = energyAt(this.heat, this.energy);
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
