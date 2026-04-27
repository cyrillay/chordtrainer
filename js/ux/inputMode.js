// Mic vs MIDI selection UI: header buttons, the "↑ activate to begin" CTA,
// and the help message that surfaces when permission was denied. Wraps the
// audio + midi modules so their start/stop functions only show up here.

import { state } from '../core/state.js';
import { startMicrophone, stopMicrophone } from '../audio/audio.js';
import { startMidi, stopMidi } from '../midi/midi.js';
import { updateStatus } from '../instruments/chordDisplay.js';
import { $, setDisplay } from '../core/dom.js';

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
  // CTA arrow: visible whenever no input is active so a brand-new user gets
  // a clear nudge. Stays visible even when the "Mic blocked" help is showing
  // — clicking the mic button re-triggers the browser's permission prompt,
  // so the CTA still has a real action to invite.
  const noInput = !state.isListening && !state.midiEnabled;
  setDisplay('inputCta', noInput, 'flex');
  if (micBtn) micBtn.classList.toggle('cta-pulse', noInput);
}

function refreshInputReadout() {
  const active = state.isListening || state.midiEnabled;
  setDisplay('inputReadout', active, 'block');
}

export function showInputHelp(message) {
  const help = $('inputHelp');
  if (!help) return;
  if (message) {
    help.textContent = message;
    help.classList.add('visible');
  } else {
    help.classList.remove('visible');
  }
}

export function refreshAfterInput() {
  updateInputModeButton();
  refreshInputReadout();
  updateStatus();
}

export function bindInputMode() {
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

  // Show the CTA immediately so a user who's about to dismiss the upcoming
  // browser permission prompt knows there's an explicit re-entry button.
  updateInputModeButton();
}

// Auto-request the microphone on first load. The browser prompt counts as user
// interaction for the AudioContext, and if the user denies, they can retry later
// via the header mode switcher.
export function autoStartMicrophone() {
  return startMicrophone().then(result => {
    if (result === 'denied') {
      showInputHelp('Mic blocked. Click the 🔒 in the URL bar to allow access, or use MIDI.');
    }
  }).finally(refreshAfterInput);
}
