// Sheet music view: replaces the chord-notes chips ("C E G") with the chord
// rendered on a single staff (treble or bass clef). Heard pitch classes get
// the same green tint as piano keys so the user gets visual confirmation
// without leaving the staff.
//
// Custom SVG (no VexFlow / abc.js): we only render whole noteheads stacked on
// five lines — no rhythm, no stems, no beams — so a 200-400KB notation lib
// would be heavyweight overkill.

import { state } from '../core/state.js';
import { spellChordTones } from '../core/theory.js';
import { LS } from '../core/constants.js';

// Mode persisted in LS:
//   'off'    — keep the existing letter chips
//   'treble' — always render in treble clef
//   'bass'   — always render in bass clef
//   'alt'    — randomly pick one of the two at every new chord
let mode = localStorage.getItem(LS.SHEET_MUSIC) || 'off';

export function getSheetMode() { return mode; }
export function isSheetActive() { return mode !== 'off'; }

export function setSheetMode(next) {
  mode = next;
  try { localStorage.setItem(LS.SHEET_MUSIC, mode); } catch { /* ignore */ }
}

// Voice the chord starting at `bassOctave`, then stack each subsequent note
// upward to the lowest octave that puts it strictly above the previous —
// mirrors the piano voicing logic so the staff matches the keyboard.
function voiceChord(orderedNotes, bassOctave) {
  const out = [{ pc: orderedNotes[0], octave: bassOctave }];
  let prevMidi = (bassOctave + 1) * 12 + orderedNotes[0];
  for (let i = 1; i < orderedNotes.length; i++) {
    const pc = orderedNotes[i];
    let octave = bassOctave;
    let midi = (octave + 1) * 12 + pc;
    while (midi <= prevMidi) { octave++; midi += 12; }
    out.push({ pc, octave });
    prevMidi = midi;
  }
  return out;
}

// Diatonic step from the bottom staff line (E4 in treble, G2 in bass). Each
// integer = one letter (line OR space). y on the SVG = bottomLineY - step * (gap/2).
// LETTER_NAMES order is C D E F G A B → E=2, G=4.
function letterSteps(letterIdx, octave, clef) {
  const base = clef === 'treble'
    ? { letter: 2, octave: 4 }   // E4
    : { letter: 4, octave: 2 };  // G2
  return (octave - base.octave) * 7 + (letterIdx - base.letter);
}

const GAP = 8;
const STAFF_HEIGHT = 4 * GAP;
const PAD_TOP = 30;
const PAD_BOTTOM = 30;
const CLEF_W = 30;
const NOTE_PAD_LEFT = 20;
const NOTE_RX = 6;
const NOTE_RY = 4.4;
// Inner cutout for the whole-note "ring": rotated so the ring is thick on the
// slanted sides (look of an engraved whole note) and thin at top/bottom.
const NOTE_INNER_RX = 4.6;
const NOTE_INNER_RY = 2.0;
const NOTE_INNER_TILT_DEG = -22;
const LEDGER_W = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// Cubic-bezier approximation of an ellipse, optionally rotated around its
// center. Returns a closed `d` subpath. Combining an outer (un-rotated) ring
// with a rotated inner ring under fill-rule="evenodd" gives the variable-
// thickness whole-note shape without depending on the page background colour.
function ellipseSubpath(cx, cy, rx, ry, rotateDeg = 0) {
  const C = 0.5522847498307936;
  const a = (rotateDeg * Math.PI) / 180;
  const cosA = Math.cos(a), sinA = Math.sin(a);
  const tx = (x, y) => [
    cx + (x - cx) * cosA - (y - cy) * sinA,
    cy + (x - cx) * sinA + (y - cy) * cosA,
  ];
  // 12 raw points: 4 anchors + 8 controls, traversed clockwise from "left".
  const raw = [
    [cx - rx, cy],
    [cx - rx, cy - ry * C], [cx - rx * C, cy - ry], [cx, cy - ry],
    [cx + rx * C, cy - ry], [cx + rx, cy - ry * C], [cx + rx, cy],
    [cx + rx, cy + ry * C], [cx + rx * C, cy + ry], [cx, cy + ry],
    [cx - rx * C, cy + ry], [cx - rx, cy + ry * C],
  ];
  const p = raw.map(([x, y]) => tx(x, y));
  const f = n => n.toFixed(2);
  return `M${f(p[0][0])},${f(p[0][1])} ` +
    `C${f(p[1][0])},${f(p[1][1])} ${f(p[2][0])},${f(p[2][1])} ${f(p[3][0])},${f(p[3][1])} ` +
    `C${f(p[4][0])},${f(p[4][1])} ${f(p[5][0])},${f(p[5][1])} ${f(p[6][0])},${f(p[6][1])} ` +
    `C${f(p[7][0])},${f(p[7][1])} ${f(p[8][0])},${f(p[8][1])} ${f(p[9][0])},${f(p[9][1])} ` +
    `C${f(p[10][0])},${f(p[10][1])} ${f(p[11][0])},${f(p[11][1])} ${f(p[0][0])},${f(p[0][1])} Z`;
}

function wholeNotePath(cx, cy) {
  return ellipseSubpath(cx, cy, NOTE_RX, NOTE_RY, 0) + ' ' +
    ellipseSubpath(cx, cy, NOTE_INNER_RX, NOTE_INNER_RY, NOTE_INNER_TILT_DEG);
}

function pickClef() {
  if (mode === 'treble' || mode === 'bass') return mode;
  if (mode === 'alt') return Math.random() < 0.5 ? 'treble' : 'bass';
  return 'treble';
}

// Adjacent seconds (step difference of 1) overlap visually, so we offset the
// upper note of the pair to the right side of the column — standard practice.
function computeOffsets(noteData) {
  const sortedIdx = noteData.map((_, i) => i)
    .sort((a, b) => noteData[a].step - noteData[b].step);
  const offset = new Array(noteData.length).fill(false);
  for (let k = 1; k < sortedIdx.length; k++) {
    const cur = sortedIdx[k];
    const prev = sortedIdx[k - 1];
    if (noteData[cur].step - noteData[prev].step === 1 && !offset[prev]) {
      offset[cur] = true;
    }
  }
  return offset;
}

function addLedgers(g, step, cx, bottomLineY) {
  const half = GAP / 2;
  if (step <= -2) {
    const lowest = step % 2 === 0 ? step : step + 1;
    for (let s = -2; s >= lowest; s -= 2) {
      const y = bottomLineY - s * half;
      g.appendChild(svg('line', {
        class: 'ledger-line',
        x1: cx - LEDGER_W / 2, x2: cx + LEDGER_W / 2, y1: y, y2: y,
      }));
    }
  } else if (step >= 10) {
    const highest = step % 2 === 0 ? step : step - 1;
    for (let s = 10; s <= highest; s += 2) {
      const y = bottomLineY - s * half;
      g.appendChild(svg('line', {
        class: 'ledger-line',
        x1: cx - LEDGER_W / 2, x2: cx + LEDGER_W / 2, y1: y, y2: y,
      }));
    }
  }
}

export function renderSheet(chord, container) {
  if (!container) return;
  container.innerHTML = '';
  if (!chord) return;

  const clef = pickClef();
  // Bass clef: high-pc roots (G and above) start an octave lower so the chord
  // sits inside the staff instead of spilling above it. e.g. B♭ chord lands
  // on B♭2 (2nd line) rather than B♭3 (above the staff).
  const bassOctave = clef === 'treble'
    ? 4
    : (chord.orderedNotes[0] < 7 ? 3 : 2);
  const voiced = voiceChord(chord.orderedNotes, bassOctave);

  const spelled = spellChordTones(chord);
  const noteData = voiced.map(({ pc, octave }, i) => {
    const { letter, accidental, octShift } = spelled[i];
    return { pc, accidental, step: letterSteps(letter, octave + octShift, clef) };
  });
  const offsets = computeOffsets(noteData);

  // Stagger flag: when an offset note has an accidental AND so does another
  // note within 1 step, both accidentals would otherwise collide vertically
  // at the same x. We push the offset note's accidental ~6px right so the
  // pair reads as a diagonal staircase instead of an overlapping stack.
  const accStagger = new Array(noteData.length).fill(false);
  for (let i = 0; i < noteData.length; i++) {
    if (!noteData[i].accidental || !offsets[i]) continue;
    for (let j = 0; j < noteData.length; j++) {
      if (i === j || !noteData[j].accidental) continue;
      if (Math.abs(noteData[i].step - noteData[j].step) <= 1) {
        accStagger[i] = true;
        break;
      }
    }
  }

  const width = CLEF_W + NOTE_PAD_LEFT + NOTE_RX * 2 + 14;
  const height = PAD_TOP + STAFF_HEIGHT + PAD_BOTTOM;
  const root = svg('svg', {
    class: `staff-svg staff-${clef}`,
    viewBox: `0 0 ${width} ${height}`,
    'aria-hidden': 'true',
  });

  // Erosion filter to thin the system-font clef glyph (Unicode music symbols
  // ship at a fixed weight that's heavier than the rest of the engraving).
  const defs = svg('defs');
  const filter = svg('filter', { id: 'clef-thin', x: '-10%', y: '-10%', width: '120%', height: '120%' });
  filter.appendChild(svg('feMorphology', { operator: 'erode', radius: '0.3' }));
  defs.appendChild(filter);
  root.appendChild(defs);

  const staffTopY = PAD_TOP;
  const bottomLineY = staffTopY + STAFF_HEIGHT;

  for (let i = 0; i < 5; i++) {
    const y = staffTopY + i * GAP;
    root.appendChild(svg('line', {
      class: 'staff-line',
      x1: 2, x2: width - 2, y1: y, y2: y,
    }));
  }

  // Clef glyph via Unicode SMuFL codepoint. The y-anchor differs per clef:
  // the G-clef curl wraps the second line from the bottom (G4); the F-clef
  // dot sits on the second line from the top (F3).
  const clefChar = clef === 'treble' ? '\uD834\uDD1E' : '\uD834\uDD22';
  const clefY = clef === 'treble'
    ? bottomLineY + GAP * 0.2
    : staffTopY + GAP * 2.9;
  const clefSize = clef === 'treble' ? STAFF_HEIGHT * 1.7 : STAFF_HEIGHT * 1.05;
  const clefEl = svg('text', {
    class: `clef clef-${clef}`,
    x: 4, y: clefY,
    'font-size': clefSize,
  });
  clefEl.textContent = clefChar;
  root.appendChild(clefEl);

  const baseNoteX = CLEF_W + NOTE_PAD_LEFT + NOTE_RX;
  for (let i = 0; i < noteData.length; i++) {
    const n = noteData[i];
    const cy = bottomLineY - n.step * (GAP / 2);
    const cx = baseNoteX + (offsets[i] ? NOTE_RX * 1.85 : 0);

    const g = svg('g', { class: 'staff-note', 'data-pc': n.pc });
    addLedgers(g, n.step, cx, bottomLineY);

    if (n.accidental) {
      // Anchor to the LEFT of the unshifted column so a single accidental on
      // a right-offset note doesn't squeeze between the two noteheads.
      // Exception: when both adjacent notes carry accidentals, push this one
      // (the offset note's) right by ACC_PAIR_OFFSET so the two glyphs form a
      // diagonal pair instead of overlapping at the same x.
      const ACC_PAIR_OFFSET = 6;
      const accX = baseNoteX - NOTE_RX - 4 + (accStagger[i] ? ACC_PAIR_OFFSET : 0);
      // Sharps render visually higher than flats at the same baseline (flat's
      // bulb sits low, sharp's body is symmetric), so we nudge sharps down a
      // few pixels to match the line/space center the flat hits naturally.
      const isSharp = n.accidental === '\u266F';
      const acc = svg('text', {
        class: 'accidental',
        x: accX,
        y: cy + GAP * 0.42 + (isSharp ? 2 : 0),
        'text-anchor': 'end',
      });
      acc.textContent = n.accidental;
      g.appendChild(acc);
    }

    g.appendChild(svg('path', {
      class: 'notehead',
      d: wholeNotePath(cx, cy),
      'fill-rule': 'evenodd',
    }));

    root.appendChild(g);
  }

  container.appendChild(root);
}

export function updateSheetHighlight(container) {
  if (!container) return;
  const heard = state.heardPitchClasses;
  const noteEls = container.querySelectorAll('.staff-note');
  for (const el of noteEls) {
    const pc = parseInt(el.dataset.pc, 10);
    el.classList.toggle('heard', heard.has(pc));
  }
}
