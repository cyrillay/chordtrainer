// Split a flat measure list into fixed-size, non-overlapping chunks of
// consecutive measures.
//
// If the total number of measures doesn't divide evenly by chunkSize, the
// last group would otherwise contain `total % chunkSize` measures — and a
// single-measure orphan after promising "chunks of 4" feels jarring. We
// absorb that orphan into the previous chunk so the last chunk is at most
// `chunkSize + 1` and is never a standalone single measure.

export function buildChunks(measures, chunkSize) {
  if (!measures.length) return [];
  const out = [];
  for (let i = 0; i < measures.length; i += chunkSize) {
    out.push(measures.slice(i, i + chunkSize));
  }
  if (out.length >= 2 && out[out.length - 1].length === 1 && chunkSize > 1) {
    const last = out.pop();
    out[out.length - 1] = out[out.length - 1].concat(last);
  }
  return out;
}

// Fisher-Yates, deterministic-friendly: takes the chunk array and returns a
// shuffled copy. Used at every round start.
export function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
