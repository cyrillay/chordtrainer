import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_NAMES, CHORD_FORMULAS, spellChordTones } from '../js/core/theory.js';
import {
  PROGRESSIONS, ProgressionStream, getUsableProgressions, progressionMode,
  progressionQualities, romanToChord, tokenQuality
} from '../js/training/progressions.js';

// Every suffix the roman-numeral parser understands. An unknown suffix would
// silently degrade to a plain triad, so the library must only use these.
const TOKEN_RE = /^[b#]?(VII|vii|III|iii|VI|vi|IV|iv|II|ii|V|v|I|i)(|Δ|ø|o|7|7\+9|\+9)$/;

test('progression library is well-formed', () => {
  const names = new Set();
  for (const prog of PROGRESSIONS) {
    assert.ok(!names.has(prog.name), `duplicate progression name ${prog.name}`);
    names.add(prog.name);
    assert.ok(prog.tokens.length >= 2, `${prog.name} is too short`);
    for (const t of prog.tokens) {
      assert.match(t, TOKEN_RE, `${prog.name}: unparseable token ${t}`);
      assert.ok(tokenQuality(t) in CHORD_FORMULAS, `${prog.name}: ${t}`);
    }
  }
});

test('every progression token resolves to a correctly spelled chord in every key', () => {
  for (const prog of PROGRESSIONS) {
    const mode = progressionMode(prog);
    for (const key of NOTE_NAMES) {
      for (const t of prog.tokens) {
        const chord = romanToChord(t, key, mode);
        assert.ok(chord, `${prog.name} ${t} in ${key}`);
        const tones = spellChordTones(chord);
        assert.equal(tones[0].display, chord.rootDisplay);
      }
    }
  }
});

test('romanToChord maps degrees and qualities in a key', () => {
  const ii = romanToChord('ii', 'C');
  assert.equal(ii.root, 'D');
  assert.equal(ii.quality, 'min');
  const v7 = romanToChord('V7', 'C');
  assert.equal(v7.root, 'G');
  assert.equal(v7.quality, 'dom7');
  const imaj7 = romanToChord('IΔ', 'C');
  assert.equal(imaj7.quality, 'maj7');
  assert.equal(romanToChord('iΔ', 'C').quality, 'mMaj7');
  assert.equal(romanToChord('iiø', 'A').quality, 'm7b5');
  assert.equal(romanToChord('#ivo', 'C').root, 'F#');
  assert.equal(romanToChord('bII7', 'C').rootDisplay, 'D♭');
  assert.equal(romanToChord('vi', 'F#').rootDisplay, 'D♯');
  assert.equal(romanToChord('V', 'C', 'major', 1).orderedNotes[0], 11);
  assert.equal(romanToChord('xyz', 'C'), null);
});

test('progressionMode reads the final tonic chord', () => {
  assert.equal(progressionMode({ tokens: ['ii', 'V7', 'IΔ'] }), 'major');
  assert.equal(progressionMode({ tokens: ['iiø', 'V7', 'i'] }), 'minor');
  assert.equal(progressionMode({ tokens: ['ii', 'V7', 'v', 'I7', 'i'] }), 'minor');
  assert.equal(progressionMode({ tokens: ['ii', 'V7', 'viiø'] }), 'major');
});

test('getUsableProgressions filters by enabled qualities', () => {
  assert.deepEqual(getUsableProgressions([]), []);
  assert.deepEqual(getUsableProgressions(null), []);
  const triads = getUsableProgressions(['maj', 'min']);
  assert.ok(triads.length > 0);
  for (const prog of triads) {
    for (const q of progressionQualities(prog)) assert.ok(q === 'maj' || q === 'min');
  }
  assert.equal(getUsableProgressions(Object.keys(CHORD_FORMULAS)).length, PROGRESSIONS.length);
});

test('ProgressionStream walks a progression then honours cycles', () => {
  const s = new ProgressionStream();
  s.setEnabledQualities(Object.keys(CHORD_FORMULAS));
  s.setCycles(2);
  const prog = s.currentProgression;
  const len = prog.tokens.length;
  for (let cycle = 0; cycle < 2; cycle++) {
    for (let i = 0; i < len; i++) {
      const chord = s.next();
      assert.equal(chord.meta.progression, prog.name);
      assert.equal(chord.meta.position, i);
      assert.equal(chord.meta.cycle, cycle);
      assert.equal(chord.meta.token, prog.tokens[i]);
    }
  }
  assert.equal(s.next().meta.position, 0);
  assert.equal(s.currentCycle, 0);
});

test('ProgressionStream stays within allowed roots and qualities', () => {
  const s = new ProgressionStream();
  s.setAllowedRoots(['D', 'A']);
  s.setEnabledQualities(['maj', 'min']);
  s.setSmartPivots(true);
  for (let i = 0; i < 300; i++) {
    const chord = s.next();
    assert.ok(['D', 'A'].includes(chord.meta.key), `key ${chord.meta.key}`);
    assert.ok(['maj', 'min'].includes(chord.quality), `quality ${chord.quality}`);
  }
});

test('ProgressionStream.setPosition clamps and jumps', () => {
  const s = new ProgressionStream();
  s.setPosition(-5);
  assert.equal(s.next().meta.position, 0);
  s.setPosition(1);
  assert.equal(s.next().meta.position, 1);
});

test('ProgressionStream inversions stay in range when enabled', () => {
  const s = new ProgressionStream();
  s.setUseInversions(true);
  s.setInversionFrequency(100);
  for (let i = 0; i < 100; i++) {
    const chord = s.next();
    assert.ok(chord.inversion >= 1 && chord.inversion < chord.orderedNotes.length);
  }
});
