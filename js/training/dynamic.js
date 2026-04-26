// Dynamic mode: metronome ticks at a tempo, chord changes every bar.
import { state } from '../core/state.js';
import { advanceToNextChord } from './generator.js';
import { displayChord } from '../instruments/chordDisplay.js';
import { playClick } from '../audio/tones.js';
import { $ } from '../core/dom.js';

let indicatorEl = null;
let startBtnEl = null;
function indicator() { return indicatorEl ||= $('beatIndicator'); }
function startBtn() { return startBtnEl ||= $('dynamicStartBtn'); }

function rebuildBeatIndicator() {
  const el = indicator();
  if (!el) return;
  const n = state.dynamic.barBeats;
  if (el.children.length === n) return;
  el.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const dot = document.createElement('span');
    dot.className = 'beat-dot';
    el.appendChild(dot);
  }
}

function flashBeatIndicator(beatIndex) {
  const dots = indicator().children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('active', i === beatIndex);
}

function clearBeatIndicator() {
  const dots = indicator().children;
  for (const d of dots) d.classList.remove('active');
}

function tick() {
  const dyn = state.dynamic;
  const isDownbeat = dyn.beatIndex === 0;
  const accent = isDownbeat && dyn.accent;

  if (isDownbeat && dyn.barStarted) {
    advanceToNextChord(displayChord);
    dyn.correctThisBar = false;
  }
  dyn.barStarted = true;

  if (!dyn.muted) {
    playClick({ freq: accent ? 1200 : 800, peak: accent ? 0.25 : 0.15 });
  }
  flashBeatIndicator(dyn.beatIndex);

  dyn.beatIndex = (dyn.beatIndex + 1) % dyn.barBeats;
}

export function startDynamic() {
  const dyn = state.dynamic;
  if (dyn.running) return;
  dyn.running = true;
  dyn.beatIndex = 0;
  dyn.barStarted = false;
  dyn.correctThisBar = false;

  rebuildBeatIndicator();
  tick();
  dyn.intervalId = setInterval(tick, 60000 / dyn.bpm);

  const btn = startBtn();
  btn.textContent = 'Stop metronome';
  btn.classList.add('danger');
  indicator().style.display = 'flex';
}

export function stopDynamic() {
  const dyn = state.dynamic;
  if (dyn.intervalId) clearInterval(dyn.intervalId);
  dyn.intervalId = null;
  dyn.running = false;
  dyn.barStarted = false;
  clearBeatIndicator();

  const btn = startBtn();
  btn.textContent = 'Start metronome';
  btn.classList.remove('danger');
  indicator().style.display = 'none';
}

export function setBpm(bpm) {
  state.dynamic.bpm = bpm;
  if (state.dynamic.running) {
    clearInterval(state.dynamic.intervalId);
    state.dynamic.intervalId = setInterval(tick, 60000 / bpm);
  }
}

export function setMetronomeMuted(muted) { state.dynamic.muted = muted; }

// value: 'off' | '3' | '4' | '6'
export function setMetronomeAccent(value) {
  const dyn = state.dynamic;
  if (value === 'off') {
    dyn.accent = false;
    dyn.barBeats = 4;
  } else {
    dyn.accent = true;
    dyn.barBeats = parseInt(value, 10);
  }
  if (dyn.beatIndex >= dyn.barBeats) dyn.beatIndex = 0;
  rebuildBeatIndicator();
}
