# V15 — Visual identity, circle-of-fifths polish, mobile triple-tap

A design + readability release. The site keeps its black / cream / gold palette but gains five "editions" the user can switch between, with Boudoir as the new default. The circle of fifths gets a clearer "what's coming" hierarchy and reads correctly on repeated chords. Mobile users finally have a one-handed way to advance.

## Visual themes
- **Five editions** selectable in the settings panel:
  - **Op. 1 · Boudoir** *(new default)* — warm reading-lamp pool, leather-corner vignettes, subtle velvet-curtain pleats
  - **Op. 2 · Ink** — original anthracite (V14 palette)
  - **Op. 3 · Urtext** — cream paper + dark ink, multiply-blend grain
  - **Op. 4 · Marble** — full-page black-marble photograph with gold veins (`marble-background.png`)
  - **Op. 5 · Marble · Musical** — same marble with a treble clef and staves (`marble-background-musical.png`)
- Theme persisted under `localStorage["etude.theme"]` and applied **pre-paint** via an inline script — no flash of the wrong palette
- First-visit users land on Boudoir; explicitly picking Ink saves the empty string and stays there
- Switcher is a row inside the **Options** group: a `Theme` label + the current edition name + a chevron. Click expands a `<details>` panel with the five editions; picking one auto-collapses. Same collapsible pattern (and shared CSS) as the roots picker.

## Typography
- **Playfair Display** added for engraved uppercase labels (titles, opus tagline, section headers, settings caps) — a Didone with that conservatoire / opera-program weight
- **JetBrains Mono** retained for data / code display: BPM value, fret numbers, string labels, debug panel, MIDI status, theme switcher, etc.
- Two new CSS variables drive the split: `--font-display` and `--font-mono`. 35 selectors use display, 18 use mono.
- Google Fonts request trimmed to the actually-used weights (no Playfair 700 / no Playfair italic)

## Circle of fifths
- **Stronger upcoming-1 indicator** — fill bumped from 0.18 → 0.38, dashed gold border (1 px, `4 4` dash), label in `--gold-bright`
- **Repeats handled cleanly** — when a chord recurs in the queue (e.g. I-IV-V-I), the soonest occurrence keeps its highlight class. Active stays gold instead of being dimmed by an `upcoming-3` overlap.
- **Active + queue[0] = same chord** keeps both layers — gold fill / glow + dashed outline — so an immediate repeat is still readable
- **Z-order fix** — highlighted slots are re-appended to the SVG so their stroke renders on all 4 sides instead of being clipped by a neighbor drawn later in DOM order
- **Accidental kerning** in SVG — wedge labels split into `<tspan>`s with `dx="-0.18em"` so ♯ / ♭ tuck against the note letter, matching the HTML `.accidental` rule

## Roots picker
- Each label's text is wrapped in a single `<span>` so the flex `gap` on `.checkbox-item` doesn't apply between letter / accidental / suffix
- ♯ / ♭ now use the existing `.accidental { margin-left: -0.15em }` rule — closer kerning, consistent with the rest of the app

## Mobile
- **Triple-tap** on the page background advances to the next chord (mobile equivalent of Space). Skipped during dynamic mode and inside controls / modals; 600 ms sliding window; passive listener.
- Onboarding step 4 updated: *"… or hit Space on desktop, triple-tap on mobile."*

## Performance
- Marble PNGs (2 × 2 MB) lazy-load — Boudoir users never download them
- Body grain (`feTurbulence`) opacity 0 by default; only re-enabled on Urtext where it reads as paper texture
- Theme applied pre-paint, no FOUC
- Highlight updates on the circle remain O(highlighted) — sub-millisecond per chord change
