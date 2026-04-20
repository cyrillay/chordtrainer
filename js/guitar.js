// Guitar fretboard visualization (SVG).
// Shows a single reasonable voicing of the current chord on a 6-string guitar
// in standard tuning. Uses a dictionary of standard shapes for common chords,
// with an algorithmic fallback for uncommon ones.

import { state } from './state.js';
import { pitchClassToDisplay, NOTE_NAMES } from './theory.js';

// Standard tuning, low E to high E (MIDI numbers).
const TUNING = [40, 45, 50, 55, 59, 64];
const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
const NUM_FRETS_VISIBLE = 5;
const MAX_FRET = 14;

// Standard chord voicing dictionary.
// Each entry: array of 6 values (low E to high e): fret number, 0 for open, null for muted.
// Keyed by "root-quality". Root is pitch class (0-11).
const STANDARD_VOICINGS = {
  // C chords
  '0-maj':  [null, 3, 2, 0, 1, 0],
  '0-min':  [null, 3, 1, 0, 1, 3],
  '0-maj7': [null, 3, 2, 0, 0, 0],
  '0-min7': [null, 3, 1, 3, 1, 3],
  '0-dom7': [null, 3, 2, 3, 1, 0],
  '0-dim':  [null, 3, 1, null, 1, null],
  '0-aug':  [null, 3, 2, 1, 1, 0],

  // C#/Db chords (barre on fret 4 for A-shape, fret 1 for others)
  '1-maj':  [null, 4, 3, 1, 2, 1],
  '1-min':  [null, 4, 2, 1, 2, null],
  '1-dom7': [null, 4, 3, 4, 2, 1],

  // D chords
  '2-maj':  [null, null, 0, 2, 3, 2],
  '2-min':  [null, null, 0, 2, 3, 1],
  '2-maj7': [null, null, 0, 2, 2, 2],
  '2-min7': [null, null, 0, 2, 1, 1],
  '2-dom7': [null, null, 0, 2, 1, 2],
  '2-dim':  [null, null, 0, 1, 3, 1],
  '2-aug':  [null, null, 0, 3, 3, 2],

  // Eb/D# chords
  '3-maj':  [null, null, 1, 3, 4, 3],
  '3-min':  [null, null, 1, 3, 4, 2],
  '3-dom7': [null, null, 1, 3, 2, 3],

  // E chords
  '4-maj':  [0, 2, 2, 1, 0, 0],
  '4-min':  [0, 2, 2, 0, 0, 0],
  '4-maj7': [0, 2, 1, 1, 0, 0],
  '4-min7': [0, 2, 0, 0, 0, 0],
  '4-dom7': [0, 2, 0, 1, 0, 0],
  '4-dim':  [null, 2, null, 0, null, 0],
  '4-aug':  [0, 3, 2, 1, 1, 0],

  // F chords
  '5-maj':  [1, 3, 3, 2, 1, 1],
  '5-min':  [1, 3, 3, 1, 1, 1],
  '5-maj7': [null, null, 3, 2, 1, 0],
  '5-min7': [1, 3, 1, 1, 1, 1],
  '5-dom7': [1, 3, 1, 2, 1, 1],
  '5-dim':  [null, null, 3, 1, 0, 1],
  '5-aug':  [null, null, 3, 2, 2, 1],

  // F#/Gb chords
  '6-maj':  [2, 4, 4, 3, 2, 2],
  '6-min':  [2, 4, 4, 2, 2, 2],
  '6-dom7': [2, 4, 2, 3, 2, 2],

  // G chords
  '7-maj':  [3, 2, 0, 0, 0, 3],
  '7-min':  [3, 5, 5, 3, 3, 3],
  '7-maj7': [3, 2, 0, 0, 0, 2],
  '7-min7': [3, 5, 3, 3, 3, 3],
  '7-dom7': [3, 2, 0, 0, 0, 1],
  '7-dim':  [null, null, 5, 3, 2, 3],
  '7-aug':  [3, 2, 1, 0, 0, 3],

  // Ab/G# chords
  '8-maj':  [4, 6, 6, 5, 4, 4],
  '8-min':  [4, 6, 6, 4, 4, 4],
  '8-dom7': [4, 6, 4, 5, 4, 4],

  // A chords
  '9-maj':  [null, 0, 2, 2, 2, 0],
  '9-min':  [null, 0, 2, 2, 1, 0],
  '9-maj7': [null, 0, 2, 1, 2, 0],
  '9-min7': [null, 0, 2, 0, 1, 0],
  '9-dom7': [null, 0, 2, 0, 2, 0],
  '9-dim':  [null, 0, 1, 2, 1, null],
  '9-aug':  [null, 0, 3, 2, 2, 1],

  // Bb/A# chords
  '10-maj': [null, 1, 3, 3, 3, 1],
  '10-min': [null, 1, 3, 3, 2, 1],
  '10-dom7':[null, 1, 3, 1, 3, 1],
  '10-maj7':[null, 1, 3, 2, 3, 1],
  '10-min7':[null, 1, 3, 1, 2, 1],

  // B chords
  '11-maj': [null, 2, 4, 4, 4, 2],
  '11-min': [null, 2, 4, 4, 3, 2],
  '11-dom7':[null, 2, 1, 2, 0, 2],
  '11-maj7':[null, 2, 4, 3, 4, 2],
  '11-min7':[null, 2, 0, 2, 0, 2],
  '11-dim': [null, 2, 3, 4, 3, null],
};

function lookupVoicing(rootPc, quality) {
  const key = `${rootPc}-${quality}`;
  return STANDARD_VOICINGS[key] || null;
}

function voicingFromDict(dictEntry, rootPc) {
  const positions = [];
  const muted = [];
  for (let s = 0; s < 6; s++) {
    const fret = dictEntry[s];
    if (fret === null) {
      muted.push(s);
    } else {
      const pc = (TUNING[s] + fret) % 12;
      positions.push({ string: s, fret, pc });
    }
  }
  return { positions, muted };
}

// Algorithmic fallback for chords without a dictionary entry.
function buildGuitarVoicing(orderedNotes) {
  if (!orderedNotes || orderedNotes.length === 0) return { positions: [], muted: [] };
  const chordPcs = new Set(orderedNotes);
  const bassPc = orderedNotes[0];

  let bassString = -1, bassFret = -1;
  for (let s = 0; s < 3; s++) {
    const openPc = TUNING[s] % 12;
    const fret = (bassPc - openPc + 12) % 12;
    if (fret <= 5 && (bassString < 0 || fret < bassFret)) {
      bassString = s;
      bassFret = fret;
    }
  }
  if (bassString < 0) {
    for (let s = 0; s < 6; s++) {
      const openPc = TUNING[s] % 12;
      const fret = (bassPc - openPc + 12) % 12;
      if (fret <= MAX_FRET && (bassString < 0 || fret < bassFret)) {
        bassString = s;
        bassFret = fret;
      }
    }
  }
  if (bassString < 0) return { positions: [], muted: [] };

  const handMin = Math.max(0, bassFret - 2);
  const handMax = bassFret + 4;
  const positions = [{ string: bassString, fret: bassFret, pc: bassPc }];
  const muted = [];

  // Strings below the bass are muted.
  for (let s = 0; s < bassString; s++) muted.push(s);

  for (let s = bassString + 1; s < 6; s++) {
    const openPc = TUNING[s] % 12;
    let bestFret = -1;
    if (chordPcs.has(openPc)) {
      bestFret = 0;
    } else {
      for (let f = handMin; f <= handMax; f++) {
        const pc = (openPc + f) % 12;
        if (chordPcs.has(pc)) { bestFret = f; break; }
      }
    }
    if (bestFret !== -1) {
      positions.push({ string: s, fret: bestFret, pc: (openPc + bestFret) % 12 });
    } else {
      muted.push(s);
    }
  }
  return { positions, muted };
}

function fretWindow(positions) {
  // Compute a tidy [startFret, endFret] window that contains all positions.
  let minF = Infinity, maxF = -Infinity;
  for (const p of positions) {
    if (p.fret < minF) minF = p.fret;
    if (p.fret > maxF) maxF = p.fret;
  }
  if (positions.length === 0) { minF = 0; maxF = NUM_FRETS_VISIBLE - 1; }
  const start = Math.max(0, minF === 0 ? 0 : minF - 1);
  const end = Math.max(start + NUM_FRETS_VISIBLE - 1, maxF + 1);
  return [start, end];
}

export function buildGuitar() {
  const svg = document.getElementById('guitarSvg');
  if (!svg) return;
  // Skeleton (drawn into in updateGuitarHighlight). Initial render is empty.
  svg.innerHTML = '';
}

export function updateGuitarHighlight() {
  const svg = document.getElementById('guitarSvg');
  if (!svg) return;
  if (!state.currentChord) { svg.innerHTML = ''; return; }

  const rootPc = NOTE_NAMES.indexOf(state.currentChord.root);
  const dict = lookupVoicing(rootPc, state.currentChord.quality);
  const voicing = dict
    ? voicingFromDict(dict, rootPc)
    : buildGuitarVoicing(state.currentChord.orderedNotes);
  const { positions, muted } = voicing;
  const [startFret, endFret] = fretWindow(positions);
  const numFrets = endFret - startFret + 1;

  const W = 640, H = 170;
  const padX = 60, padY = 24;
  const fbW = W - padX - 24;
  const fbH = H - padY - 24;
  const stringSpacing = fbH / 5;
  const fretSpacing = fbW / numFrets;

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  let svgContent = '';

  // Strings (top = high E, bottom = low E for a "view from above" feel)
  for (let i = 0; i < 6; i++) {
    const y = padY + i * stringSpacing;
    const stringIdx = 5 - i; // top row = high e (index 5)
    const thickness = 0.6 + (5 - stringIdx) * 0.25;
    svgContent += `<line x1="${padX}" y1="${y}" x2="${padX + fbW}" y2="${y}"
                         class="gtr-string" stroke-width="${thickness}"/>`;
    svgContent += `<text x="${padX - 10}" y="${y + 4}" class="gtr-string-label">${STRING_LABELS[stringIdx]}</text>`;
  }

  // Frets (vertical lines). The leftmost line is the nut if startFret == 0.
  for (let f = 0; f <= numFrets; f++) {
    const x = padX + f * fretSpacing;
    const isNut = (startFret === 0 && f === 0);
    svgContent += `<line x1="${x}" y1="${padY}" x2="${x}" y2="${padY + 5 * stringSpacing}"
                         class="gtr-fret ${isNut ? 'gtr-nut' : ''}"/>`;
  }

  // Fret numbers (along the bottom)
  for (let f = 0; f < numFrets; f++) {
    const fretNum = startFret + f + 1;
    const x = padX + (f + 0.5) * fretSpacing;
    svgContent += `<text x="${x}" y="${padY + 5 * stringSpacing + 18}" class="gtr-fret-num">${fretNum}</text>`;
  }

  // Dots for voicing positions
  for (const p of positions) {
    const stringIdx = p.string;            // 0=low E, 5=high e
    const rowFromTop = 5 - stringIdx;
    const y = padY + rowFromTop * stringSpacing;

    let cx;
    if (p.fret === 0) {
      cx = padX - 28; // open string marker, left of the nut
    } else {
      const f = p.fret - startFret;
      cx = padX + (f * fretSpacing) - (fretSpacing * 0.5) - 8;
    }

    const heard = state.heardPitchClasses.has(p.pc);
    const dotClass = `gtr-dot${heard ? ' heard' : ''}${p.fret === 0 ? ' open' : ''}`;
    const noteName = pitchClassToDisplay(p.pc);

    if (p.fret === 0) {
      svgContent += `<circle cx="${cx}" cy="${y}" r="7" class="${dotClass}"/>`;
    } else {
      svgContent += `<circle cx="${cx}" cy="${y}" r="11" class="${dotClass}"/>`;
      svgContent += `<text x="${cx}" y="${y + 4}" class="gtr-dot-label">${noteName}</text>`;
    }
  }

  // Muted string markers (×)
  for (const s of muted) {
    const rowFromTop = 5 - s;
    const y = padY + rowFromTop * stringSpacing;
    const cx = padX - 28;
    svgContent += `<text x="${cx}" y="${y + 5}" class="gtr-mute-label">×</text>`;
  }

  svg.innerHTML = svgContent;
}
