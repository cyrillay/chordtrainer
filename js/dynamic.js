// Dynamic mode: metronome ticks at a tempo, chord changes every 4 beats.
import { state } from './state.js';
import { advanceToNextChord } from './generator.js';
import { displayChord } from './views.js';

let metronomeCtx = null;

function ensureCtx() {
  if (!metronomeCtx) {
    metronomeCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return metronomeCtx;
}

function tickSound(isDownbeat) {
  const ctx = ensureCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = isDownbeat ? 1200 : 800;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(isDownbeat ? 0.25 : 0.15, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  osc.start(now);
  osc.stop(now + 0.08);
}

function flashBeatIndicator(beatIndex) {
  const dots = document.querySelectorAll('#beatIndicator .beat-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === beatIndex));
}

function clearBeatIndicator() {
  document.querySelectorAll('#beatIndicator .beat-dot').forEach(d => d.classList.remove('active'));
}

function tick() {
  const dyn = state.dynamic;
  const isDownbeat = dyn.beatIndex === 0;

  // On downbeat (beat 1) of every bar after the first, advance to next chord.
  if (isDownbeat && dyn.barStarted) {
    advanceToNextChord(displayChord);
    dyn.correctThisBar = false;
  }
  dyn.barStarted = true;

  tickSound(isDownbeat);
  flashBeatIndicator(dyn.beatIndex);

  dyn.beatIndex = (dyn.beatIndex + 1) % 4;
}

export function startDynamic() {
  const dyn = state.dynamic;
  if (dyn.running) return;
  dyn.running = true;
  dyn.beatIndex = 0;
  dyn.barStarted = false;
  dyn.correctThisBar = false;

  const intervalMs = 60000 / dyn.bpm;
  tick(); // immediate downbeat
  dyn.intervalId = setInterval(tick, intervalMs);

  document.getElementById('dynamicStartBtn').textContent = 'Stop tempo';
  document.getElementById('dynamicStartBtn').classList.add('danger');
  document.getElementById('beatIndicator').style.display = 'flex';
}

export function stopDynamic() {
  const dyn = state.dynamic;
  if (dyn.intervalId) clearInterval(dyn.intervalId);
  dyn.intervalId = null;
  dyn.running = false;
  dyn.barStarted = false;
  clearBeatIndicator();

  document.getElementById('dynamicStartBtn').textContent = 'Start tempo';
  document.getElementById('dynamicStartBtn').classList.remove('danger');
  document.getElementById('beatIndicator').style.display = 'none';
}

export function setBpm(bpm) {
  state.dynamic.bpm = bpm;
  if (state.dynamic.running) {
    // Restart the interval at the new tempo (preserves beat phase).
    clearInterval(state.dynamic.intervalId);
    const intervalMs = 60000 / bpm;
    state.dynamic.intervalId = setInterval(tick, intervalMs);
  }
}

export function setDynamicEnabled(enabled) {
  state.dynamic.enabled = enabled;
  document.getElementById('dynamicControls').style.display = enabled ? 'flex' : 'none';
  if (!enabled && state.dynamic.running) stopDynamic();
}
