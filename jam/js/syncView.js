// Ghost Jam: the audio sync test, a modal on the setup screen.
// A quiet tap test: you tap along to clicks and the
// median lag is added to the latency the browser reports (see
// js/audio/sync.js). Sight-reading's tempo mode uses the same offsets.

import { SYNC, measureOffset, offsetFor, storeOffset, forgetOffset } from '../../js/audio/sync.js';
import { loadSyncOffsets, saveSyncOffsets } from '../../js/audio/context.js';
import { $, app, band } from './state.js';

let syncSaved = loadSyncOffsets();
let sync = null;   // the running test: { clicks, taps, count, out, timer }

const syncOffset = () => (band.ctx ? offsetFor(syncSaved, band.reportedLatency) : 0);
const fmtMs = (s) => `${s > 0 ? '+' : ''}${Math.round(s * 1000)} ms`;

export function applySync() {
  band.extraLatency = syncOffset();
}

export function renderSync() {
  const off = syncOffset();
  const on = Math.round(off * 1000) !== 0;
  $('syncVal').innerHTML = on ? ` · <b>${fmtMs(off)}</b>` : '';
  $('syncResetBtn').hidden = !on || !!sync;
  if (!sync) {
    $('syncBig').textContent = on ? fmtMs(off) : '0 ms';
    $('syncBig').classList.remove('is-wait');
  }
}

function renderPips(count = 0) {
  $('syncPips').innerHTML = Array.from({ length: SYNC.clicks }, (_, i) =>
    `<i class="${i < SYNC.warmup ? 'warm' : ''}${i < count ? ' on' : ''}"></i>`).join('');
}

function openSync() {
  $('syncModal').hidden = false;
  $('syncMsg').textContent = `Hits land late? Play through the speakers you jam with and tap any key on each click you hear. ${SYNC.clicks} clicks, the first ${SYNC.warmup} to find the pulse.`;
  $('syncAgainBtn').textContent = 'Start';
  $('syncAgainBtn').hidden = false;
  renderPips();
  renderSync();
  $('syncAgainBtn').focus();
}

export function closeSync() {
  stopSync();
  $('syncModal').hidden = true;
}

export function stopSync() {
  if (!sync) return;
  clearTimeout(sync.timer);
  sync.out.disconnect();
  sync = null;
  applySync();
}

function startSync() {
  if (app.midiState !== 'connected') {
    if (app.midiState === 'off') app.connect();
    $('syncMsg').textContent = 'Connect your keyboard first, then press Start.';
    return;
  }
  stopSync();
  const ctx = band.audio();
  band.extraLatency = 0; // measure against what the browser reports
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.8;
  const clicks = Array.from({ length: SYNC.clicks }, (_, i) => t0 + i * SYNC.interval);
  clicks.forEach((t, i) => band.click(t, i < SYNC.warmup ? 0.7 : 1, out));
  const wait = (t0 - ctx.currentTime + SYNC.clicks * SYNC.interval + 0.2) * 1000;
  sync = { clicks, taps: [], count: 0, out, timer: setTimeout(endSync, wait) };
  $('syncAgainBtn').hidden = true;
  $('syncResetBtn').hidden = true;
  $('syncBig').textContent = 'Listen';
  $('syncBig').classList.add('is-wait');
  $('syncMsg').textContent = 'Tap any key on each click.';
  renderPips();
}

export function syncTap(t) {
  const last = sync.taps[sync.taps.length - 1];
  sync.taps.push(t);
  if (last === undefined || t - last > 0.1) sync.count++;
  renderPips(sync.count);
}

function endSync() {
  const { clicks, taps } = sync;
  stopSync();
  const r = measureOffset(taps, clicks);
  let msg;
  if (r.error === 'few') msg = 'Not enough taps to measure. Tap once on each click and try again.';
  else if (r.error === 'uneven') msg = 'The taps were too uneven to trust. Try again, relaxed.';
  else {
    syncSaved = storeOffset(syncSaved, band.reportedLatency, r.offset);
    saveSyncOffsets(syncSaved);
    applySync();
    msg = Math.abs(r.offset) < 0.01
      ? 'Already in sync. Nothing to change.'
      : `You hear the band <b>${Math.abs(Math.round(r.offset * 1000))} ms</b> ${r.offset > 0 ? 'late' : 'early'}. Saved for these speakers: hits and lights now follow what you hear.`;
  }
  $('syncMsg').innerHTML = msg;
  $('syncAgainBtn').textContent = 'Again';
  $('syncAgainBtn').hidden = false;
  renderSync();
}

function resetSync() {
  syncSaved = forgetOffset(syncSaved, band.reportedLatency);
  saveSyncOffsets(syncSaved);
  applySync();
  $('syncMsg').textContent = 'Back to the latency the browser reports.';
  renderSync();
}

$('syncBtn').addEventListener('click', openSync);
$('syncAgainBtn').addEventListener('click', startSync);
$('syncResetBtn').addEventListener('click', resetSync);
$('syncCloseBtn').addEventListener('click', closeSync);
$('syncModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeSync(); });

export const syncing = () => !!sync;
export const currentSync = () => sync;
