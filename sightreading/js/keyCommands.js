// Commands played on the keyboard itself, so the hands never leave it.
// Pure (no DOM), tested under `node --test`.
//
// Restart = the tonic triad of the piece's key (C E G in C major, A C E in
// A minor), any inversion or doubling, played above every written note so
// it can never be mistaken for a note of the score.

import { keyInfo, keyToMidi, midiName } from './notation.js';

const LOWEST_FLOOR = 72;   // C5: never ask for the chord lower than this

// Pitch classes of the tonic triad, root first.
export function tonicTriad(key) {
  const { tonicPc, minor } = keyInfo(key);
  return [tonicPc, (tonicPc + (minor ? 3 : 4)) % 12, (tonicPc + 7) % 12];
}

// Name of the chord, as the player reads it: "C major", "B♭ major", "F♯ minor".
export function triadName(key) {
  const { minor } = keyInfo(key);
  const root = (minor ? key.slice(0, -1) : key).replace('b', '♭').replace('#', '♯');
  return `${root} ${minor ? 'minor' : 'major'}`;
}

// Lowest MIDI note of the restart zone: above the highest written note.
export function restartFloor(exercise) {
  let top = 0;
  for (const m of exercise.measures) {
    for (const voices of Object.values(m)) {
      for (const v of voices) for (const ev of v) for (const k of ev.keys) top = Math.max(top, keyToMidi(k));
    }
  }
  return Math.max(LOWEST_FLOOR, top + 1);
}

export function restartHint(exercise) {
  return `${triadName(exercise.key)} chord, ${midiName(restartFloor(exercise))} or higher`;
}

// Is this note part of a restart chord (so it shouldn't count as a mistake)?
export function isRestartNote(midi, key, floor) {
  return midi >= floor && tonicTriad(key).includes(midi % 12);
}

// True when the notes held in the restart zone are exactly the tonic triad.
export function isRestartChord(held, key, floor) {
  const pcs = new Set([...held].filter((m) => m >= floor).map((m) => m % 12));
  const triad = tonicTriad(key);
  return pcs.size === 3 && triad.every((pc) => pcs.has(pc));
}
