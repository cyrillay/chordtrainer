# V11 — Onboarding, presets, fingerings, inversion frequency

The biggest UX release since V2. New users land on a guided tour, picking their level via presets, and see standard fingerings on the keyboard.

## What's new
- **Icon-based input + instrument selectors** — the single Mic/MIDI and Piano/Guitar toggles are replaced with explicit icon buttons (Mic / MIDI, Piano / Guitar)
- **Chord-selection presets** — 5 levels (First timer → Expert) covering qualities, roots, and inversions in one click
- **Inversion frequency slider** — tune the % of inverted chords instead of all-or-nothing
- **Piano fingerings** — standard right-hand and left-hand finger numbers shown on the keyboard view
- **Guitar voicings dataset** — voicings loaded from a scraped JSON dataset, with an alt-voicing cycling button when multiple shapes are known
- **First-visit onboarding** — 4-step walkthrough of the chord display, input mode, presets, and the New Chord button. Persisted via localStorage so it never re-fires.

## UX / layout
- CTA + help moved into an absolute `.input-overlay` so they no longer push the header layout when shown / hidden
- Guitar wrap stretches to full width inside the stacked grid cell
- Piano ↔ guitar swap cross-fades via `.is-hidden` (opacity + translateY) instead of `visibility`, removing the lingering frame from each side
- `.controls` grid recentered (2 columns, tighter max-width) after mic/midi were moved out
