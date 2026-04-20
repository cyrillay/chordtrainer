// Guitar fretboard visualization (SVG).
// Shows a single reasonable voicing of the current chord on a 6-string guitar
// in standard tuning. Chosen for clarity over completeness — beginners see
// one playable shape rather than every possible position.

import { state } from './state.js';
import { pitchClassToDisplay, NOTE_NAMES } from './theory.js';

// Standard tuning, low E to high E (MIDI numbers).
const TUNING = [40, 45, 50, 55, 59, 64];
const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
const NUM_FRETS_VISIBLE = 5; // window width
const MAX_FRET = 14;

// Pick a single voicing: bass note on a low string at low fret, then chord
// tones on each higher string within a hand-span.
function buildGuitarVoicing(orderedNotes) {
  if (!orderedNotes || orderedNotes.length === 0) return [];
  const chordPcs = new Set(orderedNotes);
  const bassPc = orderedNotes[0];

  // Bass: prefer low strings (E/A/D) at fret <= 5.
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
  if (bassString < 0) return [];

  const handMin = Math.max(0, bassFret - 2);
  const handMax = bassFret + 4;
  const positions = [{ string: bassString, fret: bassFret, pc: bassPc }];

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
    }
  }
  return positions;
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

  const positions = buildGuitarVoicing(state.currentChord.orderedNotes);
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
    const fretNum = startFret + f;
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
      cx = padX - 16; // open string marker, left of the nut
    } else {
      const f = p.fret - startFret;
      cx = padX + (f * fretSpacing) - (fretSpacing / 2); // middle of fret cell
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

  svg.innerHTML = svgContent;
}
