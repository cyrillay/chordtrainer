import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChord } from '../js/core/theory.js';
import { PROGRESSIONS, romanToChord, progressionMode } from '../js/training/progressions.js';
import { chordTargets, toneRole, SlotJudge, Scorer, multiplier, nextEnergy, timingZone } from '../jam/js/judge.js';
import { STYLES, STYLE_ORDER, TIERS, MAX_ENERGY, GUESTS, partsAt, guestEvents, barEvents, bassRoot, keysVoicing, countIn } from '../jam/js/styles.js';
import { FAMILIES, tuneFamily, tuneStyles, fitsStyle, tunesFor } from '../jam/js/tunes.js';

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

test('the previous chord still counts until the next downbeat', () => {
  // C then E, a beat of 500 ms: E lands at 1000, its window opens at 750.
  const mk = () => new SlotJudge({ chord: buildChord('E', 'maj'), prevChord: buildChord('C', 'maj'), start: 1000, end: 3000, beatMs: 500 });
  let j = mk();
  // Still improvising on C over the "and" of 4.
  assert.equal(j.noteOn(0, 800, new Set([0])), 'tone');     // C fits C
  assert.equal(j.noteOn(7, 850, new Set([7])), 'tone');     // G fits C
  assert.equal(j.noteOn(5, 900, new Set([5])), 'wrong');    // F fits neither
  play(j, [8, 11], 1000);                                   // then E on the downbeat
  const r = j.result();
  assert.equal(r.wrong, 1);
  assert.equal(r.grade, 'good');
  // From the downbeat on, a C-only note is wrong against E again.
  j = mk();
  assert.equal(j.noteOn(0, 1000, new Set([0])), 'wrong');
  // No previous chord (first slot): nothing is excused.
  j = new SlotJudge({ chord: buildChord('E', 'maj'), start: 1000, end: 3000, beatMs: 500 });
  assert.equal(j.noteOn(0, 800, new Set([0])), 'wrong');
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
  assert.equal(nextEnergy(2, 'perfect', 8), 3);
  assert.equal(nextEnergy(3, 'perfect', 40), MAX_ENERGY);
  assert.equal(MAX_ENERGY, 3);
  assert.equal(nextEnergy(3, 'good', 2), 3);      // a short streak keeps who is there
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
          for (const g of ev.guest) {
            assert.ok(g.step >= 0 && g.step + g.dur <= style.steps, `${id} guest overflow`);
            const range = GUESTS[id].range;
            if (range) for (const m of g.notes) assert.ok(m >= range[0] && m <= range[1], `${id} guest ${m}`);
          }
          if (energy === 0) assert.equal(ev.keys.length, 0);
          assert.equal(ev.guest.length > 0, energy === MAX_ENERGY, `${id} guest at ${energy}`);
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

test('band tiers: drums, bass and keys, the band heats up, then one guest', () => {
  assert.equal(TIERS.length, MAX_ENERGY + 1);
  assert.deepEqual([...partsAt(0)], ['drums', 'bass']);
  assert.deepEqual([...partsAt(1)], ['drums', 'bass', 'keys']);
  assert.deepEqual([...partsAt(2)], ['drums', 'bass', 'keys']);
  assert.deepEqual([...partsAt(3)], ['drums', 'bass', 'keys', 'guest']);
  assert.equal(partsAt(99).size, 4);
});

test('every groove has its own guest, and lines spell the chord', () => {
  const names = new Set(STYLE_ORDER.map((id) => GUESTS[id].name));
  assert.equal(names.size, STYLE_ORDER.length);
  const dm7 = buildChord('D', 'min7');
  const g7 = buildChord('G', 'dom7');
  const dm7Pcs = new Set([2, 5, 9, 0]);
  for (const id of STYLE_ORDER) {
    for (const r of [0, 0.4, 0.8]) {
      const ev = guestEvents(id, { chord: dm7, next: g7, rng: () => r });
      assert.ok(ev.length > 0, id);
      // Every note but a closing lead-in to the next chord is a chord tone.
      const inner = ev.slice(0, -1).flatMap((e) => e.notes);
      for (const m of inner) assert.ok(dm7Pcs.has(m % 12), `${id} ${m}`);
    }
  }
  // Lines open on the 3rd or 7th.
  const first = guestEvents('swing', { chord: dm7, next: dm7, rng: () => 0 })[0].notes[0] % 12;
  assert.ok([5, 0].includes(first));
});

test('reggae is played on the off-beat, the rest on the one', () => {
  assert.equal(STYLES.reggae.anchor, 0.5);
  for (const id of STYLE_ORDER) {
    if (id !== 'reggae') assert.equal(STYLES[id].anchor, 0, id);
    assert.ok(STYLES[id].accent.length > 0, id);
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

// ---- Achievements ----

import { ACH, JamTracker, smoothMove } from '../jam/js/achievements.js';

const landedChord = (o = {}) => ({
  grade: 'perfect', offsetBeats: 0, offsetMs: 0, colours: 0, wrong: 0,
  voicing: [60, 64, 67], velocities: [80, 80, 80], colourIntervals: [], quality: 'maj', ...o,
});
const run = (tr, chords) => chords.flatMap((c) => tr.chord(c));

test('achievements: ids are unique and secrets have hints', () => {
  const ids = ACH.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of ACH) {
    if (a.vis === 'visible') assert.ok(a.metric && a.target, a.id);
    else assert.ok(a.hint, a.id);
  }
});

test('achievements: feel streaks (laid back, pushing, atomic)', () => {
  let tr = new JamTracker({ style: 'swing', chorusLen: 100 });
  let ids = run(tr, Array(7).fill(landedChord({ grade: 'good', offsetBeats: 0.5 })));
  assert.ok(!ids.includes('dilla'));
  assert.ok(tr.chord(landedChord({ grade: 'good', offsetBeats: 0.5 })).includes('dilla'));

  tr = new JamTracker({ style: 'swing', chorusLen: 100 });
  ids = run(tr, [...Array(4).fill(landedChord({ offsetBeats: -0.1 })), landedChord({ offsetBeats: 0.1 }), ...Array(4).fill(landedChord({ offsetBeats: -0.1 }))]);
  assert.ok(!ids.includes('pushing'), 'a hit after the beat breaks the streak');

  tr = new JamTracker({ style: 'swing', chorusLen: 100 });
  ids = run(tr, [landedChord({ offsetMs: 10 }), landedChord({ offsetMs: -14 }), landedChord({ offsetMs: 3 }), landedChord({ offsetMs: 0 })]);
  assert.ok(ids.includes('atomic'));
});

test('achievements: on the one only counts in the funk groove', () => {
  const eight = Array(8).fill(landedChord());
  assert.ok(!run(new JamTracker({ style: 'swing', chorusLen: 100 }), eight).includes('onTheOne'));
  assert.ok(run(new JamTracker({ style: 'funk', chorusLen: 100 }), eight).includes('onTheOne'));
});

test('achievements: touch (ghost notes, wake the dead)', () => {
  const tr = new JamTracker({ style: 'swing', chorusLen: 100 });
  assert.ok(tr.chord(landedChord({ velocities: [20, 30, 35] })).includes('ghostNotes'));
  assert.ok(tr.chord(landedChord({ velocities: [120, 127, 115] })).includes('wakeDead'));
  assert.ok(!tr.chord(landedChord({ grade: 'miss', velocities: [20, 30, 35] })).includes('ghostNotes'));
});

test('achievements: voicings (shells, planing, butter)', () => {
  let tr = new JamTracker({ style: 'swing', chorusLen: 100 });
  assert.ok(run(tr, Array(8).fill(landedChord({ voicing: [64, 70], velocities: [80, 80] }))).includes('shells'));

  // Same shape slid to four spots.
  tr = new JamTracker({ style: 'swing', chorusLen: 100 });
  const shape = (low) => landedChord({ voicing: [low, low + 4, low + 7] });
  assert.ok(run(tr, [shape(60), shape(62), shape(65), shape(67)]).includes('planing'));
  tr = new JamTracker({ style: 'swing', chorusLen: 100 });
  assert.ok(!run(tr, [shape(60), shape(62), landedChord({ voicing: [60, 63, 67] }), shape(67)]).includes('planing'));

  assert.ok(smoothMove([60, 64, 67], [59, 65, 69]));
  assert.ok(!smoothMove([60, 64, 67], [60, 64, 70]));
  assert.ok(!smoothMove([60, 64], [60, 64, 67]));
  tr = new JamTracker({ style: 'swing', chorusLen: 100 });
  const ii = [62, 65, 69, 72], V = [62, 65, 67, 71], I = [60, 64, 67, 71];
  const seq = [ii, V, I, I, ii, V, I, I].map((v) => landedChord({ voicing: v, velocities: v.map(() => 80) }));
  assert.ok(run(tr, seq).includes('butter'));
});

test('achievements: colour (hot sauce, altered, sauce on everything)', () => {
  const tr = new JamTracker({ style: 'swing', chorusLen: 2 });
  assert.ok(tr.chord(landedChord({ colours: 3 })).includes('hotSauce'));
  const ids = tr.chord(landedChord({ quality: 'dom7', colours: 2, colourIntervals: [1, 8] }));
  assert.ok(ids.includes('altered'));
  assert.ok(ids.includes('sauceAll'), 'both chords of the chorus had colour');
  assert.ok(!new JamTracker({ style: 'swing', chorusLen: 9 }).chord(landedChord({ quality: 'dom7', colours: 2, colourIntervals: [1, 2] })).includes('altered'));
});

test('achievements: whole choruses (golden, basement, attic, lullaby)', () => {
  let tr = new JamTracker({ style: 'ballad', chorusLen: 2 });
  let ids = run(tr, [landedChord({ velocities: [50, 40, 55] }), landedChord({ velocities: [30, 30, 30] })]);
  assert.ok(ids.includes('golden'));
  assert.ok(ids.includes('lullaby'));
  tr = new JamTracker({ style: 'swing', chorusLen: 2 });
  ids = run(tr, [landedChord({ voicing: [40, 44, 47] }), landedChord({ voicing: [41, 45, 47], grade: 'good' })]);
  assert.ok(ids.includes('basement'));
  assert.ok(!ids.includes('golden'));
  tr = new JamTracker({ style: 'swing', chorusLen: 2 });
  assert.ok(run(tr, [landedChord({ voicing: [88, 92, 95] }), landedChord({ voicing: [86, 89, 93] })]).includes('attic'));
});

test('achievements: back from the dead needs an empty stage first', () => {
  const tr = new JamTracker({ style: 'swing', chorusLen: 4 });
  assert.deepEqual(tr.energy(MAX_ENERGY), []);
  tr.energy(0);
  assert.deepEqual(tr.energy(MAX_ENERGY), ['lazarus']);
});

test('achievements: end of the set (stage fright, ghost town, encore, séance)', () => {
  let tr = new JamTracker({ style: 'swing', chorusLen: 4 });
  assert.deepEqual(tr.finish({ complete: false, rank: 'D', hour: 20, encore: 0 }), ['stageFright']);

  tr = new JamTracker({ style: 'swing', chorusLen: 4 });
  run(tr, Array(4).fill(landedChord({ grade: 'miss', voicing: null })));
  assert.deepEqual(tr.finish({ complete: true, rank: 'D', hour: 20, encore: 0 }), ['ghostTown']);

  tr = new JamTracker({ style: 'swing', chorusLen: 4 });
  tr.note();
  run(tr, Array(4).fill(landedChord({ colours: 1 })));
  const ids = tr.finish({ complete: true, rank: 'S', hour: 3, encore: 2 });
  assert.ok(ids.includes('encore') && ids.includes('lastOrders') && ids.includes('seance'));
  assert.ok(!ids.includes('ghostTown'));
});

test('tunes: every progression suits at least one groove, every groove has tunes', () => {
  for (const p of PROGRESSIONS) {
    assert.ok(tuneStyles(p).length > 0, `${p.name} has no style`);
    assert.ok(FAMILIES.includes(tuneFamily(p)), `${p.name} has no family`);
    for (const s of tuneStyles(p)) assert.ok(STYLE_ORDER.includes(s), `${p.name}: unknown style ${s}`);
  }
  for (const s of STYLE_ORDER) assert.ok(tunesFor(s).length >= 10, `${s} has too few tunes`);
});

test('tunes: bebop stays in swing, baroque stays out of funk', () => {
  const byName = (n) => PROGRESSIONS.find((p) => p.name === n);
  assert.deepEqual(tuneStyles(byName('Rhythm')), ['swing']);
  assert.ok(!fitsStyle(byName('La Folia'), 'funk'));
  assert.ok(!fitsStyle(byName('Smoke on the Water'), 'bossa'));
  assert.ok(fitsStyle(byName('Dorian vamp'), 'funk'));
});

test('favourites: toggle, newest first, capped, cleaned', async () => {
  const { toggleFavourite, isFavourite, removeFavourite, cleanFavourites, MAX_FAVOURITES } = await import('../jam/js/favourites.js');
  const a = { style: 'funk', tune: 'Dorian vamp', key: 'E' };
  const b = { style: 'swing', tune: 'Autumnal', key: 'random' };
  let favs = toggleFavourite([], a);
  favs = toggleFavourite(favs, b);
  assert.deepEqual(favs, [b, a]);
  assert.ok(isFavourite(favs, { ...a }));
  assert.ok(!isFavourite(favs, { ...a, key: 'F' }));   // another key is another combo
  favs = toggleFavourite(favs, a);
  assert.deepEqual(favs, [b]);
  assert.deepEqual(removeFavourite([a, b], 0), [b]);
  let many = [];
  for (let i = 0; i < MAX_FAVOURITES + 3; i++) many = toggleFavourite(many, { ...a, tune: `t${i}` });
  assert.equal(many.length, MAX_FAVOURITES);
  const ctx = { tunes: new Set(['Autumnal']), styles: new Set(['swing']), keys: new Set(['C']) };
  assert.deepEqual(cleanFavourites([b, { ...b, tune: 'Gone' }, { ...b, key: 'H' }, null, { ...b, key: 'C', extra: 1 }], ctx),
    [b, { ...b, key: 'C' }]);
  assert.deepEqual(cleanFavourites('junk', ctx), []);
});

test('piano remote: one key alone is a command, a chord is not', async () => {
  const { PianoRemote, gestureOf } = await import('../jam/js/remote.js');
  const got = [];
  const r = new PianoRemote({ onCommand: (m) => got.push(m) });
  r.noteOn(67, true); r.noteOff(67);
  assert.deepEqual(got, [67]);
  r.noteOn(60, true); r.noteOn(64, true); r.noteOn(67, true);
  r.noteOff(60); r.noteOff(64); r.noteOff(67);   // a C chord does nothing
  r.noteOn(67, false); r.noteOff(67);            // pressed while playing: never a command
  assert.deepEqual(got, [67]);
  // Intervals from middle C.
  assert.equal(gestureOf(57), 'down');             // A3, minor third below
  assert.equal(gestureOf(56), 'down');             // A♭3, major third below
  assert.equal(gestureOf(64), 'up');               // E4
  assert.equal(gestureOf(63), 'up');               // E♭4
  assert.equal(gestureOf(67), 'select');           // G4
  assert.equal(gestureOf(60), null);
  assert.equal(gestureOf(76), null);               // E5: only around middle C
});

test('piano remote: hold a third and it repeats, faster', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // Timers set from inside a timer only run on a later tick: advance 1 ms at a time.
  const tick = (ms) => { for (let i = 0; i < ms; i++) t.mock.timers.tick(1); };
  const { PianoRemote, REPEAT } = await import('../jam/js/remote.js');
  const got = [];
  const r = new PianoRemote({ onCommand: (m) => got.push(m), repeats: (m) => m === 64 });
  r.noteOn(64, true);
  tick(REPEAT.delay - 1);
  assert.equal(got.length, 0);
  tick(1);
  assert.equal(got.length, 1);
  tick(REPEAT.interval * (REPEAT.rushAfter - 1));
  assert.equal(got.length, REPEAT.rushAfter);
  tick(REPEAT.rush * 4);              // rushing now
  assert.equal(got.length, REPEAT.rushAfter + 4);
  r.noteOff(64);                                    // letting go adds nothing
  tick(1000);
  assert.equal(got.length, REPEAT.rushAfter + 4);
  // A quick tap still counts once, on release.
  got.length = 0;
  r.noteOn(64, true); tick(100); r.noteOff(64);
  assert.deepEqual(got, [64]);
  // A second key stops the repeat.
  got.length = 0;
  r.noteOn(64, true); tick(REPEAT.delay); r.noteOn(67, true);
  tick(1000); r.noteOff(67); r.noteOff(64);
  assert.deepEqual(got, [64]);
  // The fifth never repeats.
  got.length = 0;
  r.noteOn(67, true); tick(2000); r.noteOff(67);
  assert.deepEqual(got, [67]);
});

test('menu cursor: thirds move, the fifth takes and lets go a setting', async () => {
  const { MenuNav, step } = await import('../jam/js/remote.js');
  const nav = new MenuNav([
    { id: 'groove', kind: 'value' }, { id: 'tempo', kind: 'value' }, { id: 'play', kind: 'action' },
  ], 'groove');
  assert.deepEqual(nav.handle('up'), { type: 'focus', id: 'groove' });   // already at the top
  assert.deepEqual(nav.handle('down'), { type: 'focus', id: 'tempo' });
  assert.deepEqual(nav.handle('select'), { type: 'edit', id: 'tempo', on: true });
  assert.deepEqual(nav.handle('up'), { type: 'change', id: 'tempo', dir: 1 });
  assert.deepEqual(nav.handle('down'), { type: 'change', id: 'tempo', dir: -1 });
  assert.deepEqual(nav.handle('select'), { type: 'edit', id: 'tempo', on: false });
  assert.deepEqual(nav.handle('down'), { type: 'focus', id: 'play' });
  assert.deepEqual(nav.handle('down'), { type: 'focus', id: 'play' });    // already at the bottom
  assert.deepEqual(nav.handle('select'), { type: 'activate', id: 'play' });
  // A row appears above: the cursor stays on the same row.
  nav.setItems([{ id: 'favs', kind: 'value' }, ...nav.items]);
  assert.equal(nav.current.id, 'play');
  assert.equal(step(['a', 'b', 'c'], 'c', 1), 'a');
  assert.equal(step(['a', 'b', 'c'], 'a', -1), 'c');
});
