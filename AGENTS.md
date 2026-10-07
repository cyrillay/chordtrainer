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

The nav numbers are the degrees of the I, vi, ii, V turnaround, which
resolves back to I (Chords), plus ♭VII, the rock "backdoor" chord that
also comes home to I. Each app's opus number is its degree, so it
never changes. The converter is not a mode: it is filed as an appendix
("Anh.", as in BWV Anh.).

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
| Chords | Op. 1 No 60 |
| Sight-reading | Op. 6 No 7 |
| Arpeggios | Op. 2 No 7 |
| Repertoire | Op. 5 No 10 |
| Ghost Jam | Op. 7 No 4 |
| PDF to MIDI | Anh. 1 No 8 |

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

## Ghost Jam is the exception

`/jam/` has its own look on purpose (neon basement bar, arcade): it loads
`header.css` and `midi-help.css` but **not** `themes.css`, and re-skins the
shared widgets by redefining the palette tokens in `jam/jam.css`. Keep the
rest of the site out of that style, and that style out of the rest.

Its logic is split so it can be tested without audio: `jam/js/judge.js`
(what counts as playing a chord, grading, scoring), `jam/js/styles.js`
(the six grooves as note events), `jam/js/band.js` (Web Audio synthesis
and scheduling, untested), `jam/js/main.js` (UI).

## Copy

- English, short sentences.
- No dashes between clauses (no "this — that"). Use a full stop, a comma
  or "·". A lone "—" as an empty-value placeholder is fine.
