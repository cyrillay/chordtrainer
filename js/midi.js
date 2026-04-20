// Web MIDI input: detect notes from a connected MIDI keyboard.
import { state } from './state.js';
import { applyHeardPitchClasses } from './views.js';

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
  for (const input of access.inputs.values()) {
    input.onmidimessage = handleMidiMessage;
  }
}

function describeInputs(access) {
  const names = [];
  for (const input of access.inputs.values()) names.push(input.name);
  return names.length === 0 ? 'No device' : names.join(' · ');
}

export async function startMidi() {
  if (!navigator.requestMIDIAccess) {
    document.getElementById('midiStatus').textContent = 'Web MIDI not supported in this browser';
    return;
  }
  try {
    const access = await navigator.requestMIDIAccess();
    state.midiAccess = access;
    state.midiEnabled = true;
    state.midiHeldNotes = new Set();

    attachInputs(access);
    access.onstatechange = () => {
      attachInputs(access);
      document.getElementById('midiStatus').textContent = describeInputs(access);
    };

    document.getElementById('midiBtn').textContent = 'Disconnect MIDI';
    document.getElementById('midiBtn').classList.add('danger');
    const status = document.getElementById('midiStatus');
    status.style.display = 'block';
    status.textContent = describeInputs(access);

    refreshHeardFromHeld();
  } catch (err) {
    console.error(err);
    document.getElementById('midiStatus').textContent = 'MIDI access denied';
    document.getElementById('midiStatus').style.display = 'block';
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

  document.getElementById('midiBtn').textContent = 'Connect MIDI';
  document.getElementById('midiBtn').classList.remove('danger');
  document.getElementById('midiStatus').style.display = 'none';

  applyHeardPitchClasses(new Set());
}
