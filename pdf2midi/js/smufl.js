// SMuFL (Standard Music Font Layout) code points we understand. Every modern
// notation program — MuseScore (Leland, Bravura, Emmentaler), Dorico
// (Bravura), Sibelius 2024+, Finale 27 (Finale Maestro), … — draws its music
// symbols from these Private Use Area slots, so one table covers them all.
//
// SMuFL glyph conventions used by the recogniser:
//  - a glyph's origin is its left edge;
//  - noteheads, accidentals and dots are vertically centred on their origin
//    (so origin.y is the staff position);
//  - clefs sit on their reference line (G line, F line, C line);
//  - 1 em = 4 staff spaces.

// Notehead → duration in quarter notes before beams/flags/dots.
export const NOTEHEADS = {
  0xE0A0: 8,   // noteheadDoubleWhole
  0xE0A1: 8,   // noteheadDoubleWholeSquare
  0xE0A2: 4,   // noteheadWhole
  0xE0A3: 2,   // noteheadHalf
  0xE0A4: 1,   // noteheadBlack
  0xE0A7: 8,   // noteheadXDoubleWhole
  0xE0A8: 4,   // noteheadXWhole
  0xE0A9: 1,   // noteheadXBlack (half/quarter indistinguishable → stem decides)
  0xE0B5: 4,   // noteheadWholeWithX
  0xE0B6: 2,   // noteheadHalfWithX
  0xE0B7: 1,   // noteheadVoidWithX
  0xE0FA: 4,   // noteheadWholeFilled
  0xE0FB: 2    // noteheadHalfFilled
};

// Rest glyph → duration in quarter notes.
export const RESTS = {
  0xE4E2: 8,       // restDoubleWhole
  0xE4E3: 4,       // restWhole (also used for full-measure rests)
  0xE4E4: 2,       // restHalf
  0xE4E5: 1,       // restQuarter
  0xE4E6: 1 / 2,   // rest8th
  0xE4E7: 1 / 4,   // rest16th
  0xE4E8: 1 / 8,   // rest32nd
  0xE4E9: 1 / 16,  // rest64th
  0xE4EA: 1 / 32   // rest128th
};

// Accidental → semitone alteration.
export const ACCIDENTALS = {
  0xE260: -1,  // accidentalFlat
  0xE261: 0,   // accidentalNatural
  0xE262: 1,   // accidentalSharp
  0xE263: 2,   // accidentalDoubleSharp
  0xE264: -2   // accidentalDoubleFlat
};

// Clef → reference pitch on the line the glyph sits on, as a diatonic index
// (octave * 7 + letter, C = 0). G4 = 4*7+4 = 32, F3 = 3*7+3 = 24, C4 = 28.
const G4 = 32, F3 = 24, C4 = 28;
export const CLEFS = {
  0xE050: { ref: G4, name: 'treble' },          // gClef
  0xE051: { ref: G4 - 14, name: 'treble 15mb' },
  0xE052: { ref: G4 - 7, name: 'treble 8vb' },
  0xE053: { ref: G4 + 7, name: 'treble 8va' },
  0xE054: { ref: G4 + 14, name: 'treble 15ma' },
  0xE05C: { ref: C4, name: 'C' },               // cClef
  0xE05D: { ref: C4 - 7, name: 'C 8vb' },
  0xE062: { ref: F3, name: 'bass' },            // fClef
  0xE063: { ref: F3 - 14, name: 'bass 15mb' },
  0xE064: { ref: F3 - 7, name: 'bass 8vb' },
  0xE065: { ref: F3 + 7, name: 'bass 8va' },
  0xE066: { ref: F3 + 14, name: 'bass 15ma' }
};

export const AUGMENTATION_DOT = 0xE1E7;

// Flags: E240 flag8thUp, E241 flag8thDown, E242 flag16thUp, … Each pair adds
// one beam-equivalent.
export function flagLevel(cp) {
  if (cp < 0xE240 || cp > 0xE24F) return 0;
  return Math.floor((cp - 0xE240) / 2) + 1;
}

// Time signature digits (timeSig0…timeSig9) plus common / cut time.
export function timeSigDigit(cp) {
  if (cp >= 0xE080 && cp <= 0xE089) return cp - 0xE080;
  return null;
}
export const TIMESIG_COMMON = 0xE08A;
export const TIMESIG_CUT = 0xE08B;

// Tuplet numbers (tuplet0…tuplet9).
export function tupletDigit(cp) {
  if (cp >= 0xE880 && cp <= 0xE889) return cp - 0xE880;
  return null;
}

// Arpeggio wiggles: EAA9 up, EAAA down, EAAB/EAAC swashes, EAAD/EAAE arrows.
export function arpeggioDirection(cp) {
  if (cp === 0xEAA9 || cp === 0xEAAB || cp === 0xEAAD) return 'up';
  if (cp === 0xEAAA || cp === 0xEAAC || cp === 0xEAAE) return 'down';
  return null;
}

// Metronome-mark note glyphs (metNoteHalfUp, metNoteQuarterUp, metNote8thUp)
// → beat length in quarters.
export const MET_NOTES = {
  0xE1D3: 2, 0xE1D5: 1, 0xE1D7: 0.5,
  // SMuFL 1.4 metronome-mark range (MuseScore 4's LelandText, Bravura Text…).
  0xECA2: 4, 0xECA3: 2, 0xECA4: 2, 0xECA5: 1, 0xECA6: 1, 0xECA7: 0.5, 0xECA8: 0.5
};
export const MET_DOTS = [0xE1E7, 0xECB7];

export function isMusicGlyph(cp) {
  return cp >= 0xE000 && cp <= 0xF8FF;
}
