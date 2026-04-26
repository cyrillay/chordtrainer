// Chord-selection presets ("first timer" → "expert") and the inversion
// frequency selector. Both live here because the presets opt-in to a
// specific inversion frequency, so applying a preset has to drive both.
//
// Each preset is a complete description: which qualities, which roots, and
// optionally inversion settings, fingerings, circle, instrument visibility.
// Applying a preset wipes the current selection and replaces it.

import { $, $$, setDisplay } from '../core/dom.js';
import { LS } from '../core/constants.js';
import { updateCircleHighlight } from '../instruments/circle.js';

const PRESETS = {
  firstTimer:   { qualities: ['maj'],                                                                roots: ['C', 'F', 'G'],           inversions: false, showFingerings: true },
  beginner:     { qualities: ['maj', 'min'],                                                         roots: ['C', 'G', 'D', 'A', 'F'], inversions: false },
  intermediate: { qualities: ['maj', 'min'],                                                         roots: 'all',                     inversions: true,  inversionFreq: 33 },
  advanced:     { qualities: ['maj', 'min', 'dom7', 'maj7', 'min7'],                                 roots: 'all',                     inversions: true,  inversionFreq: 33 },
  expert:       { qualities: ['maj', 'min', 'dim', 'aug', 'dom7', 'maj7', 'min7', 'm7b5', 'mMaj7'], roots: 'all',                     inversions: true,  inversionFreq: 66, showCircle: true, showInstrument: false }
};

// ---- Inversion frequency selector ----

const INVERSION_FREQ_OPTIONS = [33, 66];
let currentInversionFreq = 33;

export function syncInversionFreqVisibility() {
  setDisplay('inversionFreqWrap', $('inversionsCb').checked, 'flex');
}

function setInversionFreq(pct, opts = {}) {
  const v = INVERSION_FREQ_OPTIONS.includes(pct) ? pct : 33;
  currentInversionFreq = v;
  $$('.inv-preset-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.invFreq, 10) === v));
  localStorage.setItem(LS.INVERSION_FREQ, String(v));
  if (!opts.silent) {
    refreshActivePreset();
    onChangeRegenerate();
  }
}

// ---- Preset application ----

let onChangeRegenerate = () => {};
let onChangeApplyInstrument = () => {};
let onChangeRefreshRoots = () => {};

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
  onChangeApplyInstrument();
  // Programmatic checkbox changes above don't fire change events, so the
  // roots "N selected" / Select-all readouts must be refreshed explicitly.
  onChangeRefreshRoots();
  setActivePresetButton(name);
  onChangeRegenerate();
}

function setActivePresetButton(name) {
  $$('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === name));
}

// After any manual change, recompute which preset (if any) matches the current
// selection — so toggling settings can promote or clear the preset highlight.
export function refreshActivePreset() {
  const currentQs = new Set(checkedAttrValues('[data-quality]', 'quality'));
  const currentRs = new Set(checkedAttrValues('[data-root]', 'root'));
  const inv = $('inversionsCb').checked;
  const invFreq = currentInversionFreq;
  let match = null;
  for (const [name, p] of Object.entries(PRESETS)) {
    if (p.inversions !== inv) continue;
    if (p.inversions && p.inversionFreq && p.inversionFreq !== invFreq) continue;
    if (!setsEqual(currentQs, new Set(p.qualities))) continue;
    const expectedRoots = p.roots === 'all'
      ? new Set(Array.from($$('[data-root]')).map(cb => cb.dataset.root))
      : new Set(p.roots);
    if (!setsEqual(currentRs, expectedRoots)) continue;
    match = name;
    break;
  }
  setActivePresetButton(match);
}

function checkedAttrValues(sel, attr) {
  const out = [];
  for (const el of $$(sel)) if (el.checked) out.push(el.dataset[attr]);
  return out;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// ---- Init ----

export function initPresets({ regenerate, applyInstrumentVisibility, refreshRoots }) {
  onChangeRegenerate = regenerate;
  onChangeApplyInstrument = applyInstrumentVisibility;
  onChangeRefreshRoots = refreshRoots || (() => {});

  const stored = parseInt(localStorage.getItem(LS.INVERSION_FREQ), 10);
  const initial = INVERSION_FREQ_OPTIONS.includes(stored) ? stored : 33;
  setInversionFreq(initial, { silent: true });
  syncInversionFreqVisibility();
  $$('.inv-preset-btn').forEach(b => {
    b.addEventListener('click', () => setInversionFreq(parseInt(b.dataset.invFreq, 10)));
  });

  $$('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });
}
