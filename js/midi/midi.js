// Web MIDI input: detect notes from a connected MIDI keyboard.
import { state } from '../core/state.js';
import { applyHeardPitchClasses } from '../instruments/chordDisplay.js';
import { $ } from '../core/dom.js';
import { recordAction } from '../ux/achievements.js';

function refreshHeardFromHeld() {
  const pcs = new Set();
  for (const note of state.midiHeldNotes) pcs.add(note % 12);
  applyHeardPitchClasses(pcs);
}

function handleMidiMessage(event) {
  const [status, data1, data2] = event.data;
  const command = status & 0xf0;
  const note = data1;
  const velocity = data2;

  if (command === 0x90 && velocity > 0) {
    state.midiHeldNotes.add(note);
    refreshHeardFromHeld();
  } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
    state.midiHeldNotes.delete(note);
    refreshHeardFromHeld();
  }
}

function attachInputs(access) {
  for (const input of access.inputs.values()) input.onmidimessage = handleMidiMessage;
}

const MIDI_BLE_CONNECT_URL = 'https://play.google.com/store/apps/details?id=com.mobileer.example.midibtlepairing';
const WEB_MIDI_BROWSER_URL = 'https://apps.apple.com/fr/app/web-midi-browser/id953846217';

const isAndroid = () => /Android/i.test(navigator.userAgent);
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Browsers only list MIDI devices the OS has already opened, so the fix for
// "No device" depends on the platform — Android in particular never exposes
// Bluetooth MIDI to Chrome unless another app opens the link first.
function noDeviceHelpHtml() {
  // iOS browsers have no Web MIDI at all; Web MIDI Browser is a WebKit
  // wrapper that adds it.
  if (isIOS()) {
    return `Use the <a href="${WEB_MIDI_BROWSER_URL}" target="_blank" rel="noopener">Web MIDI Browser</a> app `
      + `and open this site in it — iPhone/iPad browsers don't support MIDI.`;
  }
  if (isAndroid()) {
    return `<strong>Bluetooth:</strong> Chrome can't scan for Bluetooth MIDI on Android. Install the free app `
      + `<a href="${MIDI_BLE_CONNECT_URL}" target="_blank" rel="noopener">MIDI BLE Connect</a>, `
      + `connect your keyboard there, then come back here.<br><br>`
      + `Close your keyboard's own app first (e.g. Roland Piano App): only one app can hold the Bluetooth link. `
      + `Don't pair the keyboard in Android's Bluetooth settings.`;
  }
  return `<strong>Bluetooth:</strong> connect your keyboard in your system's MIDI settings first `
    + `(Mac: Audio MIDI Setup → Window → Show MIDI Studio → Bluetooth).<br><br>`
    + `Still nothing? Check the site's MIDI permission (icon left of the URL) and reload.`;
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

function renderStatus(statusEl, access, opts) {
  const names = [];
  for (const input of access.inputs.values()) names.push(input.name);
  if (names.length > 0) statusEl.textContent = names.join(' · ');
  else renderHint(statusEl, 'No device found', opts);
}

// Auto-dismiss error messages after 5s so they don't linger forever on mobile.
function showTransient(text) {
  const statusEl = $('midiStatus');
  statusEl.textContent = text;
  statusEl.style.display = 'block';
  setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
}

export async function startMidi() {
  const statusEl = $('midiStatus');
  delete statusEl.dataset.dismissible;
  if (!navigator.requestMIDIAccess) {
    if (isIOS()) {
      statusEl.style.display = 'block';
      statusEl.dataset.dismissible = '1';
      renderHint(statusEl, 'MIDI not supported here', { openHint: true });
    } else {
      showTransient('Web MIDI not supported in this browser');
    }
    return;
  }
  try {
    const access = await navigator.requestMIDIAccess();
    state.midiAccess = access;
    state.midiEnabled = true;
    state.midiHeldNotes = new Set();

    const updateStatus = (opts) => {
      attachInputs(access);
      renderStatus(statusEl, access, opts);
      if (access.inputs.size > 0) recordAction('midiConnect');
    };

    access.onstatechange = () => updateStatus();
    statusEl.style.display = 'block';

    // On mobile browsers, inputs may be enumerated asynchronously after
    // requestMIDIAccess resolves — check immediately then retry after a short delay.
    // Only the delayed check pops the help open, so it doesn't flash on
    // devices that were simply slow to enumerate.
    updateStatus();
    setTimeout(() => { if (state.midiAccess === access) updateStatus({ openHint: true }); }, 500);

    refreshHeardFromHeld();
  } catch (err) {
    console.error(err);
    showTransient('MIDI access denied');
  }
}

export function stopMidi() {
  if (state.midiAccess) {
    for (const input of state.midiAccess.inputs.values()) input.onmidimessage = null;
    state.midiAccess.onstatechange = null;
  }
  state.midiAccess = null;
  state.midiEnabled = false;
  state.midiHeldNotes = new Set();

  $('midiStatus').style.display = 'none';
  applyHeardPitchClasses(new Set());
}
