import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTE_NAMES, CHORD_FORMULAS, buildChord, spellChordTones, spellRootForKey,
  tonicSpellingFor, tonicDisplay, formatChordHtml, getFingering, pickInversion,
  randomEnharmonicDisplay
} from '../js/core/theory.js';

const LETTER_PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACC_VALUES = { '': 0, '♭': -1, '♯': 1, '\u{1D12B}': -2, '\u{1D12A}': 2 };

// Pitch class of a displayed note name such as 'B♭' or 'C𝄪'.
function displayToPc(display) {
  const letter = display[0];
  const acc = display.slice(1);
  assert.ok(letter in LETTER_PCS, `bad letter in ${display}`);
  assert.ok(acc in ACC_VALUES, `bad accidental in ${display}`);
  return (LETTER_PCS[letter] + ACC_VALUES[acc] + 12) % 12;
}

const QUALITIES = Object.keys(CHORD_FORMULAS);

test('buildChord produces the formula pitch classes', () => {
  const c = buildChord('C', 'maj7');
  assert.deepEqual(c.orderedNotes, [0, 4, 7, 11]);
  assert.deepEqual([...c.pitchClasses].sort((a, b) => a - b), [0, 4, 7, 11]);
  assert.equal(c.inversion, 0);
});

test('buildChord rotates notes for inversions', () => {
  assert.deepEqual(buildChord('C', 'maj', 1).orderedNotes, [4, 7, 0]);
  assert.deepEqual(buildChord('C', 'maj', 2).orderedNotes, [7, 0, 4]);
  assert.deepEqual(buildChord('A', 'min7', 3).orderedNotes, [7, 9, 0, 4]);
});

test('buildChord symbols are unique per root/quality/inversion', () => {
  const seen = new Set();
  for (const root of NOTE_NAMES) {
    for (const q of QUALITIES) {
      const n = CHORD_FORMULAS[q].intervals.length;
      for (let inv = 0; inv < n; inv++) {
        const sym = buildChord(root, q, inv).symbol;
        assert.ok(!seen.has(sym), `duplicate symbol ${sym}`);
        seen.add(sym);
      }
    }
  }
});

test('spellChordTones spells every chord tone to its real pitch class', () => {
  for (const root of NOTE_NAMES) {
    for (const q of QUALITIES) {
      const n = CHORD_FORMULAS[q].intervals.length;
      for (let inv = 0; inv < n; inv++) {
        const chord = buildChord(root, q, inv);
        for (const rootDisplay of [undefined, randomEnharmonicDisplay(root)]) {
          chord.rootDisplay = rootDisplay;
          const tones = spellChordTones(chord);
          assert.equal(tones.length, n);
          tones.forEach((t, i) => {
            assert.equal(displayToPc(t.display), chord.orderedNotes[i],
              `${chord.symbol} tone ${i} spelled ${t.display}`);
          });
          // Tertian chords use distinct letters for every tone.
          assert.equal(new Set(tones.map(t => t.letter)).size, n, chord.symbol);
        }
      }
    }
  }
});

test('spellChordTones follows interval-based spelling', () => {
  const spell = (root, q, inv = 0, rootDisplay) => {
    const c = buildChord(root, q, inv);
    if (rootDisplay) c.rootDisplay = rootDisplay;
    return spellChordTones(c).map(t => t.display);
  };
  assert.deepEqual(spell('G', 'min'), ['G', 'B♭', 'D']);
  assert.deepEqual(spell('C#', 'min', 2, 'C♯'), ['G♯', 'C♯', 'E']);
  assert.deepEqual(spell('A#', 'maj', 0, 'B♭'), ['B♭', 'D', 'F']);
  assert.deepEqual(spell('B', 'm7b5'), ['B', 'D', 'F', 'A']);
  assert.deepEqual(spell('C', 'aug'), ['C', 'E', 'G♯']);
});

test('spellChordTones reports octave shifts across the B/C boundary', () => {
  const c = buildChord('G#', 'aug');   // G♯ B♯ D𝄪
  c.rootDisplay = 'G♯';
  const tones = spellChordTones(c);
  assert.equal(tones[1].display, 'B♯');
  assert.equal(tones[1].octShift, -1);
  assert.equal(tones[0].octShift, 0);
});

test('tonic spelling follows key-signature conventions', () => {
  assert.equal(tonicDisplay('C#', 'major'), 'D♭');
  assert.equal(tonicDisplay('C#', 'minor'), 'C♯');
  assert.equal(tonicDisplay('G#', 'major'), 'A♭');
  assert.equal(tonicDisplay('G#', 'minor'), 'G♯');
  assert.equal(tonicDisplay('A#', 'minor'), 'B♭');
  assert.equal(tonicDisplay('F#', 'major'), 'F♯');
  assert.deepEqual(tonicSpellingFor('nope', 'major'), { letter: 0, accidental: 0 });
});

test('spellRootForKey keeps the diatonic letter of the degree', () => {
  const fSharp = tonicSpellingFor('F#', 'major');
  assert.equal(spellRootForKey(fSharp, 6, 3), 'D♯');   // vi of F♯ = D♯, not E♭
  assert.equal(spellRootForKey(fSharp, 7, 5), 'E♯');   // vii of F♯ = E♯
  const dFlat = tonicSpellingFor('C#', 'major');
  assert.equal(spellRootForKey(dFlat, 5, 8), 'A♭');    // V of D♭ = A♭
  assert.equal(spellRootForKey(null, 1, 1), 'C♯');     // no key context
});

test('formatChordHtml shows slash bass only for inversions', () => {
  assert.equal(formatChordHtml(buildChord('C', 'maj')), 'C<span class="accent"></span>');
  const inv = buildChord('C#', 'min', 2);
  inv.rootDisplay = 'C♯';
  const html = formatChordHtml(inv);
  assert.match(html, /\/G<span class="accidental accidental-sharp">♯<\/span>/);
});

test('getFingering returns one finger per note for every quality', () => {
  for (const q of QUALITIES) {
    for (let inv = 0; inv < CHORD_FORMULAS[q].intervals.length; inv++) {
      const chord = buildChord('D', q, inv);
      const { rh, lh } = getFingering(chord);
      assert.equal(rh.length, chord.orderedNotes.length, `${q} rh`);
      assert.equal(lh.length, chord.orderedNotes.length, `${q} lh`);
    }
  }
});

test('pickInversion respects its switches and bounds', () => {
  assert.equal(pickInversion(4, false, 100), 0);
  assert.equal(pickInversion(1, true, 100), 0);
  for (let i = 0; i < 200; i++) {
    assert.equal(pickInversion(3, true, 0), 0);
    const inv = pickInversion(4, true, 100);
    assert.ok(inv >= 1 && inv <= 3, `inversion ${inv} out of range`);
  }
});
