// Entry point: wires DOM events, initializes modules.
import { state } from './core/state.js';
import {
  fillQueue,
  advanceToNextChord,
  resetProgressionStream,
  syncProgressionConfig,
  setProgressionCycles
} from './training/generator.js';
import { buildPiano, updatePianoHighlight, invalidatePianoCaches } from './instruments/piano.js';
import {
  displayChord, updateStatus, renderNextPreview, cheatCurrentChord
} from './instruments/chordDisplay.js';
import { loadSensitivity, syncSlidersFromState, bindSensitivityControls } from './audio/audio.js';
import { startDynamic, stopDynamic, setBpm, setMetronomeMuted, setMetronomeAccent } from './training/dynamic.js';
import { buildCircle, updateCircleHighlight } from './instruments/circle.js';
import { buildGuitar, updateGuitarHighlight, cycleVoicing, updateAltVoicingButton } from './instruments/guitar.js';
import { initProgressionModal } from './training/progressionManager.js';
import { initRewards, setRewardsEnabled, isRewardsEnabled } from './ux/rewards.js';
import { initAchievements, recordAction } from './ux/achievements.js';
import { bindInputMode, autoStartMicrophone } from './ux/inputMode.js';
import { initPresets, refreshActivePreset, syncInversionFreqVisibility } from './ux/presets.js';
import { startOnboarding } from './ux/onboarding.js';
import { $, $$, debounce, setDisplay } from './core/dom.js';
import { LS, REGENERATE_DEBOUNCE_MS } from './core/constants.js';

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
// Both readouts depend on the same checkbox state; refresh together so callers
// don't have to remember the pair.

function refreshRootsUi() {
  const rootCbs = Array.from($$('[data-root]'));
  const checkedCount = rootCbs.reduce((n, cb) => n + (cb.checked ? 1 : 0), 0);
  const summary = $('rootsSummary');
  if (summary) summary.textContent = `${checkedCount} selected`;
  const btn = $('toggleAllRootsBtn');
  if (btn) btn.textContent = checkedCount === rootCbs.length ? 'Unselect all' : 'Select all';
}

// ---- Instrument display (piano vs guitar) ----

function applyInstrumentVisibility() {
  invalidatePianoCaches();
  const show = $('showInstrumentCb').checked;
  const area = $('instrumentArea');
  const pianoWrap = $('pianoWrap');
  const guitarWrap = $('guitarWrap');
  const actions = $('instrumentActions');

  if (!show) {
    if (area) area.style.display = 'none';
    actions.style.display = 'none';
    updateAltVoicingButton();
    return;
  }
  if (area) area.style.display = 'grid';
  actions.style.display = 'flex';
  // Toggle via .is-hidden (opacity + pointer-events) so both wraps remain in
  // the grid cell — the taller one (guitar) always reserves the height — and
  // the switch fades smoothly without the page shifting below.
  pianoWrap.classList.toggle('is-hidden', currentInstrument !== 'piano');
  guitarWrap.classList.toggle('is-hidden', currentInstrument !== 'guitar');
  $$('.instrument-mode-btn').forEach(btn => {
    const isActive = btn.dataset.instrument === currentInstrument;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  if (currentInstrument === 'piano') updatePianoHighlight();
  else updateGuitarHighlight();
  // Refresh after the visibility flip so the alt-voicing button (which is
  // guitar-only) reads the new wrap visibility.
  updateAltVoicingButton();
}

$$('.instrument-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const next = btn.dataset.instrument;
    if (next === currentInstrument) return;
    currentInstrument = next;
    localStorage.setItem(LS.INSTRUMENT, currentInstrument);
    applyInstrumentVisibility();
  });
});

$('altVoicingBtn').addEventListener('click', () => cycleVoicing());

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
  if (state.dynamic.running) {
    stopDynamic();
  } else {
    startDynamic();
    recordAction('metroStart');
  }
});

$('muteMetronomeCb').addEventListener('change', (e) => setMetronomeMuted(e.target.checked));
$('accentSelect').addEventListener('change', (e) => setMetronomeAccent(e.target.value));

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

// Mobile triple-tap = Space. Three taps within TRIPLE_TAP_WINDOW_MS, each
// landing on non-interactive page area, advance to the next chord. We skip
// taps inside controls (button/input/label/etc.) so toggling a checkbox or
// pressing a button three times in a row doesn't accidentally skip ahead,
// and skip taps inside open modals so the gesture only acts on the main UI.
const TRIPLE_TAP_WINDOW_MS = 600;
const INTERACTIVE_SEL = 'button, input, select, textarea, a, label, [role="button"]';
const MODAL_SEL = '.onboard-overlay, .prog-modal-overlay';
const tapTimes = [];
document.addEventListener('touchstart', (e) => {
  if (state.dynamic.running) return;
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest(INTERACTIVE_SEL)) return;
  if (t.closest(MODAL_SEL)) return;
  const now = performance.now();
  tapTimes.push(now);
  while (tapTimes.length && now - tapTimes[0] > TRIPLE_TAP_WINDOW_MS) tapTimes.shift();
  if (tapTimes.length >= 3) {
    tapTimes.length = 0;
    advanceToNextChord(displayChord);
  }
}, { passive: true });

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
  inversionsCb:     ()   => { syncInversionFreqVisibility(); refreshActivePreset(); regenerate(); },
  showFingeringsCb: (cb) => {
    applyInstrumentVisibility();
    if (!cb.checked) recordAction('fingeringsOff');
  },
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
      refreshRootsUi();
      refreshActivePreset();
      regenerate();
    } else if (cb.dataset.quality) {
      refreshActivePreset();
      regenerate();
    }
  });
});

// ---- Toggle all roots ----

$('toggleAllRootsBtn').addEventListener('click', () => {
  const rootCbs = $$('[data-root]');
  const allChecked = Array.from(rootCbs).every(cb => cb.checked);
  rootCbs.forEach(cb => cb.checked = !allChecked);
  refreshRootsUi();
  refreshActivePreset();
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
initAchievements();
const rewardsCb = $('rewardsCb');
if (rewardsCb) rewardsCb.checked = isRewardsEnabled();

initProgressionModal(() => syncProgressionConfig());

loadSensitivity();
bindSensitivityControls();
syncSlidersFromState();
buildPiano();
buildCircle();
buildGuitar();
initPresets({
  regenerate,
  applyInstrumentVisibility,
  refreshRoots: refreshRootsUi,
});
bindInputMode();
refreshRootsUi();
refreshActivePreset();
applyInstrumentVisibility();
syncProgressionConfig();
fillQueue();
advanceToNextChord(displayChord);

startOnboarding();
autoStartMicrophone();
