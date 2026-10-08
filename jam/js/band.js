// Ghost Jam: the ghost band. A Web Audio look-ahead scheduler plays one bar
// at a time from styles.js, with every instrument synthesized on the fly (no
// samples to download). Bars are scheduled ~150 ms ahead; the band's energy
// is read when a bar is scheduled, so it reacts from the next bar on.

import { STYLES, GUESTS, barEvents, countIn, bassRoot, keysVoicing } from './styles.js';

const LOOKAHEAD = 0.15;   // seconds scheduled ahead
const TICK_MS = 25;

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Wind guest voices. partials: [wave, frequency multiple, gain]. air: where
// the breath noise sits, as a multiple of the note. depth: vibrato width.
const REEDS = {
  sax:      { partials: [['sawtooth', 1, 1]], peak: 0.075, a: 0.03, r: 0.08, cut: 1800, q: 1.5, breath: 0.012, air: 3, vib: 5, depth: 0.006, scoop: 1 },
  melodica: { partials: [['square', 1, 1]], peak: 0.05, a: 0.02, r: 0.06, cut: 2400, q: 1, breath: 0.008, air: 3, vib: 3, depth: 0.004, scoop: 1 },
  // Warm low flute: mostly fundamental, a touch of octave and twelfth,
  // gentle air under it.
  flute:    { partials: [['sine', 1, 1], ['sine', 2, 0.22], ['sine', 3, 0.05], ['triangle', 1, 0.15]], peak: 0.07, a: 0.07, r: 0.18, cut: 3200, q: 0.5, breath: 0.006, air: 1.5, vib: 5, depth: 0.0035, scoop: 0.99 },
  // Harmon-muted trumpet, cool and nasal (Chet Baker on a bossa).
  trumpet:  { partials: [['sawtooth', 1, 1]], peak: 0.16, a: 0.025, r: 0.1, cut: 3400, q: 0.7, bp: 1500, bpQ: 2.5, breath: 0.004, air: 2, vib: 5, depth: 0.003, scoop: 0.98 },
  // Soft breathy tenor (Getz on a bossa).
  tenor:    { partials: [['sawtooth', 1, 1], ['sine', 1, 0.6]], peak: 0.06, a: 0.05, r: 0.15, cut: 1100, q: 0.7, breath: 0.014, air: 2.5, vib: 4.5, depth: 0.004, scoop: 0.98 },
};

export class Band {
  constructor() {
    this.ctx = null;
    this.timer = null;
    this.energy = 1;
    this.muted = new Set();
  }

  audio() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.noise = this.makeNoise();
      this.impulse = this.makeImpulse(2.2);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // Seconds between the audio clock and what reaches the speakers.
  get outputLatency() {
    const c = this.ctx;
    return c ? (c.outputLatency || c.baseLatency || 0) : 0;
  }

  // ---- Session ----
  // opts: { style, tempo, chords: [chord], barsPerChord, choruses (Infinity
  // allowed), onSlot(slot), onBeat(beat), onEnd() }
  start(opts) {
    this.stop();
    const ctx = this.audio();
    this.opts = opts;
    this.style = STYLES[opts.style];
    this.beat = 60 / opts.tempo;
    this.barDur = this.beat * 4;
    this.bar = 0;
    this.totalBars = Number.isFinite(opts.choruses)
      ? 1 + opts.chords.length * opts.barsPerChord * opts.choruses
      : Infinity;
    this.nextBarAt = ctx.currentTime + 0.12;
    this.startAt = this.nextBarAt;
    this.bus = this.makeBus(opts.style);
    this.ending = false;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.bus) {
      const { out, crackle } = this.bus;
      const t = this.ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.12);
      if (crackle) crackle.stop(t + 0.15);
      const old = out;
      setTimeout(() => old.disconnect(), 400);
      this.bus = null;
    }
  }

  get running() { return !!this.timer; }

  // Where we are: { bar, beat (0..3), fraction } from the audio clock.
  position(t = this.ctx?.currentTime ?? 0) {
    if (!this.running && !this.ending) return null;
    const rel = t - this.startAt;
    if (rel < 0) return { bar: -1, beat: 0, frac: 0 };
    const bar = Math.floor(rel / this.barDur);
    const inBar = rel - bar * this.barDur;
    return { bar, beat: Math.floor(inBar / this.beat), frac: (inBar % this.beat) / this.beat };
  }

  tick() {
    const ctx = this.ctx;
    while (this.timer && this.nextBarAt < ctx.currentTime + LOOKAHEAD) {
      if (this.bar >= this.totalBars) {
        this.finale(this.nextBarAt);
        return;
      }
      this.scheduleBar(this.bar, this.nextBarAt);
      this.bar++;
      this.nextBarAt += this.barDur;
    }
  }

  chordAt(bar) {
    const { chords, barsPerChord } = this.opts;
    const k = Math.floor((bar - 1) / barsPerChord);
    return { index: k % chords.length, chorus: Math.floor(k / chords.length), chord: chords[k % chords.length], first: (bar - 1) % barsPerChord === 0 };
  }

  scheduleBar(bar, t0) {
    const steps = this.style.steps;
    const stepDur = this.barDur / steps;
    const at = (s) => t0 + s * stepDur + (steps === 16 && s % 2 === 1 ? this.style.shuffle * stepDur : 0);

    for (let b = 0; b < 4; b++) this.opts.onBeat?.({ bar, beat: b, time: t0 + b * this.beat });

    if (bar === 0) {
      for (const d of countIn(this.opts.style)) this.drum('sticks', at(d.step), d.vel);
      return;
    }

    const cur = this.chordAt(bar);
    const nextBar = bar + 1 < this.totalBars ? this.chordAt(bar + 1) : cur;
    if (cur.first) {
      this.opts.onSlot?.({
        bar, index: cur.index, chorus: cur.chorus, chord: cur.chord,
        start: t0, end: t0 + this.barDur * this.opts.barsPerChord,
        beat: this.beat,
      });
    }

    const ev = barEvents(this.opts.style, { chord: cur.chord, next: nextBar.chord, energy: this.energy });
    if (!this.muted.has('drums')) for (const d of ev.drums) this.drum(d.voice, at(d.step), d.vel);
    if (!this.muted.has('bass')) for (const n of ev.bass) this.bassNote(n.midi, at(n.step), n.dur * stepDur);
    if (!this.muted.has('keys')) for (const k of ev.keys) this.keysChord(k.notes, at(k.step), k.dur * stepDur);
    for (const g of ev.guest) this.guest(g.notes, at(g.step), g.dur * stepDur);
    // Crash on the top of each chorus once the band is cooking.
    if (this.energy >= 2 && cur.first && cur.index === 0 && cur.chorus > 0) this.drum('crash', t0, 0.8);
  }

  // The band answers a chord you nailed, with the groove's own drums. On
  // the target when it is still ahead (you anticipated), otherwise on the
  // next eighth note, like a drummer catching your hit.
  accent(hitAt, target) {
    if (!this.bus || !this.ctx) return;
    const now = this.ctx.currentTime + 0.02;
    let t = target;
    if (t < now) {
      const eighth = this.beat / 2;
      t = target + Math.ceil((Math.max(now, hitAt) - target) / eighth) * eighth;
    }
    for (const v of this.style.accent) this.drum(v, t, 0.9);
    if (this.energy >= 3 && this.opts.style !== 'reggae') this.drum('crash', t, 0.7);
  }

  // Last chord rings out with a cymbal, then the set is over.
  finale(t) {
    clearInterval(this.timer);
    this.timer = null;
    this.ending = true;
    // Resolve on the top of the form, like the band landing the tune.
    const home = this.opts.chords[0];
    this.drum('kick', t, 1);
    this.drum('crash', t, 1);
    this.keysChord(keysVoicing(home), t, this.barDur);
    this.bassNote(bassRoot(home), t, this.barDur * 0.8);
    const wait = (t - this.ctx.currentTime + this.barDur) * 1000;
    setTimeout(() => { this.ending = false; this.opts.onEnd?.(); }, Math.max(0, wait));
  }

  // ---- Audio graph ----

  makeBus(styleId) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    // The glue compressor adds its own make-up gain, which pushed the mix
    // past full scale. A fast limiter after the master keeps it clean.
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -4;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.001;
    limit.release.value = 0.12;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = styleId === 'lofi' ? 3200 : 16000;
    const dry = ctx.createGain();
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse;
    const wet = ctx.createGain();
    wet.gain.value = styleId === 'ballad' ? 0.32 : styleId === 'lofi' ? 0.22 : 0.16;
    dry.connect(tone);
    dry.connect(verb).connect(wet).connect(tone);
    tone.connect(comp).connect(out).connect(limit).connect(ctx.destination);

    let crackle = null;
    if (STYLES[styleId].crackle) {
      crackle = ctx.createBufferSource();
      crackle.buffer = this.makeCrackle();
      crackle.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      crackle.connect(g).connect(out);
      crackle.start();
    }
    return { input: dry, out, crackle };
  }

  makeNoise() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeCrackle() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.04;
      if (Math.random() < 0.0004) d[i] = (Math.random() * 2 - 1) * 0.9;
    }
    return buf;
  }

  makeImpulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  env(t, { a = 0.005, peak = 1, d = 0.3, s = 0, hold = 0, r = 0.05 }) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    if (s > 0) {
      g.gain.exponentialRampToValueAtTime(Math.max(peak * s, 0.0002), t + a + d);
      g.gain.setValueAtTime(Math.max(peak * s, 0.0002), t + a + d + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + hold + r);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    return g;
  }

  osc(type, freq, t, end, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end + 0.05);
    return o;
  }

  noiseSrc(t, dur, dest) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.connect(dest);
    n.start(t, Math.random() * 0.5);
    n.stop(t + dur + 0.05);
    return n;
  }

  filter(type, freq, q = 0.8) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  // ---- Drums ----

  drum(voice, t, vel = 1) {
    const out = this.bus?.input;
    if (!out) return;
    switch (voice) {
      case 'kick': {
        const g = this.env(t, { peak: 0.9 * vel, d: 0.35 });
        g.connect(out);
        const o = this.osc('sine', 150, t, t + 0.4, g);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
        break;
      }
      case 'snare': {
        const g = this.env(t, { peak: 0.45 * vel, d: 0.18 });
        g.connect(out);
        this.noiseSrc(t, 0.2, this.filter('highpass', 1200)).connect(g);
        const body = this.env(t, { peak: 0.25 * vel, d: 0.08 });
        body.connect(out);
        this.osc('triangle', 190, t, t + 0.1, body);
        break;
      }
      case 'hat': {
        const g = this.env(t, { peak: 0.16 * vel, d: 0.045 });
        g.connect(out);
        this.noiseSrc(t, 0.06, this.filter('highpass', 7500)).connect(g);
        break;
      }
      case 'ride': {
        const g = this.env(t, { peak: 0.13 * vel, d: 0.42 });
        g.connect(out);
        const bp = this.filter('bandpass', 8200, 1.4);
        this.noiseSrc(t, 0.45, this.filter('highpass', 5000)).connect(bp);
        bp.connect(g);
        const ping = this.env(t, { peak: 0.03 * vel, d: 0.3 });
        ping.connect(out);
        this.osc('square', 3150, t, t + 0.3, ping);
        break;
      }
      case 'crash': {
        const g = this.env(t, { peak: 0.2 * vel, d: 1.6 });
        g.connect(out);
        this.noiseSrc(t, 1.7, this.filter('highpass', 4200)).connect(g);
        break;
      }
      case 'rim': {
        const g = this.env(t, { peak: 0.22 * vel, d: 0.035 });
        g.connect(out);
        this.osc('square', 1650, t, t + 0.05, this.filter('bandpass', 1650, 4)).connect(g);
        break;
      }
      case 'brush': {
        const g = this.env(t, { a: 0.04, peak: 0.09 * vel, d: 0.22 });
        g.connect(out);
        this.noiseSrc(t, 0.3, this.filter('bandpass', 3800, 0.6)).connect(g);
        break;
      }
      case 'sticks': {
        const g = this.env(t, { peak: 0.3 * vel, d: 0.04 });
        g.connect(out);
        this.osc('square', 2400, t, t + 0.06, this.filter('bandpass', 2600, 5)).connect(g);
        break;
      }
    }
  }

  // ---- Bass ----

  bassNote(midi, t, dur) {
    const out = this.bus?.input;
    if (!out) return;
    const f = hz(midi);
    const patch = this.style.sounds.bass;
    const len = Math.max(0.08, dur * 0.92);
    if (patch === 'slap') {
      const g = this.env(t, { peak: 0.42, d: 0.06, s: 0.55, hold: len * 0.5, r: 0.08 });
      const lp = this.filter('lowpass', 2600, 7);
      lp.frequency.setValueAtTime(2600, t);
      lp.frequency.exponentialRampToValueAtTime(380, t + 0.18);
      lp.connect(g).connect(out);
      this.osc('sawtooth', f, t, t + len + 0.1, lp);
      return;
    }
    const g = this.env(t, patch === 'upright'
      ? { peak: 0.5, d: 0.12, s: 0.55, hold: Math.max(0, len - 0.2), r: 0.06 }
      : { a: 0.012, peak: 0.5, d: 0.1, s: 0.8, hold: Math.max(0, len - 0.15), r: 0.08 });
    const lp = this.filter('lowpass', patch === 'upright' ? 750 : 520);
    lp.connect(g).connect(out);
    this.osc('sine', f, t, t + len + 0.1, lp);
    if (patch !== 'sub') this.osc('triangle', f, t, t + len + 0.1, lp, 4);
  }

  // ---- Keys ----

  keysChord(notes, t, dur) {
    if (!this.bus) return;
    for (const m of notes) this.keyNote(m, t, dur);
  }

  keyNote(midi, t, dur) {
    const out = this.bus.input;
    const f = hz(midi);
    const len = Math.max(0.08, dur * 0.95);
    switch (this.style.sounds.keys) {
      case 'epiano':
      case 'dusty': {
        const g = this.env(t, { peak: 0.1, d: Math.min(1.4, len + 0.3), r: 0.1 });
        const lp = this.filter('lowpass', this.style.sounds.keys === 'dusty' ? 1600 : 4200);
        g.connect(lp).connect(out);
        const car = this.osc('sine', f, t, t + len + 0.4, g, this.style.sounds.keys === 'dusty' ? (Math.random() * 16 - 8) : 0);
        const modGain = this.ctx.createGain();
        modGain.gain.setValueAtTime(f * 1.6, t);
        modGain.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.4);
        modGain.connect(car.frequency);
        this.osc('sine', f, t, t + len + 0.4, modGain);
        break;
      }
      case 'nylon': {
        const g = this.env(t, { peak: 0.12, d: Math.min(0.9, len + 0.2) });
        const lp = this.filter('lowpass', 2800);
        lp.frequency.setValueAtTime(2800, t);
        lp.frequency.exponentialRampToValueAtTime(700, t + 0.3);
        lp.connect(g).connect(out);
        this.osc('triangle', f, t, t + len + 0.3, lp);
        this.osc('sine', f * 2, t, t + len + 0.3, lp);
        break;
      }
      case 'pad': {
        const g = this.env(t, { a: 0.35, peak: 0.07, d: 0.3, s: 0.8, hold: Math.max(0, len - 0.6), r: 0.8 });
        const lp = this.filter('lowpass', 1100);
        lp.connect(g).connect(out);
        this.osc('sawtooth', f, t, t + len + 1, lp, -7);
        this.osc('sawtooth', f, t, t + len + 1, lp, 7);
        break;
      }
      case 'clav': {
        const g = this.env(t, { peak: 0.11, d: 0.16 });
        const bp = this.filter('bandpass', 1400, 2.5);
        bp.connect(g).connect(out);
        this.osc('square', f, t, t + 0.2, bp);
        break;
      }
      case 'organ': {
        const g = this.env(t, { peak: 0.08, d: 0.05, s: 0.7, hold: 0.06, r: 0.04 });
        g.connect(out);
        this.osc('sine', f, t, t + 0.2, g);
        this.osc('sine', f * 2, t, t + 0.2, g);
        this.osc('sine', f * 3, t, t + 0.2, g);
        break;
      }
    }
  }

  // ---- The guest ----

  guest(notes, t, dur) {
    const patch = GUESTS[this.opts.style].patch;
    if (patch === 'horns') return this.hornStab(notes, t, dur);
    if (patch === 'strings') return this.strings(notes, t, dur);
    if (patch === 'vibes') return notes.forEach((m) => this.bell(m, t, dur, 0.09));
    for (const m of notes) this.reed(patch, m, t, dur);
  }

  // Wind guests: one held note with breath, a soft scoop into the pitch
  // and a late vibrato. Every partial shares the same vibrato, so the
  // note bends as one instead of beating against itself.
  reed(patch, midi, t, dur) {
    const out = this.bus?.input;
    if (!out) return;
    const f = hz(midi);
    const len = Math.max(0.1, dur * 0.92);
    const shape = REEDS[patch];
    const g = this.env(t, { a: shape.a, peak: shape.peak, d: 0.12, s: 0.82, hold: Math.max(0, len - 0.18), r: shape.r });
    let dest = this.filter('lowpass', shape.cut, shape.q);
    dest.connect(g).connect(out);
    if (shape.bp) {
      const bp = this.filter('bandpass', shape.bp, shape.bpQ);
      bp.connect(dest);
      dest = bp;
    }
    const end = t + len + shape.r + 0.05;
    const oscs = shape.partials.map(([wave, mult, gain]) => {
      const o = this.ctx.createOscillator();
      o.type = wave;
      // Start a little flat and lean up into the note.
      o.frequency.setValueAtTime(f * mult * shape.scoop, t);
      o.frequency.exponentialRampToValueAtTime(f * mult, t + 0.06);
      o.connect(this.envGain(gain, dest));
      o.start(t);
      o.stop(end);
      return [o, mult];
    });
    if (len > 0.3) {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = shape.vib;
      lfo.start(t);
      lfo.stop(end);
      for (const [o, mult] of oscs) {
        const depth = this.ctx.createGain();
        depth.gain.setValueAtTime(0, t);
        depth.gain.setValueAtTime(0, t + Math.min(0.25, len * 0.4));
        depth.gain.linearRampToValueAtTime(f * mult * shape.depth, t + Math.min(0.6, len));
        lfo.connect(depth).connect(o.frequency);
      }
    }
    // Breath: a short chiff on the attack, then a thin bed of air.
    const chiff = this.env(t, { a: 0.005, peak: shape.breath * 2.5, d: 0.06 });
    chiff.connect(out);
    this.noiseSrc(t, 0.08, this.filter('bandpass', Math.min(8000, f * shape.air), 1.2)).connect(chiff);
    const bg = this.env(t, { a: 0.04, peak: shape.breath, d: 0.1, s: 0.6, hold: Math.max(0, len - 0.2), r: shape.r });
    bg.connect(out);
    this.noiseSrc(t, len + shape.r, this.filter('bandpass', Math.min(8000, f * shape.air), 2)).connect(bg);
  }

  envGain(v, dest) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }

  // ---- Horns and strings ----

  hornStab(notes, t, dur) {
    const out = this.bus?.input;
    if (!out) return;
    const len = Math.max(0.1, dur * 0.85);
    for (const m of notes) {
      const f = hz(m);
      const g = this.env(t, { a: 0.03, peak: 0.055, d: 0.08, s: 0.75, hold: Math.max(0, len - 0.12), r: 0.09 });
      const lp = this.filter('lowpass', 900, 2);
      lp.frequency.setValueAtTime(700, t);
      lp.frequency.exponentialRampToValueAtTime(2600, t + 0.05);
      lp.frequency.exponentialRampToValueAtTime(1300, t + 0.25);
      lp.connect(g).connect(out);
      this.osc('sawtooth', f, t, t + len + 0.1, lp, -6);
      this.osc('sawtooth', f, t, t + len + 0.1, lp, 6);
    }
  }

  strings(notes, t, dur) {
    const out = this.bus?.input;
    if (!out) return;
    for (const m of notes) {
      const f = hz(m);
      const g = this.env(t, { a: 0.4, peak: 0.035, d: 0.2, s: 0.85, hold: Math.max(0, dur - 0.7), r: 0.5 });
      const lp = this.filter('lowpass', 2000);
      lp.connect(g).connect(out);
      for (const det of [-9, 0, 9]) this.osc('sawtooth', f, t, t + dur + 0.6, lp, det);
    }
  }

  bell(midi, t, dur, peak = 0.05) {
    const out = this.bus?.input;
    if (!out) return;
    const f = hz(midi);
    const g = this.env(t, { peak, d: Math.min(1.2, dur + 0.6) });
    g.connect(out);
    const car = this.osc('sine', f, t, t + dur + 0.8, g);
    const mg = this.ctx.createGain();
    mg.gain.setValueAtTime(f * 2, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.1, t + 0.6);
    mg.connect(car.frequency);
    this.osc('sine', f * 3.5, t, t + dur + 0.8, mg);
  }
}
