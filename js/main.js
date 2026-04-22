// Entry point: wires DOM events, initializes modules.
import { state } from './state.js';
import {
  fillQueue,
  advanceToNextChord,
  resetProgressionStream,
  syncProgressionConfig,
  setProgressionCycles
} from './generator.js';
import {
  buildPiano, displayChord, updatePianoHighlight, updateStatus,
  renderNextPreview, cheatCurrentChord, invalidateShowInstrument
} from './views.js';
import {
  startMicrophone, stopMicrophone, loadSensitivity, syncSlidersFromState, bindSensitivityControls
} from './audio.js';
import { startMidi, stopMidi } from './midi.js';
import { startDynamic, stopDynamic, setBpm, setMetronomeMuted } from './dynamic.js';
import { buildCircle, updateCircleHighlight } from './circle.js';
import { buildGuitar, updateGuitarHighlight } from './guitar.js';
import { initProgressionModal } from './progressionManager.js';
import { initRewards, setRewardsEnabled, isRewardsEnabled } from './rewards.js';
import { $, $$, debounce, setDisplay } from './dom.js';
import { LS, REGENERATE_DEBOUNCE_MS } from './constants.js';

let currentInstrument = localStorage.getItem(LS.INSTRUMENT) || 'piano';

// ---- Queue regeneration (debounced) ----
// A single entry point so rapid setting changes (e.g. toggling several roots)
// collapse into one queue rebuild + one chord advance, instead of cascading.

const regenerate = debounce(() => {
  syncProgressionConfig();
  state.chordQueue = [];
  fillQueue();
  renderNextPreview();
}, REGENERATE_DEBOUNCE_MS);

function regenerateAndAdvance() {
  regenerate.cancel();
  syncProgressionConfig();
  state.chordQueue = [];
  fillQueue();
  advanceToNextChord(displayChord);
}

// ---- Roots summary & "select all" toggle ----

function updateRootsSummary() {
  const checked = $$('[data-root]:checked').length;
  const summary = $('rootsSummary');
  if (summary) summary.textContent = `${checked} selected`;
}

function updateToggleAllRootsBtn() {
  const btn = $('toggleAllRootsBtn');
  const rootCbs = $$('[data-root]');
  const allChecked = Array.from(rootCbs).every(cb => cb.checked);
  btn.textContent = allChecked ? 'Unselect all' : 'Select all';
}

// ---- Input mode (mic vs MIDI) ----

export function refreshInputReadout() {
  const active = state.isListening || state.midiEnabled;
  $('inputReadout').style.display = active ? 'block' : 'none';
}

async function switchInputMode(mode) {
  // Start new mode before stopping the old one, so a failed permission prompt
  // doesn't leave the user with no input at all.
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
  const btn = $('inputModeBtn');
  if (btn) {
    const mode = state.midiEnabled ? 'midi' : 'listening';
    btn.textContent = mode === 'midi' ? 'MIDI Mode' : 'Listening Mode';
    btn.dataset.mode = mode;
  }
  const micBtn = $('micBtn');
  if (micBtn) {
    micBtn.textContent = state.isListening ? 'Stop microphone' : 'Enable microphone';
    micBtn.classList.toggle('danger', state.isListening);
  }
  const midiBtn = $('midiBtn');
  if (midiBtn) {
    midiBtn.textContent = state.midiEnabled ? 'Disconnect MIDI' : 'Connect MIDI';
    midiBtn.classList.toggle('danger', state.midiEnabled);
  }
}

async function refreshAfterInput() {
  updateInputModeButton();
  refreshInputReadout();
  updateStatus();
}

$('inputModeBtn').addEventListener('click', () =>
  switchInputMode(state.midiEnabled ? 'listening' : 'midi')
);

$('micBtn').addEventListener('click', async () => {
  if (state.isListening) stopMicrophone();
  else {
    await startMicrophone();
    if (state.isListening && state.midiEnabled) stopMidi();
  }
  refreshAfterInput();
});

$('midiBtn').addEventListener('click', async () => {
  if (state.midiEnabled) stopMidi();
  else {
    await startMidi();
    if (state.midiEnabled && state.isListening) stopMicrophone();
  }
  refreshAfterInput();
});

// ---- Instrument display (piano vs guitar) ----

function applyInstrumentVisibility() {
  invalidateShowInstrument();
  const show = $('showInstrumentCb').checked;
  const pianoWrap = $('pianoWrap');
  const guitarWrap = $('guitarWrap');
  const actions = $('instrumentActions');
  const btn = $('changeInstrumentBtn');

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

$('changeInstrumentBtn').addEventListener('click', () => {
  currentInstrument = currentInstrument === 'piano' ? 'guitar' : 'piano';
  localStorage.setItem(LS.INSTRUMENT, currentInstrument);
  applyInstrumentVisibility();
});

// ---- Standard event wiring ----

$('newChordBtn').addEventListener('click', () => advanceToNextChord(displayChord));

const bpmSlider = $('bpmSlider');
const bpmValue = $('bpmValue');
bpmSlider.addEventListener('input', () => {
  const v = parseInt(bpmSlider.value, 10);
  bpmValue.textContent = `${v} BPM`;
  setBpm(v);
});

$('dynamicStartBtn').addEventListener('click', () => {
  if (state.dynamic.running) stopDynamic();
  else startDynamic();
});

$('muteMetronomeCb').addEventListener('change', (e) => setMetronomeMuted(e.target.checked));

// Keyboard shortcuts:
//   Space — advance (disabled during dynamic mode)
//   Shift+Enter — cheat (validate current chord) for testing
document.addEventListener('keydown', (e) => {
  const inField = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
  if (inField) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (state.dynamic.running) return;
    advanceToNextChord(displayChord);
  } else if (e.code === 'Enter' && e.shiftKey) {
    e.preventDefault();
    cheatCurrentChord();
  }
});

// ---- Settings checkboxes ----
// Each handler updates its own UI concern then asks for a regenerate.
// The regenerate is debounced so toggling several in quick succession (e.g.
// flipping six qualities) collapses into one queue rebuild.

const CHECKBOX_HANDLERS = {
  rewardsCb:        (cb) => setRewardsEnabled(cb.checked),
  showInstrumentCb: ()   => applyInstrumentVisibility(),
  progressionsCb:   (cb) => handleProgressionsToggle(cb.checked),
  smartPivotsCb:    ()   => regenerate(),
  circleCb:         (cb) => {
    setDisplay('circleWrap', cb.checked, 'flex');
    if (cb.checked) updateCircleHighlight();
  },
  inversionsCb:     ()   => regenerate(),
};

function handleProgressionsToggle(on) {
  setDisplay('smartPivotsLabel', on, 'flex');
  setDisplay('progressionCyclesLabel', on, 'flex');
  setDisplay('manageProgressionsWrap', on, 'block');
  if (on) resetProgressionStream();
  // Progressions toggling is the one case where we want the chord to change
  // immediately rather than at the next advance — otherwise the user sees a
  // stale chord from the other mode linger.
  regenerate.cancel();
  regenerateAndAdvance();
}

$$('input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => {
    const handler = CHECKBOX_HANDLERS[cb.id];
    if (handler) {
      handler(cb);
      return;
    }
    if (cb.dataset.root) {
      updateRootsSummary();
      updateToggleAllRootsBtn();
      regenerate();
    } else if (cb.dataset.quality) {
      regenerate();
    }
  });
});

// ---- Toggle all roots ----

$('toggleAllRootsBtn').addEventListener('click', () => {
  const rootCbs = $$('[data-root]');
  const allChecked = Array.from(rootCbs).every(cb => cb.checked);
  rootCbs.forEach(cb => cb.checked = !allChecked);
  updateRootsSummary();
  updateToggleAllRootsBtn();
  regenerate();
});

// ---- Progression cycle buttons ----

$$('.cycle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.cycle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setProgressionCycles(btn.dataset.cycles === 'Infinity' ? Infinity : parseInt(btn.dataset.cycles, 10));
  });
});

// ---- Advanced mode toggle ----

$('advancedBtn').addEventListener('click', () => {
  const btn = $('advancedBtn');
  const content = $('advancedContent');
  const expanded = btn.classList.toggle('expanded');
  content.classList.toggle('expanded', expanded);
});

// ---- Init ----

initRewards();
const rewardsCb = $('rewardsCb');
if (rewardsCb) rewardsCb.checked = isRewardsEnabled();

initProgressionModal(() => {
  syncProgressionConfig();
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
startMicrophone().finally(refreshAfterInput);
