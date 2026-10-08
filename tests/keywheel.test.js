import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIFTHS, tonicName, keyLabel, keySignature, signatureText, wheelSlots } from '../jam/js/keyWheel.js';

test('the circle goes up in fifths from C', () => {
  assert.deepEqual(FIFTHS, [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]);
});

test('keys are spelled as on the circle', () => {
  assert.equal(keyLabel('C#', 'major'), 'D♭ major');
  assert.equal(keyLabel('C#', 'minor'), 'C♯ minor');
  assert.equal(keyLabel('G#', 'minor'), 'G♯ minor');
  assert.equal(keyLabel('G#', 'major'), 'A♭ major');
  assert.equal(tonicName('D#', 'minor'), 'E♭');
  assert.equal(tonicName('A#', 'major'), 'B♭');
});

test('key signatures', () => {
  const sig = (k, m) => signatureText(keySignature(k, m));
  assert.equal(sig('C', 'major'), '♮');
  assert.equal(sig('A', 'minor'), '♮');
  assert.equal(sig('D', 'major'), '2♯');
  assert.equal(sig('B', 'minor'), '2♯');
  assert.equal(sig('A#', 'major'), '2♭');
  assert.equal(sig('C#', 'major'), '5♭');
  assert.equal(sig('F#', 'major'), '6♯');
  assert.equal(sig('D#', 'minor'), '6♭');
  assert.equal(sig('G#', 'minor'), '5♯');
  assert.equal(sig('F', 'minor'), '4♭');
});

test('major wheel: C on top, relative minors inside', () => {
  const slots = wheelSlots('major');
  assert.equal(slots.length, 12);
  assert.deepEqual(slots.slice(0, 3).map((s) => [s.name, s.relName, s.sig]), [['C', 'Am', '♮'], ['G', 'Em', '1♯'], ['D', 'Bm', '2♯']]);
  assert.deepEqual([slots[6].name, slots[6].relName], ['F♯', 'D♯m']);
  assert.equal(slots[11].name, 'F');
  assert.equal(new Set(slots.map((s) => s.key)).size, 12);
});

test('minor wheel: A minor on top, relative majors inside', () => {
  const slots = wheelSlots('minor');
  assert.deepEqual(slots.slice(0, 2).map((s) => [s.key, s.name, s.relName]), [['A', 'A', 'C'], ['E', 'E', 'G']]);
  assert.deepEqual([slots[6].name, slots[6].relName, slots[6].sig], ['E♭', 'G♭', '6♭']);
});
