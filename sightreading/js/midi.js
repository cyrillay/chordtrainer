// Web MIDI input for the Read Trainer. Reports note-ons with the event's
// timestamp (same clock as performance.now()) so tempo grading isn't
// skewed by main-thread jank.

import { midiInputs } from '../../js/midi/ports.js';

// handlers: { onNoteOn(midi, velocity, timeStamp), onNoteOff(midi), onStatus(status) }
// status: { state: 'unsupported' | 'denied' | 'none' | 'connected', names: [] }
export async function connectMidi(handlers) {
  if (!navigator.requestMIDIAccess) {
    handlers.onStatus({ state: 'unsupported', names: [] });
    return null;
  }
  let access;
  try {
    access = await navigator.requestMIDIAccess();
  } catch (err) {
    console.error(err);
    handlers.onStatus({ state: 'denied', names: [] });
    return null;
  }

  const onMessage = (event) => {
    const [status, note, velocity] = event.data;
    const cmd = status & 0xf0;
    const t = event.timeStamp || performance.now();
    if (cmd === 0x90 && velocity > 0) handlers.onNoteOn(note, velocity, t);
    else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) handlers.onNoteOff?.(note, t);
  };

  const refresh = () => {
    const names = [];
    for (const input of midiInputs(access)) {
      input.onmidimessage = onMessage;
      names.push(input.name);
    }
    handlers.onStatus({ state: names.length ? 'connected' : 'none', names });
  };
  access.onstatechange = refresh;
  refresh();
  // Mobile browsers sometimes enumerate inputs a beat after resolving.
  setTimeout(refresh, 500);
  return access;
}
