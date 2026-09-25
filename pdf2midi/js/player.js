// Tiny Web Audio preview of the recognised notes — enough to hear whether
// the conversion is right before downloading. A lookahead scheduler creates
// voices a moment before they sound, so long scores don't allocate thousands
// of nodes up front.

const LOOKAHEAD_S = 0.6;
const TICK_MS = 100;

const freq = pitch => 440 * Math.pow(2, (pitch - 69) / 12);

export function createPlayer() {
  let ctx = null;
  let master = null;
  let timer = null;
  let raf = null;
  let notes = [];
  let idx = 0;
  let t0 = 0;
  let secPerBeat = 0.5;
  let onFrame = null;
  let onEnd = null;
  let endBeat = 0;

  function voice(n) {
    const start = t0 + n.start * secPerBeat;
    const dur = Math.max(0.05, n.dur * secPerBeat);
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc2.type = 'sine';
    osc.frequency.value = freq(n.pitch);
    osc2.frequency.value = freq(n.pitch) * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    osc2.connect(g2).connect(g);
    osc.connect(g).connect(master);
    const peak = 0.16;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + 0.008);
    // Piano-like decay, then release at the note's end.
    g.gain.setTargetAtTime(peak * 0.35, start + 0.01, 0.35);
    g.gain.setTargetAtTime(0, start + dur, 0.06);
    osc.start(start); osc2.start(start);
    osc.stop(start + dur + 0.4); osc2.stop(start + dur + 0.4);
  }

  function schedule() {
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    while (idx < notes.length && t0 + notes[idx].start * secPerBeat < horizon) voice(notes[idx++]);
  }

  function frame() {
    const beat = (ctx.currentTime - t0) / secPerBeat;
    if (onFrame) onFrame(beat);
    if (beat > endBeat + 0.5) { stop(); if (onEnd) onEnd(); return; }
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    clearInterval(timer); timer = null;
    cancelAnimationFrame(raf); raf = null;
    if (master) {
      const m = master;
      m.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      setTimeout(() => m.disconnect(), 300);
      master = null;
    }
    if (onFrame) onFrame(-1);
  }

  return {
    get playing() { return timer !== null; },
    play(score, tempo, { frame: f, end } = {}) {
      stop();
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      notes = score.tracks.flatMap(t => t.notes).sort((a, b) => a.start - b.start);
      endBeat = notes.reduce((m, n) => Math.max(m, n.start + n.dur), 0);
      idx = 0;
      secPerBeat = 60 / tempo;
      t0 = ctx.currentTime + 0.1;
      onFrame = f; onEnd = end;
      schedule();
      timer = setInterval(schedule, TICK_MS);
      raf = requestAnimationFrame(frame);
    },
    stop
  };
}
