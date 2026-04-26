# V8 — Performance pass

A focused performance / hygiene release. No new user-facing features — the goal is faster paint, lower JS work per frame, and a tidier module boundary.

## Internals
- Centralized constants in `js/constants.js` (localStorage keys, debounce windows, magic numbers)
- New `js/dom.js` helpers (`$`, `$$`, `setDisplay`, `svgEl`, `debounce`) used throughout — fewer ad-hoc `getElementById` / `createElementNS` calls
- New `js/tones.js` extracted from feedback so the success chime can be reused without pulling the rest of the feedback module
- `js/audio.js`, `js/main.js`, `js/views.js` rewritten to use the helpers and shared constants
- Highlight updates on circle / piano / guitar use cached lookups (e.g. `slotByKey` in circle) instead of `querySelectorAll` sweeps per frame
- `js/dynamic.js` simplified — fewer branches in the metronome tick path
- Generator regeneration is debounced via a single entry point so rapid toggles collapse into one queue rebuild

## Fixes
- Several small repaint / re-layout glitches eliminated as a side effect of the cache + debounce work
