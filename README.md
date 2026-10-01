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

## Interleaved Practice (Score Trainer)

`/scoretrainer/` is a companion tool: load a PDF or MIDI score, split it into
random measure-chunks and rotate through them on a timer.

## Arpeggio Trainer

`/arpeggio/` drills chord arpeggios and inversions on a MIDI keyboard (MIDI is
required). Each chord comes with an instruction — ascending, descending or up
and back, starting on the root, 3rd, 5th or 7th — and every note is checked
live: right pitch class, right direction, any octave. A 15-level path
unlocks step by step (stars on accuracy and tempo), widening the chord
qualities (major → minor → dim/aug → sevenths) and the key signatures
(1♯/♭ → all 12 roots) as it goes. Free practice uses your own chord pool, and a *Weak spots* session
drills the chord/pattern combinations you miss most. It has its own set of
achievements, mostly secret: touch, timing and a few hidden melodies.

Add `?keys` to the URL to play with the computer keyboard while developing.

## Sight Reading (Read Trainer)

`/sightreading/` is a sight-reading trainer for piano with a MIDI keyboard.
It shows a short score on the grand staff (4–8 bars, engraved with
[VexFlow](https://www.vexflow.com/)) and follows what you play:

- **Wait** — the cursor waits until every note of the current onset is played; wrong keys are counted.
- **Tempo** — one bar of count-in, then the metronome drives the cursor; each note is graded perfect / close / missed against its beat.
- **Read ahead** — notes vanish as the cursor reaches them, so you have to read ahead.

Twelve generated levels (`sightreading/js/levels.js`) go from five notes in the right hand to
sixteenths, Alberti bass and four-flat keys. The generator (`sightreading/js/generator.js`) builds
each study from a chord progression, mostly stepwise melodies and a left-hand texture, and plays
your most-missed notes more often. Three repertoire levels use public-domain excerpts
(`sightreading/js/excerpts.js`). Stars (Wait mode tops out at two, the third needs Tempo mode at the
target tempo) unlock the next level, and there is a separate set of achievements.

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

Scans, photos, screenshots and PDFs without SMuFL vector music (LilyPond,
older Finale…) go through an image recogniser instead (`pdf2midi/js/raster/`,
run in a Web Worker). It rebuilds the same primitives from pixels — staff
lines, stems, beams, noteheads and symbols matched against Bravura / Leland
glyph templates — so the music logic is shared. It is approximate; measured
note-level precision/recall against the source MIDI:

| Input | Accuracy |
|---|---|
| Clean 200 dpi image of a MuseScore score | ~95 % |
| Same page at 100 dpi | ~78 % |
| Same page scanned (skewed, blurred, noisy, uneven light) | ~65–70 % |
| Real screenshot of the page (≈100 dpi, faint staff lines) | ~65 % |
| LilyPond PDF (Chopin nocturne, Mutopia) | ~69 % |

Repeats/voltas and 8va lines are not handled yet. The result page overlays
every recognised note on the score so the reading can be checked, and plays
it back before download.

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
