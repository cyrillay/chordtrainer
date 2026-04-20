// Entry point: wires DOM events, initializes modules.
import { state } from './state.js';
import { fillQueue, advanceToNextChord, resetProgressionStream, syncProgressionConfig } from './generator.js';
import { buildPiano, displayChord, updatePianoHighlight, updateStatus } from './views.js';
import { startMicrophone, stopMicrophone, loadSensitivity, syncSlidersFromState, bindSensitivityControls } from './audio.js';
import { startMidi, stopMidi } from './midi.js';
import { startDynamic, stopDynamic, setBpm, setDynamicEnabled } from './dynamic.js';
import { buildCircle, updateCircleHighlight } from './circle.js';
import { buildGuitar, updateGuitarHighlight } from './guitar.js';

function updateRootsSummary() {
  const checked = document.querySelectorAll('[data-root]:checked').length;
  const summary = document.getElementById('rootsSummary');
  if (summary) summary.textContent = `${checked} selected`;
}

export function refreshInputReadout() {
  const active = state.isListening || state.midiEnabled;
  document.getElementById('inputReadout').style.display = active ? 'block' : 'none';
}

document.getElementById('newChordBtn').addEventListener('click', () => {
  advanceToNextChord(displayChord);
});

document.getElementById('micBtn').addEventListener('click', async () => {
  if (state.isListening) {
    stopMicrophone();
  } else {
    await startMicrophone();
  }
  refreshInputReadout();
  updateStatus();
});

document.getElementById('midiBtn').addEventListener('click', async () => {
  if (state.midiEnabled) {
    stopMidi();
  } else {
    await startMidi();
  }
  refreshInputReadout();
  updateStatus();
});

// Dynamic mode toggle
document.getElementById('dynamicModeCb').addEventListener('change', (e) => {
  setDynamicEnabled(e.target.checked);
});

// Tempo slider
const bpmSlider = document.getElementById('bpmSlider');
const bpmValue = document.getElementById('bpmValue');
bpmSlider.addEventListener('input', () => {
  const v = parseInt(bpmSlider.value, 10);
  bpmValue.textContent = `${v} BPM`;
  setBpm(v);
});

// Start/stop tempo button
document.getElementById('dynamicStartBtn').addEventListener('click', () => {
  if (state.dynamic.running) stopDynamic();
  else startDynamic();
});

// Space to advance to a new chord (disabled while dynamic mode runs).
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault();
    if (state.dynamic.running) return;
    advanceToNextChord(displayChord);
  }
});

// Refresh state when settings change.
document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => {
    if (cb.id === 'pianoHighlightCb') {
      updatePianoHighlight();
    } else if (cb.id === 'progressionsCb') {
      document.getElementById('smartPivotsLabel').style.display = cb.checked ? 'flex' : 'none';
      if (cb.checked) resetProgressionStream();
      state.chordQueue = [];
      fillQueue();
      advanceToNextChord(displayChord);
    } else if (cb.id === 'smartPivotsCb') {
      syncProgressionConfig();
    } else if (cb.id === 'circleCb') {
      document.getElementById('circleWrap').style.display = cb.checked ? 'flex' : 'none';
      if (cb.checked) updateCircleHighlight();
    } else if (cb.id === 'guitarCb') {
      const showGuitar = cb.checked;
      document.getElementById('pianoWrap').style.display = showGuitar ? 'none' : 'block';
      document.getElementById('guitarWrap').style.display = showGuitar ? 'block' : 'none';
      if (showGuitar) updateGuitarHighlight();
    } else if (cb.dataset.quality || cb.dataset.root) {
      // Chord pool changed: flush queue so new chords match the new settings.
      state.chordQueue = [];
      fillQueue();
      if (cb.dataset.root) {
        updateRootsSummary();
        syncProgressionConfig();
      }
    }
  });
});

// Advanced mode toggle.
document.getElementById('advancedBtn').addEventListener('click', () => {
  const btn = document.getElementById('advancedBtn');
  const content = document.getElementById('advancedContent');
  const expanded = btn.classList.toggle('expanded');
  content.classList.toggle('expanded', expanded);
});

// Init.
loadSensitivity();
bindSensitivityControls();
syncSlidersFromState();
buildPiano();
buildCircle();
buildGuitar();
updateRootsSummary();
fillQueue();
advanceToNextChord(displayChord);
