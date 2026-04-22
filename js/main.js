// Entry point: wires DOM events, initializes modules.
import { state } from './state.js';
import {
  fillQueue,
  advanceToNextChord,
  resetProgressionStream,
  syncProgressionConfig,
  setProgressionCycles
} from './generator.js';
import { buildPiano, displayChord, updatePianoHighlight, updateStatus, renderNextPreview, cheatCurrentChord } from './views.js';
import { startMicrophone, stopMicrophone, loadSensitivity, syncSlidersFromState, bindSensitivityControls } from './audio.js';
import { startMidi, stopMidi } from './midi.js';
import { startDynamic, stopDynamic, setBpm, setMetronomeMuted } from './dynamic.js';
import { buildCircle, updateCircleHighlight } from './circle.js';
import { buildGuitar, updateGuitarHighlight } from './guitar.js';
import { initProgressionModal } from './progressionManager.js';
import { initRewards, setRewardsEnabled, isRewardsEnabled } from './rewards.js';

// Visible instrument: 'piano' or 'guitar'. Persisted so the choice survives reloads.
let currentInstrument = localStorage.getItem('chordTrainer.instrument') || 'piano';

function updateRootsSummary() {
  const checked = document.querySelectorAll('[data-root]:checked').length;
  const summary = document.getElementById('rootsSummary');
  if (summary) summary.textContent = `${checked} selected`;
}

export function refreshInputReadout() {
  const active = state.isListening || state.midiEnabled;
  document.getElementById('inputReadout').style.display = active ? 'block' : 'none';
}

// ---- Input mode (mic vs MIDI) ----

async function switchInputMode(mode) {
  // Start the new mode before stopping the old one, so a failed permission
  // request doesn't leave the user with no input at all.
  if (mode === 'listening') {
    if (!state.isListening) await startMicrophone();
    if (state.isListening && state.midiEnabled) stopMidi();
  } else if (mode === 'midi') {
    if (!state.midiEnabled) await startMidi();
    if (state.midiEnabled && state.isListening) stopMicrophone();
  }
  updateInputModeButton();
  refreshInputReadout();
  updateStatus();
}

function updateInputModeButton() {
  const btn = document.getElementById('inputModeBtn');
  if (btn) {
    const mode = state.midiEnabled ? 'midi' : 'listening';
    btn.textContent = mode === 'midi' ? 'MIDI Mode' : 'Listening Mode';
    btn.dataset.mode = mode;
  }
  const micBtn = document.getElementById('micBtn');
  if (micBtn) {
    micBtn.textContent = state.isListening ? 'Stop microphone' : 'Enable microphone';
    micBtn.classList.toggle('danger', state.isListening);
  }
  const midiBtn = document.getElementById('midiBtn');
  if (midiBtn) {
    midiBtn.textContent = state.midiEnabled ? 'Disconnect MIDI' : 'Connect MIDI';
    midiBtn.classList.toggle('danger', state.midiEnabled);
  }
}

document.getElementById('inputModeBtn').addEventListener('click', async () => {
  // Toggle between modes. Each click re-requests permission for the target mode,
  // which lets the user recover if they denied permission on a prior attempt.
  const next = state.midiEnabled ? 'listening' : 'midi';
  await switchInputMode(next);
});

document.getElementById('micBtn').addEventListener('click', async () => {
  if (state.isListening) {
    stopMicrophone();
  } else {
    await startMicrophone();
    if (state.isListening && state.midiEnabled) stopMidi();
  }
  updateInputModeButton();
  refreshInputReadout();
  updateStatus();
});

document.getElementById('midiBtn').addEventListener('click', async () => {
  if (state.midiEnabled) {
    stopMidi();
  } else {
    await startMidi();
    if (state.midiEnabled && state.isListening) stopMicrophone();
  }
  updateInputModeButton();
  refreshInputReadout();
  updateStatus();
});

// ---- Instrument display (piano vs guitar) ----

function showInstrumentEnabled() {
  return document.getElementById('showInstrumentCb').checked;
}

function applyInstrumentVisibility() {
  const show = showInstrumentEnabled();
  const pianoWrap = document.getElementById('pianoWrap');
  const guitarWrap = document.getElementById('guitarWrap');
  const actions = document.getElementById('instrumentActions');
  const btn = document.getElementById('changeInstrumentBtn');

  if (!show) {
    pianoWrap.style.display = 'none';
    guitarWrap.style.display = 'none';
    actions.style.display = 'none';
    return;
  }
  actions.style.display = 'flex';
  pianoWrap.style.display = currentInstrument === 'piano' ? 'block' : 'none';
  guitarWrap.style.display = currentInstrument === 'guitar' ? 'block' : 'none';
  if (btn) btn.textContent = currentInstrument === 'piano' ? 'Guitar mode' : 'Piano mode';
  if (currentInstrument === 'piano') updatePianoHighlight();
  else updateGuitarHighlight();
}

document.getElementById('changeInstrumentBtn').addEventListener('click', () => {
  currentInstrument = currentInstrument === 'piano' ? 'guitar' : 'piano';
  localStorage.setItem('chordTrainer.instrument', currentInstrument);
  applyInstrumentVisibility();
});

// ---- Progressions filter / warning ----

function updateProgressionsAvailability() {
  syncProgressionConfig();
}

// ---- Standard event wiring ----

document.getElementById('newChordBtn').addEventListener('click', () => {
  advanceToNextChord(displayChord);
});

const bpmSlider = document.getElementById('bpmSlider');
const bpmValue = document.getElementById('bpmValue');
bpmSlider.addEventListener('input', () => {
  const v = parseInt(bpmSlider.value, 10);
  bpmValue.textContent = `${v} BPM`;
  setBpm(v);
});

document.getElementById('dynamicStartBtn').addEventListener('click', () => {
  if (state.dynamic.running) stopDynamic();
  else startDynamic();
});

document.getElementById('muteMetronomeCb').addEventListener('change', (e) => {
  setMetronomeMuted(e.target.checked);
});

// Space to advance to a new chord (disabled while dynamic mode runs).
// Shift+Enter: secret cheat — validates the current chord instantly (for testing).
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault();
    if (state.dynamic.running) return;
    advanceToNextChord(displayChord);
  }
  if (e.code === 'Enter' && e.shiftKey && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault();
    cheatCurrentChord();
  }
});

// Settings checkboxes.
document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => {
    if (cb.id === 'rewardsCb') {
      setRewardsEnabled(cb.checked);
    } else if (cb.id === 'showInstrumentCb') {
      applyInstrumentVisibility();
    } else if (cb.id === 'progressionsCb') {
      document.getElementById('smartPivotsLabel').style.display = cb.checked ? 'flex' : 'none';
      document.getElementById('progressionCyclesLabel').style.display = cb.checked ? 'flex' : 'none';
      document.getElementById('manageProgressionsWrap').style.display = cb.checked ? 'block' : 'none';
      if (cb.checked) {
        resetProgressionStream();
      }
      state.chordQueue = [];
      fillQueue();
      advanceToNextChord(displayChord);
    } else if (cb.id === 'smartPivotsCb') {
      syncProgressionConfig();
    } else if (cb.id === 'circleCb') {
      document.getElementById('circleWrap').style.display = cb.checked ? 'flex' : 'none';
      if (cb.checked) updateCircleHighlight();
    } else if (cb.id === 'inversionsCb') {
      state.chordQueue = [];
      fillQueue();
      renderNextPreview();
    } else if (cb.dataset.quality || cb.dataset.root) {
      if (cb.dataset.root) {
        updateRootsSummary();
        updateToggleAllRootsBtn();
      }
      syncProgressionConfig();
      updateProgressionsAvailability();
      state.chordQueue = [];
      fillQueue();
      renderNextPreview();
    }
  });
});

// Toggle all roots button.
document.getElementById('toggleAllRootsBtn').addEventListener('click', () => {
  const rootCbs = document.querySelectorAll('[data-root]');
  const allChecked = Array.from(rootCbs).every(cb => cb.checked);
  rootCbs.forEach(cb => cb.checked = !allChecked);
  updateRootsSummary();
  updateToggleAllRootsBtn();
  syncProgressionConfig();
  updateProgressionsAvailability();
  state.chordQueue = [];
  fillQueue();
  renderNextPreview();
});

function updateToggleAllRootsBtn() {
  const btn = document.getElementById('toggleAllRootsBtn');
  const rootCbs = document.querySelectorAll('[data-root]');
  const allChecked = Array.from(rootCbs).every(cb => cb.checked);
  btn.textContent = allChecked ? 'Unselect all' : 'Select all';
}

// Progression cycle buttons.
document.querySelectorAll('.cycle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cycle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setProgressionCycles(btn.dataset.cycles === 'Infinity' ? Infinity : parseInt(btn.dataset.cycles, 10));
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
initRewards();
// Sync rewards checkbox with persisted state.
const rewardsCb = document.getElementById('rewardsCb');
if (rewardsCb) rewardsCb.checked = isRewardsEnabled();
initProgressionModal(() => {
  syncProgressionConfig();
  updateProgressionsAvailability();
});
loadSensitivity();
bindSensitivityControls();
syncSlidersFromState();
buildPiano();
buildCircle();
buildGuitar();
updateRootsSummary();
applyInstrumentVisibility();
syncProgressionConfig();
fillQueue();
advanceToNextChord(displayChord);

// Auto-request the microphone on first load. The browser prompt counts as
// user interaction for the AudioContext, and if the user denies, they can
// retry later via the header mode switcher.
startMicrophone().finally(() => {
  updateInputModeButton();
  refreshInputReadout();
  updateStatus();
});
