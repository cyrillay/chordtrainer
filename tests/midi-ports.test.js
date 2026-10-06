import { test } from 'node:test';
import assert from 'node:assert/strict';
import { midiInputs } from '../js/midi/ports.js';

// Same shape as the inputs map of the Web MIDI Browser app's polyfill
// (WebMIDIAPIShimForiOS): values() returns { next } with no Symbol.iterator.
function polyfillMap(ports) {
  let i = 0;
  const it = { next: () => (i < ports.length ? { value: ports[i++], done: false } : { value: undefined, done: true }) };
  return {
    size: ports.length,
    forEach: (cb) => ports.forEach((p) => cb(p)),
    values: () => { i = 0; return it; },
  };
}

test('polyfill inputs map is not iterable with for...of', () => {
  const access = { inputs: polyfillMap([{ name: 'A' }]) };
  assert.throws(() => { for (const _ of access.inputs.values()) { /* empty */ } }, TypeError);
});

test('midiInputs lists the polyfill inputs', () => {
  const access = { inputs: polyfillMap([{ name: 'A' }, { name: 'B' }]) };
  assert.deepEqual(midiInputs(access).map((p) => p.name), ['A', 'B']);
});

test('midiInputs lists a native Map of inputs', () => {
  const access = { inputs: new Map([['1', { name: 'Piano' }]]) };
  assert.deepEqual(midiInputs(access).map((p) => p.name), ['Piano']);
});

test('midiInputs is empty before inputs exist', () => {
  assert.deepEqual(midiInputs({ inputs: null }), []);
  assert.deepEqual(midiInputs(null), []);
});
