// Circle of fifths visualization (SVG).
// Outer ring = 12 majors, inner ring = relative minors.
// Slots are cached at build time so highlight updates are O(1) lookups
// instead of a full querySelectorAll + classList.remove sweep per frame.

import { state } from '../core/state.js';
import { NOTE_DISPLAY, NOTE_NAMES } from '../core/theory.js';
import { $, svgEl } from '../core/dom.js';

const COF_ORDER_PC = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const R_OUTER = 95;
const R_MID = 65;
const R_INNER = 35;
const R_OUTER_TEXT = (R_OUTER + R_MID) / 2;
const R_INNER_TEXT = (R_MID + R_INNER) / 2;

const OUTER_QUALITIES = new Set(['maj', 'maj7', 'dom7', 'aug']);
const INNER_QUALITIES = new Set(['min', 'min7', 'dim', 'm7b5', 'mMaj7']);

function polar(angleDeg, radius) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
}

function wedgePath(startDeg, endDeg, rOuter, rInner) {
  const a = polar(startDeg, rOuter);
  const b = polar(endDeg, rOuter);
  const c = polar(endDeg, rInner);
  const d = polar(startDeg, rInner);
  const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)}
          A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}
          L ${c.x.toFixed(2)} ${c.y.toFixed(2)}
          A ${rInner} ${rInner} 0 ${largeArc} 0 ${d.x.toFixed(2)} ${d.y.toFixed(2)}
          Z`;
}

// Cached lookup: `${ring}-${pc}` → slot group element. Lets highlight updates
// flip classes on known nodes directly.
const slotByKey = new Map();
const activeSlots = new Set();
const HIGHLIGHT_CLASSES = ['active', 'upcoming-1', 'upcoming-2', 'upcoming-3'];

function buildSlot(pc, ring, startDeg, endDeg, midDeg, labelText, textCls) {
  const g = svgEl('g', { class: `cof-slot cof-${ring}`, 'data-pc': pc, 'data-ring': ring });
  const [rOuter, rInner] = ring === 'outer' ? [R_OUTER, R_MID] : [R_MID, R_INNER];
  const rText = ring === 'outer' ? R_OUTER_TEXT : R_INNER_TEXT;
  g.appendChild(svgEl('path', { d: wedgePath(startDeg, endDeg, rOuter, rInner), class: 'cof-wedge' }));
  const p = polar(midDeg, rText);
  const textEl = svgEl('text', { x: p.x, y: p.y, class: `cof-label ${textCls}` });
  textEl.textContent = labelText;
  g.appendChild(textEl);
  return g;
}

export function buildCircle() {
  const container = $('circleSvg');
  if (!container) return;
  container.setAttribute('viewBox', '-110 -110 220 220');
  container.innerHTML = '';
  slotByKey.clear();
  activeSlots.clear();

  for (let i = 0; i < 12; i++) {
    const startDeg = i * 30 - 15;
    const endDeg = startDeg + 30;
    const midDeg = startDeg + 15;
    const pc = COF_ORDER_PC[i];

    const majorLabel = NOTE_DISPLAY[NOTE_NAMES[pc]];
    const outerG = buildSlot(pc, 'outer', startDeg, endDeg, midDeg, majorLabel, 'cof-label-major');
    container.appendChild(outerG);
    slotByKey.set(`outer-${pc}`, outerG);

    const minorPc = (pc + 9) % 12;
    const minorLabel = NOTE_DISPLAY[NOTE_NAMES[minorPc]] + 'm';
    const innerG = buildSlot(minorPc, 'inner', startDeg, endDeg, midDeg, minorLabel, 'cof-label-minor');
    container.appendChild(innerG);
    slotByKey.set(`inner-${minorPc}`, innerG);
  }
}

function slotFor(chord) {
  if (!chord) return null;
  const rootPc = NOTE_NAMES.indexOf(chord.root);
  const ring = INNER_QUALITIES.has(chord.quality) ? 'inner' : 'outer';
  return slotByKey.get(`${ring}-${rootPc}`) || null;
}

function applyHighlight(slot, cls) {
  if (!slot) return;
  slot.classList.add(cls);
  activeSlots.add(slot);
}

export function updateCircleHighlight() {
  // Clear only the slots we previously touched — O(highlighted) instead of O(24).
  for (const slot of activeSlots) slot.classList.remove(...HIGHLIGHT_CLASSES);
  activeSlots.clear();

  if (!state.currentChord) return;
  applyHighlight(slotFor(state.currentChord), 'active');
  const queue = state.chordQueue;
  if (queue[0]) applyHighlight(slotFor(queue[0]), 'upcoming-1');
  if (queue[1]) applyHighlight(slotFor(queue[1]), 'upcoming-2');
  if (queue[2]) applyHighlight(slotFor(queue[2]), 'upcoming-3');
}
