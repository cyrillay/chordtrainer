// Random chord generation + upcoming-queue management.
// Two generation modes:
//   - random (default): pick any allowed root + quality + inversion
//   - progressions: walk through predefined chord progressions (see progressions.js)

import { state } from '../core/state.js';
import { CHORD_FORMULAS, NOTE_DISPLAY, buildChord, formatChordHtml, pickInversion } from '../core/theory.js';
import { ProgressionStream, romanToChord } from './progressions.js';
import { getActiveProgressions } from './progressionManager.js';
import { QUEUE_SIZE } from '../core/constants.js';
import { renderStage, displayChord } from '../instruments/chordDisplay.js';
import { $, checkedDataValues } from '../core/dom.js';

const progressionStream = new ProgressionStream();

export function getEnabledQualities() { return checkedDataValues('[data-quality]', 'quality'); }
export function getEnabledRoots()     { return checkedDataValues('[data-root]', 'root'); }

const isChecked = (id) => { const el = $(id); return !!(el && el.checked); };
const progressionsModeOn = () => isChecked('progressionsCb');
const smartPivotsOn      = () => isChecked('smartPivotsCb');
const inversionsOn       = () => isChecked('inversionsCb');

// 0–100. Probability that a generated chord is *actually* inverted (i.e. picks
// a non-root inversion). When the checkbox is off, this is ignored. Reads the
// active preset button (set by main.js) so the generator stays decoupled from
// the chosen UI shape (slider vs presets).
function inversionFrequency() {
  const btn = document.querySelector('.inv-preset-btn.active');
  const v = btn ? parseInt(btn.dataset.invFreq, 10) : 33;
  return isNaN(v) ? 33 : v;
}

export function syncProgressionConfig() {
  progressionStream.setAllProgressions(getActiveProgressions());
  progressionStream.setAllowedRoots(getEnabledRoots());
  progressionStream.setEnabledQualities(getEnabledQualities());
  progressionStream.setSmartPivots(smartPivotsOn());
  progressionStream.setUseInversions(inversionsOn());
  progressionStream.setInversionFrequency(inversionFrequency());
}

// Push the current settings into the stream and jump to a fresh progression
// — used when the user re-enables progression mode mid-session.
export function resetProgressionStream() {
  syncProgressionConfig();
  progressionStream.advanceProgression();
}

export function setProgressionCycles(n) {
  progressionStream.setCycles(n);
}

function generateRandomFreeChord(avoidSymbols) {
  const qualities = getEnabledQualities();
  const roots = getEnabledRoots();

  if (qualities.length === 0 || roots.length === 0) {
    const cd = $('chordDisplay');
    const inner = cd && cd.querySelector('.card-chord');
    if (inner) inner.textContent = '—';
    $('status').textContent = 'Select at least one root and quality';
    return null;
  }

  const useInversions = inversionsOn();
  const invFreq = inversionFrequency();
  let attempt = 0;
  let chord;
  do {
    const root = roots[Math.floor(Math.random() * roots.length)];
    const quality = qualities[Math.floor(Math.random() * qualities.length)];
    const numNotes = CHORD_FORMULAS[quality].intervals.length;
    chord = buildChord(root, quality, pickInversion(numNotes, useInversions, invFreq));
    attempt++;
  } while (avoidSymbols.includes(chord.symbol) && attempt < 10);

  return chord;
}

export function generateRandomChord(avoidSymbols = []) {
  if (progressionsModeOn()) {
    syncProgressionConfig();
    return progressionStream.next();
  }
  return generateRandomFreeChord(avoidSymbols);
}

export function fillQueue() {
  while (state.chordQueue.length < QUEUE_SIZE) {
    const avoid = [];
    if (state.currentChord) avoid.push(state.currentChord.symbol);
    state.chordQueue.forEach(c => avoid.push(c.symbol));
    const chord = generateRandomChord(avoid);
    if (!chord) break;
    state.chordQueue.push(chord);
  }
  renderStage();
  renderQueue();
}

// "Coming up" panel below the main stage. The stage itself only shows prev
// + current + next; this panel gives the broader context — the full
// progression with all its degrees in progression mode, or the queue of
// upcoming random chords.
export function renderQueue() {
  const container = $('chordQueue');
  const items = $('queueItems');
  const progHeader = $('queueProgHeader');
  if (!container || !items) return;

  const meta = state.currentChord && state.currentChord.meta;

  if (meta) {
    container.classList.add('active');
    const keyDisp = NOTE_DISPLAY[meta.key] || meta.key;
    const cycleInfo = meta.targetCycles > 1
      ? ` · cycle ${meta.cycle + 1}/${meta.targetCycles === Infinity ? '∞' : meta.targetCycles}`
      : '';
    if (progHeader) {
      progHeader.innerHTML = `<em>${meta.progression}</em> · in ${keyDisp}${cycleInfo}`;
      progHeader.style.display = '';
    }

    items.innerHTML = meta.tokens.map((token, i) => {
      const inv = (meta.inversions && meta.inversions[i]) || 0;
      const chord = romanToChord(token, meta.key, inv);
      const cls = i === meta.position ? 'queue-item current' : 'queue-item dimmed';
      return `<div class="${cls}" data-queue-idx="${i}">
        <span class="queue-degree">${token}</span>
        <span>${chord ? formatChordHtml(chord) : token}</span>
      </div>`;
    }).join('');
    bindQueueClicks(items);
    return;
  }

  if (progHeader) progHeader.style.display = 'none';

  if (state.chordQueue.length === 0) {
    container.classList.remove('active');
    return;
  }

  container.classList.add('active');
  items.innerHTML = state.chordQueue.map((chord, i) => {
    return `<div class="queue-item" data-queue-idx="${i}">
      <span>${formatChordHtml(chord)}</span>
    </div>`;
  }).join('');
  bindQueueClicks(items);
}

// Wire one click listener on the queue container — replaces any prior
// handler so we don't accumulate listeners across renders.
function bindQueueClicks(items) {
  items.onclick = (e) => {
    const item = e.target.closest('.queue-item');
    if (!item || !items.contains(item)) return;
    const idx = parseInt(item.dataset.queueIdx, 10);
    if (!isNaN(idx)) jumpToQueueIndex(idx);
  };
}

// Jump to a specific position in the "Coming up" panel.
//   - Progression mode: the panel shows all tokens, so idx is absolute and
//     can move forward OR backward within the progression.
//   - Random mode: the panel only shows upcoming chords, so idx is forward-
//     only — clicking item N consumes 0..N from the queue.
export function jumpToQueueIndex(idx) {
  const meta = state.currentChord && state.currentChord.meta;
  if (meta) {
    if (idx === meta.position || idx < 0 || idx >= meta.tokens.length) return;
    const inv = (meta.inversions && meta.inversions[idx]) || 0;
    const chord = romanToChord(meta.tokens[idx], meta.key, inv);
    if (!chord) return;
    chord.meta = {
      ...meta,
      token: meta.tokens[idx],
      position: idx
    };
    // Keep the stream in sync so subsequent advances continue from idx+1.
    progressionStream.setPosition(idx + 1);
    state.chordQueue = [];
    displayChord(chord);
    fillQueue();
    return;
  }

  if (idx < 0 || idx >= state.chordQueue.length) return;
  const target = state.chordQueue[idx];
  state.chordQueue.splice(0, idx + 1);
  displayChord(target);
  fillQueue();
}

export function advanceToNextChord(displayChord) {
  fillQueue();
  const next = state.chordQueue.shift();
  if (next) displayChord(next);
  fillQueue();
}
