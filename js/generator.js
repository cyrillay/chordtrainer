// Random chord generation + upcoming-queue management.
// Two generation modes:
//   - random (default): pick any allowed root + quality + inversion
//   - progressions: walk through predefined chord progressions (see progressions.js)

import { state } from './state.js';
import { CHORD_FORMULAS, NOTE_DISPLAY, buildChord, formatChordHtml } from './theory.js';
import { ProgressionStream, romanToChord } from './progressions.js';
import { getActiveProgressions } from './progressionManager.js';
import { QUEUE_SIZE } from './constants.js';
import { $, $$ } from './dom.js';

export { QUEUE_SIZE };

const progressionStream = new ProgressionStream();

function checkedValues(selector, attr) {
  const out = [];
  for (const el of $$(selector)) if (el.checked) out.push(el.dataset[attr]);
  return out;
}

export function getEnabledQualities() { return checkedValues('[data-quality]', 'quality'); }
export function getEnabledRoots()     { return checkedValues('[data-root]', 'root'); }

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

export function resetProgressionStream() {
  progressionStream.setAllProgressions(getActiveProgressions());
  progressionStream.setAllowedRoots(getEnabledRoots());
  progressionStream.setEnabledQualities(getEnabledQualities());
  progressionStream.setSmartPivots(smartPivotsOn());
  progressionStream.setUseInversions(inversionsOn());
  progressionStream.setInversionFrequency(inversionFrequency());
  progressionStream.advanceProgression();
}

export function syncProgressionConfig() {
  progressionStream.setAllProgressions(getActiveProgressions());
  progressionStream.setAllowedRoots(getEnabledRoots());
  progressionStream.setEnabledQualities(getEnabledQualities());
  progressionStream.setSmartPivots(smartPivotsOn());
  progressionStream.setUseInversions(inversionsOn());
  progressionStream.setInversionFrequency(inversionFrequency());
}

export function setProgressionCycles(n) {
  progressionStream.setCycles(n);
}

export function countUsableProgressions() {
  return progressionStream.usableCount();
}

function generateRandomFreeChord(avoidSymbols) {
  const qualities = getEnabledQualities();
  const roots = getEnabledRoots();

  if (qualities.length === 0 || roots.length === 0) {
    $('chordDisplay').textContent = '—';
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
    // With probability invFreq%, force a non-root inversion (uniform among
    // 1..numNotes-1). Otherwise root position. So the slider literally is
    // "% of chords that come out inverted".
    const invert = useInversions && numNotes > 1 && Math.random() * 100 < invFreq;
    const inversion = invert ? 1 + Math.floor(Math.random() * (numNotes - 1)) : 0;
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
  const container = $('chordQueue');
  const items = $('queueItems');
  const progHeader = $('queueProgHeader');
  if (!container || !items) return;

  const meta = state.currentChord && state.currentChord.meta;

  // Progression mode: show the full progression with all degrees + chords.
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
      return `<div class="${cls}">
        <span class="queue-degree">${token}</span>
        <span>${chord ? formatChordHtml(chord) : token}</span>
      </div>`;
    }).join('');
    return;
  }

  // Random mode: show queued chords without degrees.
  if (progHeader) progHeader.style.display = 'none';

  if (state.chordQueue.length === 0) {
    container.classList.remove('active');
    return;
  }

  container.classList.add('active');
  items.innerHTML = state.chordQueue.map((chord) => {
    return `<div class="queue-item">
      <span>${formatChordHtml(chord)}</span>
    </div>`;
  }).join('');
}

export function advanceToNextChord(displayChord) {
  fillQueue();
  const next = state.chordQueue.shift();
  if (next) displayChord(next);
  fillQueue();
}
