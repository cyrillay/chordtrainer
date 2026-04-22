// Success feedback: a brief visual pulse on the chord display + a soft chime.
// Uses an independent AudioContext so it works even when the mic is off and
// doesn't fight the FFT analyser.

// Observer pattern: other modules (e.g. rewards) can react to events.
const successObservers = [];
export function onSuccess(fn) { successObservers.push(fn); }

const chordChangeObservers = [];
export function onChordChange(fn) { chordChangeObservers.push(fn); }
export function notifyChordChange() { chordChangeObservers.forEach(fn => fn()); }

let chimeCtx = null;

function getCtx() {
  if (!chimeCtx) {
    chimeCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return chimeCtx;
}

// A short three-note arpeggio in the major-third stack — gentle and resolved.
export function playSuccessChime() {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.gain.linearRampToValueAtTime(0.18, now + 0.01);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    master.connect(ctx.destination);

    // E5, G#5, B5 — bright open major triad.
    const freqs = [659.25, 830.61, 987.77];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, now + i * 0.05);
      g.gain.linearRampToValueAtTime(0.5, now + i * 0.05 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.45);
      o.connect(g).connect(master);
      o.start(now + i * 0.05);
      o.stop(now + i * 0.05 + 0.5);
    });
  } catch (e) { /* silent */ }
}

function retrigger(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // force reflow so the animation replays
  el.classList.add(cls);
}

export function flashSuccess() {
  retrigger(document.getElementById('chordDisplay'), 'flash-success');
  retrigger(document.querySelector('.stage'), 'flash-success');
  retrigger(document.getElementById('successBurst'), 'burst');
}

export function triggerSuccess() {
  flashSuccess();
  playSuccessChime();
  successObservers.forEach(fn => fn());
}
