// Small SVG chart builders for the Statistics page. Each returns markup for a
// given pixel width, so the page re-renders on resize instead of scaling
// text. Marks carry a `data-tip` that the shared tooltip shows on hover/tap.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Bar with a 4px rounded top, square at the baseline.
function barPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// ---- Vertical bars (one series) ----
// values: numbers; labels: x labels (shown every `every`); fmt: value → text.
export function bars({ width, height = 150, values, labels, tips, every = 1, fmt = String, cls = 'f-gold', highlight = -1 }) {
  const pad = { l: 34, r: 6, t: 10, b: 22 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(...values));
  const step = iw / values.length;
  const bw = Math.max(2, step - 2);
  let out = `<svg class="chart" width="${width}" height="${height}" role="img">`;
  for (const f of [0.5, 1]) {
    const y = pad.t + ih - ih * f;
    out += `<line class="grid" x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}"/>`
      + `<text class="axis" x="${pad.l - 6}" y="${y + 3}" text-anchor="end">${esc(fmt(max * f))}</text>`;
  }
  out += `<line class="base" x1="${pad.l}" x2="${width - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/>`;
  values.forEach((v, i) => {
    const h = (v / max) * ih;
    const x = pad.l + i * step + (step - bw) / 2;
    out += `<path class="${i === highlight ? 'f-gold-bright' : cls}" d="${barPath(x, pad.t + ih - h, bw, h)}"/>`;
    out += `<rect class="hit" x="${pad.l + i * step}" y="${pad.t}" width="${step}" height="${ih}" data-tip="${esc(tips ? tips[i] : `${labels[i]} · ${fmt(v)}`)}"/>`;
    if (labels && i % every === 0) out += `<text class="axis" x="${pad.l + i * step + step / 2}" y="${height - 6}" text-anchor="middle">${esc(labels[i])}</text>`;
  });
  return out + '</svg>';
}

// ---- Stacked vertical bars ----
// rows: [{ label, parts: { key: value } }], keys in stacking order.
export function stacked({ width, height = 170, rows, keys, names, every = 1, fmt = String, tipLabel = (r) => r.label }) {
  const pad = { l: 34, r: 6, t: 10, b: 22 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const totals = rows.map((r) => keys.reduce((s, k) => s + (r.parts[k] || 0), 0));
  const max = niceMax(Math.max(...totals));
  const step = iw / rows.length;
  const bw = Math.max(2, step - 2);
  let out = `<svg class="chart" width="${width}" height="${height}" role="img">`;
  for (const f of [0.5, 1]) {
    const y = pad.t + ih - ih * f;
    out += `<line class="grid" x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}"/>`
      + `<text class="axis" x="${pad.l - 6}" y="${y + 3}" text-anchor="end">${esc(fmt(max * f))}</text>`;
  }
  out += `<line class="base" x1="${pad.l}" x2="${width - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/>`;
  rows.forEach((r, i) => {
    const x = pad.l + i * step + (step - bw) / 2;
    let y = pad.t + ih;
    const present = keys.filter((k) => r.parts[k] > 0);
    present.forEach((k, j) => {
      const h = (r.parts[k] / max) * ih;
      const top = j === present.length - 1;
      // 2px surface gap between stacked segments.
      const gh = Math.max(0, h - (j ? 2 : 0));
      out += top
        ? `<path class="f-${k}" d="${barPath(x, y - h, bw, gh)}"/>`
        : `<rect class="f-${k}" x="${x}" y="${y - h}" width="${bw}" height="${gh}"/>`;
      y -= h;
    });
    const tip = [tipLabel(r), ...keys.filter((k) => r.parts[k] > 0).map((k) => `${names[k]} ${fmt(r.parts[k])}`)].join(' · ');
    out += `<rect class="hit" x="${pad.l + i * step}" y="${pad.t}" width="${step}" height="${ih}" data-tip="${esc(totals[i] ? tip : `${tipLabel(r)} · nothing`)}"/>`;
    if (i % every === 0) out += `<text class="axis" x="${pad.l + i * step + step / 2}" y="${height - 6}" text-anchor="middle">${esc(r.label)}</text>`;
  });
  return out + '</svg>';
}

// ---- Calendar heatmap (one hue, light → strong) ----
// cols: weeks of 7 cells { date, ms } | null.
export function calendarHeat({ width, cols, fmtTip, monthLabel }) {
  const labelW = 22, top = 16;
  const cell = Math.max(6, Math.min(16, Math.floor((width - labelW) / cols.length) - 2));
  const gap = 2;
  const max = Math.max(1, ...cols.flat().filter(Boolean).map((c) => c.ms));
  const h = top + 7 * (cell + gap);
  const w = labelW + cols.length * (cell + gap);
  let out = `<svg class="chart" width="${w}" height="${h}" role="img">`;
  ['M', '', 'W', '', 'F', '', ''].forEach((l, i) => {
    if (l) out += `<text class="axis" x="0" y="${top + i * (cell + gap) + cell - 1}">${l}</text>`;
  });
  let lastMonth = null;
  cols.forEach((col, x) => {
    const first = col.find(Boolean);
    if (first) {
      const m = first.date.slice(0, 7);
      if (m !== lastMonth && x < cols.length - 1) {
        out += `<text class="axis" x="${labelW + x * (cell + gap)}" y="10">${esc(monthLabel(first.date))}</text>`;
        lastMonth = m;
      }
    }
    col.forEach((c, y) => {
      if (!c) return;
      const level = c.ms > 0 ? Math.min(4, 1 + Math.floor((c.ms / max) * 3.999)) : 0;
      out += `<rect class="heat h${level}" x="${labelW + x * (cell + gap)}" y="${top + y * (cell + gap)}" width="${cell}" height="${cell}" rx="2" data-tip="${esc(fmtTip(c))}"/>`;
    });
  });
  return out + '</svg>';
}

// ---- Line over runs (accuracy 0..1), dots for each run ----
export function line({ width, height = 160, points, smooth, fmt = (v) => `${Math.round(v * 100)}%`, yMin = 0, yMax = 1, cls = 'gold' }) {
  const pad = { l: 34, r: 10, t: 10, b: 18 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const n = points.length;
  const X = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v) => pad.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  let out = `<svg class="chart" width="${width}" height="${height}" role="img">`;
  for (const f of [0, 0.5, 1]) {
    const v = yMin + (yMax - yMin) * f;
    out += `<line class="${f ? 'grid' : 'base'}" x1="${pad.l}" x2="${width - pad.r}" y1="${Y(v)}" y2="${Y(v)}"/>`
      + `<text class="axis" x="${pad.l - 6}" y="${Y(v) + 3}" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  if (smooth && n > 1) out += `<path class="stroke-${cls}" d="${smooth.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}"/>`;
  points.forEach((p, i) => {
    out += `<circle class="dot-${cls}" cx="${X(i)}" cy="${Y(p.y)}" r="${n > 60 ? 2.5 : 4}"/>`;
    out += `<rect class="hit" x="${X(i) - Math.max(4, iw / n / 2)}" y="${pad.t}" width="${Math.max(8, iw / n)}" height="${ih}" data-tip="${esc(p.tip)}"/>`;
  });
  out += `<text class="axis" x="${pad.l}" y="${height - 4}">${esc(points[0]?.label || '')}</text>`;
  if (n > 1) out += `<text class="axis" x="${width - pad.r}" y="${height - 4}" text-anchor="end">${esc(points[n - 1].label)}</text>`;
  return out + '</svg>';
}

// ---- Piano keyboard heatmap: key colour = error rate ----
// notes: { midi: { seen, errors } }
const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const midiName = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

export function keyboardHeat({ width, notes, lo = 36, hi = 96 }) {
  const midis = Object.keys(notes).map(Number);
  if (midis.length) {
    lo = Math.min(lo, Math.min(...midis));
    hi = Math.max(hi, Math.max(...midis));
  }
  while (BLACK.has(lo % 12)) lo--;
  while (BLACK.has(hi % 12)) hi++;
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const ww = width / whites.length;
  const h = Math.max(70, Math.min(120, ww * 5.5));
  const level = (m) => {
    const s = notes[m];
    if (!s || s.seen + s.errors === 0) return -1;
    const rate = s.errors / (s.seen + s.errors);
    return rate === 0 ? 0 : Math.min(4, 1 + Math.floor(rate * 4 / 0.4));
  };
  const tip = (m) => {
    const s = notes[m];
    if (!s) return `${midiName(m)} · not played yet`;
    const tot = s.seen + s.errors;
    return `${midiName(m)} · ${s.seen} read · ${s.errors} missed (${Math.round((s.errors / tot) * 100)}%)`;
  };
  let out = `<svg class="chart keyboard" width="${width}" height="${h}" role="img">`;
  whites.forEach((m, i) => {
    const l = level(m);
    out += `<rect class="kw ${l < 0 ? 'k-none' : `k${l}`}" x="${i * ww + 0.5}" y="0.5" width="${ww - 1}" height="${h - 1}" rx="2" data-tip="${esc(tip(m))}"/>`;
    if (m % 12 === 0) out += `<text class="axis key-c" x="${i * ww + ww / 2}" y="${h - 6}" text-anchor="middle">C${m / 12 - 1}</text>`;
  });
  whites.forEach((m, i) => {
    if (m + 1 <= hi && BLACK.has((m + 1) % 12)) {
      const l = level(m + 1);
      out += `<rect class="kb ${l < 0 ? 'k-none' : `k${l}`}" x="${(i + 1) * ww - ww * 0.32}" y="0" width="${ww * 0.64}" height="${h * 0.6}" rx="1.5" data-tip="${esc(tip(m + 1))}"/>`;
    }
  });
  return out + '</svg>';
}

// ---- Horizontal bars in HTML (labels never collide, wrap on phones) ----
// items: [{ label, value, text, cls, tip }]
export function hbars(items, { max } = {}) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return `<div class="hbars">${items.map((i) => `
    <div class="hbar" data-tip="${esc(i.tip || `${i.label} · ${i.text}`)}">
      <span class="hbar-label">${i.swatch ? `<i class="sw f-bg-${i.swatch}"></i>` : ''}${esc(i.label)}</span>
      <span class="hbar-track"><span class="hbar-fill ${i.cls || ''}" style="width:${Math.max(i.value > 0 ? 1.5 : 0, (i.value / m) * 100)}%"></span></span>
      <span class="hbar-val">${esc(i.text)}</span>
    </div>`).join('')}</div>`;
}

// ---- Coverage grid: rows × 12 roots, filled when played ----
export function coverage({ rows, cols, has, rowLabel, tip }) {
  return `<div class="cov" style="--cols:${cols.length}">
    <span></span>${cols.map((c) => `<span class="cov-h">${esc(c)}</span>`).join('')}
    ${rows.map((r) => `<span class="cov-l">${esc(rowLabel(r))}</span>${cols.map((c) => `<span class="cov-c${has(r, c) ? ' on' : ''}" data-tip="${esc(tip(r, c))}"></span>`).join('')}`).join('')}
  </div>`;
}

// ---- Stars ----
export const starRow = (n, of = 3) => `<span class="stars" aria-label="${n} of ${of} stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(Math.max(0, of - n))}</span></span>`;

// ---- Circle of fifths heatmap ----
// Outer ring: the 12 roots in fifths order (major-family chords). Inner ring:
// their relative minors (minor-family chords, keyed by their own root).
// outer / inner: pitch class → { value, tip }.
const COF = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const PC_LABEL = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const polar = (deg, r) => [r * Math.cos((deg - 90) * Math.PI / 180), r * Math.sin((deg - 90) * Math.PI / 180)];
function wedge(a0, a1, ro, ri) {
  const [ax, ay] = polar(a0, ro), [bx, by] = polar(a1, ro), [cx, cy] = polar(a1, ri), [dx, dy] = polar(a0, ri);
  return `M${ax.toFixed(2)},${ay.toFixed(2)}A${ro},${ro} 0 0 1 ${bx.toFixed(2)},${by.toFixed(2)}L${cx.toFixed(2)},${cy.toFixed(2)}A${ri},${ri} 0 0 0 ${dx.toFixed(2)},${dy.toFixed(2)}Z`;
}

export function fifthsHeat({ size, outer, inner, center = '', centerSub = '' }) {
  const R = size / 2 - 4, rMid = R * 0.68, rIn = R * 0.38;
  const max = Math.max(1, ...[...Object.values(outer), ...Object.values(inner)].map((c) => c?.value || 0));
  const lv = (c) => (!c || !c.value ? 0 : Math.min(4, 1 + Math.floor((c.value / max) * 3.999)));
  let out = `<svg class="chart cof" width="${size}" height="${size}" viewBox="${-size / 2} ${-size / 2} ${size} ${size}" role="img">`;
  COF.forEach((pc, i) => {
    const a0 = i * 30 - 15 + 0.8, a1 = i * 30 + 15 - 0.8;
    const minor = (pc + 9) % 12;
    const o = outer[pc], n = inner[minor];
    out += `<path class="heat h${lv(o)}" d="${wedge(a0, a1, R, rMid + 1)}" data-tip="${esc(o?.tip || `${PC_LABEL[pc]} · nothing yet`)}"/>`;
    out += `<path class="heat h${lv(n)}" d="${wedge(a0, a1, rMid - 1, rIn)}" data-tip="${esc(n?.tip || `${PC_LABEL[minor]}m · nothing yet`)}"/>`;
    const [tx, ty] = polar(i * 30, (R + rMid) / 2);
    const [ux, uy] = polar(i * 30, (rMid + rIn) / 2);
    out += `<text class="cof-l${lv(o) >= 3 ? ' on-strong' : ''}" x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central">${PC_LABEL[pc]}</text>`;
    out += `<text class="cof-l small${lv(n) >= 3 ? ' on-strong' : ''}" x="${ux}" y="${uy}" text-anchor="middle" dominant-baseline="central">${PC_LABEL[minor]}m</text>`;
  });
  out += `<text class="cof-c" x="0" y="${centerSub ? -6 : 0}" text-anchor="middle" dominant-baseline="central">${esc(center)}</text>`;
  if (centerSub) out += `<text class="axis" x="0" y="14" text-anchor="middle">${esc(centerSub)}</text>`;
  return out + '</svg>';
}
