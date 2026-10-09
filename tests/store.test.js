import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEYS, PREFIXES, isOurs, read, write, readRaw, writeRaw, ourKeys,
  exportBackup, parseBackup, restoreBackup, describeBackup, backupFileName, BACKUP_FORMAT,
} from '../js/core/store.js';

// A Map-backed localStorage, like the browser's.
function fakeStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

beforeEach(() => { globalThis.localStorage = fakeStorage(); });

test('every registered key carries one of our prefixes, and no key is registered twice', () => {
  const all = Object.values(KEYS).flatMap((g) => Object.values(g));
  for (const k of all) assert.ok(isOurs(k), k);
  assert.equal(new Set(all).size, all.length);
  assert.ok(PREFIXES.length >= 6);
});

test('read gives the fallback for missing keys, null and broken JSON', () => {
  assert.deepEqual(read('etude.x', { a: 1 }), { a: 1 });
  localStorage.setItem('etude.x', 'null');
  assert.equal(read('etude.x', 7), 7);
  localStorage.setItem('etude.x', '{oops');
  assert.equal(read('etude.x', 7), 7);
  write('etude.x', { b: 2 });
  assert.deepEqual(read('etude.x', null), { b: 2 });
});

test('raw values stay strings', () => {
  writeRaw('chordTrainer.onboarded', '1');
  assert.equal(readRaw('chordTrainer.onboarded'), '1');
  assert.equal(readRaw('chordTrainer.nothing', 'dflt'), 'dflt');
});

test('storage that throws never breaks a read or a write', () => {
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(read('etude.x', 3), 3);
  assert.equal(write('etude.x', 3), false);
  assert.deepEqual(ourKeys(), []);
});

test('a backup holds our keys only, as raw strings, and restores exactly', () => {
  write(KEYS.arpeggio.PROGRESS, { levels: { 1: { stars: 3 } } });
  writeRaw(KEYS.site.THEME, 'urtext');
  localStorage.setItem('someoneElse', 'keep me');
  const b = exportBackup(new Date('2026-10-08T12:00:00Z'));
  assert.equal(b.format, BACKUP_FORMAT);
  assert.deepEqual(Object.keys(b.data).sort(), [KEYS.arpeggio.PROGRESS, KEYS.site.THEME].sort());

  // Later the browser holds something else.
  globalThis.localStorage = fakeStorage();
  write(KEYS.jam.SCORES, { x: 1 });
  localStorage.setItem('someoneElse', 'keep me');

  const parsed = parseBackup(JSON.stringify(b));
  assert.ok(parsed.ok);
  assert.deepEqual(describeBackup(parsed.backup).apps.sort(), ['arpeggio', 'site']);
  restoreBackup(parsed.backup);
  assert.deepEqual(read(KEYS.arpeggio.PROGRESS, null), { levels: { 1: { stars: 3 } } });
  assert.equal(readRaw(KEYS.site.THEME), 'urtext');
  assert.equal(readRaw(KEYS.jam.SCORES), null, 'keys absent from the backup are cleared');
  assert.equal(readRaw('someoneElse'), 'keep me', 'keys that are not ours are left alone');
});

test('parseBackup refuses other files with a message, and drops foreign keys', () => {
  assert.equal(parseBackup('not json').ok, false);
  assert.match(parseBackup('{"hello":1}').error, /not an Étude backup/);
  assert.match(parseBackup({ format: BACKUP_FORMAT, v: 99, data: {} }).error, /newer version/);
  const p = parseBackup({ format: BACKUP_FORMAT, v: 1, data: { 'etude.stats': '{}', evil: 'x', 'ghostJam.scores': 5 } });
  assert.deepEqual(Object.keys(p.backup.data), ['etude.stats']);
});

test('backup file names carry the local date', () => {
  assert.equal(backupFileName(new Date(2026, 9, 8)), 'etude-backup-2026-10-08.json');
});
