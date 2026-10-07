import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChord } from '../js/core/theory.js';
import { PROGRESSIONS, romanToChord, progressionMode } from '../js/training/progressions.js';
import { chordTargets, toneRole, SlotJudge, Scorer, multiplier, nextEnergy, timingZone } from '../jam/js/judge.js';
import { STYLES, STYLE_ORDER, TIERS, MAX_ENERGY, partsAt, barEvents, bassRoot, keysVoicing, countIn } from '../jam/js/styles.js';

const pcs = (set) => [...set].sort((a, b) => a - b);

test('targets: triads need 3rd and 5th, sevenths need 3rd and 7th', () => {
  assert.deepEqual(pcs(chordTargets(buildChord('C', 'maj')).required), [4, 7]);
  assert.deepEqual(pcs(chordTargets(buildChord('D', 'min7')).required), [0, 5]);     // F, C
  assert.deepEqual(pcs(chordTargets(buildChord('G', 'dom7')).required), [5, 11]);    // B, F
  // Half-diminished keeps its b5: it is what makes the chord.
  assert.deepEqual(pcs(chordTargets(buildChord('B', 'm7b5')).required), [2, 5, 9]);  // D, F, A
});

test('colour tones are never wrong', () => {
  const g7 = chordTargets(buildChord('G', 'dom7'));
  assert.equal(toneRole(g7, 9), 'colour');   // A = 9th
  assert.equal(toneRole(g7, 8), 'colour');   // Ab = b9
  assert.equal(toneRole(g7, 7), 'tone');     // G
  assert.equal(toneRole(g7, 0), 'wrong');    // C = sus4 against B
});

function play(judge, notes, t) {
  const held = new Set();
  for (const pc of notes) { held.add(pc); judge.noteOn(pc, t, held); }
}

test('grading: on the beat is perfect, within a beat good, later late, nothing a miss', () => {
  const chord = buildChord('C', 'maj');
  const mk = () => new SlotJudge({ chord, start: 1000, end: 3000, beatMs: 500 });
  let j = mk(); play(j, [0, 4, 7], 1050); assert.equal(j.result().grade, 'perfect');
  j = mk(); play(j, [4, 7], 900); assert.equal(j.result().grade, 'perfect');   // anticipated a little
  j = mk(); play(j, [4, 7], 780); assert.equal(j.result().grade, 'good');      // anticipated a lot
  j = mk(); play(j, [4, 7], 1400); assert.equal(j.result().grade, 'good');
  j = mk(); play(j, [4, 7], 2200); assert.equal(j.result().grade, 'late');
  j = mk(); play(j, [4], 1000); assert.equal(j.result().grade, 'miss');
  j = mk(); assert.equal(j.result().grade, 'miss');
});

test('wrong notes cost the grade, colours earn a bonus', () => {
  const chord = buildChord('D', 'min7');
  let j = new SlotJudge({ chord, start: 0, end: 2000, beatMs: 500 });
  play(j, [1, 5, 0], 0);                         // C# is wrong
  assert.equal(j.result().grade, 'good');
  j = new SlotJudge({ chord, start: 0, end: 2000, beatMs: 500 });
  play(j, [5, 0, 4], 0);                         // E = 9th
  const r = j.result();
  assert.equal(r.grade, 'perfect');
  assert.equal(r.colours, 1);
  assert.ok(r.bonus > 0);
});

test('slot windows let you anticipate by half a beat', () => {
  const j = new SlotJudge({ chord: buildChord('C', 'maj'), start: 1000, end: 3000, beatMs: 500 });
  assert.ok(j.owns(760));
  assert.ok(!j.owns(740));
  assert.ok(!j.owns(2760));
});

test('scorer: combo, multiplier and band energy', () => {
  const s = new Scorer();
  const perfect = { grade: 'perfect', base: 300, bonus: 0 };
  for (let i = 0; i < 4; i++) s.add(perfect);
  assert.equal(s.combo, 4);
  assert.equal(multiplier(4), 2);
  assert.equal(s.energy, 2);
  s.add({ grade: 'miss', base: 0, bonus: 0 });
  assert.equal(s.combo, 0);
  assert.equal(s.energy, 1);
  assert.equal(nextEnergy(3, 'perfect', 12), 4);
  assert.equal(nextEnergy(4, 'perfect', 40), MAX_ENERGY);
  assert.equal(nextEnergy(4, 'good', 2), 4);      // a short streak keeps who is there
  assert.equal(nextEnergy(0, 'miss', 0), 0);
  assert.ok(['S', 'A', 'B', 'C', 'D'].includes(s.rank));
});

test('every groove plays every progression chord in range', () => {
  for (const id of STYLE_ORDER) {
    const style = STYLES[id];
    assert.equal(countIn(id).length, 4);
    for (const prog of PROGRESSIONS.slice(0, 40)) {
      const chords = prog.tokens.map((t) => romanToChord(t, 'F#', progressionMode(prog)));
      chords.forEach((chord, i) => {
        for (let energy = 0; energy <= MAX_ENERGY; energy++) {
          const ev = barEvents(id, { chord, next: chords[(i + 1) % chords.length], energy, rng: () => 0.3 });
          for (const d of ev.drums) assert.ok(d.step >= 0 && d.step < style.steps, `${id} drum step`);
          for (const n of ev.bass) {
            assert.ok(n.step >= 0 && n.step < style.steps, `${id} bass step`);
            assert.ok(n.midi >= 26 && n.midi <= 56, `${id} bass ${n.midi} on ${chord.symbol}`);
          }
          for (const k of ev.keys) assert.ok(k.step + k.dur <= style.steps, `${id} keys overflow`);
          for (const h of [...ev.horns, ...ev.strings]) assert.ok(h.step + h.dur <= style.steps, `${id} horns/strings overflow`);
          if (energy === 0) assert.equal(ev.keys.length, 0);
          assert.equal(ev.horns.length > 0, energy >= 3, `${id} horns at ${energy}`);
          assert.equal(ev.strings.length > 0, energy >= 4, `${id} strings at ${energy}`);
        }
      });
    }
  }
});

test('drum patterns match their grid', () => {
  for (const id of STYLE_ORDER) {
    const style = STYLES[id];
    for (const levels of Object.values(style.drums)) {
      assert.equal(levels.length, 4);
      for (const p of levels) assert.equal(p.length, style.steps, `${id}: ${p}`);
    }
    assert.ok(style.tempo.min <= style.tempo.def && style.tempo.def <= style.tempo.max);
  }
});

test('voicings: bass root in the low register, keys around middle C', () => {
  for (const root of ['C', 'F#', 'B', 'E']) {
    const m = bassRoot(buildChord(root, 'maj'));
    assert.ok(m >= 28 && m < 40);
  }
  const v = keysVoicing(buildChord('D', 'min7'));
  assert.equal(v.length, 3);                       // rootless
  assert.ok(v.every((n) => n >= 53 && n < 65));
});

test('band tiers: one more player per tier, everyone at the top', () => {
  assert.equal(TIERS.length, MAX_ENERGY + 1);
  assert.deepEqual([...partsAt(0)], ['drums', 'bass']);
  assert.ok(partsAt(1).has('keys') && !partsAt(1).has('perc'));
  for (let e = 1; e <= MAX_ENERGY; e++) assert.equal(partsAt(e).size, partsAt(e - 1).size + 1);
  assert.equal(partsAt(99).size, partsAt(MAX_ENERGY).size);
  // The shaker only plays from its tier on.
  const chord = buildChord('C', 'maj');
  for (const id of STYLE_ORDER) {
    const voices = (e) => new Set(barEvents(id, { chord, energy: e, rng: () => 0.3 }).drums.map((d) => d.voice));
    const perc = (e) => voices(e).has('shaker') || voices(e).has('tamb');
    assert.ok(!perc(1) && perc(2), id);
  }
});

test('timing zones match the grading windows', () => {
  assert.equal(timingZone(null), null);
  assert.equal(timingZone(0), 'perfect');
  assert.equal(timingZone(-0.2), 'perfect');
  assert.equal(timingZone(0.25), 'perfect');
  assert.equal(timingZone(-0.4), 'early');
  assert.equal(timingZone(0.6), 'good');
  assert.equal(timingZone(1.4), 'late');
});
