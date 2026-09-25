import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { scanPage } from '../pdf2midi/js/raster/scan.js';
import { rotateGray } from '../pdf2midi/js/raster/image.js';
import { recognize } from '../pdf2midi/js/omr.js';
import { readMidi } from './helpers/midi.js';

// Image recognition: a 200 dpi greyscale render of the Autumn Leaves page,
// read as a picture, compared with the MIDI MuseScore exported for it.
const dir = new URL('./fixtures/pdf2midi/', import.meta.url);

function readPgm(buf) {
  let i = 0;
  const fields = [];
  while (fields.length < 4) {
    let s = '';
    while (buf[i] !== 0x0a && buf[i] !== 0x20) s += String.fromCharCode(buf[i++]);
    i++;
    if (s) fields.push(s);
  }
  const width = +fields[1], height = +fields[2];
  return { width, height, data: new Uint8Array(buf.subarray(i, i + width * height)) };
}

const clean = readPgm(zlib.gunzipSync(fs.readFileSync(new URL('autumn-leaves.page1.pgm.gz', dir))));
const ref = readMidi(new Uint8Array(fs.readFileSync(new URL('autumn-leaves.mid', dir)))).tracks.filter(t => t.notes.length);

// What a cheap scan does to a page: a slight rotation, blur, grey paper with
// uneven lighting, and sensor noise (seeded, so the test is deterministic).
function degrade(img) {
  const rot = rotateGray(img, 0.7 * Math.PI / 180);
  const { width: w, height: h } = rot;
  const out = new Uint8Array(w * h);
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h) { s += rot.data[Y * w + X]; n++; }
      }
      const light = 232 - 30 * ((x / w - 0.3) ** 2 + (y / h - 0.6) ** 2);
      const v = (s / n) / 255 * light + (rand() + rand() + rand() - 1.5) * 16;
      out[y * w + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return { width: w, height: h, data: out };
}

function score(result) {
  let tp = 0, fp = 0, fn = 0;
  result.tracks.forEach((tr, i) => {
    const pool = ref[i].notes.map(n => ({ ...n, used: false }));
    for (const n of tr.notes) {
      const m = pool.find(x => !x.used && x.pitch === n.pitch && Math.abs(x.start - n.start) <= 0.2);
      if (m) { m.used = true; tp++; } else fp++;
    }
    fn += pool.filter(x => !x.used).length;
  });
  return { precision: tp / (tp + fp), recall: tp / (tp + fn) };
}

test('reads a clean image of a score', () => {
  const { page, stats } = scanPage(clean, { pageWidth: 595 });
  assert.equal(stats.staves, 10);
  const r = recognize({ pages: [page] });
  assert.equal(r.measures.length, 33);
  assert.deepEqual(r.keySigs[0], { time: 0, fifths: -2 });
  const s = score(r);
  assert.ok(s.precision >= 0.88, `precision ${s.precision}`);
  assert.ok(s.recall >= 0.88, `recall ${s.recall}`);
});

test('reads a skewed, noisy scan of the same page', () => {
  const { page, stats } = scanPage(degrade(clean), { pageWidth: 595 });
  assert.equal(stats.staves, 10);
  assert.ok(Math.abs(Math.abs(stats.skew) - 0.7 * Math.PI / 180) < 0.1 * Math.PI / 180, `skew ${stats.skew}`);
  const r = recognize({ pages: [page] });
  assert.equal(r.measures.length, 33);
  const s = score(r);
  // Regression floor, not a target: raise it as recognition improves.
  assert.ok(s.precision >= 0.44, `precision ${s.precision}`);
  assert.ok(s.recall >= 0.42, `recall ${s.recall}`);
});

test('an image without music has no staves', () => {
  const blank = { width: 400, height: 300, data: new Uint8Array(400 * 300).fill(255) };
  const { stats } = scanPage(blank, { pageWidth: 595 });
  assert.equal(stats.staves, 0);
});
