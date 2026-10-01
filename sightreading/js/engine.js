// Turns an exercise into a timeline of onsets and scores a performance
// against it. Pure — the UI feeds note-ons and clock ticks in, and gets
// back what to colour. Two modes:
//
//   WaitRun   the cursor waits on each onset until every note of it has been
//             struck; any other key is a wrong note.
//   TempoRun  the cursor moves with the metronome; each written note must be
//             struck within a timing window around its beat.

import { keyToMidi, timeSignature, measureLength } from './notation.js';

const EPS = 1 / 192;
const roundBeat = (b) => Math.round(b * 192) / 192;

// timeline = {
//   measureStarts, measureBeats, pickupBeats, totalBeats, beatUnit,
//   groups: [{ onset, measure, notes: [ref], required: [midi] }],
//   anchors: [{ beat, measure, ref | null }]   (all onsets incl. rests)
// }
// ref = { staff, voice, measure, index, keyIndex, midi, required }
export function buildTimeline(ex) {
  const { measureBeats, beatUnit } = timeSignature(ex.time);
  const measureStarts = [];
  let t = 0;
  ex.measures.forEach((m, i) => {
    measureStarts.push(t);
    t += i === 0 ? measureLength(m) : measureBeats;
  });
  const totalBeats = t;
  const pickupBeats = ex.measures.length && measureLength(ex.measures[0]) < measureBeats - EPS
    ? measureLength(ex.measures[0]) : 0;

  const byOnset = new Map();
  const slot = (onset, measure) => {
    const k = roundBeat(onset);
    if (!byOnset.has(k)) byOnset.set(k, { onset: k, measure, notes: [], events: [] });
    return byOnset.get(k);
  };

  for (const staff of ex.staves) {
    const voiceCount = Math.max(...ex.measures.map((m) => (m[staff] || []).length));
    for (let v = 0; v < voiceCount; v++) {
      let prev = null;
      ex.measures.forEach((m, mi) => {
        let at = measureStarts[mi];
        (m[staff]?.[v] || []).forEach((ev, ei) => {
          const g = slot(at, mi);
          g.events.push({ staff, voice: v, measure: mi, index: ei });
          ev.keys.forEach((key, ki) => {
            const midi = keyToMidi(key);
            const tiedIn = !!(prev && prev.tie && prev.keys.some((k) => keyToMidi(k) === midi));
            g.notes.push({ staff, voice: v, measure: mi, index: ei, keyIndex: ki, midi, required: !tiedIn });
          });
          prev = ev.rest ? null : ev;
          at += ev.beats;
        });
      });
    }
  }

  const all = [...byOnset.values()].sort((a, b) => a.onset - b.onset);
  const groups = [];
  for (const g of all) {
    const required = [...new Set(g.notes.filter((n) => n.required).map((n) => n.midi))].sort((a, b) => a - b);
    if (required.length) groups.push({ onset: g.onset, measure: g.measure, notes: g.notes, required });
  }
  const anchors = all.map((g) => ({ beat: g.onset, measure: g.measure, events: g.events }));
  return { measureStarts, measureBeats, pickupBeats, totalBeats, beatUnit, groups, anchors };
}

export function totalRequired(timeline) {
  return timeline.groups.reduce((s, g) => s + g.required.length, 0);
}

// ---- Wait mode --------------------------------------------------------------

export class WaitRun {
  constructor(timeline) {
    this.tl = timeline;
    this.index = 0;
    this.struck = new Set();
    this.wrong = 0;
    this.correct = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.errorsByMidi = {};   // expected midi → misses attributed to it
    this.seen = {};           // expected midi → times read
    this.startedAt = null;
    this.finishedAt = null;
    this.groupTimes = [];
  }

  get done() { return this.index >= this.tl.groups.length; }
  get current() { return this.tl.groups[this.index] || null; }

  // Returns { kind: 'hit' | 'wrong' | 'ignored', midi, advanced, done }
  noteOn(midi, now = 0) {
    if (this.done) return { kind: 'ignored', midi };
    if (this.startedAt === null) { this.startedAt = now; this.groupStart = now; }
    const g = this.current;
    if (!g.required.includes(midi)) {
      this.wrong++;
      this.streak = 0;
      for (const m of g.required) {
        if (!this.struck.has(m)) this.errorsByMidi[m] = (this.errorsByMidi[m] || 0) + 1;
      }
      return { kind: 'wrong', midi, group: this.index };
    }
    if (this.struck.has(midi)) return { kind: 'ignored', midi };
    this.struck.add(midi);
    if (this.struck.size < g.required.length) return { kind: 'hit', midi, group: this.index, advanced: false };

    // Whole onset played.
    for (const m of g.required) this.seen[m] = (this.seen[m] || 0) + 1;
    this.correct += g.required.length;
    this.streak += g.required.length;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.groupTimes.push(now - this.groupStart);
    this.groupStart = now;
    const group = this.index;
    this.index++;
    this.struck = new Set();
    if (this.done) this.finishedAt = now;
    return { kind: 'hit', midi, group, advanced: true, done: this.done };
  }

  result() {
    const total = totalRequired(this.tl);
    const accuracy = total ? total / (total + this.wrong) : 1;
    return {
      mode: 'wait',
      total,
      correct: this.correct,
      wrong: this.wrong,
      accuracy,
      bestStreak: this.bestStreak,
      durationMs: (this.finishedAt ?? 0) - (this.startedAt ?? 0),
      errorsByMidi: this.errorsByMidi,
      seen: this.seen,
      stars: waitStars(accuracy),
    };
  }
}

// Wait mode tops out at two stars — the third needs tempo.
export function waitStars(accuracy) {
  if (accuracy >= 0.95) return 2;
  if (accuracy >= 0.8) return 1;
  return 0;
}

// ---- Tempo mode -------------------------------------------------------------

export function tempoWindows(bpm, beatUnit = 1) {
  const quarterMs = 60000 / bpm / beatUnit;
  const hit = Math.min(260, Math.max(120, quarterMs * 0.35));
  return { hit, perfect: Math.max(50, hit * 0.4) };
}

export class TempoRun {
  // bpm counts beat units (quarters, dotted quarters in 6/8, eighths in 3/8).
  // `leadInBeats` = quarter-note beats of count-in before onset 0.
  constructor(timeline, { bpm, leadInBeats = 0 }) {
    this.tl = timeline;
    this.bpm = bpm;
    this.msPerBeat = 60000 / bpm / timeline.beatUnit;
    this.leadInBeats = leadInBeats;
    this.win = tempoWindows(bpm, timeline.beatUnit);
    this.startMs = null;
    this.expected = [];
    timeline.groups.forEach((g, gi) => {
      for (const midi of g.required) {
        this.expected.push({ group: gi, midi, beat: g.onset, status: 'pending', offset: null });
      }
    });
    this.extras = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.perfectStreak = 0;
    this.bestPerfectStreak = 0;
  }

  start(nowMs) { this.startMs = nowMs; }

  timeOf(beat) { return this.startMs + (this.leadInBeats + beat) * this.msPerBeat; }

  // Current position in beats (negative during the count-in).
  beatAt(nowMs) { return (nowMs - this.startMs) / this.msPerBeat - this.leadInBeats; }

  // Returns { kind: 'hit' | 'extra', expected?, offset?, grade? }
  noteOn(midi, nowMs) {
    let best = null;
    for (const e of this.expected) {
      if (e.status !== 'pending' || e.midi !== midi) continue;
      const off = nowMs - this.timeOf(e.beat);
      if (Math.abs(off) > this.win.hit) continue;
      if (!best || Math.abs(off) < Math.abs(best.off)) best = { e, off };
    }
    if (!best) {
      this.extras++;
      this.streak = 0;
      this.perfectStreak = 0;
      return { kind: 'extra', midi };
    }
    const grade = Math.abs(best.off) <= this.win.perfect ? 'perfect' : 'good';
    best.e.status = grade;
    best.e.offset = best.off;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.perfectStreak = grade === 'perfect' ? this.perfectStreak + 1 : 0;
    this.bestPerfectStreak = Math.max(this.bestPerfectStreak, this.perfectStreak);
    return { kind: 'hit', midi, expected: best.e, offset: best.off, grade };
  }

  // Marks notes whose window has passed. Returns the newly missed ones.
  tick(nowMs) {
    const missed = [];
    for (const e of this.expected) {
      if (e.status === 'pending' && nowMs - this.timeOf(e.beat) > this.win.hit) {
        e.status = 'missed';
        missed.push(e);
        this.streak = 0;
        this.perfectStreak = 0;
      }
    }
    return missed;
  }

  get endMs() { return this.timeOf(this.tl.totalBeats); }

  isFinished(nowMs) {
    const lastOnset = this.tl.groups.length ? this.tl.groups[this.tl.groups.length - 1].onset : 0;
    return nowMs > Math.max(this.timeOf(lastOnset) + this.win.hit, this.endMs);
  }

  result() {
    const total = this.expected.length;
    const count = (s) => this.expected.filter((e) => e.status === s).length;
    const perfect = count('perfect'), good = count('good'), missed = count('missed') + count('pending');
    const hits = this.expected.filter((e) => e.offset !== null);
    const meanOffset = hits.length ? hits.reduce((s, e) => s + e.offset, 0) / hits.length : 0;
    const noteScore = total ? (perfect + 0.75 * good) / total : 1;
    const accuracy = total ? noteScore * total / (total + 0.5 * this.extras) : 1;
    const errorsByMidi = {}, seen = {};
    for (const e of this.expected) {
      seen[e.midi] = (seen[e.midi] || 0) + 1;
      if (e.status === 'missed' || e.status === 'pending') errorsByMidi[e.midi] = (errorsByMidi[e.midi] || 0) + 1;
    }
    return {
      mode: 'tempo',
      bpm: this.bpm,
      total, perfect, good, missed,
      correct: perfect + good,
      wrong: this.extras,
      accuracy,
      meanOffset,
      bestStreak: this.bestStreak,
      bestPerfectStreak: this.bestPerfectStreak,
      errorsByMidi, seen,
    };
  }
}

// Three stars need the level's target tempo.
export function tempoStars(accuracy, bpm, targetBpm) {
  let s = 0;
  if (accuracy >= 0.7) s = 1;
  if (accuracy >= 0.85) s = 2;
  if (accuracy >= 0.95 && bpm >= targetBpm) s = 3;
  return s;
}
