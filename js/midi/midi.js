// Chords' MIDI: the notes held on a connected keyboard, as pitch classes for
// the chord matcher. The connection itself is js/midi/input.js, shared by
// every app; this file keeps the held-notes set and the status line.
import { state } from '../core/state.js';
import { applyHeardPitchClasses } from '../instruments/chordDisplay.js';
import { $ } from '../core/dom.js';
import { recordAction } from '../ux/achievements.js';
import { noDeviceHelpHtml, isIOS } from './midiHelp.js';
import { createMidiInput } from './input.js';

function refreshHeardFromHeld() {
  const pcs = new Set();
  for (const note of state.midiHeldNotes) pcs.add(note % 12);
  applyHeardPitchClasses(pcs);
}

function noteOn(note) {
  state.midiHeldNotes.add(note);
  refreshHeardFromHeld();
}

function noteOff(note) {
  state.midiHeldNotes.delete(note);
  refreshHeardFromHeld();
}

// Tapping anywhere closes an auto-opened hint; registered once.
let hintDismissBound = false;
function bindHintDismiss() {
  if (hintDismissBound) return;
  hintDismissBound = true;
  document.addEventListener('pointerdown', (e) => {
    const tip = document.querySelector('.midi-help.open');
    if (!tip || tip.contains(e.target)) return;
    tip.classList.remove('open');
    // The "not supported" hint has no MIDI session behind it: hide it outright.
    const statusEl = $('midiStatus');
    if (statusEl.dataset.dismissible) {
      statusEl.style.display = 'none';
      delete statusEl.dataset.dismissible;
    }
  });
}

function renderHint(statusEl, label, { openHint = false } = {}) {
  let tip = statusEl.querySelector('.midi-help');
  if (!tip || statusEl.firstChild.textContent !== label) {
    statusEl.innerHTML = `<span>${label}</span>`
      + `<span class="info-tip midi-help" tabindex="0" aria-label="How to connect a MIDI keyboard">`
      + `<span class="info-tip-icon" aria-hidden="true">?</span>`
      + `<span class="info-tip-bubble" role="tooltip">${noDeviceHelpHtml()}</span></span>`;
    tip = statusEl.querySelector('.midi-help');
    bindHintDismiss();
  }
  if (openHint) tip.classList.add('open');
}

// Auto-dismiss error messages after 5s so they don't linger forever on mobile.
function showTransient(text) {
  const statusEl = $('midiStatus');
  statusEl.textContent = text;
  statusEl.style.display = 'block';
  setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
}

let input = null;

function onStatus({ state: st, names, late }) {
  const statusEl = $('midiStatus');
  if (st === 'unsupported') {
    if (isIOS()) {
      statusEl.style.display = 'block';
      statusEl.dataset.dismissible = '1';
      renderHint(statusEl, 'MIDI not supported here', { openHint: true });
    } else {
      showTransient('Web MIDI not supported in this browser');
    }
  } else if (st === 'denied') {
    showTransient('MIDI access denied');
  } else if (st === 'connected' || st === 'nodevice') {
    statusEl.style.display = 'block';
    if (st === 'connected') {
      statusEl.textContent = names.join(' · ');
      recordAction('midiConnect');
    } else {
      // Only the late check pops the help open, so it doesn't flash on
      // devices that were simply slow to enumerate.
      renderHint(statusEl, 'No device found', { openHint: !!late });
    }
  }
}

export async function startMidi() {
  delete $('midiStatus').dataset.dismissible;
  input ||= createMidiInput({ onNoteOn: noteOn, onNoteOff: noteOff, onStatus });
  state.midiHeldNotes = new Set();
  const ok = await input.connect();
  state.midiEnabled = ok;
  state.midiAccess = ok ? input : null;
  if (ok) refreshHeardFromHeld();
}

export function stopMidi() {
  input?.disconnect();
  state.midiAccess = null;
  state.midiEnabled = false;
  state.midiHeldNotes = new Set();

  $('midiStatus').style.display = 'none';
  applyHeardPitchClasses(new Set());
}
