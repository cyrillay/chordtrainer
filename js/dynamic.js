// Dynamic mode: metronome ticks at a tempo, chord changes every 4 beats.
import { state } from './state.js';
import { advanceToNextChord } from './generator.js';
import { displayChord } from './views.js';
import { playClick } from './tones.js';
import { $, $$ } from './dom.js';
import { BAR_BEATS } from './constants.js';

let beatDots = null;

function getBeatDots() {
  if (!beatDots) beatDots = $$('#beatIndicator .beat-dot');
  return beatDots;
}

function flashBeatIndicator(beatIndex) {
  const dots = getBeatDots();
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('active', i === beatIndex);
}

function clearBeatIndicator() {
  for (const d of getBeatDots()) d.classList.remove('active');
}

function tick() {
  const dyn = state.dynamic;
  const isDownbeat = dyn.beatIndex === 0;

  if (isDownbeat && dyn.barStarted) {
    advanceToNextChord(displayChord);
    dyn.correctThisBar = false;
  }
  dyn.barStarted = true;

  if (!dyn.muted) {
    playClick({ freq: isDownbeat ? 1200 : 800, peak: isDownbeat ? 0.25 : 0.15 });
  }
  flashBeatIndicator(dyn.beatIndex);

  dyn.beatIndex = (dyn.beatIndex + 1) % BAR_BEATS;
}

export function startDynamic() {
  const dyn = state.dynamic;
  if (dyn.running) return;
  dyn.running = true;
  dyn.beatIndex = 0;
  dyn.barStarted = false;
  dyn.correctThisBar = false;

  tick();
  dyn.intervalId = setInterval(tick, 60000 / dyn.bpm);

  $('dynamicStartBtn').textContent = 'Stop metronome';
  $('dynamicStartBtn').classList.add('danger');
  $('beatIndicator').style.display = 'flex';
}

export function stopDynamic() {
  const dyn = state.dynamic;
  if (dyn.intervalId) clearInterval(dyn.intervalId);
  dyn.intervalId = null;
  dyn.running = false;
  dyn.barStarted = false;
  clearBeatIndicator();

  $('dynamicStartBtn').textContent = 'Start metronome';
  $('dynamicStartBtn').classList.remove('danger');
  $('beatIndicator').style.display = 'none';
}

export function setBpm(bpm) {
  state.dynamic.bpm = bpm;
  if (state.dynamic.running) {
    clearInterval(state.dynamic.intervalId);
    state.dynamic.intervalId = setInterval(tick, 60000 / bpm);
  }
}

export function setMetronomeMuted(muted) { state.dynamic.muted = muted; }

export function setDynamicEnabled(enabled) {
  state.dynamic.enabled = enabled;
  if (!enabled && state.dynamic.running) stopDynamic();
}
