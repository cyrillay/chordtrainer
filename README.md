# Étude · Chord Trainer

A web app for practicing chords on piano or guitar.

<img width="1172" height="839" alt="image" src="https://github.com/user-attachments/assets/b0834894-8431-42cf-9414-e20f6ca48971" />


## What it does

Displays a chord — root, quality, optional inversion — and listens for you to play it.
Detection works with a microphone (FFT-based polyphonic pitch detection) or a MIDI keyboard.

## Modes

- **Free practice** — random chords from a pool you choose.
- **Chord progressions** — walk through named progressions (Amen, Autumnal, Body & Soul, …) by roman numerals. Smart pivot keys can modulate between progressions.
- **Dynamic mode** — a metronome paces you: 4 beats per chord, advance on the downbeat.

## Score Trainer

`/scoretrainer/` is a companion tool: load a PDF or MIDI score, split it into
random measure-chunks and rotate through them on a timer.

## PDF → MIDI converter

`/pdf2midi/` turns a sheet-music PDF into a MIDI file, in the browser.

It targets PDFs exported by notation software (MuseScore, Dorico, Sibelius,
Finale…). Those are vector files: every notehead, clef and accidental is a
glyph from a [SMuFL](https://www.smufl.org/) music font at an exact position,
and staff lines, stems, beams and barlines are plain paths. Instead of image
recognition, the converter reads that structure through pdf.js's operator list
(`pdf2midi/js/extract.js`) and rebuilds the music from it (`pdf2midi/js/omr.js`):
staves and systems from the lines, chords from the noteheads sharing a stem,
durations from beams, flags and dots, pitches from clef + key signature +
accidentals, onsets by aligning simultaneous events in x-columns per measure,
plus ties, tuplets, grace notes, arpeggios and tempo marks. On the test scores it
matches the MIDI exported by MuseScore itself note for note.

Scans and photos are not supported (no vector data), nor yet repeats/voltas
and 8va lines. The result page overlays every recognised note on the score so
the reading can be checked, and plays it back before download.

## Visualizations

- Piano (default) — single-voicing highlight, bass note + chord tones stacked upward.
- Guitar fretboard — one playable shape on a 6-string in standard tuning.
- Circle of fifths — current chord highlighted on the major/minor wheel.

## Running

No build step. Open `index.html` in any modern browser, or serve the directory:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Tests

The music-theory core (chord building, enharmonic spelling, roman-numeral
progressions), the score-trainer chunker and the PDF → MIDI converter are
covered by unit tests using Node's built-in test runner — no dependencies to
install. Converter tests compare the recognised notes of real scores against
the MIDI file exported from the same score (`tests/fixtures/pdf2midi/`; add one
with `tools/pdf2midi-dump.mjs`).

```
npm test
```

Requires Node 20+. Tests also run in CI on every push and pull request.

## Tech

Vanilla HTML / CSS / JS (ES modules). Web Audio API for pitch detection, Web MIDI API for keyboard input, SVG for the fretboard and circle.
