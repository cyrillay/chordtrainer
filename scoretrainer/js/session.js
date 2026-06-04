// Playback session state machine.
//
// One "round" is a shuffled pass through every chunk: each chunk appears
// exactly once. When the round ends we reshuffle (with a guarantee that
// the new round's first chunk differs from the previous round's last —
// otherwise you'd see the same screen for double the configured time and
// it would feel like the timer broke).

import { shuffle } from './chunker.js';

export function createSession({ chunks, displayMs, onChunkChange, onTick, onRoundComplete }) {
  if (!chunks.length) throw new Error('Session needs at least one chunk');

  let round = 1;
  let order = nextOrder(null);
  let cursor = 0;          // 0..order.length-1
  let history = [];        // cursors visited THIS round (for prev)
  let paused = false;
  let remainingMs = displayMs;
  let lastTickAt = 0;
  let rafId = null;

  function nextOrder(prevLast) {
    if (chunks.length === 1) return [0];
    let attempt = shuffle(chunks.map((_, i) => i));
    if (prevLast != null && attempt[0] === prevLast) {
      // Rotate so the new first ≠ old last. This is cheap and preserves
      // uniformity of permutations conditioned on the constraint.
      const swapIdx = 1 + Math.floor(Math.random() * (attempt.length - 1));
      [attempt[0], attempt[swapIdx]] = [attempt[swapIdx], attempt[0]];
    }
    return attempt;
  }

  function emitChunk() {
    const chunkIdx = order[cursor];
    onChunkChange?.({
      chunk: chunks[chunkIdx],
      chunkIdx,
      positionInRound: cursor + 1,
      roundSize: order.length,
      round,
      canGoBack: history.length > 0,
    });
    remainingMs = displayMs;
    onTick?.({ remainingMs, totalMs: displayMs });
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (paused) { lastTickAt = now; return; }
    const dt = lastTickAt ? now - lastTickAt : 0;
    lastTickAt = now;
    remainingMs -= dt;
    if (remainingMs <= 0) {
      next();
    } else {
      onTick?.({ remainingMs, totalMs: displayMs });
    }
  }

  function start() {
    cursor = 0;
    history = [];
    emitChunk();
    lastTickAt = 0;
    rafId = requestAnimationFrame(tick);
  }

  function next() {
    history.push(cursor);
    cursor++;
    if (cursor >= order.length) {
      const prevLast = order[order.length - 1];
      onRoundComplete?.({ round });
      round += 1;
      order = nextOrder(prevLast);
      cursor = 0;
      history = [];
    }
    emitChunk();
  }

  function prev() {
    if (!history.length) return;
    cursor = history.pop();
    emitChunk();
  }

  function pause() {
    paused = true;
    onTick?.({ remainingMs, totalMs: displayMs, paused: true });
  }
  function resume() {
    paused = false;
    lastTickAt = performance.now();
    onTick?.({ remainingMs, totalMs: displayMs, paused: false });
  }
  function toggle() { paused ? resume() : pause(); }

  function setDisplayMs(ms) {
    const ratio = remainingMs / displayMs;
    displayMs = ms;
    remainingMs = ms * ratio;
    onTick?.({ remainingMs, totalMs: displayMs });
  }

  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
  }

  return { start, next, prev, pause, resume, toggle, setDisplayMs, destroy, get paused() { return paused; } };
}
