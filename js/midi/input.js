// Web MIDI input, for every app. One event-based wrapper: note on (with
// velocity and timestamp), note off, sustain pedal, and one status vocabulary
// so every page draws the same "Connect MIDI" button and help line.
//
//   status.state: 'off'          not asked yet
//                 'unsupported'  no Web MIDI in this browser
//                 'denied'       the browser refused access
//                 'nodevice'     access granted, no keyboard plugged in
//                 'connected'    at least one input; status.names lists them
//   status.late:  true on the check made a beat after connecting (some
//                 platforms list their inputs late), so a page can wait for
//                 it before popping help open.
//
// Timestamps are on the performance.now() clock: the event's own timeStamp
// when the browser gives a sane one (it is not skewed by main-thread jank),
// else the time we receive it.

import { midiInputs } from './ports.js';
import { KEYS, readRaw, writeRaw } from '../core/store.js';

// Older keys that meant "MIDI was granted here before", per app.
const LEGACY_GRANTED = ['arpeggioTrainer.midiGranted', 'ghostJam.midiAuto'];

export function previouslyGranted() {
  if (readRaw(KEYS.midi.GRANTED) === '1') return true;
  return LEGACY_GRANTED.some((k) => { const v = readRaw(k); return v === '1' || v === 'true'; });
}

// The event's timestamp if it is on our clock, else now. Some polyfills send
// 0 or an epoch time in milliseconds.
export function eventTime(timeStamp, now) {
  return timeStamp > 0 && timeStamp <= now + 50 && now - timeStamp < 5000 ? timeStamp : now;
}

// Decodes one MIDI message into the handlers. Exported for the tests.
export function dispatch(data, t, { onNoteOn, onNoteOff, onPedal, onControl }) {
  const [status, d1, d2] = data;
  const cmd = status & 0xf0;
  if (cmd === 0x90 && d2 > 0) onNoteOn?.(d1, d2, t);
  else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) onNoteOff?.(d1, t);
  else if (cmd === 0xb0) {
    if (d1 === 64) onPedal?.(d2 >= 64, t);
    onControl?.(d1, d2, t);
  }
}

export function createMidiInput(handlers) {
  let access = null;
  let state = 'off';
  let names = [];

  const report = (next, extra = {}) => {
    state = next;
    handlers.onStatus?.({ state, names: names.slice(), ...extra });
  };

  const onMessage = (e) => {
    const now = performance.now();
    dispatch(e.data, eventTime(e.timeStamp, now), handlers);
  };

  function refresh(late = false) {
    if (!access) return;
    names = [];
    for (const input of midiInputs(access)) {
      input.onmidimessage = onMessage;
      names.push(input.name);
    }
    report(names.length ? 'connected' : 'nodevice', { late });
  }

  async function connect() {
    if (access) { refresh(); return true; }
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      report('unsupported');
      return false;
    }
    let granted;
    try {
      granted = await navigator.requestMIDIAccess();
    } catch (err) {
      console.error(err);
      report('denied');
      return false;
    }
    access = granted;
    writeRaw(KEYS.midi.GRANTED, '1');
    access.onstatechange = () => refresh();
    refresh();
    // Mobile browsers sometimes enumerate inputs a beat after resolving.
    setTimeout(() => { if (access === granted) refresh(true); }, 500);
    return true;
  }

  function disconnect() {
    if (access) {
      for (const input of midiInputs(access)) input.onmidimessage = null;
      access.onstatechange = null;
    }
    access = null;
    names = [];
    report('off');
  }

  return {
    connect,
    disconnect,
    previouslyGranted,
    get state() { return state; },
    get names() { return names.slice(); },
  };
}
