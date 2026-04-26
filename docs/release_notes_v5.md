# V5 — Chord recognition features and guitar improvements

## Theory & display
- Add **m7♭5** and **mMaj7** to selectable chord qualities
- Improve ♯/♭ spacing with `.accidental` wrapping (negative `margin-left`)
- Progressive highlight of upcoming chords on the circle of fifths

## Progressions
- Progression cycles option (1–4) to repeat a progression before switching
- Highlight the current degree in the progression name with a cycle indicator
- Select / unselect-all toggle for root notes with a smart label that reflects state

## Guitar
- Implement a standard guitar voicings dictionary (~60 common chord shapes)
- Shift guitar dots and muted-string markers further left to avoid overlap
- × markers for muted strings in gold

## UX
- Fix next-chord display on mobile (responsive sizing, no longer hidden)
- Reduce coming-up-chords spacing on mobile with a slide animation
- Add a collapsible info banner with tips and guidelines
- Metronome mute checkbox option
- Remove hover effect on circle-of-fifths wedges
- Fix toggle-all-roots button label so it correctly reflects state
- Draft Reddit post for r/piano and r/pianolearning
