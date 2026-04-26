# V4 — Progression filtering, auto-mic, instrument toggle, UI polish

## Features
- **Filter chord progressions by enabled qualities** with a warning + auto-disable when fewer than 3 progressions match the user's selection
- 14 basic triadic progressions added (I-vi-IV-V, axis, ii-V-I, …) usable without enabling 7th chords
- **Auto-request microphone** on first load with graceful fallback if denied
- Clickable input-mode indicator in the header (Listening / MIDI) that re-requests permission on each click
- "Change instrument" button below the staff; label reflects the target mode ("Guitar mode" on piano, "Piano mode" on guitar). Choice persisted via localStorage
- Next-chord preview shown dimmed beside the current chord
- Stronger success feedback: ◆ sigil burst, stage wash, chord glow + a short sine-arpeggio chime (`feedback.js`)
- Reduced MIDI→advance latency (200 ms vs 700 ms for mic)
- Inversions are now opt-in (default off)

## UX / layout
- Tempo slider sits inside the controls grid, to the right of the metronome button
- Metronome + mic + MIDI buttons always visible (header toggle is now an alternative, not a replacement)
- "Highlight keys on piano" → "Show instrument"
- "Start/Stop tempo" → "Start/Stop metronome"
- Removed the redundant "Dynamic mode (metronome)" checkbox
- Header opus tagline: "Op. 1" → "Op. 1 No 42"

## Fixes
- Gold-on-gold hover bug on mode-toggle and instrument-toggle buttons

## Internals
- `ProgressionStream` exposes `setEnabledQualities` / `usableCount` and falls back to the full library if the filter empties the pool
- Source-agnostic heard-pitch-class pipeline shared between mic and MIDI
- `switchInputMode` starts the new source before stopping the old one, so a denied permission doesn't leave the user without input
