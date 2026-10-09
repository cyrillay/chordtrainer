# Notes for agents working on Étude

Static site, no build step: plain HTML, CSS and ES modules. Run it with
`npm start` (python http.server on :8000) and test with `npm test`.

## The apps

| Nav | App | Path | Opus |
|-----|-----|------|------|
| I   | Chords | `/` | Op. 1 |
| vi  | Sight-reading | `/sightreading/` | Op. 6 |
| ii  | Arpeggios | `/arpeggio/` | Op. 2 |
| V   | Repertoire (interleaved practice) | `/scoretrainer/` | Op. 5 |
| ♭VII | Ghost Jam (backing band) | `/jam/` | Op. 7 |
| (none) | PDF to MIDI converter | `/pdf2midi/` | Anh. 1 |
| Σ | Statistics | `/stats/` | Anh. 2 |

The nav numbers are the degrees of the I, vi, ii, V turnaround, which
resolves back to I (Chords), plus ♭VII, the rock "backdoor" chord that
also comes home to I. Each app's opus number is its degree, so it
never changes. The converter is not a mode: it is filed as an appendix
("Anh.", as in BWV Anh.). Statistics is not a mode either: Anh. 2, and Σ
(the sum of everything) in the nav, after the turnaround.

## Version number: bump "No" on every update

The header shows `Op. <degree> No <version>` under the logo
(`<span class="hd-opus">` in each app's `index.html`). **"No" is the app's
version number. Whenever a change ships for an app, add 1 to its "No"** in
that app's `index.html`, and only for the apps the change actually touches.
A change to a shared file (`header.css`, `themes.css`, `midi-help.css`,
`js/midi/midiHelp.js`…) counts for every app that loads it.

Current versions (keep this table in sync):

| App | Current |
|-----|---------|
| Chords | Op. 1 No 62 |
| Sight-reading | Op. 6 No 9 |
| Arpeggios | Op. 2 No 9 |
| Repertoire | Op. 5 No 12 |
| Ghost Jam | Op. 7 No 17 |
| PDF to MIDI | Anh. 1 No 10 |
| Statistics | Anh. 2 No 2 |

## Shared pieces

- `header.css`: the site header (logo, opus line, MIDI and Achievements
  buttons, nav). Every app uses the same markup; copy it from another
  page when adding one.
- `themes.css`: the themes picked in the Chords options (stored in
  `localStorage['etude.theme']`). Every page loads it and applies the theme
  with the same inline script right after `<body>`. Style with the palette
  tokens (`--ink`, `--ivory`, `--gold`…) rather than hard-coded colours so
  the light Urtext theme keeps working.
- `midi-help.css` + `js/midi/midiHelp.js`: the "No device found ?" line,
  its help bubble (Bluetooth first, then USB) and the "connect your
  keyboard" card used by Arpeggios and Sight-reading.
- `js/ux/infoTip.js`: "?" help bubbles that open on click only.
- `js/stats/log.js`: the dated practice log (`localStorage['etude.stats']`)
  every trainer feeds with `track()` (one event: a chord, an arpeggio, a
  note run) and `logRun()` (a finished level, exercise or set). The
  Statistics page (`/stats/`) reads it with the trainers' own stores; the
  series maths is in `js/stats/compute.js`. A new trainer should call both.
- `js/core/store.js`: every `localStorage` key the site owns, in one
  registry (`KEYS`), with safe `read`/`write` and the backup file the
  Statistics page saves and restores. Add a new key there, never inline.
- `js/midi/input.js`: the one Web MIDI connection (states, note on/off,
  pedal, the remembered grant). `paintMidiStatus()` in `midiHelp.js` draws
  its state in the header. `js/midi/computerKeyboard.js` is the `?keys`
  dev piano.
- `js/audio/context.js`: the one shared `AudioContext` (and its unlock on
  the first tap) plus the latency offsets from Ghost Jam's audio sync.
  Only the microphone keeps its own context.
- `js/ux/achievementKit.js`: the achievements store, toast and case. Each
  app keeps its own list and rules in its `achievements.js`.
- `<app>/js/summary.js`: what the Statistics page may read from an app
  (levels, achievements list, store keys). Keep it free of DOM code.
- `js/music-ui/`: the musical controls, with `music-ui.css`:
  `keyWheel.js` (a key on the circle of fifths), `noteKeyboard.js` (notes
  on a one-octave keyboard), `tempo.js` (♩ = 120 with its Italian term,
  the terms as buttons, tap tempo), `pianoRemote.js` and `menuRemote.js`
  (the piano as a remote: A or E on their own move, G presses).

## Imports: an app owns its folder

An app imports only from `js/` and from its own folder. Code two apps need
moves to `js/`; it is never imported across apps. The one exception is the
Statistics page, which reads `<app>/js/summary.js`. `js/` never imports
from an app. `tests/site.test.js` checks this, along with the shared nav
and the version table above.

## Ghost Jam is the exception

`/jam/` has its own look on purpose (neon basement bar, arcade): it loads
`header.css` and `midi-help.css` but **not** `themes.css`, and re-skins the
shared widgets by redefining the palette tokens in `jam/jam.css`. Keep the
rest of the site out of that style, and that style out of the rest.

Its logic is split so it can be tested without audio: `jam/js/judge.js`
(what counts as playing a chord, grading, scoring), `jam/js/styles.js`
(the six grooves as note events), `jam/js/band.js` (Web Audio synthesis
and scheduling, untested). The UI is split by screen: `setupView.js`
(groove, tune, key, tempo, favourites), `syncView.js` (the audio sync
test), `playView.js` (the set on stage), `resultsView.js` (the end of a
set), around `state.js` (settings, scores, the band, the live set).
`main.js` keeps the MIDI input, the piano remote and the boot.

## UX: music first

Every choice a musician makes on the site should look and feel like music,
not like a web form. Prefer the instrument and music theory over generic
controls:

- Pick musical things on musical pictures: a key on a circle of fifths
  (see `jam/js/keyWheel.js`), a note on a keyboard, a rhythm on a beat grid.
  A `<select>` of note names is the last resort.
- The piano is an input everywhere it makes sense: play a note to pick it,
  move through menus from the keys (`js/music-ui/menuRemote.js`). Mouse,
  touch and computer keyboard still work too.
- Spell and name things as a musician would (D♭ major, C♯ minor, key
  signatures, degrees), and keep the screens ergonomic: big targets, one
  tap or one note per choice.

## Copy

- English, short sentences.
- No dashes between clauses (no "this — that"). Use a full stop, a comma
  or "·". A lone "—" as an empty-value placeholder is fine.

## Pull requests: include screenshots

Every PR that changes something visible carries screenshots of it in the
description (desktop and phone width when the layout differs). Take them
with Playwright against `npm start` (Chromium is preinstalled), commit them
under `docs/screenshots/<branch-or-feature>/` and embed them with their raw
GitHub URL so they render in the PR. Save them as **WebP** (quality ~85),
not PNG: every screenshot stays in the git history forever, and WebP is
about eight times lighter.
