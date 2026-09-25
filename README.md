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
progressions) and the score-trainer chunker are covered by unit tests using
Node's built-in test runner — no dependencies to install:

```
npm test
```

Requires Node 20+. Tests also run in CI on every push and pull request.

## Tech

Vanilla HTML / CSS / JS (ES modules). Web Audio API for pitch detection, Web MIDI API for keyboard input, SVG for the fretboard and circle.
