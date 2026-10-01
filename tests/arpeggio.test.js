import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTask, ArpeggioMatcher, toneOrder, startIndex, starsFor, scoreArpeggio, parseWeakKey,
} from '../arpeggio/js/engine.js';
import {
  LEVELS, makeTask, poolFrom, recordWeak, weakList, makeWeakTask, rootsUpTo,
} from '../arpeggio/js/levels.js';
import {
  detectMelody, detectBach, detectTristan, detectChromatic, detectGlissando, detectPalindrome,
  isCrescendo, isMetronomic,
} from '../arpeggio/js/eggs.js';

const play = (m, notes) => notes.map((midi, i) => m.press(midi, 64, i * 300));
const seq = (midis, dt = 300) => midis.map((midi, i) => ({ midi, t: i * dt }));

test('toneOrder walks chord tones in each direction', () => {
  assert.deepEqual(toneOrder(4, 'up', 1), [1, 2, 3, 0]);
  assert.deepEqual(toneOrder(4, 'down', 0), [0, 3, 2, 1]);
  assert.deepEqual(toneOrder(3, 'updown', 0), [0, 1, 2, 1, 0]);
});

test('startIndex maps top/seventh to the highest tone of the chord', () => {
  assert.equal(startIndex('top', 3), 2);
  assert.equal(startIndex('seventh', 3), 2);
  assert.equal(startIndex('seventh', 4), 3);
  assert.equal(startIndex('third', 4), 1);
});

test('buildTask spells and orders an ascending arpeggio from the 3rd', () => {
  const t = buildTask({ root: 'C', quality: 'maj7', direction: 'up', start: 'third', rootDisplay: 'C' });
  assert.deepEqual(t.steps.map(s => s.label), ['E', 'G', 'B', 'C']);
  assert.deepEqual(t.steps.map(s => s.dir), [null, 'up', 'up', 'up']);
  assert.equal(t.startName, '3rd');
});

test('matcher accepts a correct arpeggio in any octave', () => {
  const t = buildTask({ root: 'C', quality: 'maj7', direction: 'up', start: 'third' });
  const m = new ArpeggioMatcher(t);
  const res = play(m, [76, 79, 83, 84]); // E5 G5 B5 C6
  assert.ok(res.every(r => r.type === 'correct'));
  assert.ok(m.done);
  assert.equal(m.result().clean, true);
});

test('matcher rejects wrong pitch, wrong direction and octave leaps, then recovers', () => {
  const t = buildTask({ root: 'C', quality: 'maj', direction: 'up', start: 'root' });
  const m = new ArpeggioMatcher(t);
  assert.equal(m.press(62).type, 'wrong');            // D: wrong pitch
  assert.equal(m.press(60).type, 'correct');          // C4
  assert.equal(m.press(52).reason, 'direction');      // E3: below
  assert.equal(m.press(76).reason, 'leap');           // E5: too far
  assert.equal(m.press(60).type, 'ignore');           // restrike C4
  assert.equal(m.expectedMidi(), 64);
  assert.equal(m.press(64).type, 'correct');
  assert.equal(m.press(67).done, true);
  assert.equal(m.result().mistakes, 3);
});

test('descending matcher crosses octave boundaries', () => {
  const t = buildTask({ root: 'A', quality: 'min7', direction: 'down', start: 'seventh' });
  assert.deepEqual(t.steps.map(s => s.pc), [7, 4, 0, 9]);
  const m = new ArpeggioMatcher(t);
  const res = play(m, [67, 64, 60, 57]);
  assert.ok(res.every(r => r.type === 'correct'));
});

test('round trip goes up then down', () => {
  const t = buildTask({ root: 'C', quality: 'maj', direction: 'updown', start: 'root' });
  const m = new ArpeggioMatcher(t);
  const res = play(m, [48, 52, 55, 52, 48]);
  assert.ok(res.every(r => r.type === 'correct'));
  assert.ok(m.done);
});

test('stars and score reward clean, steady play', () => {
  assert.equal(starsFor({ accuracy: 0.7, avgGapMs: 300 }), 0);
  assert.equal(starsFor({ accuracy: 0.85, avgGapMs: 300 }), 1);
  assert.equal(starsFor({ accuracy: 0.95, avgGapMs: 300 }), 2);
  assert.equal(starsFor({ accuracy: 1, avgGapMs: 300 }), 3);
  assert.equal(starsFor({ accuracy: 1, avgGapMs: 900 }), 2);
  const clean = { clean: true, mistakes: 0, avgGapMs: 300 };
  assert.ok(scoreArpeggio(clean, 8) > scoreArpeggio(clean, 1));
  assert.ok(scoreArpeggio({ clean: false, mistakes: 2 }, 0) < scoreArpeggio(clean, 1));
});

test('every level generates playable tasks from a triad-only pool', () => {
  const pool = poolFrom({ roots: ['C', 'F', 'G'], qualities: ['maj', 'min'] });
  for (const level of LEVELS) {
    let prev = null;
    for (let k = 0; k < 6; k++) {
      const t = makeTask(level, pool, k, prev);
      assert.ok(t.steps.length >= 3, `level ${level.id}`);
      if (level.alternate) assert.equal(t.direction, level.directions[k % 2]);
      prev = t;
    }
  }
});

test('weak spots surface the most-missed pattern and forgive recovered ones', () => {
  const stats = {};
  const bad = buildTask({ root: 'F#', quality: 'm7b5', direction: 'down', start: 'third' });
  const ok = buildTask({ root: 'C', quality: 'maj', direction: 'up', start: 'root' });
  for (let i = 0; i < 4; i++) recordWeak(stats, { task: bad, clean: false, mistakes: 3, durationMs: 5000 });
  recordWeak(stats, { task: ok, clean: false, mistakes: 1, durationMs: 1200 });
  for (let i = 0; i < 4; i++) recordWeak(stats, { task: ok, clean: true, mistakes: 0, durationMs: 1200 });
  const weak = weakList(stats);
  assert.equal(weak[0].key, bad.key);
  assert.deepEqual(parseWeakKey(bad.key), { root: 'F#', quality: 'm7b5', direction: 'down', start: 1 });
  const t = makeWeakTask(weak, null, () => 0);
  assert.equal(t.key, bad.key);
});

test('rootsUpTo grows by key signature', () => {
  assert.deepEqual(rootsUpTo(0), ['C']);
  assert.deepEqual(rootsUpTo(1), ['C', 'G', 'F']);
  assert.equal(rootsUpTo(6).length, 12);
});

test('easter eggs: melodies in any key, Bach, Tristan', () => {
  assert.equal(detectMelody(seq([76, 75, 76, 75, 76, 71, 74, 72, 69])), 'furElise');
  assert.equal(detectMelody(seq([78, 77, 78, 77, 78, 73, 76, 74, 71])), 'furElise');
  assert.equal(detectMelody(seq([60, 62, 64])), null);
  assert.ok(detectBach(seq([70, 69, 72, 71])));
  assert.ok(detectTristan(new Set([53, 59, 63, 68])));
  assert.ok(!detectTristan(new Set([59, 65, 63, 68])));
});

test('easter eggs: gestures', () => {
  assert.ok(detectChromatic(seq(Array.from({ length: 13 }, (_, i) => 60 + i))));
  assert.ok(detectGlissando(seq([60, 62, 64, 65, 67, 69, 71, 72], 50)));
  assert.ok(!detectGlissando(seq([60, 62, 64, 65, 67, 69, 71, 72], 200)));
  assert.ok(detectPalindrome(seq([60, 64, 67, 71, 67, 64, 60])));
  assert.ok(isCrescendo([20, 40, 60, 90].map(velocity => ({ velocity }))));
  assert.ok(isMetronomic([300, 310, 295]));
  assert.ok(!isMetronomic([300, 400, 295]));
});
