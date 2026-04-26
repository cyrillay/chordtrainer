// Guitar fretboard visualization (SVG).
// Shows a voicing of the current chord on a 6-string guitar in standard
// tuning. Voicings are loaded from data/guitar-voicings.json (scraped from
// all-guitar-chords.com by scripts/scrape_voicings.py); an algorithmic
// fallback handles chords missing from the dataset or the brief window
// before the JSON has finished loading.
//
// The SVG skeleton (strings, nut/frets, fret numbers) is built once per
// fret window and reused across chord changes; only the voicing dots are
// re-rendered. This keeps chord transitions cheap on mobile.

import { state } from '../core/state.js';
import { pitchClassToDisplay, NOTE_NAMES } from '../core/theory.js';
import { $, svgEl } from '../core/dom.js';
import {
  TUNING, STRING_LABELS, NUM_FRETS_VISIBLE, MAX_FRET,
  HAND_SPAN_BACK, HAND_SPAN_FWD
} from '../core/constants.js';

// Voicings keyed `${rootPc}-${quality}` → array of [low_E..high_e] arrays.
// Populated asynchronously; callers handle the empty case via the fallback.
const voicingDataset = new Map();

fetch('data/guitar-voicings.json')
  .then(r => r.ok ? r.json() : Promise.reject(r.status))
  .then(data => {
    for (const [k, v] of Object.entries(data)) voicingDataset.set(k, v);
    // Re-render so the freshly-loaded voicings replace the algorithmic
    // fallback that may have rendered first.
    if (state.currentChord) updateGuitarHighlight();
  })
  .catch(err => console.warn('guitar voicings dataset unavailable:', err));

function lookupVoicings(rootPc, quality) {
  const list = voicingDataset.get(`${rootPc}-${quality}`);
  return (list && list.length) ? list : null;
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

// Detect a barre: when 3+ strings share the same fretted (>0) note AND that fret
// is the lowest fretted note in the chord (so the index finger holds them all
// down). Returns { fret, fromString, toString } or null.
function detectBarre(positions) {
  if (positions.length < 3) return null;
  const fretted = positions.filter(p => p.fret > 0);
  if (fretted.length < 3) return null;
  const minFret = Math.min(...fretted.map(p => p.fret));

  // Group by fret to find the bar candidate.
  const onMinFret = fretted.filter(p => p.fret === minFret);
  if (onMinFret.length < 3) return null;

  const stringIdxs = onMinFret.map(p => p.string).sort((a, b) => a - b);
  return { fret: minFret, fromString: stringIdxs[0], toString: stringIdxs[stringIdxs.length - 1] };
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

  // Inlay markers (single dot at 3/5/7/9/15, double dot at 12/24).
  // Centered between strings 3-4 (single) or strings 2-3 + 4-5 (double).
  const SINGLE_MARKERS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
  const DOUBLE_MARKERS = new Set([12, 24]);
  const yMid = PAD_Y + 2.5 * STRING_SPACING;
  const yUpper = PAD_Y + 1.5 * STRING_SPACING;
  const yLower = PAD_Y + 3.5 * STRING_SPACING;
  for (let f = 0; f < numFrets; f++) {
    const fretNum = startFret + f + 1;
    const cx = PAD_X + (f + 0.5) * fretSpacing;
    if (DOUBLE_MARKERS.has(fretNum)) {
      skeletonLayer.appendChild(svgEl('circle', { cx, cy: yUpper, r: 3, class: 'gtr-inlay' }));
      skeletonLayer.appendChild(svgEl('circle', { cx, cy: yLower, r: 3, class: 'gtr-inlay' }));
    } else if (SINGLE_MARKERS.has(fretNum)) {
      skeletonLayer.appendChild(svgEl('circle', { cx, cy: yMid, r: 3, class: 'gtr-inlay' }));
    }
  }
}

function renderDots(positions, muted, startFret, endFret, barre) {
  const numFrets = endFret - startFret + 1;
  const fretSpacing = FB_W / numFrets;
  dotsLayer.textContent = '';

  // Draw the barre underlay first so dots sit on top.
  if (barre) {
    const xCenter = PAD_X + (barre.fret - startFret) * fretSpacing - (fretSpacing * 0.5) - 8;
    const yFrom = PAD_Y + (5 - barre.toString) * STRING_SPACING;
    const yTo = PAD_Y + (5 - barre.fromString) * STRING_SPACING;
    dotsLayer.appendChild(svgEl('rect', {
      x: xCenter - 11,
      y: yFrom - 11,
      width: 22,
      height: (yTo - yFrom) + 22,
      rx: 11,
      class: 'gtr-barre'
    }));
  }

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

// ---- Voicing index per chord (for the "alt voicing" cycle button) ----
let voicingIndex = 0;
let voicingKey = '';

export function getVoicingCount() {
  if (!state.currentChord) return 0;
  const rootPc = NOTE_NAMES.indexOf(state.currentChord.root);
  const list = lookupVoicings(rootPc, state.currentChord.quality);
  return list ? list.length : 0;
}

export function cycleVoicing() {
  const count = getVoicingCount();
  if (count <= 1) return;
  voicingIndex = (voicingIndex + 1) % count;
  updateGuitarHighlight();
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
  const list = lookupVoicings(rootPc, state.currentChord.quality);

  // Reset the alternative-voicing cursor when the chord changes; otherwise
  // an "alt" picked for the previous chord persists into the next one and
  // confuses users (and may exceed the new chord's voicing count).
  const key = `${rootPc}-${state.currentChord.quality}`;
  if (key !== voicingKey) { voicingKey = key; voicingIndex = 0; }

  const dict = list ? list[Math.min(voicingIndex, list.length - 1)] : null;
  const { positions, muted } = dict
    ? voicingFromDict(dict)
    : buildGuitarVoicing(state.currentChord.orderedNotes);
  const [startFret, endFret] = fretWindow(positions);
  const barre = detectBarre(positions);

  renderSkeleton(startFret, endFret);
  renderDots(positions, muted, startFret, endFret, barre);
  updateAltVoicingButton();
}

// Exported so main.js can refresh the button when guitar visibility flips
// (switching to piano, or hiding the instrument entirely). displayChord calls
// updateGuitarHighlight unconditionally, so without the guitar-visibility check
// here the button would re-appear in piano mode the moment a new chord is set.
export function updateAltVoicingButton() {
  const btn = document.getElementById('altVoicingBtn');
  if (!btn) return;
  const wrap = document.getElementById('guitarWrap');
  // Wrap stays in flow (only its .is-hidden class fades it out), so we check
  // that class rather than display/visibility.
  const guitarVisible = wrap && !wrap.classList.contains('is-hidden');
  const count = getVoicingCount();
  const show = guitarVisible && count > 1;
  btn.style.display = show ? '' : 'none';
  if (show) btn.textContent = `Alt voicing (${voicingIndex + 1}/${count})`;
}
