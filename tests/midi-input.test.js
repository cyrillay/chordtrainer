import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, eventTime, previouslyGranted, createMidiInput } from '../js/midi/input.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
beforeEach(() => { globalThis.localStorage = memory(); });

test('dispatch decodes note on, note off (both forms), pedal and controls', () => {
  const log = [];
  const h = {
    onNoteOn: (n, v, t) => log.push(['on', n, v, t]),
    onNoteOff: (n, t) => log.push(['off', n, t]),
    onPedal: (down, t) => log.push(['pedal', down, t]),
    onControl: (cc, v) => log.push(['cc', cc, v]),
  };
  dispatch([0x90, 60, 100], 1, h);
  dispatch([0x91, 61, 0], 2, h);       // note on with velocity 0, channel 2
  dispatch([0x80, 62, 40], 3, h);
  dispatch([0xb0, 64, 127], 4, h);
  dispatch([0xb0, 1, 10], 5, h);
  assert.deepEqual(log, [
    ['on', 60, 100, 1], ['off', 61, 2], ['off', 62, 3],
    ['pedal', true, 4], ['cc', 64, 127], ['cc', 1, 10],
  ]);
});

test('dispatch ignores handlers a page does not need', () => {
  assert.doesNotThrow(() => dispatch([0xb0, 64, 0], 0, {}));
});

test('eventTime keeps a sane event timestamp and replaces the rest', () => {
  assert.equal(eventTime(990, 1000), 990);
  assert.equal(eventTime(0, 1000), 1000);
  assert.equal(eventTime(1.7e12, 1000), 1000, 'an epoch time from a polyfill');
  assert.equal(eventTime(-5, 1000), 1000);
});

test('a grant remembered by an older version still reconnects', () => {
  assert.equal(previouslyGranted(), false);
  localStorage.setItem('ghostJam.midiAuto', 'true');
  assert.equal(previouslyGranted(), true);
  globalThis.localStorage = memory();
  localStorage.setItem('arpeggioTrainer.midiGranted', '1');
  assert.equal(previouslyGranted(), true);
});

test('connect reports unsupported when the browser has no Web MIDI', async () => {
  const seen = [];
  const midi = createMidiInput({ onStatus: (s) => seen.push(s.state) });
  assert.equal(await midi.connect(), false);
  assert.deepEqual(seen, ['unsupported']);
  assert.equal(midi.state, 'unsupported');
});

test('connect lists inputs, hands them our handler, and remembers the grant', async () => {
  const input = { name: 'Piano', onmidimessage: null };
  const access = { inputs: { forEach: (f) => f(input) }, onstatechange: null };
  const nav = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: { requestMIDIAccess: async () => access }, configurable: true });
  try {
    const notes = [];
    const statuses = [];
    const midi = createMidiInput({ onNoteOn: (n) => notes.push(n), onStatus: (s) => statuses.push(s) });
    assert.equal(await midi.connect(), true);
    assert.deepEqual(statuses.at(-1), { state: 'connected', names: ['Piano'], late: false });
    input.onmidimessage({ data: [0x90, 64, 90], timeStamp: 0 });
    assert.deepEqual(notes, [64]);
    assert.equal(previouslyGranted(), true);
    midi.disconnect();
    assert.equal(input.onmidimessage, null);
    assert.equal(midi.state, 'off');
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
  }
});
