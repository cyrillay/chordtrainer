import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChord } from '../js/core/theory.js';
import { COMPS, compById, stabsFor, stabTimeline, stabAt, CompJudge } from '../jam/js/comping.js';

test('every comp has two bars of steps inside the bar', () => {
  for (const [style, comps] of Object.entries(COMPS)) {
    assert.equal(comps[0].id, 'one', style);
    for (const c of comps) {
      assert.equal(c.bars.length, 2, c.id);
      for (const bar of c.bars) for (const p of bar) assert.ok(p >= 0 && p < 16, `${style} ${c.id}`);
    }
  }
});

test('on the one: one stab per bar, on the downbeat', () => {
  const one = compById('bossa', 'one');
  assert.deepEqual(stabsFor(one, 0), [0]);
  assert.deepEqual(stabsFor(one, 3), [0]);
  assert.deepEqual(stabsFor(one, 1, 2), [0, 4]);
});

test('son clave 2-3 alternates its bars', () => {
  const clave = compById('salsa', 'clave');
  assert.deepEqual(stabsFor(clave, 0), [1, 2]);          // beats 2 and 3
  assert.deepEqual(stabsFor(clave, 1), [0, 1.5, 3]);     // 1, and of 2, 4
  assert.deepEqual(stabsFor(clave, 0, 2), [1, 2, 4, 5.5, 7]);
});

test('montuno: the and of 4 belongs to the next chord', () => {
  const m = compById('salsa', 'montuno');
  assert.deepEqual(stabsFor(m, 0), [-0.5, 0.5, 1.5, 2.5]);   // pushed into the count-in
  assert.deepEqual(stabsFor(m, 1), [-0.5, 0.5, 1.5, 2.5]);
  assert.deepEqual(stabsFor(m, 0, 2), [-0.5, 0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]);
  const tl = stabTimeline(m, 2);
  assert.equal(tl.length, 8);
  assert.deepEqual(tl.find((s) => s.beat === 3.5), { slot: 1, beat: 3.5 });
});

test('a moment goes to the nearest stab in its window', () => {
  const m = compById('salsa', 'montuno');
  const tl = stabTimeline(m, 2);
  assert.equal(tl[stabAt(tl, 3.45, m.window)].slot, 1);
  assert.equal(stabAt(tl, 3.0, m.window), -1);             // on beat 4: between stabs
});

function strike(j, pcs, t) {
  const held = new Set();
  for (const pc of pcs) { held.add(pc); j.noteOn(pc, t, held); }
}

const C = buildChord('C', 'maj');
const mk = (stabs, extra = {}) => new CompJudge({ chord: C, start: 1000, beatMs: 500, stabs, ...extra });

test('every stab in time is perfect', () => {
  const j = mk([-0.5, 0.5, 1.5, 2.5]);
  for (const b of [-0.5, 0.5, 1.5, 2.5]) strike(j, [0, 4, 7], 1000 + b * 500 + 20);
  const r = j.result();
  assert.equal(r.grade, 'perfect');
  assert.equal(r.stabs.filter((s) => s.offset !== null).length, 4);
});

test('holding the chord is not playing the rhythm', () => {
  const j = mk([0.5, 1.5, 2.5, 3.5]);
  strike(j, [0, 4, 7], 1250);                    // lands stab 1, then just held
  const r = j.result();
  assert.equal(r.stabs.filter((s) => s.offset !== null).length, 1);
  assert.equal(r.grade, 'miss');
});

test('three stabs of four is good, two is half there, a stray costs the perfect', () => {
  let j = mk([0.5, 1.5, 2.5, 3.5]);
  for (const b of [0.5, 1.5, 2.5]) strike(j, [4, 7], 1000 + b * 500);
  assert.equal(j.result().grade, 'good');
  j = mk([0.5, 1.5, 2.5, 3.5]);
  for (const b of [0.5, 1.5]) strike(j, [4, 7], 1000 + b * 500);
  assert.equal(j.result().grade, 'late');
  j = mk([0, 1.5, 3]);
  for (const b of [0, 0.9, 1.5, 3]) strike(j, [4, 7], 1000 + b * 500);   // 0.9: between stabs
  const r = j.result();
  assert.equal(r.stray, 1);
  assert.equal(r.grade, 'good');
});

test('a rolled chord is one attack, timed from its first note', () => {
  const j = mk([0]);
  const held = new Set();
  [[0, 990], [4, 1020], [7, 1050]].forEach(([pc, t]) => { held.add(pc); j.noteOn(pc, t, held); });
  const r = j.result();
  assert.equal(r.stray, 0);
  assert.ok(Math.abs(r.stabs[0].offset - (-0.02)) < 1e-9);
});
