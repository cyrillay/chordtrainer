import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVoice, exerciseFromText, keyToMidi, keyInfo, degreeToKey, timeSignature,
  voiceBeats, durationBeats,
} from '../sightreading/js/notation.js';
import { EXCERPTS } from '../sightreading/js/excerpts.js';
import { LEVELS } from '../sightreading/js/levels.js';
import { generateExercise, mulberry32 } from '../sightreading/js/generator.js';
import {
  buildTimeline, totalRequired, WaitRun, TempoRun, waitStars, tempoStars,
} from '../sightreading/js/engine.js';

const near = (a, b) => Math.abs(a - b) < 1e-6;

// Every voice of every bar fills the time signature; only a first bar may be
// shorter (a pickup), and then all its voices agree.
function assertBarsComplete(ex, label) {
  const { measureBeats } = timeSignature(ex.time);
  ex.measures.forEach((m, i) => {
    const lengths = ex.staves.flatMap((s) => m[s].map(voiceBeats));
    for (const len of lengths) {
      if (i === 0 && len < measureBeats) {
        assert.ok(lengths.every((l) => near(l, lengths[0])), `${label} bar 1: pickup voices disagree (${lengths})`);
      } else {
        assert.ok(near(len, measureBeats), `${label} bar ${i + 1}: ${len} beats, expected ${measureBeats}`);
      }
    }
  });
}

test('durations, pitches and ties parse', () => {
  assert.equal(durationBeats('q', 1), 1.5);
  assert.equal(durationBeats('8', 2), 0.875);
  const [bar] = parseVoice('c#4:8. d4:16 (c4 e4 g4):h r:q~');
  assert.deepEqual(bar.map((e) => e.beats), [0.75, 0.25, 2, 1]);
  assert.deepEqual(bar[2].keys, ['c/4', 'e/4', 'g/4']);
  assert.equal(bar[3].rest, true);
  assert.equal(bar[3].tie, true);
  assert.equal(keyToMidi('c#/4'), 61);
  assert.equal(keyToMidi('bb/3'), 58);
  assert.equal(keyToMidi('b/3'), 59);
  assert.equal(keyToMidi('cb/5'), 71);
});

test('durations are sticky across measures', () => {
  const bars = parseVoice('c4:h d4 | e4 f4');
  assert.deepEqual(bars.map((b) => b.map((e) => e.beats)), [[2, 2], [2, 2]]);
});

test('degrees are spelled from the key signature', () => {
  const spell = (key, ds, alter = 0) => ds.map((d) => degreeToKey(keyInfo(key), d, alter));
  assert.deepEqual(spell('C', [0, 1, 2, 3, 4, 5, 6, 7]), ['c/4', 'd/4', 'e/4', 'f/4', 'g/4', 'a/4', 'b/4', 'c/5']);
  assert.deepEqual(spell('Bb', [0, 3, -1]), ['bb/4', 'eb/5', 'a/4']);
  assert.deepEqual(spell('Am', [0, 2, -1]), ['a/4', 'c/5', 'g/4']);
  assert.equal(degreeToKey(keyInfo('Am'), -1, 1), 'g#/4');
  assert.deepEqual(spell('E', [0, 6]), ['e/4', 'd#/5']);
  assert.equal(degreeToKey(keyInfo('G'), -7), 'g/3');
});

test('every excerpt has complete bars', () => {
  for (const def of EXCERPTS) {
    const ex = exerciseFromText(def);
    assertBarsComplete(ex, def.id);
    const counts = ex.staves.map((s) => ex.measures.filter((m) => m[s]).length);
    assert.ok(counts.every((c) => c === ex.measures.length), `${def.id}: staves have different bar counts`);
  }
});

test('every repertoire level has excerpts', () => {
  for (const level of LEVELS.filter((l) => l.repertoire)) {
    assert.ok(EXCERPTS.filter((e) => e.level === level.id).length >= 3, level.id);
  }
});

test('Für Elise starts with a pickup and ties are not re-struck', () => {
  const elise = buildTimeline(exerciseFromText(EXCERPTS.find((e) => e.id === 'fur-elise')));
  assert.equal(elise.pickupBeats, 0.5);
  assert.deepEqual(elise.groups[0].required, [76]);
  assert.equal(elise.groups[0].onset, 0);

  const prelude = buildTimeline(exerciseFromText(EXCERPTS.find((e) => e.id === 'bach-prelude-c')));
  // Per half bar: C4, E4, then six right-hand notes — the tied E4 is held.
  assert.equal(totalRequired(prelude), 4 * 2 * 8);
  assert.deepEqual(prelude.groups.slice(0, 3).map((g) => g.required), [[60], [64], [67]]);
});

const GENERATED = LEVELS.filter((l) => !l.repertoire);

test('generated exercises are well formed for every level', () => {
  for (const level of GENERATED) {
    for (let seed = 1; seed <= 60; seed++) {
      const ex = generateExercise(level, { rng: mulberry32(seed * 7919 + level.id.length) });
      const label = `${level.id} seed ${seed}`;
      assert.equal(ex.measures.length, level.bars, label);
      assert.deepEqual(ex.staves, level.staves, label);
      assertBarsComplete(ex, label);
      for (const m of ex.measures) {
        for (const staff of ex.staves) {
          const spec = level.hands === 'both' && staff === 'bass' ? null
            : staff === 'treble' ? level.rh : level.lh;
          for (const ev of m[staff][0]) {
            for (const key of ev.keys) {
              const midi = keyToMidi(key);
              assert.ok(/^[a-g](#|##|b|bb)?\/\d$/.test(key), `${label}: bad key ${key}`);
              if (spec) {
                // Chromatic notes and harmonic-minor raises may sit a step outside.
                assert.ok(midi >= spec.range[0] - 2 && midi <= spec.range[1] + 2,
                  `${label}: ${key} outside ${spec.range}`);
              } else {
                assert.ok(midi >= level.lh.range[0] - 2 && midi <= level.lh.range[1] + 12,
                  `${label}: bass ${key} out of range`);
              }
            }
          }
        }
      }
    }
  }
});

test('generated melodies end on the tonic', () => {
  for (const level of GENERATED) {
    for (let seed = 1; seed <= 20; seed++) {
      const ex = generateExercise(level, { rng: mulberry32(seed) });
      const tonicPc = keyInfo(ex.key).tonicPc;
      const last = ex.measures[ex.measures.length - 1];
      const melodyStaff = ex.staves.find((s) => last[s][0].some((e) => !e.rest));
      const notes = last[melodyStaff][0].filter((e) => !e.rest);
      const final = notes[notes.length - 1];
      assert.ok(final.keys.some((k) => ((keyToMidi(k) % 12) + 12) % 12 === tonicPc),
        `${level.id} seed ${seed}: ends on ${final.keys}`);
    }
  }
});

test('generator is deterministic for a seed', () => {
  const a = generateExercise(LEVELS[3], { rng: mulberry32(42) });
  const b = generateExercise(LEVELS[3], { rng: mulberry32(42) });
  assert.deepEqual(a, b);
});

function simpleExercise() {
  return exerciseFromText({
    id: 't', title: 't', key: 'C', time: '4/4',
    rh: 'c4:q d4 e4 f4 | g4:w',
    lh: 'c3:w | (c3 g3):w',
  });
}

test('wait mode advances only when every note of an onset is struck', () => {
  const tl = buildTimeline(simpleExercise());
  assert.deepEqual(tl.groups.map((g) => g.required), [[48, 60], [62], [64], [65], [48, 55, 67]]);
  const run = new WaitRun(tl);
  assert.equal(run.noteOn(60, 0).advanced, false);
  assert.equal(run.noteOn(61, 10).kind, 'wrong');
  assert.equal(run.noteOn(48, 20).advanced, true);
  for (const m of [62, 64, 65, 48, 55]) run.noteOn(m, 30);
  const last = run.noteOn(67, 40);
  assert.equal(last.done, true);
  const r = run.result();
  assert.equal(r.total, 8);
  assert.equal(r.wrong, 1);
  assert.equal(r.accuracy, 8 / 9);
  assert.equal(r.stars, 1);
  assert.equal(r.errorsByMidi[48], 1);
});

test('tempo mode grades timing, misses and extra notes', () => {
  const tl = buildTimeline(simpleExercise());
  const run = new TempoRun(tl, { bpm: 60, leadInBeats: 4 });
  run.start(0);
  // Beat 0 lands at 4000 ms.
  assert.equal(run.noteOn(60, 4010).grade, 'perfect');
  assert.equal(run.noteOn(48, 4200).grade, 'good');
  assert.equal(run.noteOn(62, 4600).kind, 'extra');   // too early for beat 1
  assert.equal(run.noteOn(62, 5000).grade, 'perfect');
  assert.equal(run.tick(6500).length, 1);              // E4 at 6000 missed
  for (const m of [65]) run.noteOn(m, 7000);
  for (const m of [48, 55, 67]) run.noteOn(m, 8000);
  assert.ok(run.isFinished(12500));
  const r = run.result();
  assert.equal(r.total, 8);
  assert.equal(r.perfect, 6);
  assert.equal(r.good, 1);
  assert.equal(r.missed, 1);
  assert.equal(r.wrong, 1);
  assert.ok(near(r.accuracy, 6.75 / 8.5));
});

test('stars', () => {
  assert.equal(waitStars(1), 2);
  assert.equal(waitStars(0.85), 1);
  assert.equal(waitStars(0.5), 0);
  assert.equal(tempoStars(0.99, 80, 80), 3);
  assert.equal(tempoStars(0.99, 60, 80), 2);
  assert.equal(tempoStars(0.75, 80, 80), 1);
});
