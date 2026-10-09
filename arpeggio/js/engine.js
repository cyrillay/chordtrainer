// Arpeggio tasks + live note matching. Pure logic, no DOM: the page feeds
// note-on events in and renders whatever the matcher reports.
//
// A task is one chord to arpeggiate in a given direction, starting on a given
// chord tone. Validation is pitch-class + direction based: any octave, and
// each next chord tone may be played in any octave as long as it moves the
// right way from the previous correct note.

import { CHORD_FORMULAS, buildChord, spellChordTones, chordRootDisplay } from '../../js/core/theory.js';

export const DIRECTIONS = ['up', 'down', 'updown'];
export const STARTS = ['root', 'third', 'fifth', 'seventh'];

const DEGREE_NAMES = ['root', '3rd', '5th', '7th'];

// 'top' = highest chord tone (5th of a triad, 7th of a seventh chord).
// 'seventh' on a triad falls back to the 5th so a mixed pool never stalls.
export function startIndex(start, size) {
  switch (start) {
    case 'root': return 0;
    case 'third': return 1;
    case 'fifth': return 2;
    case 'seventh':
    case 'top': return size - 1;
    default: return Math.max(0, Math.min(size - 1, start | 0));
  }
}

export function degreeName(index) {
  return DEGREE_NAMES[index] || '?';
}

// Chord-tone indices visited, in order.
export function toneOrder(size, direction, start) {
  const up = [], down = [];
  for (let k = 0; k < size; k++) {
    up.push((start + k) % size);
    down.push((start - k + size) % size);
  }
  if (direction === 'down') return down;
  if (direction === 'updown') return up.concat(up.slice(0, -1).reverse());
  return up;
}

// Direction of the move *into* step k (k ≥ 1).
function stepDirection(direction, size, k) {
  if (direction === 'down') return 'down';
  if (direction === 'updown') return k < size ? 'up' : 'down';
  return 'up';
}

export function buildTask({ root, quality, direction, start, rootDisplay }) {
  const chord = buildChord(root, quality, 0);
  chord.rootDisplay = rootDisplay || chordRootDisplay(root, quality);
  const size = chord.orderedNotes.length;
  const startIdx = startIndex(start, size);
  const spelled = spellChordTones(chord);
  const order = toneOrder(size, direction, startIdx);
  const steps = order.map((tone, k) => ({
    pc: chord.orderedNotes[tone],
    tone,
    label: spelled[tone].display,
    degree: degreeName(tone),
    dir: k === 0 ? null : stepDirection(direction, size, k),
  }));
  return {
    key: weakKey({ root, quality, direction, start: startIdx }),
    root, quality, direction,
    start: startIdx,
    startName: degreeName(startIdx),
    size,
    chord,
    steps,
  };
}

// Stable identifier for a (chord, pattern) combination — used by the weak
// spots tracker. Start is stored as a tone index so 'top' and 'seventh' on
// the same chord collapse to one key.
export function weakKey({ root, quality, direction, start }) {
  return `${root}|${quality}|${direction}|${start}`;
}

export function parseWeakKey(key) {
  const [root, quality, direction, start] = key.split('|');
  return { root, quality, direction, start: Number(start) };
}

export class ArpeggioMatcher {
  constructor(task) {
    this.task = task;
    this.index = 0;
    this.mistakes = 0;
    this.lastMidi = null;
    this.notes = [];       // correct notes: { midi, velocity, t }
    this.wrong = [];       // wrong notes: { midi, t, reason }
    this.firstAt = null;
    this.doneAt = null;
  }

  get done() { return this.index >= this.task.steps.length; }
  get expected() { return this.task.steps[this.index] || null; }

  // The closest key the next note can be, once one note has been played (used
  // for the guide-key hint; farther octaves in the right direction count too).
  // Before the first note any octave works, so this returns null.
  expectedMidi() {
    const step = this.expected;
    if (!step || this.lastMidi === null) return null;
    const last = this.lastMidi;
    if (step.dir === 'up') {
      let m = last + 1;
      while (m % 12 !== step.pc) m++;
      return m;
    }
    let m = last - 1;
    while (((m % 12) + 12) % 12 !== step.pc) m--;
    return m;
  }

  press(midi, velocity = 64, t = 0) {
    if (this.done) return { type: 'ignore' };
    // Re-striking the last correct key is harmless (a stutter, not a mistake).
    if (midi === this.lastMidi) return { type: 'ignore' };

    const step = this.expected;
    const reason = this.check(step, midi);
    if (reason) {
      this.mistakes++;
      this.wrong.push({ midi, t, reason });
      return { type: 'wrong', reason, index: this.index };
    }

    if (this.firstAt === null) this.firstAt = t;
    this.notes.push({ midi, velocity, t });
    this.lastMidi = midi;
    const index = this.index++;
    if (this.done) this.doneAt = t;
    return { type: 'correct', index, done: this.done };
  }

  check(step, midi) {
    if (midi % 12 !== step.pc) return 'pitch';
    if (step.dir === null) return null;
    const delta = midi - this.lastMidi;
    if (step.dir === 'up' && delta <= 0) return 'direction';
    if (step.dir === 'down' && delta >= 0) return 'direction';
    return null;
  }

  result() {
    const durationMs = this.doneAt !== null && this.firstAt !== null ? this.doneAt - this.firstAt : 0;
    const gaps = [];
    for (let i = 1; i < this.notes.length; i++) gaps.push(this.notes[i].t - this.notes[i - 1].t);
    return {
      task: this.task,
      clean: this.mistakes === 0,
      mistakes: this.mistakes,
      correct: this.notes.length,
      notes: this.notes,
      wrong: this.wrong,
      durationMs,
      gaps,
      avgGapMs: gaps.length ? durationMs / gaps.length : 0,
    };
  }
}

// ---- Scoring ----

export function comboMultiplier(combo) {
  return Math.min(4, 1 + Math.floor(combo / 4) * 0.5);
}

// Points for one completed arpeggio. `combo` is the streak *including* this
// arpeggio when clean.
export function scoreArpeggio(result, combo) {
  if (!result.clean) return Math.max(10, 50 - result.mistakes * 10);
  const speed = result.avgGapMs > 0 ? Math.max(0, Math.min(60, Math.round((700 - result.avgGapMs) / 8))) : 0;
  return Math.round((100 + speed) * comboMultiplier(combo));
}

// Stars for a finished level. Accuracy is correct notes over all notes
// played; three stars also needs a steady tempo.
export const STAR_RULES = { one: 0.8, two: 0.92, three: 0.98, threeGapMs: 600 };

export function starsFor({ accuracy, avgGapMs, timeouts = 0 }) {
  if (accuracy < STAR_RULES.one) return 0;
  if (accuracy >= STAR_RULES.three && avgGapMs <= STAR_RULES.threeGapMs && timeouts === 0) return 3;
  if (accuracy >= STAR_RULES.two) return 2;
  return 1;
}

export function chordSize(quality) {
  return CHORD_FORMULAS[quality].intervals.length;
}
