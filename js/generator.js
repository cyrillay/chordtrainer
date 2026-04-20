// Random chord generation + upcoming-queue management.
// Two generation modes:
//   - random (default): pick any allowed root + quality + inversion
//   - progressions: walk through predefined chord progressions (see progressions.js)

import { state } from './state.js';
import { CHORD_FORMULAS, NOTE_DISPLAY, buildChord, noteToPitchClass, pitchClassToDisplay } from './theory.js';
import { ProgressionStream } from './progressions.js';

export const QUEUE_SIZE = 3;

const progressionStream = new ProgressionStream();

export function getEnabledQualities() {
  return Array.from(document.querySelectorAll('[data-quality]'))
    .filter(c => c.checked)
    .map(c => c.dataset.quality);
}

export function getEnabledRoots() {
  return Array.from(document.querySelectorAll('[data-root]'))
    .filter(c => c.checked)
    .map(c => c.dataset.root);
}

function progressionsModeOn() {
  const cb = document.getElementById('progressionsCb');
  return cb && cb.checked;
}

function smartPivotsOn() {
  const cb = document.getElementById('smartPivotsCb');
  return cb && cb.checked;
}

export function resetProgressionStream() {
  progressionStream.setAllowedRoots(getEnabledRoots());
  progressionStream.setEnabledQualities(getEnabledQualities());
  progressionStream.setSmartPivots(smartPivotsOn());
  progressionStream.advanceProgression();
}

export function syncProgressionConfig() {
  progressionStream.setAllowedRoots(getEnabledRoots());
  progressionStream.setEnabledQualities(getEnabledQualities());
  progressionStream.setSmartPivots(smartPivotsOn());
}

export function countUsableProgressions() {
  return progressionStream.usableCount();
}

function inversionsOn() {
  const cb = document.getElementById('inversionsCb');
  return cb && cb.checked;
}

function generateRandomFreeChord(avoidSymbols) {
  const qualities = getEnabledQualities();
  const roots = getEnabledRoots();

  if (qualities.length === 0 || roots.length === 0) {
    document.getElementById('chordDisplay').textContent = '—';
    document.getElementById('status').textContent = 'Select at least one root and quality';
    return null;
  }

  const useInversions = inversionsOn();
  let attempt = 0;
  let chord;
  do {
    const root = roots[Math.floor(Math.random() * roots.length)];
    const quality = qualities[Math.floor(Math.random() * qualities.length)];
    const numNotes = CHORD_FORMULAS[quality].intervals.length;
    const inversion = useInversions ? Math.floor(Math.random() * numNotes) : 0;
    chord = buildChord(root, quality, inversion);
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
  renderQueue();
}

export function renderQueue() {
  const container = document.getElementById('chordQueue');
  const items = document.getElementById('queueItems');
  if (!container || !items) return;

  if (state.chordQueue.length === 0) {
    container.classList.remove('active');
    return;
  }

  container.classList.add('active');
  items.innerHTML = state.chordQueue.map((chord, idx) => {
    const formula = CHORD_FORMULAS[chord.quality];
    const rootDisplay = NOTE_DISPLAY[chord.root];
    const suffix = formula.suffix;
    const bassNote = chord.orderedNotes[0] !== noteToPitchClass(chord.root)
      ? '/' + pitchClassToDisplay(chord.orderedNotes[0])
      : '';
    return `<div class="queue-item">
      <span class="position">${idx + 1}</span>
      <span>${rootDisplay}<span class="accent">${suffix}${bassNote}</span></span>
    </div>`;
  }).join('');
}

export function advanceToNextChord(displayChord) {
  fillQueue();
  const next = state.chordQueue.shift();
  if (next) displayChord(next);
  fillQueue();
}
