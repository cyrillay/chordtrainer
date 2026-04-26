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
import { buildGuitar, updateGuitarHighlight, cycleVoicing, updateAltVoicingButton } from './guitar.js';
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

function updateInputModeButton() {
  const micBtn = $('micBtn');
  const midiBtn = $('midiBtn');
  if (micBtn) {
    micBtn.classList.toggle('active', state.isListening);
    micBtn.setAttribute('aria-pressed', state.isListening ? 'true' : 'false');
    micBtn.title = state.isListening ? 'Stop microphone' : 'Enable microphone';
  }
  if (midiBtn) {
    midiBtn.classList.toggle('active', state.midiEnabled);
    midiBtn.setAttribute('aria-pressed', state.midiEnabled ? 'true' : 'false');
    midiBtn.title = state.midiEnabled ? 'Disconnect MIDI' : 'Connect MIDI';
  }
  // CTA arrow: visible only when no input is active so a brand-new user who
  // skipped the mic prompt during onboarding gets a clear nudge.
  const noInput = !state.isListening && !state.midiEnabled;
  setDisplay('inputCta', noInput, 'flex');
}

function showInputHelp(message) {
  const help = $('inputHelp');
  if (!help) return;
  if (message) {
    help.textContent = message;
    help.classList.add('visible');
  } else {
    help.classList.remove('visible');
  }
}

async function refreshAfterInput() {
  updateInputModeButton();
  refreshInputReadout();
  updateStatus();
}

$('micBtn').addEventListener('click', async () => {
  if (state.isListening) {
    stopMicrophone();
    showInputHelp('');
  } else {
    // Re-runs getUserMedia. The browser re-prompts if the user dismissed the
    // prompt earlier; if they hit "Block", it rejects immediately — in which
    // case we surface a help message pointing at the URL bar lock icon.
    const result = await startMicrophone();
    if (result === 'ok') {
      showInputHelp('');
      if (state.midiEnabled) stopMidi();
    } else if (result === 'denied') {
      showInputHelp('Mic blocked by browser. Click the 🔒 (or 🎤) in the URL bar to allow access, then reload.');
    }
  }
  refreshAfterInput();
});

$('midiBtn').addEventListener('click', async () => {
  if (state.midiEnabled) stopMidi();
  else {
    await startMidi();
    if (state.midiEnabled && state.isListening) stopMicrophone();
  }
  showInputHelp('');
  refreshAfterInput();
});

// ---- Instrument display (piano vs guitar) ----

function applyInstrumentVisibility() {
  invalidateShowInstrument();
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
  inversionsCb:     (cb) => { syncInversionFreqVisibility(); refreshActivePreset(); regenerate(); },
  showFingeringsCb: ()   => applyInstrumentVisibility(),
};

// ---- Inversion frequency (3-preset selector: 33% / 66% / 100%) ----

const INVERSION_FREQ_OPTIONS = [33, 66];
let currentInversionFreq = 33;

function syncInversionFreqVisibility() {
  setDisplay('inversionFreqWrap', $('inversionsCb').checked, 'flex');
}

function setInversionFreq(pct, opts = {}) {
  const v = INVERSION_FREQ_OPTIONS.includes(pct) ? pct : 33;
  currentInversionFreq = v;
  $$('.inv-preset-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.invFreq, 10) === v));
  localStorage.setItem(LS.INVERSION_FREQ, String(v));
  if (!opts.silent) {
    refreshActivePreset();
    regenerate();
  }
}

export function getInversionFreq() { return currentInversionFreq; }

(function initInversionFreq() {
  const stored = parseInt(localStorage.getItem(LS.INVERSION_FREQ), 10);
  const initial = INVERSION_FREQ_OPTIONS.includes(stored) ? stored : 33;
  setInversionFreq(initial, { silent: true });
  syncInversionFreqVisibility();
  $$('.inv-preset-btn').forEach(b => {
    b.addEventListener('click', () => setInversionFreq(parseInt(b.dataset.invFreq, 10)));
  });
})();

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
  updateRootsSummary();
  updateToggleAllRootsBtn();
  refreshActivePreset();
  regenerate();
});

// ---- Chord-selection presets ----
// Each preset is a complete description: which qualities, which roots, and
// whether to include inversions. Applying a preset wipes the current selection
// and replaces it; clicking the "active" preset is a no-op.

const PRESETS = {
  firstTimer:   { qualities: ['maj'],                                                roots: ['C', 'F', 'G'],                inversions: false, showFingerings: true },
  beginner:     { qualities: ['maj', 'min'],                                         roots: ['C', 'G', 'D', 'A', 'F'],      inversions: false },
  intermediate: { qualities: ['maj', 'min'],                                         roots: 'all',                          inversions: true, inversionFreq: 33 },
  advanced:     { qualities: ['maj', 'min', 'dom7', 'maj7', 'min7'],                 roots: 'all',                          inversions: true, inversionFreq: 66 },
  expert:       { qualities: ['maj', 'min', 'dim', 'aug', 'dom7', 'maj7', 'min7', 'm7b5', 'mMaj7'], roots: 'all',          inversions: true, inversionFreq: 66, showCircle: true, showInstrument: false }
};

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  const qualSet = new Set(p.qualities);
  $$('[data-quality]').forEach(cb => cb.checked = qualSet.has(cb.dataset.quality));
  const rootCbs = $$('[data-root]');
  if (p.roots === 'all') {
    rootCbs.forEach(cb => cb.checked = true);
  } else {
    const rootSet = new Set(p.roots);
    rootCbs.forEach(cb => cb.checked = rootSet.has(cb.dataset.root));
  }
  $('inversionsCb').checked = p.inversions;
  if (p.inversions && p.inversionFreq) setInversionFreq(p.inversionFreq, { silent: true });
  syncInversionFreqVisibility();
  // Optional preset-driven options. Defaults preserve the user's current
  // setting if the preset doesn't mention them, so non-prescriptive presets
  // don't blow away user choices.
  if ('showFingerings' in p) {
    const cb = $('showFingeringsCb');
    if (cb) cb.checked = p.showFingerings;
  }
  if ('showInstrument' in p) {
    const cb = $('showInstrumentCb');
    if (cb) cb.checked = p.showInstrument;
  }
  if ('showCircle' in p) {
    const cb = $('circleCb');
    if (cb) {
      cb.checked = p.showCircle;
      setDisplay('circleWrap', p.showCircle, 'flex');
      if (p.showCircle) updateCircleHighlight();
    }
  }
  applyInstrumentVisibility();
  updateRootsSummary();
  updateToggleAllRootsBtn();
  setActivePresetButton(name);
  regenerate();
}

function setActivePresetButton(name) {
  $$('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === name));
}

// After any manual change, recompute which preset (if any) matches the current
// selection — so toggling settings can promote or clear the preset highlight.
function refreshActivePreset() {
  const currentQs = new Set(getCheckedAttr('[data-quality]', 'quality'));
  const currentRs = new Set(getCheckedAttr('[data-root]', 'root'));
  const inv = $('inversionsCb').checked;
  const invFreq = currentInversionFreq;
  let match = null;
  for (const [name, p] of Object.entries(PRESETS)) {
    if (p.inversions !== inv) continue;
    if (p.inversions && p.inversionFreq && p.inversionFreq !== invFreq) continue;
    if (!setsEqual(currentQs, new Set(p.qualities))) continue;
    const expectedRoots = p.roots === 'all'
      ? new Set($$('[data-root]').length ? Array.from($$('[data-root]')).map(cb => cb.dataset.root) : [])
      : new Set(p.roots);
    if (!setsEqual(currentRs, expectedRoots)) continue;
    match = name;
    break;
  }
  setActivePresetButton(match);
}

function getCheckedAttr(sel, attr) {
  const out = [];
  for (const el of $$(sel)) if (el.checked) out.push(el.dataset[attr]);
  return out;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

$$('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
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
refreshActivePreset();
applyInstrumentVisibility();
syncProgressionConfig();
fillQueue();
advanceToNextChord(displayChord);

// ---- Onboarding (first-visit walkthrough) ----
// Skippable 4-step pointer at the controls a brand-new user needs:
// the chord display, the input mode, the chord-selection presets, and
// the new-chord button. Persisted via LS.ONBOARDED so it never re-fires.

const ONBOARD_STEPS = [
  {
    title: 'Welcome to Étude',
    body: 'A chord trainer that listens and validates your chords as you play them.',
    target: 'chordDisplay'
  },
  {
    title: 'Pick how you play',
    body: 'Pick the <strong>microphone</strong> (default) or <strong>MIDI</strong> if you have a keyboard plugged in. You can switch any time.',
    target: 'inputSelector'
  },
  {
    title: 'Match your level',
    body: 'Start with a <strong>preset</strong> — First timer locks you to C, F, G majors. Move up as you get comfortable.',
    target: 'presetRow'
  },
  {
    title: 'New chord, anytime',
    body: 'Click <strong>New chord</strong> (or hit Space) to skip ahead. Play the displayed chord on your instrument and the app does the rest.',
    target: 'newChordBtn'
  }
];

function startOnboarding() {
  if (localStorage.getItem(LS.ONBOARDED) === '1') return;
  const overlay = $('onboardOverlay');
  if (!overlay) return;
  const card = overlay.querySelector('.onboard-card');
  let idx = 0;
  let activeTarget = null;

  const stepEl = $('onboardStep');
  const titleEl = $('onboardTitle');
  const bodyEl = $('onboardBody');
  const nextBtn = $('onboardNext');
  const skipBtn = $('onboardSkip');

  const clearTarget = () => {
    if (activeTarget) {
      activeTarget.classList.remove('onboard-target');
      activeTarget = null;
    }
  };

  // Position the card adjacent to the highlighted target instead of centered,
  // so the user's eye doesn't have to bounce between the spotlight and the
  // instructions. Falls back to centered (CSS flex) when there's no target.
  const placeCard = () => {
    if (!card) return;
    if (!activeTarget) {
      card.style.position = '';
      card.style.top = '';
      card.style.left = '';
      card.style.margin = '';
      return;
    }
    const target = activeTarget.getBoundingClientRect();
    // Reset before measuring so the card's natural width/height is used,
    // not the previous placement's clamped size.
    card.style.position = 'fixed';
    card.style.top = '0px';
    card.style.left = '0px';
    card.style.margin = '0';
    const cardRect = card.getBoundingClientRect();
    const cardW = cardRect.width;
    const cardH = cardRect.height;
    const margin = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer below; fall back to above; final fallback clamps below the viewport edge.
    let top = target.bottom + margin;
    if (top + cardH > vh - margin) {
      const aboveTop = target.top - margin - cardH;
      top = aboveTop >= margin ? aboveTop : Math.max(margin, vh - margin - cardH);
    }
    let left = target.left + target.width / 2 - cardW / 2;
    left = Math.max(margin, Math.min(left, vw - margin - cardW));

    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  };

  const renderStep = () => {
    const s = ONBOARD_STEPS[idx];
    stepEl.textContent = `${idx + 1} / ${ONBOARD_STEPS.length}`;
    titleEl.textContent = s.title;
    bodyEl.innerHTML = s.body;
    nextBtn.textContent = idx === ONBOARD_STEPS.length - 1 ? 'Got it' : 'Next →';
    clearTarget();
    const t = s.target ? $(s.target) : null;
    if (t) {
      t.classList.add('onboard-target');
      activeTarget = t;
      overlay.classList.add('has-target');
      // Use 'auto' (instant) so we can place the card on the same frame —
      // smooth scroll would have us positioning against a stale rect.
      t.scrollIntoView({ behavior: 'auto', block: 'center' });
    } else {
      overlay.classList.remove('has-target');
    }
    // rAF lets the browser settle layout (post-scroll, post-content swap)
    // before we measure for placement.
    requestAnimationFrame(placeCard);
  };

  const onResize = () => placeCard();

  const finish = () => {
    clearTarget();
    overlay.style.display = 'none';
    overlay.classList.remove('has-target');
    window.removeEventListener('resize', onResize);
    localStorage.setItem(LS.ONBOARDED, '1');
  };

  nextBtn.onclick = () => {
    idx++;
    if (idx >= ONBOARD_STEPS.length) finish();
    else renderStep();
  };
  skipBtn.onclick = finish;

  window.addEventListener('resize', onResize);
  overlay.style.display = 'flex';
  renderStep();
}

startOnboarding();

// Show the CTA immediately so a user who's about to dismiss the upcoming
// browser permission prompt knows there's an explicit re-entry button.
updateInputModeButton();

// Auto-request the microphone on first load. The browser prompt counts as
// user interaction for the AudioContext, and if the user denies, they can
// retry later via the header mode switcher.
startMicrophone().then(result => {
  if (result === 'denied') {
    showInputHelp('Mic blocked. Click the 🔒 in the URL bar to allow access, or use MIDI.');
  }
}).finally(refreshAfterInput);
