// Low-level image routines for scanned scores. Images are plain objects
// { width, height, data } with one byte per pixel: grey levels (0 = black)
// for greyscale images, 1 = ink / 0 = paper for binary ones.

export function rgbaToGray(rgba, width, height) {
  const out = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    const a = rgba[j + 3] / 255;
    // Transparent pixels count as white paper.
    out[i] = Math.round((0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) * a + 255 * (1 - a));
  }
  return { width, height, data: out };
}

// Sauvola adaptive threshold: copes with uneven lighting and grey paper.
export function binarize(gray, win = 31, k = 0.2) {
  const { width: w, height: h, data } = gray;
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  const sq = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0, rq = 0;
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x];
      rs += v; rq += v * v;
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + rs;
      sq[(y + 1) * W + x + 1] = sq[y * W + x + 1] + rq;
    }
  }
  const r = win >> 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const n = (y1 - y0) * (x1 - x0);
      const s = sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0];
      const q = sq[y1 * W + x1] - sq[y0 * W + x1] - sq[y1 * W + x0] + sq[y0 * W + x0];
      const m = s / n;
      const sd = Math.sqrt(Math.max(0, q / n - m * m));
      const t = m * (1 + k * (sd / 128 - 1));
      // Very light pixels are paper whatever the local statistics say.
      out[y * w + x] = data[y * w + x] < t && data[y * w + x] < 200 ? 1 : 0;
    }
  }
  return { width: w, height: h, data: out };
}

// Skew angle (radians) that makes the staff lines horizontal: the rotation
// that maximises the sharpness of the horizontal ink projection.
export function estimateSkew(bin) {
  const { width: w, height: h, data } = bin;
  const pts = [];
  const stepY = Math.max(1, Math.floor(h / 1500));
  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += 3) if (data[y * w + x]) pts.push(x, y);
  }
  const score = a => {
    const t = Math.tan(a);
    const hist = new Float64Array(Math.ceil((h + w) / stepY) + 2);
    for (let i = 0; i < pts.length; i += 2) {
      // Bins as tall as the sampling step, or every other bin would be empty
      // at 0° and win for the wrong reason.
      const r = Math.round((pts[i + 1] - pts[i] * t + w * Math.abs(t)) / stepY) | 0;
      if (r >= 0 && r < hist.length) hist[r]++;
    }
    let s = 0;
    for (let i = 1; i < hist.length; i++) { const d = hist[i] - hist[i - 1]; s += d * d; }
    return s;
  };
  let best = 0, bestS = -1;
  for (let deg = -3; deg <= 3.0001; deg += 0.1) {
    const s = score(deg * Math.PI / 180);
    if (s > bestS) { bestS = s; best = deg; }
  }
  let fine = best;
  for (let deg = best - 0.1; deg <= best + 0.1001; deg += 0.02) {
    const s = score(deg * Math.PI / 180);
    if (s > bestS) { bestS = s; fine = deg; }
  }
  return fine * Math.PI / 180;
}

// Rotate a greyscale image by -angle around its centre (bilinear).
export function rotateGray(gray, angle) {
  const { width: w, height: h, data } = gray;
  if (Math.abs(angle) < 1e-4) return gray;
  const out = new Uint8Array(w * h).fill(255);
  const c = Math.cos(angle), s = Math.sin(angle);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Source position of destination pixel (x, y).
      const dx = x - cx, dy = y - cy;
      const sx = c * dx - s * dy + cx, sy = s * dx + c * dy + cy;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
      const fx = sx - x0, fy = sy - y0;
      const i = y0 * w + x0;
      out[y * w + x] = Math.round(
        data[i] * (1 - fx) * (1 - fy) + data[i + 1] * fx * (1 - fy) +
        data[i + w] * (1 - fx) * fy + data[i + w + 1] * fx * fy);
    }
  }
  return { width: w, height: h, data: out };
}

// Staff line thickness and staff space (line to line) from the most common
// vertical black and white run lengths — the classic OMR estimate.
export function staffMetrics(bin) {
  const { width: w, height: h, data } = bin;
  const black = new Uint32Array(64), white = new Uint32Array(256);
  for (let x = 0; x < w; x += 2) {
    let run = 0, cur = data[x];
    for (let y = 1; y <= h; y++) {
      const v = y < h ? data[y * w + x] : 1 - cur;
      if (v === cur) { run++; continue; }
      if (cur) { if (run + 1 < 64) black[run + 1]++; }
      else if (run + 1 < 256) white[run + 1]++;
      cur = v; run = 0;
    }
  }
  let lt = 1;
  for (let i = 1; i < 64; i++) if (black[i] > black[lt]) lt = i;
  let ws = 3;
  for (let i = 3; i < 256; i++) if (white[i] > white[ws]) ws = i;
  return { lineThickness: lt, staffSpace: lt + ws };
}

// 8-connected components. Returns { labels, comps } where comps[i] has the
// bounding box and pixel count of label i + 1.
export function components(bin) {
  const { width: w, height: h, data } = bin;
  const labels = new Int32Array(w * h);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < data.length; start++) {
    if (!data[start] || labels[start]) continue;
    const id = comps.length + 1;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = id;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p - x) / w;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (data[q] && !labels[q]) { labels[q] = id; stack[sp++] = q; }
        }
      }
    }
    comps.push({ id, x0, y0, x1, y1, area });
  }
  return { labels, comps };
}

// Summed-area table of a binary image, for O(1) ink counts in rectangles.
export function integral(bin) {
  const { width: w, height: h, data } = bin;
  const W = w + 1;
  const s = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      s[(y + 1) * W + x + 1] = s[y * W + x + 1] + row;
    }
  }
  return {
    // Ink pixels in [x0, x1) × [y0, y1), clipped to the image.
    count(x0, y0, x1, y1) {
      x0 = Math.max(0, x0); y0 = Math.max(0, y0);
      x1 = Math.min(w, x1); y1 = Math.min(h, y1);
      if (x1 <= x0 || y1 <= y0) return 0;
      return s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0];
    }
  };
}

// Resample a greyscale image by `f` (area average when shrinking, bilinear
// when enlarging).
export function resizeGray(gray, f) {
  const { width: w, height: h, data } = gray;
  const W = Math.max(1, Math.round(w * f)), H = Math.max(1, Math.round(h * f));
  const out = new Uint8Array(W * H);
  if (f < 1) {
    const inv = 1 / f;
    for (let Y = 0; Y < H; Y++) {
      const y0 = Math.floor(Y * inv), y1 = Math.min(h, Math.max(y0 + 1, Math.floor((Y + 1) * inv)));
      for (let X = 0; X < W; X++) {
        const x0 = Math.floor(X * inv), x1 = Math.min(w, Math.max(x0 + 1, Math.floor((X + 1) * inv)));
        let s = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += data[y * w + x];
        out[Y * W + X] = Math.round(s / ((y1 - y0) * (x1 - x0)));
      }
    }
  } else {
    for (let Y = 0; Y < H; Y++) {
      const sy = Math.min(h - 1.001, (Y + 0.5) / f - 0.5), y0 = Math.max(0, Math.floor(sy)), fy = Math.max(0, sy - y0);
      for (let X = 0; X < W; X++) {
        const sx = Math.min(w - 1.001, (X + 0.5) / f - 0.5), x0 = Math.max(0, Math.floor(sx)), fx = Math.max(0, sx - x0);
        const i = y0 * w + x0;
        out[Y * W + X] = Math.round(data[i] * (1 - fx) * (1 - fy) + data[i + 1] * fx * (1 - fy) +
          data[i + w] * (1 - fx) * fy + data[i + w + 1] * fx * fy);
      }
    }
  }
  return { width: W, height: H, data: out };
}
