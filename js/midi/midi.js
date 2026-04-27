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

function describeInputs(access) {
  const names = [];
  for (const input of access.inputs.values()) names.push(input.name);
  return names.length === 0 ? 'No device' : names.join(' · ');
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
  if (!navigator.requestMIDIAccess) {
    showTransient('Web MIDI not supported in this browser');
    return;
  }
  try {
    const access = await navigator.requestMIDIAccess();
    state.midiAccess = access;
    state.midiEnabled = true;
    state.midiHeldNotes = new Set();

    const updateStatus = () => {
      attachInputs(access);
      statusEl.textContent = describeInputs(access);
      if (access.inputs.size > 0) recordAction('midiConnect');
    };

    access.onstatechange = updateStatus;
    statusEl.style.display = 'block';

    // On mobile browsers, inputs may be enumerated asynchronously after
    // requestMIDIAccess resolves — check immediately then retry after a short delay.
    updateStatus();
    setTimeout(updateStatus, 500);

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
