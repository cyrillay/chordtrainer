// Ghost Jam achievements: what they are and when they are earned.
// Pure logic, no DOM and no storage, so it can be unit tested. The trophy
// case (store, toasts, modal) lives in trophyCase.js.
//
// They reward how you play with the band more than how much: feel (laid
// back, pushing), touch (ghost notes), voicings (shells, planing, smooth
// voice leading), colour, and a few jokes from the basement.

import { MAX_ENERGY } from './styles.js';

// visible: shown with a progress bar (metric + target). secret: a hint until
// earned. ultra: the hard ones.
export const ACH = [
  // ---- On the bill ----
  { id: 'firstGig',   vis: 'visible', icon: '\u{1F3A4}', name: 'First Gig',          desc: 'Play a whole set with the ghosts',                 metric: 'sets',    target: 1 },
  { id: 'fullBand',   vis: 'visible', icon: '\u{1F47B}', name: 'Full House',         desc: 'Bring every ghost on stage',                       metric: 'energy',  target: MAX_ENERGY },
  { id: 'golden',     vis: 'visible', icon: '\u{1F31F}', name: 'Golden Chorus',      desc: 'A whole chorus, every chord Perfect',              metric: 'golden',  target: 1 },
  { id: 'busted',     vis: 'visible', icon: '\u{1F6AB}', name: 'Ghostbuster',        desc: 'Finish a set with rank S',                         metric: 'rankS',   target: 1 },
  { id: 'passport',   vis: 'visible', icon: '\u{1F5FA}\u{FE0F}', name: 'Passport',   desc: 'Finish a set in all six grooves',                  metric: 'grooves', target: 6 },

  // ---- Feel ----
  { id: 'dilla',      vis: 'secret', icon: '\u{1F6CB}\u{FE0F}', name: 'Dilla Time',  desc: 'Eight chords in a row, all laid back behind the beat', hint: 'Lean back. Further. Not too far.' },
  { id: 'pushing',    vis: 'secret', icon: '\u{1F3C3}', name: 'Pushing It',          desc: 'Eight chords in a row, all anticipated',           hint: 'Jump the gun. Every single time.' },
  { id: 'atomic',     vis: 'secret', icon: '\u{269B}\u{FE0F}', name: 'Atomic Clock', desc: 'Four chords in a row within 15 ms of the beat',     hint: 'Caesium has nothing on you.' },
  { id: 'onTheOne',   vis: 'secret', icon: '\u{1F57A}', name: 'On the One',          desc: 'Eight Perfect chords in a row on the funk groove', hint: 'Mr Brown wants it on the one.' },

  // ---- Touch ----
  { id: 'ghostNotes', vis: 'secret', icon: '\u{1FAB6}', name: 'Ghost Notes',         desc: 'Land a chord with every note whispered',           hint: 'Play like one of them.' },
  { id: 'wakeDead',   vis: 'secret', icon: '\u{26B0}\u{FE0F}', name: 'Wake the Dead', desc: 'Land a chord with every note slammed',            hint: 'Loud enough to raise a few.' },
  { id: 'lullaby',    vis: 'secret', icon: '\u{1F319}', name: 'Lullaby',             desc: 'A whole ballad chorus, every note soft',           hint: 'Shh. The ghosts are sleeping.' },

  // ---- Voicings ----
  { id: 'shells',     vis: 'secret', icon: '\u{1F41A}', name: 'Shell Game',          desc: 'Eight chords in a row with just two notes',        hint: 'Two notes are plenty.' },
  { id: 'planing',    vis: 'secret', icon: '\u{1F17F}\u{FE0F}', name: 'Parallel Parking', desc: 'Four chords in a row with one hand shape, slid around', hint: 'Same shape. New spot.' },
  { id: 'butter',     vis: 'secret', icon: '\u{1F9C8}', name: 'Butter',              desc: 'Eight chords in a row, no voice moving more than a whole step', hint: 'Smooth. Really smooth.' },
  { id: 'contortionist', vis: 'secret', icon: '\u{1F938}', name: 'Contortionist',  desc: 'Land the same chord with three different notes in the bass in one set', hint: 'Same chord. Turn it over. And again.' },
  { id: 'upsideDown', vis: 'secret', icon: '\u{1F643}', name: 'Upside Down',         desc: 'Eight chords in a row, never the root in the bass', hint: 'Leave the bottom to the bass player.' },
  { id: 'evans',      vis: 'secret', icon: '\u{1F3B9}', name: 'Left Hand of Bill',   desc: 'A whole chorus of rootless voicings',             hint: 'Who needs a root? Bill did not.' },
  { id: 'tenFingers', vis: 'secret', icon: '\u{1F590}\u{FE0F}', name: 'All Hands on Deck', desc: 'Land a chord with ten notes and none wrong', hint: 'Count your fingers.' },
  { id: 'basement',   vis: 'secret', icon: '\u{1F573}\u{FE0F}', name: 'Basement Tapes', desc: 'A whole chorus voiced below C3',               hint: 'Down where the pipes rattle.' },
  { id: 'attic',      vis: 'secret', icon: '\u{1F987}', name: 'Attic Ghost',         desc: 'A whole chorus voiced above C6',                   hint: 'Up with the bats.' },

  // ---- Colour ----
  { id: 'hotSauce',   vis: 'secret', icon: '\u{1F336}\u{FE0F}', name: 'Hot Sauce',   desc: 'Spicy ×3 on a single chord',                  hint: 'Three colours on one plate.' },
  { id: 'altered',    vis: 'secret', icon: '\u{1F300}', name: 'Altered State',       desc: 'Two altered tensions on a dominant (♭9, ♯9, ♯11, ♭13)', hint: 'Bend the dominant until it squeals.' },
  { id: 'sauceAll',   vis: 'secret', icon: '\u{1F35D}', name: 'Sauce on Everything', desc: 'A whole chorus with colour on every chord',        hint: 'No plain plates tonight.' },

  // ---- Stories ----
  { id: 'lazarus',    vis: 'secret', icon: '\u{1FA7B}', name: 'Back From the Dead',  desc: 'Lose the whole band, then bring them all back',    hint: 'Empty stage. Full stage.' },
  { id: 'stageFright', vis: 'secret', icon: '\u{1F631}', name: 'Stage Fright',       desc: 'Run off during the count-in',                      hint: 'One, two… nope.' },
  { id: 'ghostTown',  vis: 'secret', icon: '\u{1F3DA}\u{FE0F}', name: 'Ghost Town', desc: 'Let the band play a whole set without you',        hint: 'Sometimes they jam alone.' },
  { id: 'encore',     vis: 'secret', icon: '\u{1F44F}', name: 'Encore! Encore!',     desc: 'Play the same tune three times in a row',          hint: 'They want more.' },
  { id: 'lastOrders', vis: 'secret', icon: '\u{1F37A}', name: 'Last Orders',         desc: 'Finish a set between 1 and 5 a.m.',                hint: 'The bar is closed. The band is not.' },

  // ---- Ultra-rare ----
  { id: 'seance',     vis: 'ultra',  icon: '\u{1F52E}', name: 'Séance',              desc: 'Rank S with colour on every chord',                hint: 'Perfect, and spicy, all night long.' },
  { id: 'worldTour',  vis: 'ultra',  icon: '\u{1F30D}', name: 'World Tour',          desc: 'Rank S in all six grooves',                        hint: 'Six rooms. Six crowds. No mistakes.' },
];

// ---- Thresholds ----

export const STREAK = 8;            // feel, shells, butter, on the one
export const SHORT_STREAK = 4;      // atomic clock, planing
export const ATOMIC_MS = 15;
export const SOFT = 40;             // velocity at or under: a ghost note
export const LOUD = 112;            // velocity at or over: slammed
export const LULLABY = 60;
export const LOW = 48;              // C3
export const HIGH = 84;             // C6
const ALTERED = [1, 3, 6, 8];       // b9, #9, #11, b13 above the root

const landed = (c) => c.grade !== 'miss';

// Same intervals above the lowest note.
function shapeOf(voicing) {
  return voicing.map((m) => m - voicing[0]).join(',');
}

// Each voice moves at most `max` semitones from one voicing to the next.
export function smoothMove(a, b, max = 2) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((m, i) => Math.abs(m - b[i]) <= max);
}

// Follows one set. Feed it every graded chord in order, energy changes and
// the end of the set; each call returns the ids it earned (maybe again: the
// trophy case ignores repeats).
export class JamTracker {
  // style: groove id. chorusLen: chords per chorus.
  constructor({ style, chorusLen }) {
    this.style = style;
    this.chorusLen = chorusLen;
    this.chords = [];
    this.chorus = [];
    this.streaks = { dilla: 0, pushing: 0, atomic: 0, onTheOne: 0, shells: 0, planing: 0, butter: 0, upsideDown: 0 };
    this.inversions = new Map(); // chordId -> bass roles it landed with
    this.lastShape = null;
    this.lastVoicing = null;
    this.hitZero = false;
    this.energyBest = 1;
    this.notes = 0;
  }

  // One graded chord. c = {
  //   grade, offsetBeats, offsetMs, colours (count),
  //   voicing (sorted MIDI notes held when it landed, or null),
  //   velocities (of those notes), wrong, colourIntervals (semitones above
  //   the root of every colour tone played), quality,
  //   bass ('root', '3rd', '5th', '7th' or null: see voicing.js),
  //   tags (voicing tags), chordId (same chord, same id) }
  chord(c) {
    const out = [];
    const s = this.streaks;
    const ok = landed(c) && c.voicing && c.voicing.length > 0;
    const step = (name, cond, need, id) => {
      s[name] = cond ? s[name] + 1 : 0;
      if (s[name] >= need) out.push(id);
    };

    step('dilla', ok && c.offsetBeats > 0.25 && c.offsetBeats <= 1, STREAK, 'dilla');
    step('pushing', ok && c.offsetBeats < 0, STREAK, 'pushing');
    step('atomic', ok && Math.abs(c.offsetMs) <= ATOMIC_MS, SHORT_STREAK, 'atomic');
    step('onTheOne', this.style === 'funk' && c.grade === 'perfect', STREAK, 'onTheOne');
    step('shells', ok && c.voicing.length === 2, STREAK, 'shells');
    step('upsideDown', ok && !!c.bass && c.bass !== 'root', STREAK, 'upsideDown');
    if (ok && c.bass && c.chordId) {
      const seen = this.inversions.get(c.chordId) || new Set();
      seen.add(c.bass);
      this.inversions.set(c.chordId, seen);
      if (seen.size >= 3) out.push('contortionist');
    }

    const shape = ok && c.voicing.length >= 3 ? shapeOf(c.voicing) : null;
    const slid = shape && shape === this.lastShape && c.voicing[0] !== this.lastVoicing?.[0];
    s.planing = shape ? (slid ? s.planing + 1 : 1) : 0;
    if (s.planing >= SHORT_STREAK) out.push('planing');
    this.lastShape = shape;

    s.butter = ok ? (smoothMove(this.lastVoicing, c.voicing) ? s.butter + 1 : 1) : 0;
    if (s.butter >= STREAK) out.push('butter');
    this.lastVoicing = ok ? c.voicing : null;

    if (ok) {
      const v = c.velocities || [];
      if (v.length >= 2 && v.every((x) => x <= SOFT)) out.push('ghostNotes');
      if (v.length >= 2 && v.every((x) => x >= LOUD)) out.push('wakeDead');
      if (c.voicing.length >= 10 && c.wrong === 0) out.push('tenFingers');
      if (c.colours >= 3) out.push('hotSauce');
      if (c.quality === 'dom7' && ALTERED.filter((i) => c.colourIntervals?.includes(i)).length >= 2) out.push('altered');
    }

    this.chords.push(c);
    this.chorus.push(c);
    if (this.chorus.length === this.chorusLen) {
      out.push(...this.closeChorus(this.chorus));
      this.chorus = [];
    }
    return out;
  }

  closeChorus(ch) {
    const out = [];
    if (ch.every((c) => c.grade === 'perfect')) out.push('golden');
    if (!ch.every((c) => landed(c) && c.voicing?.length)) return out;
    if (ch.every((c) => c.colours > 0)) out.push('sauceAll');
    if (ch.every((c) => c.tags?.includes('rootless'))) out.push('evans');
    if (ch.every((c) => c.voicing.every((m) => m < LOW))) out.push('basement');
    if (ch.every((c) => c.voicing.every((m) => m >= HIGH))) out.push('attic');
    if (this.style === 'ballad' && ch.every((c) => c.velocities?.length && c.velocities.every((v) => v <= LULLABY))) out.push('lullaby');
    return out;
  }

  // Band energy changed.
  energy(e) {
    const out = [];
    if (e === 0) this.hitZero = true;
    if (e >= MAX_ENERGY && this.hitZero) out.push('lazarus');
    this.energyBest = Math.max(this.energyBest, e);
    return out;
  }

  // Every key pressed during the set, chord or not.
  note() { this.notes++; }

  // End of the set. complete: the band played to the end (not stopped).
  // rank: the scorer's letter. hour: local hour (0..23). encore: how many
  // times in a row this tune was replayed (0 for a fresh start).
  finish({ complete, rank, hour, encore }) {
    const out = [];
    const n = this.chords.length;
    if (!complete) {
      if (n === 0) out.push('stageFright');
      return out;
    }
    if (n > 0 && this.notes === 0) out.push('ghostTown');
    if (encore >= 2) out.push('encore');
    if (hour >= 1 && hour < 5) out.push('lastOrders');
    if (rank === 'S' && n > 0 && this.chords.every((c) => c.colours > 0)) out.push('seance');
    return out;
  }
}
