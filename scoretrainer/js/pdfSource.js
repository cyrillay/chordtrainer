// PDF.js wrapper. We load the lib lazily and pin the worker to the matching
// CDN build — bundlers that mix versions silently break with cryptic
// "promise.cancel is not a function" errors at render time.

const PDFJS_VER = '4.8.69';
const PDFJS_URL  = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.min.mjs`;
const WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.worker.min.mjs`;

let pdfjsLib = null;
async function ensurePdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import(/* webpackIgnore: true */ PDFJS_URL);
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
  return pdfjsLib;
}

// Returns a handle around the parsed PDF document. Pages are rendered on
// demand to avoid keeping every page's bitmap in memory.
export async function loadPdfFromFile(file) {
  const lib = await ensurePdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
  return {
    kind: 'pdf',
    name: file.name,
    numPages: pdf.numPages,
    pdf,
    arrayBuffer,
    // Render `pageIdx` (0-based) at `scale` into `canvas`. Returns the
    // viewport so callers can derive coordinate mappings.
    renderPage: async (pageIdx, scale, canvas) => {
      const page = await pdf.getPage(pageIdx + 1);
      const viewport = page.getViewport({ scale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      await page.render({ canvasContext: ctx, viewport }).promise;
      return viewport;
    },
    // Render a sub-rectangle of a page (normalized 0-1 coords) into a fresh
    // canvas at the given pixel width. Used at session time to display one
    // chunk's bitmap.
    renderRegion: async (pageIdx, normRect, targetWidthPx) => {
      const page = await pdf.getPage(pageIdx + 1);
      const base = page.getViewport({ scale: 1 });
      const regionPdfW = base.width * normRect.w;
      const regionPdfH = base.height * normRect.h;
      const scale = targetWidthPx / regionPdfW;
      const viewport = page.getViewport({
        scale,
        offsetX: -base.width * normRect.x * scale,
        offsetY: -base.height * normRect.y * scale,
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(regionPdfW * scale);
      canvas.height = Math.floor(regionPdfH * scale);
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas;
    },
  };
}

// Convert raw markings (systems with barline x-positions) into a flat,
// ordered list of measures: `{ pageIdx, systemIdx, x, y, w, h, num }`,
// with measure numbers running 1..N across the whole document.
export function measuresFromMarkings(markings) {
  // markings.pages = [{ systems: [{ x, y, w, h, barlines: [normalized x's
  //   between system.x and system.x+system.w] }] }, ...]
  const out = [];
  let measureNum = 1;
  for (let p = 0; p < markings.pages.length; p++) {
    const systems = markings.pages[p].systems || [];
    // Sort systems top-to-bottom so practice order matches reading order.
    const sorted = [...systems].sort((a, b) => a.y - b.y);
    for (let s = 0; s < sorted.length; s++) {
      const sys = sorted[s];
      const xs = [sys.x, ...(sys.barlines || []).slice().sort((a, b) => a - b), sys.x + sys.w];
      for (let i = 0; i < xs.length - 1; i++) {
        out.push({
          pageIdx: p,
          systemIdx: s,
          num: measureNum++,
          x: xs[i],
          y: sys.y,
          w: xs[i + 1] - xs[i],
          h: sys.h,
        });
      }
    }
  }
  return out;
}

// Build a single render rectangle covering a run of consecutive measures
// from the same system. If the run spans multiple systems, we hand back
// multiple rectangles to stack vertically in the playback view.
export function chunkToRegions(chunk) {
  if (!chunk.length) return [];
  const groups = [];
  let cur = null;
  for (const m of chunk) {
    if (cur && cur.pageIdx === m.pageIdx && cur.systemIdx === m.systemIdx) {
      cur.w = (m.x + m.w) - cur.x;
    } else {
      cur = { pageIdx: m.pageIdx, systemIdx: m.systemIdx, x: m.x, y: m.y, w: m.w, h: m.h };
      groups.push(cur);
    }
  }
  return groups;
}
