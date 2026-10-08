// Ghost Jam: favourite combos of groove, tune and key. Pure functions over a
// plain array (stored in localStorage by main.js) so they can be tested.
// A key may be 'random': that is a favourite too.

export const MAX_FAVOURITES = 12;

const same = (a, b) => a.style === b.style && a.tune === b.tune && a.key === b.key;

export const isFavourite = (favs, combo) => favs.some((f) => same(f, combo));

// Add the combo (newest first) or remove it if it is already there.
export function toggleFavourite(favs, { style, tune, key }) {
  const combo = { style, tune, key };
  if (isFavourite(favs, combo)) return favs.filter((f) => !same(f, combo));
  return [combo, ...favs].slice(0, MAX_FAVOURITES);
}

export const removeFavourite = (favs, i) => favs.filter((_, j) => j !== i);

// Drop anything malformed or pointing at a tune or groove that no longer exists.
export function cleanFavourites(raw, { tunes, styles, keys }) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f) => f && tunes.has(f.tune) && styles.has(f.style) && (f.key === 'random' || keys.has(f.key)))
    .map(({ style, tune, key }) => ({ style, tune, key }))
    .slice(0, MAX_FAVOURITES);
}
