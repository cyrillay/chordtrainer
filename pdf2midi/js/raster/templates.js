// SMuFL glyph outlines rasterised at the staff size of a scan, used to
// recognise isolated symbols (clefs, rests, accidentals, digits, flags) by
// shape overlap. Two fonts with different design (Bravura, Leland) give each
// symbol a couple of plausible shapes.

import GLYPHS from './glyphs.js';

const cache = new Map();

// Non-zero winding scanline fill of the glyph's polygons at `sp` pixels per
// staff space. Returns a mask plus the pixel offset of the SMuFL origin.
export function rasterGlyph(font, cp, sp) {
  const key = `${font}:${cp}:${sp.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key);
  const g = GLYPHS[font] && GLYPHS[font][cp.toString(16).toUpperCase()];
  if (!g) { cache.set(key, null); return null; }
  const [bx0, by0, bx1, by1] = g.bbox;
  const ox = Math.floor(bx0 * sp), oy = Math.floor(by0 * sp);
  const w = Math.max(1, Math.ceil(bx1 * sp) - ox), h = Math.max(1, Math.ceil(by1 * sp) - oy);
  const edges = [];
  for (const c of g.c) {
    const n = c.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = c[2 * i] * sp - ox, y1 = c[2 * i + 1] * sp - oy;
      const x2 = c[2 * j] * sp - ox, y2 = c[2 * j + 1] * sp - oy;
      if (y1 !== y2) edges.push([x1, y1, x2, y2]);
    }
  }
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const yc = y + 0.5;
    const xs = [];
    for (const [x1, y1, x2, y2] of edges) {
      if ((yc >= y1 && yc < y2) || (yc >= y2 && yc < y1)) {
        xs.push({ x: x1 + (yc - y1) * (x2 - x1) / (y2 - y1), d: y2 > y1 ? 1 : -1 });
      }
    }
    xs.sort((a, b) => a.x - b.x);
    let wind = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      wind += xs[k].d;
      if (wind === 0) continue;
      const a = Math.max(0, Math.round(xs[k].x)), b = Math.min(w, Math.round(xs[k + 1].x));
      for (let x = a; x < b; x++) mask[y * w + x] = 1;
    }
  }
  let area = 0;
  for (const v of mask) area += v;
  const t = { font, cp, w, h, ox, oy, mask, area, adv: g.adv * sp };
  cache.set(key, t);
  return t;
}

export const FONTS = Object.keys(GLYPHS);

// Paper pixels enclosed by the glyph (e.g. the inside of a hollow notehead).
export function holeMask(t) {
  const { w, h, mask } = t;
  const outside = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (outside[p] || mask[p]) continue;
    outside[p] = 1;
    const x = p % w, y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  const hole = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < hole.length; i++) if (!mask[i] && !outside[i]) { hole[i] = 1; n++; }
  return { hole, n };
}

// Dice overlap between a component's pixels (inside its bounding box) and a
// template placed with its bounding box at (x0 + dx, y0 + dy).
export function dice(bin, labels, comp, t, dx, dy) {
  const { width: W, data } = bin;
  let inter = 0, compArea = 0;
  const cw = comp.x1 - comp.x0 + 1, ch = comp.y1 - comp.y0 + 1;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = (comp.y0 + y) * W + comp.x0 + x;
      const on = labels ? labels[p] === comp.id : data[p] === 1;
      if (!on) continue;
      compArea++;
      const tx = x - dx, ty = y - dy;
      if (tx >= 0 && ty >= 0 && tx < t.w && ty < t.h && t.mask[ty * t.w + tx]) inter++;
    }
  }
  return (2 * inter) / (compArea + t.area);
}
