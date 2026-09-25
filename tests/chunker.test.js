import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChunks, shuffle } from '../scoretrainer/js/chunker.js';

const range = n => Array.from({ length: n }, (_, i) => i + 1);

test('buildChunks splits evenly', () => {
  assert.deepEqual(buildChunks(range(8), 4), [[1, 2, 3, 4], [5, 6, 7, 8]]);
});

test('buildChunks keeps a trailing remainder larger than one', () => {
  assert.deepEqual(buildChunks(range(10), 4), [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10]]);
});

test('buildChunks merges a single orphan measure into the previous chunk', () => {
  assert.deepEqual(buildChunks(range(9), 4), [[1, 2, 3, 4], [5, 6, 7, 8, 9]]);
});

test('buildChunks edge cases', () => {
  assert.deepEqual(buildChunks([], 4), []);
  assert.deepEqual(buildChunks([1], 4), [[1]]);
  assert.deepEqual(buildChunks(range(3), 1), [[1], [2], [3]]);
});

test('shuffle returns a permutation without mutating its input', () => {
  const input = range(20);
  const out = shuffle(input);
  assert.deepEqual(input, range(20));
  assert.deepEqual([...out].sort((a, b) => a - b), input);
});
