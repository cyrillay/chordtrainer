# V2 — Modular rewrite + practice modes

The single-file V1 is split into ES modules under `js/` with an external `styles.css`. Several new practice modes and visualizations layer on top of the existing mic-based recognizer.

## What's new
- **MIDI input** via Web MIDI API as an alternative to the microphone
- **Dynamic mode** — metronome paces 4 beats per chord, advance on the downbeat
- **Chord progressions mode** — walks named progressions (Amen, Autumnal, Body & Soul, …) parsed from roman numerals, with optional smart pivot-key modulation
- **Guitar fretboard** visualization showing a single playable voicing
- **Circle of fifths** visualization highlighting the current chord
- Always-on inversions, chord-note chips, auto-advance, and a next-chord queue

## UX
- Roots picker collapsed into a `<details>` menu
- Advanced sensitivity panel moved to the bottom of the page, always visible
- Footer adds a Buy Me a Coffee widget and a Suggestions mailto link
