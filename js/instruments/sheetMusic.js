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
let mode = localStorage.getItem(LS.SHEET_MUSIC) || 'alt';

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

// Clef outlines from Wikimedia Commons (public domain). Coordinates are in the
// original SVG space with staff lines at y 6378–8740.
const ORIG_STAFF_TOP = 6378;
const ORIG_STAFF_SPAN = 8740 - ORIG_STAFF_TOP; // 4 gaps
const TREBLE_CLEF_D = 'M2002,7851C1941,7868,1886,7906,1835,7964C1784,8023,1759,8088,1759,8158C1759,8202,1774,8252,1803,8305C1832,8359,1876,8398,1933,8423C1952,8427,1961,8437,1961,8451C1961,8456,1954,8461,1937,8465C1846,8442,1771,8393,1713,8320C1655,8246,1625,8162,1623,8066C1626,7963,1657,7867,1716,7779C1776,7690,1853,7627,1947,7590L1878,7235C1724,7363,1599,7496,1502,7636C1405,7775,1355,7926,1351,8089C1353,8162,1368,8233,1396,8301C1424,8370,1466,8432,1522,8489C1635,8602,1782,8661,1961,8667C2022,8663,2087,8652,2157,8634L2002,7851zM2074,7841L2230,8610C2384,8548,2461,8413,2461,8207C2452,8138,2432,8076,2398,8021C2365,7965,2321,7921,2265,7889C2209,7857,2146,7841,2074,7841zM1869,6801C1902,6781,1940,6746,1981,6697C2022,6649,2062,6592,2100,6528C2139,6463,2170,6397,2193,6330C2216,6264,2227,6201,2227,6143C2227,6118,2225,6093,2220,6071C2216,6035,2205,6007,2186,5988C2167,5970,2143,5960,2113,5960C2053,5960,1999,5997,1951,6071C1914,6135,1883,6211,1861,6297C1838,6384,1825,6470,1823,6557C1828,6656,1844,6737,1869,6801zM1806,6859C1761,6697,1736,6532,1731,6364C1732,6256,1743,6155,1764,6061C1784,5967,1813,5886,1851,5816C1888,5746,1931,5693,1979,5657C2022,5625,2053,5608,2070,5608C2083,5608,2094,5613,2104,5622C2114,5631,2127,5646,2143,5666C2262,5835,2322,6039,2322,6277C2322,6390,2307,6500,2277,6610C2248,6719,2205,6823,2148,6920C2090,7018,2022,7103,1943,7176L2024,7570C2068,7565,2098,7561,2115,7561C2191,7561,2259,7577,2322,7609C2385,7641,2439,7684,2483,7739C2527,7793,2561,7855,2585,7925C2608,7995,2621,8068,2621,8144C2621,8262,2590,8370,2528,8467C2466,8564,2373,8635,2248,8681C2256,8730,2270,8801,2291,8892C2311,8984,2326,9057,2336,9111C2346,9165,2350,9217,2350,9268C2350,9347,2331,9417,2293,9479C2254,9541,2202,9589,2136,9623C2071,9657,1999,9674,1921,9674C1811,9674,1715,9643,1633,9582C1551,9520,1507,9437,1503,9331C1506,9284,1517,9240,1537,9198C1557,9156,1584,9122,1619,9096C1653,9069,1694,9055,1741,9052C1780,9052,1817,9063,1852,9084C1886,9106,1914,9135,1935,9172C1955,9209,1966,9250,1966,9294C1966,9353,1946,9403,1906,9444C1866,9485,1815,9506,1754,9506L1731,9506C1770,9566,1834,9597,1923,9597C1968,9597,2014,9587,2060,9569C2107,9550,2146,9525,2179,9493C2212,9461,2234,9427,2243,9391C2260,9350,2268,9293,2268,9222C2268,9174,2263,9126,2254,9078C2245,9031,2231,8968,2212,8890C2193,8813,2179,8753,2171,8712C2111,8727,2049,8735,1984,8735C1875,8735,1772,8713,1675,8668C1578,8623,1493,8561,1419,8481C1346,8401,1289,8311,1248,8209C1208,8108,1187,8002,1186,7892C1190,7790,1209,7692,1245,7600C1281,7507,1327,7419,1384,7337C1441,7255,1500,7180,1561,7113C1623,7047,1704,6962,1806,6859z';
const BASS_CLEF_D = 'M1239,8245C1397,8138,1515,8057,1591,8001C1667,7946,1747,7877,1829,7795C1911,7713,1980,7620,2036,7517C2080,7441,2118,7353,2149,7253C2180,7154,2196,7058,2199,6967C2199,6882,2188,6801,2165,6725C2143,6648,2105,6585,2051,6534C1997,6484,1927,6459,1840,6459C1756,6459,1677,6476,1603,6509C1530,6543,1478,6597,1449,6673C1449,6680,1445,6689,1439,6702C1441,6718,1449,6730,1464,6739C1479,6748,1492,6752,1504,6752C1510,6752,1527,6749,1553,6743C1580,6737,1602,6733,1620,6733C1673,6733,1720,6752,1763,6789C1805,6826,1826,6871,1826,6924C1826,6962,1815,6998,1794,7031C1773,7064,1744,7091,1707,7110C1670,7130,1629,7139,1585,7139C1505,7139,1437,7115,1381,7066C1326,7016,1298,6953,1298,6874C1298,6773,1329,6686,1390,6612C1452,6538,1530,6483,1626,6446C1721,6408,1817,6390,1915,6390C2022,6390,2124,6417,2219,6472C2315,6526,2390,6601,2446,6694C2502,6788,2531,6888,2531,6996C2531,7188,2467,7366,2339,7531C2211,7696,2053,7839,1864,7961C1738,8044,1534,8156,1253,8297L1239,8245zM2628,6698C2628,6662,2641,6632,2667,6608C2692,6583,2723,6571,2760,6571C2792,6571,2822,6585,2849,6612C2876,6638,2889,6669,2889,6703C2889,6739,2875,6770,2849,6795C2821,6819,2790,6831,2755,6831C2718,6831,2688,6819,2664,6792C2640,6766,2628,6735,2628,6698zM2628,7222C2628,7186,2641,7155,2665,7131C2690,7106,2721,7094,2760,7094C2792,7094,2821,7107,2849,7134C2875,7161,2889,7190,2889,7222C2889,7261,2876,7292,2851,7317C2825,7342,2795,7355,2760,7355C2721,7355,2690,7342,2665,7318C2641,7294,2628,7262,2628,7222z';
const TREBLE_CLEF_MIN_X = 1186;
const BASS_CLEF_MIN_X = 1239;

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

  const staffTopY = PAD_TOP;
  const bottomLineY = staffTopY + STAFF_HEIGHT;

  for (let i = 0; i < 5; i++) {
    const y = staffTopY + i * GAP;
    root.appendChild(svg('line', {
      class: 'staff-line',
      x1: 2, x2: width - 2, y1: y, y2: y,
    }));
  }

  const clefScale = STAFF_HEIGHT / ORIG_STAFF_SPAN;
  const clefMinX = clef === 'treble' ? TREBLE_CLEF_MIN_X : BASS_CLEF_MIN_X;
  const clefTx = 4 - clefMinX * clefScale;
  const clefTy = staffTopY - ORIG_STAFF_TOP * clefScale;
  const clefEl = svg('path', {
    class: `clef clef-${clef}`,
    d: clef === 'treble' ? TREBLE_CLEF_D : BASS_CLEF_D,
    transform: `translate(${clefTx.toFixed(2)},${clefTy.toFixed(2)}) scale(${clefScale.toFixed(6)})`,
    'fill-rule': 'evenodd',
  });
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
