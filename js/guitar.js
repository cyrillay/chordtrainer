// Guitar fretboard visualization (SVG).
// Shows a single reasonable voicing of the current chord on a 6-string guitar
// in standard tuning. Uses a dictionary of standard shapes for common chords,
// with an algorithmic fallback for uncommon ones.
//
// The SVG skeleton (strings, nut/frets, fret numbers) is built once per
// fret window and reused across chord changes; only the voicing dots are
// re-rendered. This keeps chord transitions cheap on mobile.

import { state } from './state.js';
import { pitchClassToDisplay, NOTE_NAMES } from './theory.js';
import { $, svgEl } from './dom.js';
import {
  TUNING, STRING_LABELS, NUM_FRETS_VISIBLE, MAX_FRET,
  HAND_SPAN_BACK, HAND_SPAN_FWD
} from './constants.js';

// Standard chord voicing dictionary.
// Each entry: array of 6 values (low E to high e): fret number, 0 for open, null for muted.
// Keyed by "root-quality". Root is pitch class (0-11).
const STANDARD_VOICINGS = {
  '0-maj':  [null, 3, 2, 0, 1, 0],
  '0-min':  [null, 3, 1, 0, 1, 3],
  '0-maj7': [null, 3, 2, 0, 0, 0],
  '0-min7': [null, 3, 1, 3, 1, 3],
  '0-dom7': [null, 3, 2, 3, 1, 0],
  '0-dim':  [null, 3, 1, null, 1, null],
  '0-aug':  [null, 3, 2, 1, 1, 0],

  '1-maj':  [null, 4, 3, 1, 2, 1],
  '1-min':  [null, 4, 2, 1, 2, null],
  '1-dom7': [null, 4, 3, 4, 2, 1],

  '2-maj':  [null, null, 0, 2, 3, 2],
  '2-min':  [null, null, 0, 2, 3, 1],
  '2-maj7': [null, null, 0, 2, 2, 2],
  '2-min7': [null, null, 0, 2, 1, 1],
  '2-dom7': [null, null, 0, 2, 1, 2],
  '2-dim':  [null, null, 0, 1, 3, 1],
  '2-aug':  [null, null, 0, 3, 3, 2],

  '3-maj':  [null, null, 1, 3, 4, 3],
  '3-min':  [null, null, 1, 3, 4, 2],
  '3-dom7': [null, null, 1, 3, 2, 3],

  '4-maj':  [0, 2, 2, 1, 0, 0],
  '4-min':  [0, 2, 2, 0, 0, 0],
  '4-maj7': [0, 2, 1, 1, 0, 0],
  '4-min7': [0, 2, 0, 0, 0, 0],
  '4-dom7': [0, 2, 0, 1, 0, 0],
  '4-dim':  [null, 2, null, 0, null, 0],
  '4-aug':  [0, 3, 2, 1, 1, 0],

  '5-maj':  [1, 3, 3, 2, 1, 1],
  '5-min':  [1, 3, 3, 1, 1, 1],
  '5-maj7': [null, null, 3, 2, 1, 0],
  '5-min7': [1, 3, 1, 1, 1, 1],
  '5-dom7': [1, 3, 1, 2, 1, 1],
  '5-dim':  [null, null, 3, 1, 0, 1],
  '5-aug':  [null, null, 3, 2, 2, 1],

  '6-maj':  [2, 4, 4, 3, 2, 2],
  '6-min':  [2, 4, 4, 2, 2, 2],
  '6-dom7': [2, 4, 2, 3, 2, 2],

  '7-maj':  [3, 2, 0, 0, 0, 3],
  '7-min':  [3, 5, 5, 3, 3, 3],
  '7-maj7': [3, 2, 0, 0, 0, 2],
  '7-min7': [3, 5, 3, 3, 3, 3],
  '7-dom7': [3, 2, 0, 0, 0, 1],
  '7-dim':  [null, null, 5, 3, 2, 3],
  '7-aug':  [3, 2, 1, 0, 0, 3],

  '8-maj':  [4, 6, 6, 5, 4, 4],
  '8-min':  [4, 6, 6, 4, 4, 4],
  '8-dom7': [4, 6, 4, 5, 4, 4],

  '9-maj':  [null, 0, 2, 2, 2, 0],
  '9-min':  [null, 0, 2, 2, 1, 0],
  '9-maj7': [null, 0, 2, 1, 2, 0],
  '9-min7': [null, 0, 2, 0, 1, 0],
  '9-dom7': [null, 0, 2, 0, 2, 0],
  '9-dim':  [null, 0, 1, 2, 1, null],
  '9-aug':  [null, 0, 3, 2, 2, 1],

  '10-maj': [null, 1, 3, 3, 3, 1],
  '10-min': [null, 1, 3, 3, 2, 1],
  '10-dom7':[null, 1, 3, 1, 3, 1],
  '10-maj7':[null, 1, 3, 2, 3, 1],
  '10-min7':[null, 1, 3, 1, 2, 1],

  '11-maj': [null, 2, 4, 4, 4, 2],
  '11-min': [null, 2, 4, 4, 3, 2],
  '11-dom7':[null, 2, 1, 2, 0, 2],
  '11-maj7':[null, 2, 4, 3, 4, 2],
  '11-min7':[null, 2, 0, 2, 0, 2],
  '11-dim': [null, 2, 3, 4, 3, null],
};

function lookupVoicing(rootPc, quality) {
  return STANDARD_VOICINGS[`${rootPc}-${quality}`] || null;
}

function voicingFromDict(dictEntry) {
  const positions = [];
  const muted = [];
  for (let s = 0; s < 6; s++) {
    const fret = dictEntry[s];
    if (fret === null) muted.push(s);
    else positions.push({ string: s, fret, pc: (TUNING[s] + fret) % 12 });
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

  const handMin = Math.max(0, bassFret - HAND_SPAN_BACK);
  const handMax = bassFret + HAND_SPAN_FWD;
  const positions = [{ string: bassString, fret: bassFret, pc: bassPc }];
  const muted = [];

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

// ---- SVG rendering: skeleton cached, dots swapped ----

const W = 640, H = 170, PAD_X = 60, PAD_Y = 24;
const FB_W = W - PAD_X - 24;
const FB_H = H - PAD_Y - 24;
const STRING_SPACING = FB_H / 5;

let skeletonLayer = null; // <g> that holds the fretboard (re-rendered when window changes)
let dotsLayer = null;     // <g> that holds voicing dots (re-rendered every chord)
let lastWindowKey = '';

export function buildGuitar() {
  const svg = $('guitarSvg');
  if (!svg) return;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';
  skeletonLayer = svgEl('g', { class: 'gtr-skeleton' });
  dotsLayer = svgEl('g', { class: 'gtr-dots' });
  svg.appendChild(skeletonLayer);
  svg.appendChild(dotsLayer);
  lastWindowKey = '';
}

function renderSkeleton(startFret, endFret) {
  const key = `${startFret}-${endFret}`;
  if (key === lastWindowKey) return;
  lastWindowKey = key;

  const numFrets = endFret - startFret + 1;
  const fretSpacing = FB_W / numFrets;
  skeletonLayer.textContent = '';

  for (let i = 0; i < 6; i++) {
    const y = PAD_Y + i * STRING_SPACING;
    const stringIdx = 5 - i;
    const thickness = 0.6 + (5 - stringIdx) * 0.25;
    skeletonLayer.appendChild(svgEl('line', {
      x1: PAD_X, y1: y, x2: PAD_X + FB_W, y2: y,
      class: 'gtr-string', 'stroke-width': thickness
    }));
    const lbl = svgEl('text', {
      x: PAD_X - 10, y: y + 4, class: 'gtr-string-label'
    });
    lbl.textContent = STRING_LABELS[stringIdx];
    skeletonLayer.appendChild(lbl);
  }

  for (let f = 0; f <= numFrets; f++) {
    const x = PAD_X + f * fretSpacing;
    const isNut = (startFret === 0 && f === 0);
    skeletonLayer.appendChild(svgEl('line', {
      x1: x, y1: PAD_Y, x2: x, y2: PAD_Y + 5 * STRING_SPACING,
      class: `gtr-fret${isNut ? ' gtr-nut' : ''}`
    }));
  }

  for (let f = 0; f < numFrets; f++) {
    const fretNum = startFret + f + 1;
    const x = PAD_X + (f + 0.5) * fretSpacing;
    const t = svgEl('text', {
      x, y: PAD_Y + 5 * STRING_SPACING + 18, class: 'gtr-fret-num'
    });
    t.textContent = fretNum;
    skeletonLayer.appendChild(t);
  }
}

function renderDots(positions, muted, startFret, endFret) {
  const numFrets = endFret - startFret + 1;
  const fretSpacing = FB_W / numFrets;
  dotsLayer.textContent = '';

  for (const p of positions) {
    const rowFromTop = 5 - p.string;
    const y = PAD_Y + rowFromTop * STRING_SPACING;
    const isOpen = p.fret === 0;
    const cx = isOpen
      ? PAD_X - 28
      : PAD_X + (p.fret - startFret) * fretSpacing - (fretSpacing * 0.5) - 8;

    const heard = state.heardPitchClasses.has(p.pc);
    const cls = `gtr-dot${heard ? ' heard' : ''}${isOpen ? ' open' : ''}`;
    dotsLayer.appendChild(svgEl('circle', {
      cx, cy: y, r: isOpen ? 7 : 11, class: cls
    }));
    if (!isOpen) {
      const label = svgEl('text', {
        x: cx, y: y + 4, class: 'gtr-dot-label'
      });
      label.textContent = pitchClassToDisplay(p.pc);
      dotsLayer.appendChild(label);
    }
  }

  for (const s of muted) {
    const rowFromTop = 5 - s;
    const y = PAD_Y + rowFromTop * STRING_SPACING;
    const t = svgEl('text', {
      x: PAD_X - 28, y: y + 5, class: 'gtr-mute-label'
    });
    t.textContent = '×';
    dotsLayer.appendChild(t);
  }
}

export function updateGuitarHighlight() {
  const svg = $('guitarSvg');
  if (!svg || !skeletonLayer) return;
  if (!state.currentChord) {
    skeletonLayer.textContent = '';
    dotsLayer.textContent = '';
    lastWindowKey = '';
    return;
  }

  const rootPc = NOTE_NAMES.indexOf(state.currentChord.root);
  const dict = lookupVoicing(rootPc, state.currentChord.quality);
  const { positions, muted } = dict
    ? voicingFromDict(dict)
    : buildGuitarVoicing(state.currentChord.orderedNotes);
  const [startFret, endFret] = fretWindow(positions);

  renderSkeleton(startFret, endFret);
  renderDots(positions, muted, startFret, endFret);
}
