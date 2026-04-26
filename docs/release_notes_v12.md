# V12 — JS refactor + onboarding / input UI polish

## Internals
- **`js/` reorganized into themed folders**: `core/`, `audio/`, `midi/`, `instruments/`, `training/`, `ux/`
- `views.js` split into `instruments/piano.js` and `instruments/chordDisplay.js`
- Module imports cleaner; cross-folder dependencies easier to follow

## UX
- Onboarding card width capped on mobile so the walkthrough stays inside the viewport
- Walkthrough scrolls back to the top when finished (no more "dropped mid-page" feeling)
- MIDI status moved under the mic / MIDI buttons via `.input-overlay`
- Desktop layout shrunk to 90% via a `rem` cascade (≥900px) — gives more breathing room without changing mobile sizes
