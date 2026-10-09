// The page's one AudioContext for sound output: Ghost Jam's band, the
// metronomes, the chimes, the PDF to MIDI player. One place for the two
// things every app needs from it:
//
// - Unlocking. Browsers start audio suspended until a tap or a key. iOS also
//   wants a sound started inside that gesture, so unlock plays one silent
//   sample. Pages call unlockAudio() from their own start buttons, and the
//   first tap or key anywhere does it too.
// - Latency. The browser reports how late its speakers are; the tap test in
//   Ghost Jam stores what is left on top, per output (js/audio/sync.js).
//   outputLatency() gives both, so every app judges against what you hear.
//
// The microphone analysis in Chords keeps its own context: it needs a fixed
// sample rate for its FFT, and it never plays anything.

import { KEYS, read, write } from '../core/store.js';
import { offsetFor } from './sync.js';

let ctx = null;
let unlocked = false;

export const audioSupported = () => typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);

// The shared context, created on first use. Resumes it if the browser
// suspended it (a fresh page, a phone call, a tab in the background).
export function getAudioContext() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor({ latencyHint: 'interactive' });
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Call from a click, tap or key handler.
export function unlockAudio() {
  const c = getAudioContext();
  if (!c || unlocked) return c;
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start(0);
    unlocked = true;
  } catch { /* try again on the next gesture */ }
  return c;
}

// The first gesture on the page unlocks audio, whatever it lands on.
if (typeof window !== 'undefined') {
  const once = () => {
    unlockAudio();
    if (unlocked) {
      window.removeEventListener('pointerdown', once, true);
      window.removeEventListener('keydown', once, true);
    }
  };
  window.addEventListener('pointerdown', once, true);
  window.addEventListener('keydown', once, true);
}

// ---- Latency ----

// Older versions kept the offsets under Ghost Jam's own key.
const LEGACY_SYNC = 'ghostJam.sync';

export function loadSyncOffsets() {
  const saved = read(KEYS.audio.SYNC, null);
  if (Array.isArray(saved)) return saved;
  const legacy = read(LEGACY_SYNC, []);
  return Array.isArray(legacy) ? legacy : [];
}
export const saveSyncOffsets = (list) => write(KEYS.audio.SYNC, list);

// Seconds, as the browser reports it.
export function reportedLatency() {
  const c = ctx;
  return c ? (c.outputLatency || c.baseLatency || 0) : 0;
}

// Seconds, measured by the tap test for this output, on top of the report.
export const syncOffset = () => (ctx ? offsetFor(loadSyncOffsets(), reportedLatency()) : 0);

// Seconds between scheduling a sound and hearing it.
export const outputLatency = () => reportedLatency() + syncOffset();
