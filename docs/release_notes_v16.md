# V16 — Achievements, mobile polish, sharper onboarding cues

A "make the app feel alive and discoverable" release. The headline feature is a localStorage-backed achievements system with three visibility tiers (common, rare, ultra-rare) and 35+ unlocks spanning practice volume, theory milestones, exploration of UI features, and time-pressure feats. Around it, the mic CTA gets a clearer target, several mobile annoyances are fixed, and the onboarding ring breathes.

## Achievements

- **Three tiers** of visibility, each shown in its own section with a count:
  - **Common** — name + description visible while locked, with a progress bar
  - **Rare** — shown as `???` with a playful one-liner hint while locked; light gold pulse on the icon hints at the mystery
  - **Ultra-rare** — placeholder lock + per-achievement riddle; aurora gradient + shimmer overlay so the tile reads as a prize, not a missing entry
- **Toast notification** on unlock (top-right, auto-dismiss after 4 s, stagger-safe so multi-unlock events don't stomp on each other)
- **Trophy button in the header** with an "Achievements" label visible on both desktop and mobile
- **Reset button** in the modal footer, two-step confirm pattern (no native `confirm()` dialog) — armed state auto-disarms after 5 s
- **Persisted in `localStorage["chordTrainer.achievements"]`** — no login, no backend; works offline; survives reloads. Resetting wipes the key and starts fresh.

### Achievement catalogue (highlights)

- **Beginner journey** — *Hello, World*, *Walking Bass*
- **Intermediate / Advanced / Expert volume** — *Mezzo Piano/Forte*, *Off-Book*, *Magna Cum Laude*, *Welcome to the Lab*, *Knee Deep*, *Hand of Liszt*
- **Triad volume** — *Major League*, *Minor Threat*
- **Sevenths intro** — *Blues Brother*, *Smooth Operator*, *Café au Lait*
- **Half-diminished progression** — *Half Empty* → *Tristan Was Right* → *ii-V-Cry* → *Diminishing Returns* → *The Half Truth*
- **Augmented progression** — *Going Up?* → *Augmented Reality* → *Whole-Tone Mood* → *Liszt Move* → *Debussy on Speed Dial*
- **Minor-major 7 (Bond chord) progression** — *Bond. Chord, Bond.* → *Shaken, Not Stirred* → *Licensed to Trill* → *The Spy Who Voiced Me* → *Goldfinger Position*
- **Exploration / non-performance** — *Bold Move* (open Expert), *By Ear* (turn off fingerings), *Costume Drama* + *Style Council* (theme switching)
- **Metronome** — *Tick Tock* (start it), *In the Pocket* (20 chords with metro on), *Locked In* (60 chords with metro on)
- **Rare (secret)** — *Iron Pianist* (15 min active expert), *Allegro Furioso* (4 in 10 s), *Caffeine Spike* (8 in 30 s — Intermediate), *Espresso Shot* (25 in 2 min — Advanced)
- **Ultra-rare** — *Lunar Alignment* (mMaj7 on all 12 roots), *Tenured at Juilliard* (100 in Expert), *The Horowitz* (150 in 10 min — Expert)

### Internals

- New module `js/ux/achievements.js` (~360 lines) wires into the existing `onSuccess()` hook from `js/ux/feedback.js` plus a generic `recordAction(actionId)` for non-success events
- Custom event `etude:action` lets non-module callers (the inline theme switcher) record an action without an import
- **Window-density evaluator** — sliding per-preset timestamp arrays, auto-pruned each tick to the largest window any active achievement needs (caps at 1000 entries per series, sub-millisecond evaluation per success)
- **Expert active time** — accumulates only the gap between consecutive successes when ≤30 s apart, so idle pauses stop the clock automatically
- **Per-quality root sets** — tracks distinct roots played per quality so *Lunar Alignment* (mMaj7 on all 12 roots) can fire

## Mic activation CTA

- Replaced the small generic `↑` glyph with a **curved SVG arrow** that visually targets the mic button and a more direct "Tap **Mic** to start" label
- The mic button itself now has a **subtle gold pulse** (`cta-pulse` class) while no input is active — disappears the moment the user activates mic or MIDI
- CTA repositioned to the **left side** of the input overlay (under the mic button) instead of right-aligned (where it used to point at the MIDI button area)
- Bigger text, gold shadow, and a gentle bobbing arrow animation

## Smart progressions tooltip

- New reusable `.info-tip` component (a small `?` badge with a hover/focus tooltip bubble) — used to explain "Smart progressions (pivot keys)"
- The tooltip explains pivot modulations in plain language without cluttering the option label

## Onboarding polish

- **Breathing room around the highlight ring** — switched from `box-shadow` (which hugs the element) to `outline + outline-offset: 8px` so the gold frame visibly stands away from the targeted button
- **Hover readability** — the Achievements button and modal close button now use `--gold-bright` on hover so the text stays legible

## Mobile

- **MIDI status messages auto-dismiss after 5 s** — "Web MIDI not supported" no longer lingers forever once it has fired; same for "MIDI access denied"
- **Header right-aligned** on mobile (was top-left); achievements label kept visible alongside the icon
- **Tighter horizontal padding** on `.app`, `.piano-wrap`, `.guitar-wrap` under 600 px so the keyboard and fretboard reclaim the width (V15 carry-over)
- **Tempo control wraps under 700 px** — slider on its own row; BPM, Accent, Mute drop below cleanly

## Typography & sizing

- **Desktop sizing tightened** — `html { font-size: 85%; zoom: 0.9 }` above 900 px replicates a browser cmd+- 90% zoom in code, so the layout occupies less width on wide monitors and the chord display, instrument, and controls stay close together
- Mic detection tip added to the Tips & Info section: how to position the mic for best chord recognition

## Storage keys

- New: `localStorage["chordTrainer.achievements"]` — JSON blob with `unlocked`, `counters`, `rootSets`, `windowTimes`, `lastSuccessAt`
- Reset via the **Reset all achievements** button in the modal footer
