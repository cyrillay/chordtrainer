// Circle of fifths visualization (SVG).
// Outer ring = 12 majors, inner ring = relative minors.
// The current chord (root + maj/min mapping) is highlighted.

import { state } from './state.js';
import { NOTE_DISPLAY, NOTE_NAMES } from './theory.js';

// Circle order, clockwise from 12 o'clock.
const COF_ORDER_PC = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

const R_OUTER = 95;
const R_MID = 65;       // boundary between major (outer) and minor (inner) rings
const R_INNER = 35;
const R_OUTER_TEXT = (R_OUTER + R_MID) / 2;
const R_INNER_TEXT = (R_MID + R_INNER) / 2;

// Major qualities map to outer ring; minor-ish qualities map to inner ring.
const OUTER_QUALITIES = new Set(['maj', 'maj7', 'dom7', 'aug']);
const INNER_QUALITIES = new Set(['min', 'min7', 'dim', 'm7b5', 'mMaj7']);

function polar(angleDeg, radius) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
}

// Build a donut sector SVG path between two angles and two radii.
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

export function buildCircle() {
  const container = document.getElementById('circleSvg');
  if (!container) return;
  container.setAttribute('viewBox', '-110 -110 220 220');
  container.innerHTML = '';

  for (let i = 0; i < 12; i++) {
    const startDeg = i * 30 - 15;
    const endDeg = startDeg + 30;
    const midDeg = startDeg + 15;
    const pc = COF_ORDER_PC[i];

    // Outer ring (major)
    const outerG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    outerG.classList.add('cof-slot', 'cof-outer');
    outerG.dataset.pc = pc;
    outerG.dataset.ring = 'outer';
    const outerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    outerPath.setAttribute('d', wedgePath(startDeg, endDeg, R_OUTER, R_MID));
    outerPath.setAttribute('class', 'cof-wedge');
    outerG.appendChild(outerPath);
    const outerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const op = polar(midDeg, R_OUTER_TEXT);
    outerText.setAttribute('x', op.x);
    outerText.setAttribute('y', op.y);
    outerText.setAttribute('class', 'cof-label cof-label-major');
    outerText.textContent = NOTE_DISPLAY[NOTE_NAMES[pc]];
    outerG.appendChild(outerText);
    container.appendChild(outerG);

    // Inner ring (minor) — relative minor sits 3 semitones below the major
    const minorPc = (pc + 9) % 12;
    const innerG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    innerG.classList.add('cof-slot', 'cof-inner');
    innerG.dataset.pc = minorPc;
    innerG.dataset.ring = 'inner';
    const innerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    innerPath.setAttribute('d', wedgePath(startDeg, endDeg, R_MID, R_INNER));
    innerPath.setAttribute('class', 'cof-wedge');
    innerG.appendChild(innerPath);
    const innerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const ip = polar(midDeg, R_INNER_TEXT);
    innerText.setAttribute('x', ip.x);
    innerText.setAttribute('y', ip.y);
    innerText.setAttribute('class', 'cof-label cof-label-minor');
    innerText.textContent = NOTE_DISPLAY[NOTE_NAMES[minorPc]] + 'm';
    innerG.appendChild(innerText);
    container.appendChild(innerG);
  }
}

export function updateCircleHighlight() {
  document.querySelectorAll('.cof-slot').forEach(s => s.classList.remove('active'));
  if (!state.currentChord) return;
  const rootPc = NOTE_NAMES.indexOf(state.currentChord.root);
  const quality = state.currentChord.quality;
  const ring = INNER_QUALITIES.has(quality) ? 'inner'
             : OUTER_QUALITIES.has(quality) ? 'outer'
             : 'outer';
  const match = document.querySelector(`.cof-slot[data-ring="${ring}"][data-pc="${rootPc}"]`);
  if (match) match.classList.add('active');
}
