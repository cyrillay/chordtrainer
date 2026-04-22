// Microphone capture, FFT-based polyphonic pitch detection, sensitivity sliders.
import { state, DEFAULT_SENSITIVITY } from './state.js';
import { pitchClassToDisplay } from './theory.js';
import { updatePianoHighlight, updateStatus, applyHeardPitchClasses } from './views.js';
import { $ } from './dom.js';
import {
  SAMPLE_RATE, FFT_SIZE, FFT_SMOOTHING, ANALYSIS_FRAME_STRIDE,
  PIANO_LOW_HZ, PIANO_HIGH_HZ, PITCH_IGNORE_LOW_HZ, PITCH_IGNORE_HIGH_HZ,
  PEAK_TOP_N, HARMONIC_MAX, LS
} from './constants.js';

function freqToPitchClass(freq) {
  if (freq < PITCH_IGNORE_LOW_HZ || freq > PITCH_IGNORE_HIGH_HZ) return null;
  const midi = 69 + 12 * Math.log2(freq / 440);
  return ((Math.round(midi) % 12) + 12) % 12;
}

// Reused across frames to avoid a per-frame allocation (was the biggest GC
// source on mobile: a fresh Float32Array every rAF at 60 Hz).
let freqBuffer = null;
let frameCounter = 0;

export async function startMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    state.micStream = stream;

    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      $('status').textContent = 'Web Audio is not supported in this browser';
      return;
    }
    state.audioContext = new Ctor({ sampleRate: SAMPLE_RATE });
    const source = state.audioContext.createMediaStreamSource(stream);

    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = FFT_SIZE;
    state.analyser.smoothingTimeConstant = FFT_SMOOTHING;
    source.connect(state.analyser);

    freqBuffer = new Float32Array(state.analyser.frequencyBinCount);
    frameCounter = 0;

    state.isListening = true;
    $('levelMeter').style.display = 'block';

    analyzeLoop();
    updateStatus();
  } catch (err) {
    console.error(err);
    $('status').textContent = 'Microphone access denied';
  }
}

export function stopMicrophone() {
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  if (state.micStream) state.micStream.getTracks().forEach(t => t.stop());
  if (state.audioContext) state.audioContext.close();
  state.audioContext = null;
  state.analyser = null;
  state.micStream = null;
  state.isListening = false;
  state.heardPitchClasses = new Set();
  state.heardHistory = [];
  freqBuffer = null;

  $('levelMeter').style.display = 'none';
  $('meterFill').style.width = '0%';

  updatePianoHighlight();
  updateStatus();
}

function analyzeLoop() {
  if (!state.isListening) return;
  state.animationFrame = requestAnimationFrame(analyzeLoop);

  // Run the analysis every N frames so we don't block the main thread at 60 Hz.
  // Chord detection is already stabilised over several frames, so ~30 Hz is ample.
  frameCounter = (frameCounter + 1) % ANALYSIS_FRAME_STRIDE;
  if (frameCounter !== 0) return;

  const sens = state.sensitivity;
  const analyser = state.analyser;
  const bufferLength = analyser.frequencyBinCount;
  analyser.getFloatFrequencyData(freqBuffer);

  const sampleRate = state.audioContext.sampleRate;
  const binSize = sampleRate / analyser.fftSize;

  let maxDb = -Infinity;
  for (let i = 0; i < bufferLength; i++) {
    if (freqBuffer[i] > maxDb) maxDb = freqBuffer[i];
  }

  const level = Math.max(0, Math.min(100, (maxDb + 80) * 1.66));
  $('meterFill').style.width = level + '%';

  if (maxDb < sens.silenceGate) {
    state.heardHistory.push(new Set());
    if (state.heardHistory.length > sens.historyLength) state.heardHistory.shift();
    computeStableHeard();
    if (state.debugEnabled) updateDebugPanel([], maxDb, 'silence');
    return;
  }

  const minBin = Math.floor(PIANO_LOW_HZ / binSize);
  const maxBin = Math.ceil(PIANO_HIGH_HZ / binSize);
  const threshold = maxDb - sens.peakThreshold;

  const peaks = [];
  const iStart = Math.max(2, minBin);
  const iEnd = Math.min(bufferLength - 2, maxBin);
  for (let i = iStart; i < iEnd; i++) {
    const v = freqBuffer[i];
    if (v < threshold) continue;
    if (v > freqBuffer[i - 1] && v > freqBuffer[i - 2] &&
        v > freqBuffer[i + 1] && v > freqBuffer[i + 2]) {
      // Parabolic interpolation for refined frequency.
      const alpha = freqBuffer[i - 1];
      const beta = v;
      const gamma = freqBuffer[i + 1];
      const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma);
      const refinedBin = i + (isFinite(p) ? p : 0);
      peaks.push({ freq: refinedBin * binSize, mag: beta });
    }
  }

  peaks.sort((a, b) => b.mag - a.mag);
  const topPeaks = peaks.length > PEAK_TOP_N ? peaks.slice(0, PEAK_TOP_N) : peaks;

  // A peak is a fundamental unless a stronger peak's harmonic series matches it.
  const fundamentals = [];
  const fundamentalCutoffDb = maxDb - sens.fundamentalCutoff;
  for (const peak of topPeaks) {
    let isHarmonic = false;
    for (const stronger of fundamentals) {
      for (let n = 2; n <= HARMONIC_MAX; n++) {
        const expected = stronger.freq * n;
        const cents = 1200 * Math.log2(peak.freq / expected);
        if (Math.abs(cents) < sens.harmonicTolerance) {
          isHarmonic = true;
          break;
        }
      }
      if (isHarmonic) break;
    }
    if (!isHarmonic && peak.mag > fundamentalCutoffDb) {
      fundamentals.push(peak);
    }
    if (fundamentals.length >= sens.maxFundamentals) break;
  }

  const framePcs = new Set();
  for (const f of fundamentals) {
    const pc = freqToPitchClass(f.freq);
    if (pc !== null) framePcs.add(pc);
  }

  state.heardHistory.push(framePcs);
  if (state.heardHistory.length > sens.historyLength) state.heardHistory.shift();

  computeStableHeard();
  if (state.debugEnabled) updateDebugPanel(fundamentals, maxDb, 'active');
}

function updateDebugPanel(fundamentals, maxDb, status) {
  const content = $('debugContent');
  if (status === 'silence') {
    content.innerHTML = `<div class="debug-row"><span><em>silence</em></span><span class="debug-mag">${maxDb.toFixed(1)} dB</span></div>`;
    return;
  }
  if (fundamentals.length === 0) {
    content.innerHTML = `<div class="debug-row"><span><em>no peaks</em></span><span class="debug-mag">${maxDb.toFixed(1)} dB</span></div>`;
    return;
  }
  const rows = fundamentals.map(f => {
    const pc = freqToPitchClass(f.freq);
    const noteName = pc !== null ? pitchClassToDisplay(pc) : '?';
    const midi = 69 + 12 * Math.log2(f.freq / 440);
    const octave = Math.floor(midi / 12) - 1;
    return `<div class="debug-row">
      <span class="debug-freq">${f.freq.toFixed(1)} Hz</span>
      <span class="debug-note">${noteName}${octave}</span>
      <span class="debug-mag">${f.mag.toFixed(1)} dB</span>
    </div>`;
  }).join('');
  content.innerHTML = rows;
}

function computeStableHeard() {
  const counts = new Map();
  for (const frame of state.heardHistory) {
    for (const pc of frame) {
      counts.set(pc, (counts.get(pc) || 0) + 1);
    }
  }

  const threshold = Math.max(1, Math.floor(state.heardHistory.length * (state.sensitivity.stabilityPct / 100)));
  const stable = new Set();
  for (const [pc, count] of counts) {
    if (count >= threshold) stable.add(pc);
  }

  const prev = state.heardPitchClasses;
  let changed = stable.size !== prev.size;
  if (!changed) {
    for (const pc of stable) {
      if (!prev.has(pc)) { changed = true; break; }
    }
  }
  if (changed) applyHeardPitchClasses(stable);
}

// Sensitivity slider setup + persistence.
const SLIDER_CONFIG = [
  { id: 'silenceSlider', valId: 'silenceVal', key: 'silenceGate', fmt: v => `${v} dB` },
  { id: 'peakSlider', valId: 'peakVal', key: 'peakThreshold', fmt: v => `${v} dB` },
  { id: 'harmonicSlider', valId: 'harmonicVal', key: 'harmonicTolerance', fmt: v => `${v} ¢` },
  { id: 'stabilitySlider', valId: 'stabilityVal', key: 'stabilityPct', fmt: v => `${v} %` },
  { id: 'maxFundSlider', valId: 'maxFundVal', key: 'maxFundamentals', fmt: v => `${v}` },
  { id: 'fundCutSlider', valId: 'fundCutVal', key: 'fundamentalCutoff', fmt: v => `${v} dB` }
];

export function loadSensitivity() {
  try {
    const saved = localStorage.getItem(LS.SENSITIVITY);
    if (saved) Object.assign(state.sensitivity, JSON.parse(saved));
  } catch { /* ignore */ }
}

function saveSensitivity() {
  try { localStorage.setItem(LS.SENSITIVITY, JSON.stringify(state.sensitivity)); }
  catch { /* ignore */ }
}

export function syncSlidersFromState() {
  for (const cfg of SLIDER_CONFIG) {
    const slider = $(cfg.id);
    const valEl = $(cfg.valId);
    if (!slider || !valEl) continue;
    slider.value = state.sensitivity[cfg.key];
    valEl.textContent = cfg.fmt(state.sensitivity[cfg.key]);
  }
}

export function bindSensitivityControls() {
  for (const cfg of SLIDER_CONFIG) {
    const slider = $(cfg.id);
    const valEl = $(cfg.valId);
    if (!slider || !valEl) continue;
    slider.addEventListener('input', () => {
      const value = parseInt(slider.value, 10);
      state.sensitivity[cfg.key] = value;
      valEl.textContent = cfg.fmt(value);
      saveSensitivity();
    });
  }

  $('resetSensBtn').addEventListener('click', () => {
    Object.assign(state.sensitivity, DEFAULT_SENSITIVITY);
    syncSlidersFromState();
    saveSensitivity();
  });

  $('debugCb').addEventListener('change', (e) => {
    state.debugEnabled = e.target.checked;
    $('debugPanel').style.display = e.target.checked ? 'block' : 'none';
  });
}
