// Ghost Jam: audio sync. The browser says how late its speakers are, and
// the game already plays and judges against that. Some outputs report less
// than the truth (a digital piano used as a Bluetooth speaker), and a
// Bluetooth MIDI keyboard adds its own delay. A short tap test measures
// what is left: you tap on clicks you hear, and the median gap between
// your taps and the clicks is added to the latency.
//
// Pure functions, no audio: main.js plays the clicks and collects the taps.

export const SYNC = {
  clicks: 16,       // clicks in one test
  warmup: 4,        // first clicks, not measured (finding the pulse)
  interval: 0.6,    // seconds between clicks (100 bpm)
  early: 0.15,      // a tap counts for a click from this much before it...
  late: 0.45,       // ...to this much after
  minTaps: 6,       // fewer measured taps and the test fails
  maxSpread: 0.035, // median distance to the median, beyond it: too uneven
  match: 0.03,      // a saved offset applies when the reported latency is this close
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// taps and clicks: times in seconds on the same clock. A chord played as a
// tap counts once. Returns { offset, taps, spread } with offset in seconds
// (positive: you hear the band late), or { error: 'few' | 'uneven' }.
export function measureOffset(taps, clicks, opts = SYNC) {
  const firsts = [];
  for (const t of [...taps].sort((a, b) => a - b)) {
    if (!firsts.length || t - firsts[firsts.length - 1] > 0.1) firsts.push(t);
  }
  const used = new Set();
  const offs = [];
  for (const t of firsts) {
    const i = clicks.findIndex((c, k) => k >= opts.warmup && !used.has(k) && t - c >= -opts.early && t - c <= opts.late);
    if (i < 0) continue;
    used.add(i);
    offs.push(t - clicks[i]);
  }
  if (offs.length < opts.minTaps) return { error: 'few', taps: offs.length };
  const offset = median(offs);
  const spread = median(offs.map((o) => Math.abs(o - offset)));
  if (spread > opts.maxSpread) return { error: 'uneven', taps: offs.length, spread };
  return { offset, taps: offs.length, spread };
}

// Saved offsets, one per audio output. Browsers do not say which output is
// in use, but each one reports its own latency, so that is the key.
// saved: [{ reported, offset }] in seconds.
export function offsetFor(saved, reported, opts = SYNC) {
  let best = null;
  for (const s of saved) {
    const d = Math.abs(s.reported - reported);
    if (d <= opts.match && (!best || d < best.d)) best = { d, offset: s.offset };
  }
  return best ? best.offset : 0;
}

export function storeOffset(saved, reported, offset, opts = SYNC) {
  const rest = saved.filter((s) => Math.abs(s.reported - reported) > opts.match);
  return [...rest, { reported, offset }].slice(-8);
}

export function forgetOffset(saved, reported, opts = SYNC) {
  return saved.filter((s) => Math.abs(s.reported - reported) > opts.match);
}
