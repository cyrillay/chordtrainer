// Metronome clicks scheduled on the Web Audio clock, so they stay steady
// even when the main thread is busy. Times passed in are performance.now()
// milliseconds; they are converted to the audio clock once at start.

let ctx = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Call from a user gesture so browsers allow sound.
export function unlockAudio() { audio(); }

// Estimated delay between scheduling a sound and hearing it.
export function outputLatencyMs() {
  const c = audio();
  if (!c) return 0;
  return ((c.outputLatency || 0) + (c.baseLatency || 0)) * 1000;
}

function click(c, when, accent) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 1760 : 1175;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.13, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  osc.connect(gain).connect(c.destination);
  osc.start(when);
  osc.stop(when + 0.06);
}

// Schedules clicks at each of `timesMs` (performance.now() clock). `accents`
// flags the downbeats. Returns a stop() that silences what's left.
export function scheduleClicks(timesMs, accents) {
  const c = audio();
  if (!c) return () => {};
  const offset = c.currentTime - performance.now() / 1000;
  const handle = { stopped: false };
  // Schedule in small batches ahead of time instead of all at once, so
  // stop() takes effect quickly.
  let i = 0;
  const pump = () => {
    if (handle.stopped) return;
    const horizon = performance.now() + 400;
    while (i < timesMs.length && timesMs[i] <= horizon) {
      const when = timesMs[i] / 1000 + offset;
      if (when > c.currentTime) click(c, when, accents[i]);
      i++;
    }
    if (i < timesMs.length) handle.timer = setTimeout(pump, 100);
  };
  pump();
  return () => { handle.stopped = true; clearTimeout(handle.timer); };
}
