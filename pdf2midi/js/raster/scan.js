// Scanned / image score page → the vector primitives omr.js understands.
//
// Instead of a separate recogniser for images, this rebuilds what a vector
// PDF would have given: staff lines, stems and barlines as lines, beams as
// filled shapes, ties as curves, and every symbol as a SMuFL glyph with its
// origin. The music logic (rhythm, pitch, ties, tuplets…) is then shared.
//
// Steps, on a deskewed, binarised page:
//  1. staff metrics (line thickness, staff space) from run lengths;
//  2. staff lines: rows covered by long horizontal runs, grouped in fives;
//  3. staff-line and ledger-line removal (keeping pixels symbols need);
//  4. isolated symbols (clefs, rests, accidentals, digits) matched against
//     rasterised Bravura / Leland glyphs;
//  5. noteheads: template matching at every staff position;
//  6. stems (thin vertical runs starting at a head) and barlines;
//  7. beams and flags on what remains around stem ends;
//  8. augmentation dots and tie/slur curves.

import { binarize, estimateSkew, rotateGray, staffMetrics, components, integral, resizeGray } from './image.js';

const TARGET_SP = 14;
import { rasterGlyph, holeMask, dice, FONTS } from './templates.js';

// Symbols recognised by shape, with their SMuFL code points.
const CLASSES = [
  ...[0xE4E3, 0xE4E5, 0xE4E6, 0xE4E7, 0xE4E8].map(cp => ({ cp, kind: 'rest' })),
  ...[0xE260, 0xE261, 0xE262, 0xE263, 0xE264].map(cp => ({ cp, kind: 'acc' })),
  ...[0xE883, 0xE885, 0xE886].map(cp => ({ cp, kind: 'tuplet' }))
];
const FLAGS = [0xE240, 0xE241, 0xE242, 0xE243, 0xE244, 0xE245];
const HEAD_BLACK = 0xE0A4, HEAD_HALF = 0xE0A3, HEAD_WHOLE = 0xE0A2;

// Dice between all ink in a template-sized window and the template.
function windowDice(bin, x0, y0, t) {
  const { width: W, height: H, data } = bin;
  let inter = 0, ink = 0;
  for (let y = 0; y < t.h; y++) {
    const Y = y0 + y;
    if (Y < 0 || Y >= H) continue;
    for (let x = 0; x < t.w; x++) {
      const X = x0 + x;
      if (X < 0 || X >= W || !data[Y * W + X]) continue;
      ink++;
      if (t.mask[y * t.w + x]) inter++;
    }
  }
  return (2 * inter) / (ink + t.area);
}

// Same, skipping staff-line rows (in both image and template): symbols that
// staff-line removal broke into pieces are compared whole.
function maskedDice(bin, x0, y0, t, skipRow) {
  const { width: W, height: H, data } = bin;
  let inter = 0, ink = 0, area = 0;
  for (let y = 0; y < t.h; y++) {
    const Y = y0 + y;
    if (Y < 0 || Y >= H || skipRow[Y]) continue;
    for (let x = 0; x < t.w; x++) {
      const X = x0 + x;
      const m = t.mask[y * t.w + x];
      if (m) area++;
      if (X < 0 || X >= W || !data[Y * W + X]) continue;
      ink++;
      if (m) inter++;
    }
  }
  return ink + area ? (2 * inter) / (ink + area) : 0;
}

function eraseUnder(img, x0, y0, t, pad) {
  const { width: W, height: H } = img;
  for (let y = -pad; y < t.h + pad; y++) for (let x = -pad; x < t.w + pad; x++) {
    const X = x0 + x, Y = y0 + y;
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    let near = false;
    for (let yy = -pad; yy <= pad && !near; yy++) for (let xx = -pad; xx <= pad && !near; xx++) {
      const tx = x + xx, ty = y + yy;
      if (tx >= 0 && ty >= 0 && tx < t.w && ty < t.h && t.mask[ty * t.w + tx]) near = true;
    }
    if (near) img.data[Y * W + X] = 0;
  }
}

const noSkip = new Map();
const NO_SKIP = h => { if (!noSkip.has(h)) noSkip.set(h, new Uint8Array(h)); return noSkip.get(h); };

function copy(img) { return { width: img.width, height: img.height, data: new Uint8Array(img.data) }; }

// Horizontal black runs of one row: [x0, x1) pairs.
function rowRuns(bin, y) {
  const { width: w, data } = bin;
  const runs = [];
  let x = 0;
  const row = y * w;
  while (x < w) {
    while (x < w && !data[row + x]) x++;
    const s = x;
    while (x < w && data[row + x]) x++;
    if (x > s) runs.push([s, x]);
  }
  return runs;
}

// Length of the vertical ink run through (x, y) and its extent.
function vRun(bin, x, y) {
  const { width: w, height: h, data } = bin;
  if (!data[y * w + x]) return null;
  let a = y, b = y;
  while (a > 0 && data[(a - 1) * w + x]) a--;
  while (b < h - 1 && data[(b + 1) * w + x]) b++;
  return [a, b];
}

// ---------------------------------------------------------------- staves

export function findStaffLines(bin, sp, lt) {
  const { width: w, height: h } = bin;
  const minRun = Math.round(3 * sp);
  const cover = new Float64Array(h);
  const spans = [];
  for (let y = 0; y < h; y++) {
    let c = 0, x0 = w, x1 = 0;
    // Bridge gaps of a couple of pixels: resampled or faint lines break up.
    const runs = [];
    for (const r of rowRuns(bin, y)) {
      const last = runs[runs.length - 1];
      if (last && r[0] - last[1] <= 3) last[1] = r[1]; else runs.push([r[0], r[1]]);
    }
    for (const [a, b] of runs) {
      if (b - a >= minRun) { c += b - a; if (a < x0) x0 = a; if (b > x1) x1 = b; }
    }
    cover[y] = c;
    spans.push([x0, x1]);
  }
  const minCover = 8 * sp;
  // Bands of consecutive rows → line centres.
  // Keep rows close to their local maximum: a staff line covers the whole
  // staff width, a beam touching it only its group of notes.
  const r = Math.max(2, Math.round(0.4 * sp));
  const keep = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    if (cover[y] < minCover) continue;
    let m = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, cover[k]);
    if (cover[y] >= 0.7 * m) keep[y] = 1;
  }
  const bands = [];
  for (let y = 0; y < h; y++) {
    if (!keep[y]) continue;
    let y1 = y, wsum = 0, ysum = 0, x0 = w, x1 = 0;
    while (y1 < h && keep[y1]) {
      wsum += cover[y1]; ysum += cover[y1] * y1;
      x0 = Math.min(x0, spans[y1][0]); x1 = Math.max(x1, spans[y1][1]);
      y1++;
    }
    // Staff lines are thin; long horizontal beams are not.
    if (y1 - y <= lt + 3) bands.push({ y: ysum / wsum, y0: y, y1: y1 - 1, x0, x1, cover: wsum });
    y = y1;
  }
  if (findStaffLines.debug) findStaffLines.debug(bands);
  // Five equally spaced overlapping bands make a staff. Every band is tried
  // as a top line; the most regular, best covered candidates win.
  const cands = [];
  for (let i = 0; i < bands.length; i++) {
    const group = [i];
    let ok = true;
    for (let n = 1; n < 5 && ok; n++) {
      const want = bands[group[n - 1]].y + sp;
      let best = -1, bd = Infinity;
      for (let j = group[n - 1] + 1; j < bands.length && bands[j].y < want + 0.35 * sp; j++) {
        const d = Math.abs(bands[j].y - want);
        const ov = Math.min(bands[j].x1, bands[i].x1) - Math.max(bands[j].x0, bands[i].x0);
        if (d < bd && d <= 0.3 * sp && ov > 0.5 * (bands[i].x1 - bands[i].x0)) { bd = d; best = j; }
      }
      if (best < 0) ok = false; else group.push(best);
    }
    if (!ok) continue;
    const ls = group.map(k => bands[k]);
    const gaps = ls.slice(1).map((l, k) => l.y - ls[k].y);
    const mean = gaps.reduce((x, y) => x + y, 0) / 4;
    const dev = gaps.reduce((x, g) => x + Math.abs(g - mean), 0) / 4;
    const cov = Math.min(...ls.map(l => l.cover));
    cands.push({ group, ls, score: cov / (1 + dev) });
  }
  cands.sort((p, q) => q.score - p.score);
  const staves = [];
  const used = new Set();
  for (const c of cands) {
    if (c.group.some(k => used.has(k))) continue;
    const ls = c.ls;
    if (staves.some(s => ls[0].y < s.bottom + 0.5 * sp && ls[4].y > s.top - 0.5 * sp)) continue;
    c.group.forEach(k => used.add(k));
    staves.push({
      lines: ls,
      top: ls[0].y, bottom: ls[4].y,
      sp: (ls[4].y - ls[0].y) / 4,
      x0: Math.min(...ls.map(l => l.x0)), x1: Math.max(...ls.map(l => l.x1))
    });
  }
  staves.sort((p, q) => p.top - q.top);
  return staves;
}

// Erase a horizontal line's pixels where nothing else crosses it.
function eraseLine(img, orig, y0, y1, x0, x1, maxRun) {
  const { width: w, height: h } = img;
  for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
      const r = vRun(orig, x, y);
      if (!r) continue;
      if (r[1] - r[0] + 1 <= maxRun) for (let k = r[0]; k <= r[1]; k++) img.data[k * w + x] = 0;
      break;
    }
  }
}

// ---------------------------------------------------------------- main

export function scanPage(gray, options = {}) {
  const { pageWidth } = options;
  // Normalise the scale: every threshold below is in staff spaces, and a
  // staff space of ~14 px is both fast and detailed enough. Big scans shrink,
  // small screenshots grow.
  const origW = gray.width;
  let bin = binarize(gray);
  const first = staffMetrics(bin);
  const f = first.staffSpace >= 6 && first.staffSpace <= 80 ? TARGET_SP / first.staffSpace : 1;
  if (Math.abs(f - 1) > 0.15) { gray = resizeGray(gray, f); bin = binarize(gray); }
  const skew = estimateSkew(bin);
  if (Math.abs(skew) > 0.0005) bin = binarize(rotateGray(gray, skew));
  const { width: W, height: H } = bin;
  const { lineThickness: lt, staffSpace: spEst } = staffMetrics(bin);
  const toPt = (pageWidth || origW) / W;
  if (options.debugBin) options.debugBin(bin);
  const out = { width: W * toPt, height: H * toPt, glyphs: [], lines: [], shapes: [] };
  const stats = { skew, staffSpace: spEst, lineThickness: lt, staves: 0 };

  const staves = findStaffLines(bin, spEst, lt);
  stats.staves = staves.length;
  if (!staves.length) return { page: out, stats, transform: toOriginal(0, out.width, out.height) };
  const sp = staves.reduce((a, s) => a + s.sp, 0) / staves.length;
  const maxRun = Math.max(lt + 2, Math.round(lt * 1.6 + 1));

  const P = v => Math.round(v * toPt * 100) / 100;
  const glyph = (cp, x, y, wpx) => out.glyphs.push({ c: cp, x: P(x), y: P(y), size: P(4 * sp), w: P(wpx), rot: 0, font: 'scan' });
  const line = (x1, y1, x2, y2, lw) => out.lines.push({ x1: P(x1), y1: P(y1), x2: P(x2), y2: P(y2), lw: P(lw) });

  // --- 2/3. Staff lines out, ledger lines out --------------------------------
  const ns = copy(bin);
  for (const st of staves) {
    for (const l of st.lines) {
      line(st.x0, l.y, st.x1, l.y, lt);
      eraseLine(ns, bin, Math.floor(l.y - lt), Math.ceil(l.y + lt), st.x0 - 2, st.x1 + 2, maxRun);
    }
  }
  const ledgers = [];
  for (const st of staves) {
    for (const dir of [-1, 1]) {
      let prev = null; // x-ranges of the previous rung
      for (let k = 1; k <= 7; k++) {
        const yc = dir < 0 ? st.top - k * st.sp : st.bottom + k * st.sp;
        const found = [];
        for (let y = Math.round(yc - lt - 1); y <= Math.round(yc + lt + 1); y++) {
          if (y < 0 || y >= H) continue;
          for (const [a, b] of rowRuns(ns, y)) {
            const len = b - a;
            if (len < 1.4 * sp || len > 5 * sp || a < st.x0 - sp || b > st.x1 + sp) continue;
            // Thin at both ends (a ledger sticks out on either side of its note).
            const thin = x => { const r = vRun(ns, x, y); return r && r[1] - r[0] + 1 <= maxRun + 1; };
            if (!thin(a + 1) || !thin(b - 2)) continue;
            if (prev && !prev.some(([p0, p1]) => Math.min(p1, b) - Math.max(p0, a) > 0.3 * sp)) continue;
            if (!found.some(f => Math.min(f[1], b) - Math.max(f[0], a) > 0 && Math.abs(f[2] - y) <= lt + 1)) found.push([a, b, y]);
          }
        }
        if (!found.length) break;
        for (const [a, b, y] of found) {
          ledgers.push({ x0: a, x1: b, y });
          line(a, y, b, y, lt);
          eraseLine(ns, bin, y - lt - 1, y + lt + 1, a, b, maxRun);
        }
        prev = found;
      }
    }
  }

  // Heal: put staff-line pixels back where a symbol crosses the line, so
  // accidentals and clefs stay in one piece for shape matching.
  const healed = copy(ns);
  for (const st of staves) {
    for (const l of st.lines) {
      for (let x = Math.max(0, st.x0); x < Math.min(W, st.x1); x++) {
        const ya = Math.floor(l.y - lt), yb = Math.ceil(l.y + lt);
        const above = ya - 1 >= 0 && ns.data[(ya - 1) * W + x];
        const below = yb + 1 < H && ns.data[(yb + 1) * W + x];
        if (above && below) for (let y = ya; y <= yb; y++) if (bin.data[y * W + x]) healed.data[y * W + x] = 1;
      }
    }
  }

  const staffOf = y => {
    let best = null, bd = Infinity;
    for (const s of staves) {
      const d = y < s.top ? s.top - y : y > s.bottom ? y - s.bottom : 0;
      if (d < bd) { bd = d; best = s; }
    }
    return bd <= 7 * sp ? best : null;
  };

  // --- 4a. Clefs and time signatures, by sliding the templates -------------------
  const skipRow = new Uint8Array(H);
  for (const st of staves) for (const l of st.lines) {
    for (let y = Math.floor(l.y - lt); y <= Math.ceil(l.y + lt); y++) if (y >= 0 && y < H) skipRow[y] = 1;
  }
  const clefXs = [];
  for (const st of staves) {
    // Clefs sit at the start of each system (courtesy/mid-staff clefs are
    // smaller and left to the shape classifier).
    let best = null;
    for (const cp of [0xE050, 0xE062, 0xE05C]) for (const font of FONTS) {
      const t = rasterGlyph(font, cp, sp);
      if (!t) continue;
      for (const l of st.lines) {
        const oy = Math.round(l.y);
        for (let x = Math.round(st.x0); x < st.x0 + 4 * sp; x++) {
          const x0 = x + Math.min(0, t.ox), y0 = oy + t.oy;
          const s = maskedDice(bin, x0, y0, t, skipRow);
          if (!best || s > best.s) best = { s, t, cp, x0, y0, oy };
        }
      }
    }
    if (best && best.s > 0.6) {
      glyph(best.cp, best.x0 - best.t.ox, best.oy, best.t.adv);
      eraseUnder(healed, best.x0, best.y0, best.t, 2);
      eraseUnder(ns, best.x0, best.y0, best.t, 2);
      clefXs.push({ st, x: best.x0 + best.t.w });
    }
  }
  // Time signatures: a digit centred one space below the top line over one
  // centred one space above the bottom line (or C / cut C on the middle line).
  const digitTpls = [];
  for (const font of FONTS) for (let d = 0; d <= 9; d++) { const t = rasterGlyph(font, 0xE080 + d, sp); if (t) digitTpls.push({ d, t }); }
  const commonTpls = [0xE08A, 0xE08B].flatMap(cp => FONTS.map(f => ({ cp, t: rasterGlyph(f, cp, sp) }))).filter(o => o.t);
  const tsComps = components(healed).comps.filter(c => {
    const st = staffOf((c.y0 + c.y1) / 2);
    return st && c.y0 >= st.top - 0.6 * sp && c.y1 <= st.bottom + 0.6 * sp && c.y1 - c.y0 >= 1.5 * sp && c.x1 - c.x0 <= 3 * sp;
  });
  for (const c of tsComps) {
    const st = staffOf((c.y0 + c.y1) / 2);
    const fit = (tpls, cy) => {
      let b = null;
      for (const o of tpls) for (let dx = -2; dx <= 2; dx++) {
        const x0 = c.x0 + dx, y0 = Math.round(cy + o.t.oy);
        const s = maskedDice(bin, x0, y0, o.t, skipRow);
        if (!b || s > b.s) b = { ...o, s, x0, y0 };
      }
      return b;
    };
    const num = fit(digitTpls, st.top + st.sp), den = fit(digitTpls, st.bottom - st.sp);
    const com = fit(commonTpls, (st.top + st.bottom) / 2);
    const plausible = num && den && num.d >= 1 && [1, 2, 4, 8].includes(den.d);
    if (plausible && num.s > 0.65 && den.s > 0.65 && Math.min(num.s, den.s) > (com ? com.s : 0)) {
      for (const [o, cy] of [[num, st.top + st.sp], [den, st.bottom - st.sp]]) {
        glyph(0xE080 + o.d, o.x0 - o.t.ox, cy, o.t.adv);
        eraseUnder(healed, o.x0, o.y0, o.t, 2);
        eraseUnder(ns, o.x0, o.y0, o.t, 2);
      }
    } else if (com && com.s > 0.65) {
      glyph(com.cp, com.x0 - com.t.ox, (st.top + st.bottom) / 2, com.t.adv);
      eraseUnder(healed, com.x0, com.y0, com.t, 2);
      eraseUnder(ns, com.x0, com.y0, com.t, 2);
    }
  }

  // --- 4b. Other isolated symbols, by shape ----------------------------------------
  const { labels, comps } = components(healed);
  const work = copy(healed); // symbols get erased from this as they are explained
  const eraseComp = c => {
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (labels[y * W + x] === c.id) work.data[y * W + x] = 0;
  };
  // Words: small components in a row on a shared baseline with tight gaps.
  // Dynamics, expression marks and lyrics are left out of shape matching.
  const small = comps.filter(c => c.y1 - c.y0 <= 2.2 * sp && c.x1 - c.x0 <= 2.5 * sp && c.area > 4);
  const byX = [...small].sort((a, b) => a.x0 - b.x0);
  const inText = new Set();
  // A taller symbol set inside a line of text ("(♩ = 69)") belongs to it.
  for (const c of comps) {
    if (c.y1 - c.y0 <= 2.2 * sp || c.y1 - c.y0 > 3.5 * sp || c.x1 - c.x0 > 2 * sp) continue;
    const near = side => byX.some(o => Math.abs(o.y1 - c.y1) <= 0.35 * sp &&
      (side < 0 ? c.x0 - o.x1 >= -1 && c.x0 - o.x1 <= 1.2 * sp : o.x0 - c.x1 >= -1 && o.x0 - c.x1 <= 1.2 * sp));
    if (near(-1) && near(1)) inText.add(c);
  }
  for (const c of byX) {
    const mates = byX.filter(o => o !== c && Math.abs(o.y1 - c.y1) <= 0.35 * sp &&
      (Math.abs(o.x0 - c.x1) <= 0.7 * sp || Math.abs(c.x0 - o.x1) <= 0.7 * sp));
    if (mates.length >= 1 && mates.some(o => Math.abs(o.y1 - o.y0 - (c.y1 - c.y0)) < 0.8 * sp)) {
      // Two letters side by side on one baseline; a key signature's flats
      // sit at different heights, so they don't qualify.
      inText.add(c); mates.forEach(o => inText.add(o));
    }
  }
  const classified = [];
  const placedAcc = [];
  const unclassified = [];
  for (const c of comps) {
    if (inText.has(c)) continue;
    const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1;
    if (ch < 0.6 * sp && cw < 0.6 * sp) continue;
    const st = staffOf((c.y0 + c.y1) / 2);
    if (!st) continue;
    let best = null;
    for (const cl of CLASSES) {
      for (const font of FONTS) {
        const t = rasterGlyph(font, cl.cp, sp);
        if (!t) continue;
        const rw = cw / t.w, rh = ch / t.h;
        if (rw < (cl.kind === 'clef' ? 0.6 : 0.72) || rw > 1.35 || rh < 0.75 || rh > 1.3) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            // Clefs have detached parts (the F clef's dots): score them on
            // all ink under the template, not just this component.
            const s = cl.kind === 'clef'
              ? Math.max(dice(healed, labels, c, t, dx, dy), windowDice(healed, c.x0 + dx, c.y0 + dy, t))
              : dice(healed, labels, c, t, dx, dy);
            if (!best || s > best.s) best = { s, cl, t, dx, dy };
          }
        }
      }
    }
    if (options.debugComp) options.debugComp(c, best);
    if (!best || best.s < 0.62) { unclassified.push({ c, st, cw, ch }); continue; }
    classified.push({ c, ...best, st });
  }
  for (const k of classified) {
    const { c, cl, t, dx, dy, st } = k;
    let ox = c.x0 + dx - t.ox, oy = c.y0 + dy - t.oy;
    let cp = cl.cp;
    if (cl.kind === 'clef') {
      // Snap the clef's reference line onto the nearest staff line.
      const ly = st.lines.reduce((a, l) => (Math.abs(l.y - oy) < Math.abs(a - oy) ? l.y : a), st.lines[0].y);
      oy = ly;
    } else if (cl.kind === 'acc') {
      oy = st.bottom - Math.round((st.bottom - oy) / (st.sp / 2)) * (st.sp / 2);
    } else if (cl.kind === 'rest' && (cp === 0xE4E3)) {
      // Whole and half rests share a shape: a whole rest hangs from the
      // second line, a half rest sits on the middle line.
      const mid = (c.y0 + c.y1) / 2;
      const hangs = Math.abs(c.y0 - (st.top + st.sp)) < Math.abs(c.y1 - (st.top + 2 * st.sp));
      cp = hangs ? 0xE4E3 : 0xE4E4;
      oy = mid;
    }
    glyph(cp, ox, oy, t.adv);
    eraseComp(c);
  }
  // Components no single template explained: accidentals touching each
  // other or cut by staff-line removal, found by sliding the templates.
  // Share of a placed template's ink that belongs to big neighbouring
  // components (a note and its stem): an accidental doesn't overlap them.
  const big = comps.map(k => k.y1 - k.y0 > 3.5 * sp || k.area > 3 * sp * sp);
  const foreignInk = f => {
    let ink = 0, foreign = 0;
    for (let y = 0; y < f.t.h; y++) {
      const Y = f.y + y;
      if (Y < 0 || Y >= H || skipRow[Y]) continue;
      for (let x = 0; x < f.t.w; x++) {
        const X = f.x + x;
        if (X < 0 || X >= W || !f.t.mask[y * f.t.w + x]) continue;
        const l = labels[Y * W + X];
        if (!l) continue;
        ink++;
        if (big[l - 1]) foreign++;
      }
    }
    return ink ? foreign / ink : 1;
  };
  const classifiedAcc = classified.filter(k => k.cl.kind === 'acc').map(k => ({ x: k.c.x0, y: k.c.y0, t: k.t }));
  for (const { c, st, cw, ch } of unclassified) {
    // Touching accidentals (key signatures, chord columns) form one wide
    // component: slide the accidental templates along it.
    // Also catches accidentals that staff-line removal cut in two (a
    // flat's bowl on a line): matching skips staff-line rows.
    if (cw <= 8 * sp && ch >= 0.9 * sp && ch <= 4 * sp) {
      const found = [];
      for (let x = Math.round(c.x0 - sp); x < c.x1; x++) {
        let b = null;
        for (const cp of [0xE260, 0xE261, 0xE262]) for (const font of FONTS) {
          const t = rasterGlyph(font, cp, sp);
          if (!t || t.w > cw + sp) continue;
          for (let y = Math.round(c.y0 - 1.5 * sp); y <= c.y1 - t.h + 1.5 * sp; y++) {
            const sc = maskedDice(healed, x, y, t, skipRow);
            if (!b || sc > b.s) b = { s: sc, t, cp, x, y };
          }
        }
        if (b && b.s > 0.74 && foreignInk(b) < 0.15) found.push(b);
      }
      found.sort((a, b) => b.s - a.s);
      const picked = [];
      for (const f of found) {
        if (placedAcc.concat(picked, classifiedAcc).some(p => Math.abs(p.x - f.x) < 0.6 * f.t.w && Math.abs(p.y - f.y) < 0.6 * f.t.h)) continue;
        picked.push(f);
      }
      // Keep them only if they explain the component (not a note's stem).
      let covered = 0, total = 0;
      for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
        if (labels[y * W + x] !== c.id || skipRow[y]) continue;
        total++;
        if (picked.some(f => { const tx = x - f.x, ty = y - f.y; return tx >= -1 && ty >= -1 && tx <= f.t.w && ty <= f.t.h; })) covered++;
      }
      if (!total || covered / total < 0.8) continue;
      for (const f of picked) {
        placedAcc.push(f);
        const oy = st.bottom - Math.round((st.bottom - (f.y - f.t.oy)) / (st.sp / 2)) * (st.sp / 2);
        glyph(f.cp, f.x - f.t.ox, oy, f.t.adv);
        eraseUnder(work, f.x, f.y, f.t, 1);
      }
    }
  }
  stats.symbols = classified.length;

  // --- 5. Noteheads -------------------------------------------------------------
  const ii = integral(work);
  const heads = [];
  const tBlack = FONTS.map(f => rasterGlyph(f, HEAD_BLACK, sp)).filter(Boolean);
  const tHollow = [HEAD_HALF, HEAD_WHOLE].flatMap(cp => FONTS.map(f => rasterGlyph(f, cp, sp)).filter(Boolean)
    .map(t => {
      const sectors = Array.from({ length: 8 }, () => []);
      const cx = t.w / 2, cy = t.h / 2;
      for (let i = 0; i < t.mask.length; i++) {
        if (!t.mask[i]) continue;
        const y = (i / t.w) | 0, x = i - y * t.w;
        const a = Math.atan2((y + 0.5 - cy) / t.h, (x + 0.5 - cx) / t.w) + Math.PI;
        sectors[Math.min(7, Math.floor(a / (Math.PI / 4)))].push(i);
      }
      return { ...t, ...holeMask(t), sectors };
    }));
  const scoreAt = (t, x0, y0, hollow) => {
    let on = 0;
    for (let y = 0; y < t.h; y++) {
      const row = (y0 + y) * W + x0;
      for (let x = 0; x < t.w; x++) if (t.mask[y * t.w + x] && work.data[row + x]) on++;
    }
    const fill = on / t.area;
    if (!hollow) return fill;
    let white = 0;
    for (let y = 0; y < t.h; y++) {
      const row = (y0 + y) * W + x0;
      for (let x = 0; x < t.w; x++) if (t.hole[y * t.w + x] && !work.data[row + x]) white++;
    }
    if (!t.n) return 0;
    // The ring must be closed: every eighth of it carries ink (rules out the
    // paper under beams, arpeggio wiggles, gaps between chord notes…).
    let worst = 1;
    for (const sec of t.sectors) {
      let ink = 0;
      for (const i of sec) {
        const y = (i / t.w) | 0, x = i - y * t.w;
        // Measured with staff lines in: a ring touching a line lost those
        // pixels when the lines were removed.
        if (bin.data[(y0 + y) * W + x0 + x]) ink++;
      }
      worst = Math.min(worst, sec.length ? ink / sec.length : 1);
    }
    if (worst < 0.4) return 0;
    return Math.min(fill / 0.85, white / t.n);
  };
  // Outside the head shape, at least two of its bounding-box corners are paper
  // (rules out beams, clef blobs and other solid areas).
  const cornersOk = (t, x0, y0) => {
    const q = Math.max(1, Math.round(Math.min(t.w, t.h) * 0.3));
    let white = 0;
    for (const [cx, cy] of [[0, 0], [t.w - q, 0], [0, t.h - q], [t.w - q, t.h - q]]) {
      let ink = 0, n = 0;
      for (let y = cy; y < cy + q; y++) for (let x = cx; x < cx + q; x++) {
        if (t.mask[y * t.w + x]) continue;
        n++;
        if (work.data[(y0 + y) * W + x0 + x]) ink++;
      }
      if (n === 0 || ink / n < 0.4) white++;
    }
    return white >= 2;
  };
  for (const st of staves) {
    const half = st.sp / 2;
    for (let k = -14; k <= 22; k++) {
      const yc = st.bottom - k * half;
      for (const [tpls, hollow, minFill] of [[tBlack, false, 0.8], [tHollow, true, 0.62]]) {
        for (const t of tpls) {
          for (let yj = -Math.ceil(sp / 4); yj <= Math.ceil(sp / 4); yj++) {
            const y0 = Math.round(yc + t.oy + yj);
            if (y0 < 0 || y0 + t.h >= H) continue;
            for (let x0 = Math.max(0, Math.round(st.x0)); x0 < Math.min(W - t.w, st.x1); x0++) {
              // O(1) pre-checks: a black head's centre is solid ink, a hollow
              // head's centre is paper; most positions stop here.
              const cw2 = Math.max(1, Math.round(t.w * (hollow ? 0.15 : 0.2))), ch2 = Math.max(1, Math.round(t.h * (hollow ? 0.15 : 0.2)));
              const cx0 = x0 + (t.w >> 1) - cw2, cy0 = y0 + (t.h >> 1) - ch2;
              const centre = ii.count(cx0, cy0, cx0 + 2 * cw2, cy0 + 2 * ch2) / (4 * cw2 * ch2);
              if (hollow ? centre > 0.6 : centre < 0.6) continue;
              const box = ii.count(x0, y0, x0 + t.w, y0 + t.h) / (t.w * t.h);
              if (box < (hollow ? 0.3 : 0.55)) continue;
              const s = scoreAt(t, x0, y0, hollow);
              if (s < minFill || !cornersOk(t, x0, y0)) continue;
              heads.push({ x: x0 - t.ox, y: yc, w: t.w, h: t.h, s, hollow, cp: t.cp, t, x0, y0, st, k });
            }
          }
        }
      }
    }
  }
  // A head more than one step outside the staff hangs on a ladder of ledger
  // lines: every rung between it and the staff must be there (this rejects
  // text, pedal marks and dynamics around the staves).
  const ladderOk = h => {
    const k = h.k;
    const rungs = [];
    if (k <= -2) for (let r = 1; r <= Math.floor(-k / 2); r++) rungs.push(h.st.bottom + r * h.st.sp);
    if (k >= 10) for (let r = 1; r <= Math.floor((k - 8) / 2); r++) rungs.push(h.st.top - r * h.st.sp);
    // Each rung runs under the whole head.
    return rungs.every(y => ledgers.some(l => Math.abs(l.y - y) <= lt + 2 && l.x0 <= h.x + 0.3 * sp && l.x1 >= h.x + h.w - 0.3 * sp));
  };
  // Letters of words are not noteheads.
  const textLabel = new Set([...inText].map(c => c.id));
  const inWord = h => {
    let n = 0, w = 0;
    for (let y = 0; y < h.t.h; y++) for (let x = 0; x < h.t.w; x++) {
      if (!h.t.mask[y * h.t.w + x]) continue;
      const l = labels[(h.y0 + y) * W + h.x0 + x];
      if (!l) continue;
      n++;
      if (textLabel.has(l)) w++;
    }
    return n && w / n > 0.5;
  };
  for (let i = heads.length - 1; i >= 0; i--) if (!ladderOk(heads[i]) || inWord(heads[i])) heads.splice(i, 1);
  // Non-maximum suppression.
  heads.sort((a, b) => b.s - a.s);
  const kept = [];
  for (const h of heads) {
    if (kept.some(k => Math.abs(k.x - h.x) < 0.75 * Math.max(k.w, h.w) && Math.abs(k.y - h.y) < 0.6 * sp)) continue;
    kept.push(h);
  }
  stats.heads = kept.length;

  // --- 6. Stems and barlines ------------------------------------------------------
  // Vertical runs ≥ 1.5 spaces, linked across adjacent columns.
  const segs = [];
  let open = [];
  for (let x = 0; x < W; x++) {
    const runs = [];
    let y = 0;
    while (y < H) {
      while (y < H && !ns.data[y * W + x]) y++;
      const s = y;
      while (y < H && ns.data[y * W + x]) y++;
      if (y - s >= 1.5 * sp) runs.push([s, y - 1]);
    }
    const next = [];
    for (const r of runs) {
      const seg = open.find(o => Math.abs(o.ly0 - r[0]) <= 0.35 * sp && Math.abs(o.ly1 - r[1]) <= 0.35 * sp);
      if (seg) {
        seg.x1 = x; seg.ys0.push(r[0]); seg.ys1.push(r[1]); seg.ly0 = r[0]; seg.ly1 = r[1];
        next.push(seg); open = open.filter(o => o !== seg);
      } else {
        const s = { x0: x, x1: x, ys0: [r[0]], ys1: [r[1]], ly0: r[0], ly1: r[1] };
        segs.push(s); next.push(s);
      }
    }
    open = next;
  }
  const med = a => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
  let verticals = segs
    .filter(s => s.x1 - s.x0 + 1 <= Math.max(3, 0.45 * sp))
    .map(s => ({ x0: s.x0, x1: s.x1, y0: Math.min(...s.ys0), y1: Math.max(...s.ys1) }))
    .sort((a, b) => a.x0 - b.x0);
  // A stem whose columns end at different heights (antialiasing, a head or
  // ledger alongside) comes out as neighbouring pieces: merge them.
  const merged = [];
  for (const v of verticals) {
    const m = merged.find(o => v.x0 - o.x1 <= 2 && Math.min(o.y1, v.y1) - Math.max(o.y0, v.y0) > 0.5 * Math.min(o.y1 - o.y0, v.y1 - v.y0));
    if (m) { m.x1 = Math.max(m.x1, v.x1); m.y0 = Math.min(m.y0, v.y0); m.y1 = Math.max(m.y1, v.y1); }
    else merged.push({ ...v });
  }
  verticals = merged
    .filter(v => v.x1 - v.x0 + 1 <= Math.max(4, 0.5 * sp))
    .map(v => ({ ...v, x: (v.x0 + v.x1 + 1) / 2, w: v.x1 - v.x0 + 1 }));
  if (options.debugVert) options.debugVert(segs, verticals, kept);

  // Stems: vertical runs that start on a notehead's edge and stick out of the
  // chord. Returns them with their tip (the end away from the heads).
  const findStems = heads => {
    const found = [];
    for (const v of verticals) {
      const attached = heads.filter(h => (Math.abs(v.x - (h.x + h.w)) < 0.4 * sp || Math.abs(v.x - h.x) < 0.4 * sp) &&
        h.y >= v.y0 - 0.7 * sp && h.y <= v.y1 + 0.7 * sp);
      if (!attached.length || v.y1 - v.y0 < 2 * sp) continue;
      const hy0 = Math.min(...attached.map(h => h.y)), hy1 = Math.max(...attached.map(h => h.y));
      if (Math.max(hy0 - v.y0, v.y1 - hy1) < 1.5 * sp) continue;
      if (!attached.some(h => Math.abs(h.y - v.y0) < 0.8 * sp || Math.abs(h.y - v.y1) < 0.8 * sp)) continue;
      const up = (v.y1 - hy1) < (hy0 - v.y0);
      found.push({ v, up, tip: up ? v.y0 : v.y1 });
    }
    return found;
  };
  // Blurred scans make the stem/beam junction look like a black notehead,
  // which then flips the stem. Find the beams once, drop "heads" sitting on
  // a beam, and only then settle the stems.
  {
    const pre = findStems(kept).sort((a, b) => a.v.x - b.v.x);
    const band = (x, y) => [-1, 0, 1].some(d => { const X = Math.round(x), Y = Math.round(y + d); return X >= 0 && Y >= 0 && X < W && Y < H && work.data[Y * W + X]; });
    const falseHeads = new Set();
    for (let i = 0; i < pre.length; i++) {
      const a = pre[i];
      for (let j = i + 1; j < pre.length && pre[j].v.x - a.v.x <= 12 * sp; j++) {
        const b = pre[j];
        if (b.v.x - a.v.x < 0.8 * sp) continue;
        const ya = a.tip + (a.up ? 1 : -1) * 0.25 * sp, yb = b.tip + (b.up ? 1 : -1) * 0.25 * sp;
        let ok = 0, n = 0;
        for (let x = a.v.x1 + 1; x < b.v.x0; x++) { n++; if (band(x, ya + (yb - ya) * (x - a.v.x) / (b.v.x - a.v.x))) ok++; }
        if (!n || ok / n < 0.92) continue;
        for (const h of kept) {
          if (h.hollow) continue;
          const cx = h.x + h.w / 2;
          if (cx < a.v.x - 0.8 * sp || cx > b.v.x + 0.8 * sp) continue;
          const by = ya + (yb - ya) * (cx - a.v.x) / (b.v.x - a.v.x);
          if (Math.abs(h.y - by) < 0.45 * sp) falseHeads.add(h);
        }
        break;
      }
    }
    if (falseHeads.size) for (let i = kept.length - 1; i >= 0; i--) if (falseHeads.has(kept[i])) kept.splice(i, 1);
  }
  // Systems: staves joined by a vertical line running through both (the
  // system's opening line, grand-staff barlines).
  const spanned = v => staves.filter(s => v.y0 <= s.top + lt + 1 && v.y1 >= s.bottom - lt - 1);
  const sysOf = new Map(staves.map(s => [s, s]));
  const root = s => { while (sysOf.get(s) !== s) s = sysOf.get(s); return s; };
  for (const v of verticals) {
    const sp2 = spanned(v);
    for (let i = 1; i < sp2.length; i++) sysOf.set(root(sp2[i]), root(sp2[0]));
  }
  const systemStaves = s => staves.filter(o => root(o) === root(s));
  const isBarline = (v, attached) => {
    const sp2 = spanned(v);
    if (!sp2.length) return false;
    const sys = systemStaves(sp2[0]);
    // Through every staff of a multi-staff system: a barline, whatever is near.
    if (sys.length > 1) return sys.every(o => sp2.includes(o));
    return !attached.length;
  };
  const stems = [];
  for (const v of verticals) {
    const len = v.y1 - v.y0;
    // A stem starts at a notehead: one end within a head, on the head's edge.
    const attached = kept.filter(h => (Math.abs(v.x - (h.x + h.w)) < 0.4 * sp || Math.abs(v.x - h.x) < 0.4 * sp) &&
      h.y >= v.y0 - 0.7 * sp && h.y <= v.y1 + 0.7 * sp);
    // …and sticks out of the chord: stacked heads' outlines also make short
    // vertical runs.
    const hy0 = attached.length ? Math.min(...attached.map(h => h.y)) : 0;
    const hy1 = attached.length ? Math.max(...attached.map(h => h.y)) : 0;
    const protrudes = Math.max(hy0 - v.y0, v.y1 - hy1) >= 1.5 * sp;
    const endsAtHead = protrudes && attached.some(h => Math.abs(h.y - v.y0) < 0.8 * sp || Math.abs(h.y - v.y1) < 0.8 * sp);
    if (isBarline(v, attached)) {
      line(v.x, v.y0, v.x, v.y1, v.w);
    } else if (endsAtHead && len >= 2 * sp) {
      // The tip is the end away from the noteheads.
      v.up = (v.y1 - hy1) < (hy0 - v.y0) ? true : false;
      v.tip = v.up ? v.y0 : v.y1;
      stems.push(v);
      line(v.x, v.y0, v.x, v.y1, v.w);
    } else continue;
    v.erase = true;
  }
  // Stems stay in the image until beams are read (erasing them would cut
  // each beam into pieces); barlines go now.
  const eraseVertical = v => {
    for (let y = v.y0; y <= v.y1; y++) for (let x = Math.max(0, v.x0 - 1); x <= Math.min(W - 1, v.x1 + 1); x++) work.data[y * W + x] = 0;
  };
  for (const v of verticals) if (v.erase && !stems.includes(v)) eraseVertical(v);

  // Heads: hollow heads with a stem are halves, without are wholes.
  for (const h of kept) {
    let cp = HEAD_BLACK;
    if (h.hollow) {
      const hasStem = stems.some(v => (Math.abs(v.x - (h.x + h.w)) < 0.4 * sp || Math.abs(v.x - h.x) < 0.4 * sp) &&
        h.y >= v.y0 - 0.7 * sp && h.y <= v.y1 + 0.7 * sp);
      cp = hasStem ? HEAD_HALF : HEAD_WHOLE;
    }
    glyph(cp, h.x, h.y, h.w);
    // Erase the head so beams, flags and dots stand alone.
    for (let y = 0; y < h.t.h; y++) for (let x = 0; x < h.t.w; x++) {
      if (h.t.mask[y * h.t.w + x] || (h.hollow && h.t.hole[y * h.t.w + x])) {
        // One pixel of margin takes the anti-aliased rim with it.
        for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
          const X = h.x0 + x + xx, Y = h.y0 + y + yy;
          if (X >= 0 && Y >= 0 && X < W && Y < H) work.data[Y * W + X] = 0;
        }
      }
    }
  }

  // --- 7. Beams and flags -----------------------------------------------------------
  // Beams are rebuilt stem by stem: two neighbouring stems are beamed when a
  // thick band of ink joins their tips in a straight line. (Components are
  // no use here: separate beam groups often touch.)
  const rest = components(work);
  const beamThick = 0.5 * sp, beamGap = 0.25 * sp;
  const inkAt = (x, y) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < W && Y < H && work.data[Y * W + X] === 1; };
  const bandAt = (x, y) => inkAt(x, y) || inkAt(x, y - 1) || inkAt(x, y + 1);
  const joined = (a, b) => {
    const ia = a.up ? 1 : -1, ib = b.up ? 1 : -1;
    const ya = a.tip + ia * 0.25 * sp, yb = b.tip + ib * 0.25 * sp;
    let ok = 0, n = 0;
    for (let x = a.x1 + 1; x < b.x0; x++) {
      const y = ya + (yb - ya) * (x - a.x) / (b.x - a.x);
      n++;
      if (bandAt(x, y)) ok++;
    }
    return n > 0 && ok / n >= 0.92;
  };
  // Beam levels beside a stem: thick runs stacked inwards from its tip.
  const levelsAt = v => {
    let best = [];
    for (const xx of [Math.round(v.x0 - 0.3 * sp), Math.round(v.x1 + 0.3 * sp)]) {
      if (xx < 0 || xx >= W) continue;
      const levels = [];
      const dir = v.up ? 1 : -1;
      let y = Math.round(v.tip - dir * 0.3 * sp);
      const limit = v.tip + dir * 3 * sp;
      // skip to the first ink near the tip
      while ((dir > 0 ? y < limit : y > limit) && !work.data[y * W + xx]) y += dir;
      if (Math.abs(y - v.tip) > 0.7 * sp) { if (best.length === 0) best = []; continue; }
      while (dir > 0 ? y < limit : y > limit) {
        const s0 = y;
        while ((dir > 0 ? y < limit : y > limit) && work.data[y * W + xx]) y += dir;
        const len = Math.abs(y - s0);
        if (len < 0.33 * sp) break;
        const n = Math.max(1, Math.round((len + beamGap) / (beamThick + beamGap)));
        for (let k = 0; k < n; k++) levels.push(s0 + dir * (k + 0.5) * len / n);
        const g0 = y;
        while ((dir > 0 ? y < limit : y > limit) && !work.data[y * W + xx]) y += dir;
        if (Math.abs(y - g0) > 0.6 * sp) break;
      }
      if (levels.length > best.length) best = levels;
    }
    return best;
  };
  const sortedStems = [...stems].sort((a, b) => a.x - b.x);
  const next = new Map();
  for (let i = 0; i < sortedStems.length; i++) {
    const a = sortedStems[i];
    for (let j = i + 1; j < sortedStems.length; j++) {
      const b = sortedStems[j];
      if (b.x - a.x > 12 * sp) break;
      if (b.x - a.x < 0.8 * sp) continue;
      if (staffOf(a.tip) !== staffOf(b.tip) && Math.abs(a.tip - b.tip) > 4 * sp) continue;
      if (joined(a, b)) { next.set(a, b); break; }
    }
  }
  const hasPrev = new Set(next.values());
  const t2 = beamThick / 2;
  const beamShape = (x0, y0, x1, y1) => out.shapes.push({ kind: 'fill', curve: false, lw: 0,
    bbox: [P(x0), P(Math.min(y0, y1) - t2), P(x1), P(Math.max(y0, y1) + t2)],
    pts: [[P(x0), P(y0 - t2)], [P(x1), P(y1 - t2)], [P(x1), P(y1 + t2)], [P(x0), P(y0 + t2)], [P(x0), P(y0 - t2)]] });
  const beamed = new Set();
  for (const first of sortedStems) {
    if (hasPrev.has(first) || !next.has(first)) continue;
    const chain = [first];
    while (next.has(chain[chain.length - 1])) chain.push(next.get(chain[chain.length - 1]));
    const last = chain[chain.length - 1];
    const cy = v => v.tip + (v.up ? 1 : -1) * t2;
    const ya = cy(first), yb = cy(last);
    beamShape(first.x, ya, last.x, yb);
    const primaryAt = x => ya + (yb - ya) * (x - first.x) / Math.max(1, last.x - first.x);
    for (const v of chain) {
      beamed.add(v);
      const py = primaryAt(v.x);
      if (options.debugBeam) options.debugBeam(v, levelsAt(v), py, chain.length);
      for (const y of levelsAt(v)) {
        if (Math.abs(y - py) < 0.45 * sp) continue;
        beamShape(v.x - 0.35 * sp, y, v.x + 0.35 * sp, y);
      }
    }
  }
  // Flags: ink to the right of an unbeamed stem's tip.
  for (const v of stems) {
    if (beamed.has(v)) continue;
    const c = rest.comps.find(k => {
      const p = Math.round(v.tip) * W + Math.round(v.x);
      return rest.labels[p] === k.id;
    });
    if (!c) continue;
    const ch = c.y1 - c.y0 + 1;
    let side = 0, reach = 0;
    for (let y = c.y0; y <= c.y1; y++) for (let x = v.x1 + 2; x <= c.x1; x++) {
      if (rest.labels[y * W + x] === c.id) { side++; reach = Math.max(reach, x - v.x1); }
    }
    if (side < 0.6 * sp * sp || reach < 0.6 * sp || reach > 2 * sp || ch < 1.2 * sp) continue;
    // Count the hooks: separate ink runs down the column just right of the stem.
    const xx = Math.round(v.x1 + 0.5 * sp);
    let hooks = 0, inRun = false;
    for (let y = c.y0; y <= c.y1; y++) {
      const on = rest.labels[y * W + xx] === c.id;
      if (on && !inRun) hooks++;
      inRun = on;
    }
    hooks = Math.max(1, Math.min(4, hooks));
    const cp = 0xE240 + 2 * (hooks - 1) + (v.up ? 0 : 1);
    glyph(cp, v.x, v.tip, sp);
    c.used = true;
  }
  // Beams are explained: erase the ink along them so leftovers are clean.
  for (const c of rest.comps) {
    if (c.used) continue;
    const touchesBeamed = [...beamed].some(v => v.x >= c.x0 - 1 && v.x <= c.x1 + 1 && v.tip >= c.y0 - 1 && v.tip <= c.y1 + 1);
    if (touchesBeamed && c.x1 - c.x0 >= sp) c.used = true;
  }

  // --- 8. Dots and curves ------------------------------------------------------------
  for (const c of rest.comps) {
    if (!c.used) continue;
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (rest.labels[y * W + x] === c.id) work.data[y * W + x] = 0;
  }
  stems.forEach(eraseVertical);
  const left = components(work);
  // A wiggle's left edge swings back and forth about every staff space.
  const isWiggle = c => {
    const xs = [];
    for (let y = c.y0; y <= c.y1; y++) {
      let x = c.x0;
      while (x <= c.x1 && left.labels[y * W + x] !== c.id) x++;
      if (x <= c.x1) xs.push(x);
    }
    let turns = 0, dir = 0;
    for (let i = 2; i < xs.length; i += 2) {
      const d = Math.sign(xs[i] - xs[i - 2]);
      if (d && d !== dir) { if (dir) turns++; dir = d; }
    }
    return turns >= 2 * (c.y1 - c.y0) / sp - 1 && turns >= 3;
  };
  for (const c of left.comps) {
    const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1;
    if (!staffOf((c.y0 + c.y1) / 2)) continue;
    if (ch >= 2 * sp && cw >= 0.3 * sp && cw <= 1.1 * sp && isWiggle(c)) {
      // Arpeggio: a narrow wavy column; emitted as stacked wiggle glyphs.
      for (let y = c.y0 + sp / 2; y <= c.y1; y += sp) glyph(0xEAA9, c.x0, y, cw);
      continue;
    }
    const dst = staffOf((c.y0 + c.y1) / 2);
    const nearStaff = dst && c.y0 >= dst.top - 4 * sp && c.y1 <= dst.bottom + 4 * sp;
    if (nearStaff && cw <= 0.7 * sp && ch <= 0.7 * sp && cw >= 0.28 * sp && ch >= 0.28 * sp &&
        Math.abs(cw - ch) <= 0.35 * Math.max(cw, ch) && c.area >= 0.6 * cw * ch) {
      glyph(0xE1E7, c.x0, (c.y0 + c.y1) / 2, cw);
      continue;
    }
    if (cw >= 1.5 * sp && ch <= Math.max(1.6 * sp, 0.4 * cw) && c.area / cw <= 0.45 * sp) {
      // Tie or slur: sample its centre line.
      const pts = [];
      const step = Math.max(1, Math.floor(cw / 12));
      for (let x = c.x0; x <= c.x1; x += step) {
        let s = 0, n = 0;
        for (let y = c.y0; y <= c.y1; y++) if (left.labels[y * W + x] === c.id) { s += y; n++; }
        if (n) pts.push([P(x), P(s / n)]);
      }
      if (pts.length >= 3) out.shapes.push({ kind: 'fillStroke', curve: true, lw: 0, bbox: [P(c.x0), P(c.y0), P(c.x1), P(c.y1)], pts });
    }
  }

  // Coordinates in the deskewed frame → original page, for display.
  return { page: out, stats, transform: toOriginal(skew, out.width, out.height) };
}

// Maps a point of the deskewed page (points) back onto the original page,
// e.g. to draw recognised notes over the scan as the user sees it.
export function toOriginal(skew, width, height) {
  const cx = width / 2, cy = height / 2, cs = Math.cos(skew), sn = Math.sin(skew);
  return ({ x, y }) => {
    const dx = x - cx, dy = y - cy;
    return { x: cs * dx - sn * dy + cx, y: sn * dx + cs * dy + cy };
  };
}
