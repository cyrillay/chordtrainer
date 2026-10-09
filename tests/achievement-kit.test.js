import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStore, unlockedCount, progressOf, dueUnlocks, tileHtml, sectionsHtml, createAchievements } from '../js/ux/achievementKit.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
beforeEach(() => { globalThis.localStorage = memory(); });

const LIST = [
  { id: 'ten', vis: 'visible', icon: 'T', name: 'Ten', desc: 'Ten notes', metric: 'notes', target: 10 },
  { id: 'calc', vis: 'visible', icon: 'C', name: 'Calc', desc: 'Computed', target: 2, value: (s) => (s.extra || 0) },
  { id: 'egg', vis: 'secret', icon: 'E', name: 'Egg', desc: 'Found it', hint: 'Look closer' },
  { id: 'ultra', vis: 'ultra', icon: 'U', name: 'Ultra', desc: 'All of it', hint: 'Far away', metric: 'big', target: 1 },
];
const SECTIONS = [
  { vis: 'visible', label: 'Common', blurb: 'b' },
  { vis: 'secret', label: 'Rare', blurb: 'b' },
  { vis: 'ultra', label: 'Ultra-rare', blurb: 'b' },
];

test('normalizeStore reads the old flat map and the current shape', () => {
  assert.deepEqual(normalizeStore({ ten: 5 }), { unlocked: { ten: 5 }, counters: {} });
  assert.deepEqual(normalizeStore(null), { unlocked: {}, counters: {} });
  const s = normalizeStore({ unlocked: { a: 1 }, counters: { n: 2 }, grooves: ['swing'] });
  assert.deepEqual(s.grooves, ['swing']);
});

test('progress and due unlocks come from counters, custom metric readers or value()', () => {
  const store = { unlocked: {}, counters: { notes: 12 }, extra: 1 };
  assert.deepEqual(progressOf(LIST[0], store), { value: 10, target: 10 });
  assert.deepEqual(progressOf(LIST[1], store), { value: 1, target: 2 });
  assert.equal(progressOf(LIST[2], store), null);
  assert.deepEqual(dueUnlocks(LIST, store).map((a) => a.id), ['ten']);
  assert.deepEqual(dueUnlocks(LIST, store, () => 99).map((a) => a.id), ['ten', 'ultra']);
});

test('tiles hide secrets and riddles until unlocked', () => {
  const store = { unlocked: { egg: 1 }, counters: { notes: 3 } };
  assert.match(tileHtml(LIST[0], store), /3 \/ 10/);
  assert.match(tileHtml(LIST[2], store), /Egg/);
  assert.match(tileHtml(LIST[2], { unlocked: {}, counters: {} }), /\?\?\?.*Look closer/s);
  assert.doesNotMatch(tileHtml(LIST[3], store), /Ultra<\/div>/);
  assert.match(tileHtml(LIST[0], store, { cls: { unlocked: 'is-on', locked: 'is-off', secret: 's', ultra: 'u' } }), /ach-tile is-off/);
  assert.match(sectionsHtml(LIST, store, SECTIONS), /Rare<\/span><span class="ach-section-count">1 \/ 1/);
});

test('the live case counts, grants and saves without a page', () => {
  const unlocks = [];
  const kit = createAchievements({ list: LIST, key: 'etude.testAch', sections: SECTIONS, onUnlock: (a) => unlocks.push(a.id) });
  kit.bump('notes', 9);
  assert.equal(kit.isUnlocked('ten'), false);
  kit.bump('notes');
  assert.equal(kit.isUnlocked('ten'), true);
  kit.grant('egg');
  kit.setMax('big', 1);
  assert.deepEqual(unlocks, ['ten', 'egg', 'ultra']);
  const saved = JSON.parse(localStorage.getItem('etude.testAch'));
  assert.equal(unlockedCount(LIST, saved), 3);
  assert.equal(saved.counters.notes, 10);
  kit.reset();
  assert.equal(unlockedCount(LIST, JSON.parse(localStorage.getItem('etude.testAch'))), 0);
});
