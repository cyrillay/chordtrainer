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

## Tech

Vanilla HTML / CSS / JS (ES modules). Web Audio API for pitch detection, Web MIDI API for keyboard input, SVG for the fretboard and circle.

## Tests

Cross-browser front-end tests with [Playwright](https://playwright.dev): Chrome, Firefox and Safari (WebKit) on desktop, plus Pixel 7 and iPhone 14 emulation.

```
npm install
npx playwright install        # one-time browser download
npm test                      # all browsers
npx playwright test --project=mobile-safari   # a single one
npm run test:ui               # interactive mode
BASE_URL=https://chordtrainer.io npm test     # against production
```

They also run on GitHub Actions on every push to `main` and every pull request (`.github/workflows/e2e.yml`). To test production, run the workflow manually with a `base_url`.
