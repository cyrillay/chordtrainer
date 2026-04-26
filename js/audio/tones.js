// Shared AudioContext for short tones (success chime, metronome tick).
// Kept independent of the mic analyser so output playback never touches the FFT
// input chain. Lazy-created on first use to respect browser autoplay policies.

let ctx = null;

export function getToneCtx() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Quick envelope-shaped sine burst. Used by the metronome.
export function playClick({ freq = 1000, peak = 0.2, length = 0.06 } = {}) {
  try {
    const c = getToneCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = freq;
    osc.connect(gain).connect(c.destination);
    const now = c.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    osc.start(now);
    osc.stop(now + length + 0.02);
  } catch { /* silent */ }
}

// Soft three-note arpeggio for the success chime.
export function playArpeggio(freqs = [659.25, 830.61, 987.77]) {
  try {
    const c = getToneCtx();
    const now = c.currentTime;
    const master = c.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(0.18, now + 0.01);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    master.connect(c.destination);

    freqs.forEach((f, i) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0, now + i * 0.05);
      g.gain.linearRampToValueAtTime(0.5, now + i * 0.05 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.45);
      o.connect(g).connect(master);
      o.start(now + i * 0.05);
      o.stop(now + i * 0.05 + 0.5);
    });
  } catch { /* silent */ }
}
