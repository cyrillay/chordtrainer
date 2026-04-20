// Microphone capture, FFT-based polyphonic pitch detection, sensitivity sliders.
import { state, DEFAULT_SENSITIVITY } from './state.js';
import { pitchClassToDisplay } from './theory.js';
import { updatePianoHighlight, updateStatus, applyHeardPitchClasses } from './views.js';

function freqToPitchClass(freq) {
  if (freq < 50 || freq > 4500) return null;
  const midi = 69 + 12 * Math.log2(freq / 440);
  return ((Math.round(midi) % 12) + 12) % 12;
}

export async function startMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    state.micStream = stream;

    state.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    const source = state.audioContext.createMediaStreamSource(stream);

    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 16384;
    state.analyser.smoothingTimeConstant = 0.7;
    source.connect(state.analyser);

    state.isListening = true;
    document.getElementById('micBtn').textContent = 'Stop microphone';
    document.getElementById('micBtn').classList.add('danger');
    document.getElementById('levelMeter').style.display = 'block';

    analyzeLoop();
    updateStatus();
  } catch (err) {
    console.error(err);
    document.getElementById('status').textContent = 'Microphone access denied';
  }
}

export function stopMicrophone() {
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  if (state.micStream) state.micStream.getTracks().forEach(t => t.stop());
  if (state.audioContext) state.audioContext.close();
  state.isListening = false;
  state.heardPitchClasses = new Set();
  state.heardHistory = [];

  document.getElementById('micBtn').textContent = 'Enable microphone';
  document.getElementById('micBtn').classList.remove('danger');
  document.getElementById('levelMeter').style.display = 'none';
  document.getElementById('meterFill').style.width = '0%';

  updatePianoHighlight();
  updateStatus();
}

function analyzeLoop() {
  if (!state.isListening) return;
  state.animationFrame = requestAnimationFrame(analyzeLoop);

  const sens = state.sensitivity;
  const analyser = state.analyser;
  const bufferLength = analyser.frequencyBinCount;
  const freqData = new Float32Array(bufferLength);
  analyser.getFloatFrequencyData(freqData);

  const sampleRate = state.audioContext.sampleRate;
  const binSize = sampleRate / analyser.fftSize;

  let maxDb = -Infinity;
  for (let i = 0; i < bufferLength; i++) {
    if (freqData[i] > maxDb) maxDb = freqData[i];
  }

  const level = Math.max(0, Math.min(100, (maxDb + 80) * 1.66));
  document.getElementById('meterFill').style.width = level + '%';

  if (maxDb < sens.silenceGate) {
    state.heardHistory.push(new Set());
    if (state.heardHistory.length > sens.historyLength) state.heardHistory.shift();
    computeStableHeard();
    if (state.debugEnabled) updateDebugPanel([], maxDb, 'silence');
    return;
  }

  // Piano range: ~55 Hz (A1) to ~4200 Hz (C8).
  const minBin = Math.floor(55 / binSize);
  const maxBin = Math.ceil(4200 / binSize);
  const threshold = maxDb - sens.peakThreshold;

  const peaks = [];
  for (let i = Math.max(2, minBin); i < Math.min(bufferLength - 2, maxBin); i++) {
    const v = freqData[i];
    if (v < threshold) continue;
    if (v > freqData[i - 1] && v > freqData[i - 2] &&
        v > freqData[i + 1] && v > freqData[i + 2]) {
      // Parabolic interpolation for refined frequency.
      const alpha = freqData[i - 1];
      const beta = freqData[i];
      const gamma = freqData[i + 1];
      const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma);
      const refinedBin = i + (isFinite(p) ? p : 0);
      const freq = refinedBin * binSize;
      peaks.push({ freq, mag: beta });
    }
  }

  peaks.sort((a, b) => b.mag - a.mag);
  const topPeaks = peaks.slice(0, 20);

  // A peak is a fundamental unless a stronger peak's harmonic series matches it.
  const fundamentals = [];
  for (const peak of topPeaks) {
    let isHarmonic = false;
    for (const stronger of fundamentals) {
      for (let n = 2; n <= 8; n++) {
        const expected = stronger.freq * n;
        const cents = 1200 * Math.log2(peak.freq / expected);
        if (Math.abs(cents) < sens.harmonicTolerance) {
          isHarmonic = true;
          break;
        }
      }
      if (isHarmonic) break;
    }
    if (!isHarmonic && peak.mag > maxDb - sens.fundamentalCutoff) {
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
  const content = document.getElementById('debugContent');
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

  const changed = stable.size !== state.heardPitchClasses.size ||
                  [...stable].some(pc => !state.heardPitchClasses.has(pc));

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
    const saved = localStorage.getItem('chordTrainer.sensitivity');
    if (saved) Object.assign(state.sensitivity, JSON.parse(saved));
  } catch (e) { /* ignore */ }
}

function saveSensitivity() {
  try {
    localStorage.setItem('chordTrainer.sensitivity', JSON.stringify(state.sensitivity));
  } catch (e) { /* ignore */ }
}

export function syncSlidersFromState() {
  SLIDER_CONFIG.forEach(cfg => {
    const slider = document.getElementById(cfg.id);
    const valEl = document.getElementById(cfg.valId);
    if (!slider || !valEl) return;
    slider.value = state.sensitivity[cfg.key];
    valEl.textContent = cfg.fmt(state.sensitivity[cfg.key]);
  });
}

export function bindSensitivityControls() {
  SLIDER_CONFIG.forEach(cfg => {
    const slider = document.getElementById(cfg.id);
    const valEl = document.getElementById(cfg.valId);
    if (!slider || !valEl) return;
    slider.addEventListener('input', () => {
      const value = parseInt(slider.value, 10);
      state.sensitivity[cfg.key] = value;
      valEl.textContent = cfg.fmt(value);
      saveSensitivity();
    });
  });

  document.getElementById('resetSensBtn').addEventListener('click', () => {
    Object.assign(state.sensitivity, DEFAULT_SENSITIVITY);
    syncSlidersFromState();
    saveSensitivity();
  });

  document.getElementById('debugCb').addEventListener('change', (e) => {
    state.debugEnabled = e.target.checked;
    document.getElementById('debugPanel').style.display = e.target.checked ? 'block' : 'none';
  });
}
