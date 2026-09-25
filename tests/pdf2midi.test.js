import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recognize } from '../pdf2midi/js/omr.js';
import { writeMidi, PPQ } from '../pdf2midi/js/midiWriter.js';
import { readMidi } from './helpers/midi.js';

// Fixtures: for each score, the primitives extracted from its PDF
// (tools/pdf2midi-dump.mjs) and the MIDI file the notation program exported
// from the same score, used as ground truth. The first three are real piano
// arrangements engraved with MuseScore 4; the others are random scores
// engraved with MuseScore 3 (another music font, italic tuplet numbers).
const FIXTURES = [
  // name, min precision, min recall, min duration accuracy
  ['autumn-leaves', 1, 1, 0.99],          // arpeggios, ties in chords, 2 voices
  ['luv-sic-part-3', 1, 1, 1],            // 16ths, dense chords
  ['carrying-you', 0.995, 0.995, 0.99],   // 3 pages, 2/4 bars, grace note, tempo mark
  ['key-changes', 0.99, 0.99, 0.95],
  ['clef-changes', 0.98, 0.99, 0.95],
  ['triplets-time-changes', 0.98, 0.99, 0.95]
];
const dir = new URL('./fixtures/pdf2midi/', import.meta.url);
const load = name => ({
  prim: JSON.parse(fs.readFileSync(new URL(`${name}.primitives.json`, dir))),
  ref: readMidi(new Uint8Array(fs.readFileSync(new URL(`${name}.mid`, dir)))).tracks.filter(t => t.notes.length)
});

// Note-level precision/recall on (pitch, onset). A recognised note that
// duplicates a reference note of another staff is a unison MuseScore's MIDI
// export only plays once, so it counts as neither right nor wrong.
function score(result, ref) {
  const all = ref.flatMap(t => t.notes);
  let tp = 0, fp = 0, fn = 0, durOk = 0;
  result.tracks.forEach((tr, i) => {
    const pool = (ref[i] ? ref[i].notes : []).map(n => ({ ...n, used: false }));
    for (const n of tr.notes) {
      const m = pool.find(x => !x.used && x.pitch === n.pitch && Math.abs(x.start - n.start) <= 0.2);
      if (m) {
        m.used = true; tp++;
        if (Math.abs(m.start + m.dur - (n.start + n.dur)) < 0.1) durOk++;
      } else if (!all.some(x => x.pitch === n.pitch && Math.abs(x.start - n.start) <= 0.2)) fp++;
    }
    fn += pool.filter(x => !x.used).length;
  });
  return { precision: tp / (tp + fp), recall: tp / (tp + fn), duration: durOk / tp };
}

for (const [name, minP, minR, minD] of FIXTURES) {
  test(`recognises ${name} against MuseScore's own MIDI export`, () => {
    const { prim, ref } = load(name);
    const result = recognize(prim);
    assert.equal(result.tracks.length, 2);
    const s = score(result, ref);
    assert.ok(s.precision >= minP, `precision ${s.precision}`);
    assert.ok(s.recall >= minR, `recall ${s.recall}`);
    assert.ok(s.duration >= minD, `duration accuracy ${s.duration}`);
  });
}

test('recognition reads title, tempo, key and time signatures', () => {
  const r = recognize(load('carrying-you').prim);
  assert.equal(r.title, 'Carrying you');
  assert.equal(r.tempo, 60);
  assert.deepEqual(r.keySigs, [{ time: 0, fifths: -3 }]);
  assert.deepEqual(r.timeSigs.map(t => [t.time, t.num, t.den]),
    [[0, 4, 4], [80, 2, 4], [82, 4, 4], [130, 2, 4], [132, 4, 4], [148, 2, 4], [150, 4, 4]]);
  assert.equal(r.stats.graceNotes, 1);
  assert.ok(recognize(load('key-changes').prim).keySigs.length > 1, 'key signature changes');
  assert.ok(recognize(load('triplets-time-changes').prim).stats.tuplets > 0, 'tuplets');
  // Measures tile the timeline without gaps.
  r.measures.forEach((m, i) => {
    if (i) assert.ok(Math.abs(m.start - (r.measures[i - 1].start + r.measures[i - 1].length)) < 1e-9);
  });
});

test('recognize rejects PDFs without staves', () => {
  assert.throws(() => recognize({ pages: [{ width: 595, height: 842, glyphs: [], lines: [], shapes: [] }] }), /scanned/);
});

test('writeMidi round-trips notes, tempo and signatures', () => {
  const r = recognize(load('key-changes').prim);
  const bytes = writeMidi(r, { tempo: 96 });
  const midi = readMidi(bytes);
  assert.equal(midi.format, 1);
  assert.equal(midi.ppq, PPQ);
  assert.equal(midi.tracks.length, r.tracks.length + 1);
  const tempo = midi.tracks[0].metas.find(m => m.type === 0x51).data;
  assert.equal(Math.round(60e6 / ((tempo[0] << 16) | (tempo[1] << 8) | tempo[2])), 96);
  assert.equal(midi.tracks[0].metas.filter(m => m.type === 0x59).length, r.keySigs.length);
  r.tracks.forEach((tr, i) => {
    const got = midi.tracks[i + 1].notes;
    assert.equal(got.length, tr.notes.length);
    // One channel per staff, so the two hands never cut each other's notes.
    assert.ok(got.every(n => n.channel === got[0].channel));
    const exp = [...tr.notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    got.forEach((n, k) => {
      assert.equal(n.pitch, exp[k].pitch);
      assert.ok(Math.abs(n.start - exp[k].start) <= 1 / PPQ);
    });
  });
  assert.notEqual(midi.tracks[1].notes[0].channel, midi.tracks[2].notes[0].channel);
});
