import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempoTerm, termsInRange, tapTempo, formatMark } from '../js/music-ui/tempo.js';
import { toggleNote } from '../js/music-ui/noteKeyboard.js';
import { PianoRemote } from '../js/music-ui/pianoRemote.js';

test('tempo terms follow the usual metronome bands', () => {
  assert.equal(tempoTerm(40), 'Largo');
  assert.equal(tempoTerm(72), 'Adagio');
  assert.equal(tempoTerm(100), 'Andante');
  assert.equal(tempoTerm(120), 'Allegro');
  assert.equal(tempoTerm(168), 'Vivace');
  assert.equal(tempoTerm(220), 'Prestissimo');
  assert.equal(formatMark(120), '♩ = 120');
});

test('only the terms a range can reach are offered, clamped into it', () => {
  const t = termsInRange(50, 200);
  assert.deepEqual(t.map((x) => x.name), ['Largo', 'Adagio', 'Andante', 'Moderato', 'Allegro', 'Vivace', 'Presto', 'Prestissimo']);
  assert.equal(t[t.length - 1].bpm, 200);
  const slow = termsInRange(30, 90);
  assert.deepEqual(slow.map((x) => x.name), ['Largo', 'Adagio', 'Andante']);
  for (const x of slow) assert.ok(x.bpm >= 30 && x.bpm <= 90);
  for (const x of termsInRange(50, 200)) assert.equal(tempoTerm(x.bpm), x.name);
});

test('tap tempo needs three even taps', () => {
  assert.equal(tapTempo([0, 500]), null);
  assert.equal(tapTempo([0, 500, 1000]), 120);
  assert.equal(tapTempo([0, 500, 1010, 1500, 2000]), 120);
  assert.equal(tapTempo([0, 500, 2000]), null);
});

test('the note keyboard toggles notes and never empties', () => {
  assert.deepEqual(toggleNote(['C', 'G'], 'E'), ['C', 'E', 'G']);
  assert.deepEqual(toggleNote(['C', 'E'], 'C'), ['E']);
  assert.deepEqual(toggleNote(['E'], 'E'), ['E']);
});

test('a held fifth is needed when the remote asks for one', () => {
  let t = 0;
  const fired = [];
  const r = new PianoRemote({ onCommand: (m) => fired.push(m), holdMs: (m) => (m % 12 === 7 ? 600 : 0), now: () => t });
  r.noteOn(67, true); t = 200; r.noteOff(67);
  assert.deepEqual(fired, []);
  r.noteOn(67, true); t = 900; r.noteOff(67);
  assert.deepEqual(fired, [67]);
  r.noteOn(69, true); t = 950; r.noteOff(69);
  assert.deepEqual(fired, [67, 69]);
});
