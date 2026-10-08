// Ghost Jam: what a voicing is worth on top of the chord itself.
// Pure logic, no DOM and no audio, so it can be unit tested.
//
// A voicing is the sorted MIDI notes held when the chord landed. Each tag
// below is worth a few points, capped per chord, and only when every note
// held fits the chord (a wrong note spoils the voicing):
//
//   smooth     every note within a whole step of the last chord you played
//   rootless   no root, the chord's defining tones and a colour (Bill Evans)
//   shell      just the 3rd and the 7th of a seventh chord (root allowed)
//   quartal    three notes or more stacked in fourths ("So What")
//   open       four notes or more spread over more than an octave
//   inversion  the lowest note is the 3rd, 5th or 7th, not the root
//   upper      upper structure: on a dominant, the 3rd and 7th below and a
//              major triad of colours on top (D/C7, A/C7, Ab/C7…)
//
// The bass already has the root, so leaving it out or moving it up costs
// nothing in sound and is what pianists do in a band.

import { CHORD_FORMULAS } from '../../js/core/theory.js';
import { chordTargets, toneRole } from './judge.js';

export const VOICING_POINTS = { upper: 75, smooth: 50, rootless: 50, quartal: 50, shell: 25, open: 25, inversion: 25 };
export const VOICING_CAP = 100;
export const VOICING_LABELS = {
  upper: 'Upper structure', smooth: 'Smooth', rootless: 'Rootless', quartal: 'Quartal', shell: 'Shell', open: 'Open',
};
export const SMOOTH_STEP = 2;   // semitones: a whole step

// Which chord tone is in the bass of your hand: 'root', '3rd', '5th', '7th',
// or null when the lowest note is a colour (or there is no voicing).
const BASS_ROLE = { 0: 'root', 3: '3rd', 4: '3rd', 6: '5th', 7: '5th', 8: '5th', 10: '7th', 11: '7th' };
export function bassRole(chord, voicing) {
  if (!voicing?.length) return null;
  const t = chordTargets(chord);
  const pc = voicing[0] % 12;
  if (!t.tones.has(pc)) return null;
  return BASS_ROLE[(pc - t.root + 12) % 12] || null;
}

export const INVERSION_LABELS = { '3rd': '1st inv.', '5th': '2nd inv.', '7th': '3rd inv.' };

// Every note of b is within `step` semitones of some note of a, and the
// hands did move (holding the very same keys is not voice leading).
export function smoothFrom(a, b, step = SMOOTH_STEP) {
  if (!a?.length || !b?.length || b.length < 2) return false;
  if (a.length === b.length && a.every((m, i) => m === b[i])) return false;
  return b.every((m) => a.some((p) => Math.abs(m - p) <= step));
}

// The top three notes make a major triad, in any inversion within an octave.
function topMajorTriad(voicing) {
  if (voicing.length < 3) return null;
  const top = voicing.slice(-3);
  if (top[2] - top[0] >= 12) return null;
  const pcs = new Set(top.map((m) => m % 12));
  for (const r of pcs) if ([4, 7].every((i) => pcs.has((r + i) % 12))) return [...pcs];
  return null;
}

// Tags earned by a voicing (in the order they are shown) and their points.
// prev: the voicing of the chord just before, if it landed.
export function voicingTags(chord, voicing, prev = null) {
  if (!voicing?.length) return [];
  const t = chordTargets(chord);
  const pcs = voicing.map((m) => m % 12);
  if (pcs.some((pc) => toneRole(t, pc) === 'wrong')) return [];
  const set = new Set(pcs);
  const iv = (pc) => (pc - t.root + 12) % 12;
  const intervals = CHORD_FORMULAS[chord.quality].intervals;
  const seventh = intervals.length === 4;
  const third = intervals.map((i) => (t.root + i) % 12).find((pc) => [3, 4].includes(iv(pc)));
  const sev = seventh ? (t.root + intervals[3]) % 12 : null;
  const hasRequired = [...t.required].every((pc) => set.has(pc));
  const hasColour = pcs.some((pc) => t.colours.has(pc));
  const span = voicing[voicing.length - 1] - voicing[0];

  const tags = [];
  if (smoothFrom(prev, voicing)) tags.push('smooth');
  const rootless = voicing.length >= 3 && !set.has(t.root) && hasRequired && hasColour;
  if (rootless) tags.push('rootless');
  const shell = seventh && voicing.length <= 3 && set.has(third) && set.has(sev)
    && pcs.every((pc) => pc === third || pc === sev || pc === t.root);
  if (shell) tags.push('shell');
  const quartal = voicing.length >= 3 && voicing.every((m, i) => i === 0 || m - voicing[i - 1] === 5);
  if (quartal) tags.push('quartal');
  if (!quartal && voicing.length >= 4 && span > 12) tags.push('open');
  const triad = chord.quality === 'dom7' && voicing.length >= 5 ? topMajorTriad(voicing) : null;
  const below = triad ? new Set(voicing.slice(0, -3).map((m) => m % 12)) : null;
  if (triad && below.has(third) && below.has(sev) && triad.filter((pc) => t.colours.has(pc)).length >= 2) tags.push('upper');
  const bass = bassRole(chord, voicing);
  if (!rootless && !shell && bass && bass !== 'root') tags.push('inversion');
  return tags;
}

export function voicingBonus(tags) {
  return Math.min(VOICING_CAP, tags.reduce((sum, tag) => sum + VOICING_POINTS[tag], 0));
}

// The words on the shout: "Smooth · 1st inv.".
export function voicingWords(tags, bass) {
  return tags.map((tag) => (tag === 'inversion' ? INVERSION_LABELS[bass] : VOICING_LABELS[tag]));
}
