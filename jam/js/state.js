// Ghost Jam: what every screen shares. The saved settings and scores, the
// tunes, the band, the held keys, and `app`, the live state (the set being
// played, the MIDI state) plus a few hooks main.js fills in.

import { NOTE_NAMES } from '../../js/core/theory.js';
import { PROGRESSIONS, romanToChord, progressionMode } from '../../js/training/progressions.js';
import { STYLE_ORDER } from './styles.js';
import { FAMILIES, tuneFamily, fitsStyle, tunesFor } from './tunes.js';
import { Band } from './band.js';
import { KEYS, read, write } from '../../js/core/store.js';
import { cleanFavourites } from './favourites.js';
import { keyLabel } from '../../js/music-ui/keyWheel.js';

export const $ = (id) => document.getElementById(id);
export const params = new URLSearchParams(location.search);

export const app = {
  game: null,        // the set on stage, or null on the setup screen
  midiState: 'off',
  // Filled in by main.js.
  connect: () => {},
  paintNav: () => {},
  syncSetupRows: () => {},
  showResultsNav: () => {},
};

export const band = new Band();
export const held = new Map(); // midi -> the chord it was judged against
export const velocities = new Map(); // midi -> velocity of the held key

// ---- Settings + high scores ----

const K = KEYS.jam;
export const LS = { settings: K.SETTINGS, scores: K.SCORES, guests: K.GUESTS, favs: K.FAVOURITES };

export const settings = Object.assign({
  style: 'swing', tune: 'Autumnal', key: 'random', tempo: null, bars: 1, length: 4, showTones: true,
}, read(LS.settings, {}));
export const scores = read(LS.scores, {});
export const guestsMet = new Set(read(LS.guests, []));
export const store = { favs: [] };
store.favs = cleanFavourites(read(LS.favs, []), {
  tunes: new Set(PROGRESSIONS.map((p) => p.name)), styles: new Set(STYLE_ORDER), keys: new Set(NOTE_NAMES),
});
export const scoreKey = () => `${settings.tune}|${settings.style}`;
export const save = () => write(LS.settings, settings);

// ---- Tunes: the Chords trainer's progressions, sorted by the groove ----
// Tunes that suit the chosen style come first, in their families. The rest
// stay at the bottom under "Off-style" for anyone who wants Pachelbel in funk.

export const randomTune = (style) => {
  const pool = tunesFor(style);
  return pool[Math.floor(Math.random() * pool.length)].name;
};
const tuneOption = (p) => `<option value="${p.name.replace(/"/g, '&quot;')}">${p.name}</option>`;

export function tuneMenuHtml(style) {
  const fit = PROGRESSIONS.filter((p) => fitsStyle(p, style));
  const off = PROGRESSIONS.filter((p) => !fitsStyle(p, style));
  return FAMILIES.map((f) => {
    const tunes = fit.filter((p) => tuneFamily(p) === f);
    return tunes.length ? `<optgroup label="${f}">${tunes.map(tuneOption).join('')}</optgroup>` : '';
  }).join('') + (off.length ? `<optgroup label="Off-style">${off.map(tuneOption).join('')}</optgroup>` : '');
}
export const tuneByName = (name) => PROGRESSIONS.find((p) => p.name === name) || PROGRESSIONS.find((p) => p.name === 'Autumnal') || PROGRESSIONS[0];

export function resolveKey() {
  return settings.key === 'random' ? NOTE_NAMES[Math.floor(Math.random() * 12)] : settings.key;
}

export function buildChords(prog, key) {
  const mode = progressionMode(prog);
  return prog.tokens.map((t) => romanToChord(t, key, mode)).filter(Boolean);
}

// Major or minor is part of the tune (a minor ii–V–i is not a major one
// played darker), so the key picker picks the tonic and names the mode,
// spelled as on the circle of fifths (D♭ major, C♯ minor).
export const keyName = (key, prog) => keyLabel(key, progressionMode(prog));

export const hiFor = (key) => scores[key]?.score || 0;
export { write };
