// Routes a chunk to the right renderer based on the underlying source. PDF
// chunks become one or more bitmap rectangles (one per visual system the
// chunk spans). MIDI chunks become a single OSMD-rendered score block.

import { chunkToRegions } from './pdfSource.js';

let osmdInstance = null;

// Computed once per session and threaded through `renderChunk`. We lock in
// the ORIENTATION here (side-by-side vs stacked) — but NOT the scale. Each
// chunk later sizes itself to fit the container, so the score actually
// uses the full width of the (wide-screen-expanded) stage instead of
// leaving big black margins on either side.
//
// Why per-chunk scale doesn't break the "consistent across chunks" rule:
//   per-measure-px = target / numMeasures
// regardless of how each measure happens to be wider or narrower in the
// source PDF. So as long as `chunkSize` is uniform (which it is, modulo
// the last orphan-absorbed chunk), every chunk renders measures at the
// same pixel density.
//
// Orientation rule: read side-by-side (horizontal) by default — that's how
// music actually reads. Fall back to vertical only when stuffing every
// chunk into one row would shrink each measure below a comfortable
// threshold. Below ~65px per measure, notes feel pinched and accidentals
// start to collide.
const MIN_PX_PER_MEASURE = 75;

export function planLayout(source, chunks, containerWidth) {
  if (source.kind !== 'pdf') return { kind: source.kind };

  const target = Math.max(320, Math.min(containerWidth || 900, 1700));

  let maxMeasureCount = 0;
  for (const chunk of chunks) {
    if (chunk.length > maxMeasureCount) maxMeasureCount = chunk.length;
  }
  if (maxMeasureCount <= 0) maxMeasureCount = 1;

  // If even the largest chunk has enough room per measure when laid in one
  // row, use horizontal globally; otherwise stack vertically.
  const horizontalPxPerMeasure = target / maxMeasureCount;
  const orientation = horizontalPxPerMeasure >= MIN_PX_PER_MEASURE ? 'horizontal' : 'vertical';

  return {
    kind: 'pdf',
    orientation,
  };
}

export async function renderChunk(source, chunk, container, layout) {
  container.innerHTML = '';
  if (!chunk?.length) {
    container.textContent = '—';
    return;
  }
  if (source.kind === 'pdf')  return renderPdfChunk(source, chunk, container, layout);
  if (source.kind === 'midi') return renderMidiChunk(source, chunk, container);
  throw new Error(`Unknown source kind: ${source.kind}`);
}

// Visual gap between adjacent regions in horizontal mode (matches the CSS
// `gap` on `.chunk-render-pdf-horizontal`). Subtracted from the available
// width when computing the per-chunk fit-to-container scale so two stacked
// canvases plus the gap don't push past the stage edge.
const HORIZONTAL_GAP_PX = 10;
// Wrapper padding (matches `padding: 4px` on the chunk-render-pdf classes)
// — counted on both sides so the bitmap doesn't kiss the white wrapper edge.
const WRAPPER_PADDING_PX = 8;

async function renderPdfChunk(source, chunk, container, layout) {
  const regions = chunkToRegions(chunk);

  // Single wrapper owns the paper-look (white bg + one shadow). The
  // orientation modifier flips between row (side-by-side reading, the
  // default) and column (vertical stack when horizontal would crush each
  // measure too narrow).
  const orientation = layout?.orientation || 'vertical';
  const wrap = document.createElement('div');
  wrap.className = `chunk-render-pdf chunk-render-pdf-${orientation}`;
  container.appendChild(wrap);

  // Fit-to-container per chunk: the score actually uses the screen real
  // estate. Per-measure size stays consistent across chunks for a given
  // chunkSize (= target / numMeasures), so this doesn't reintroduce the
  // "size jumps between chunks" problem — only the LAST orphan-absorbed
  // chunk (chunkSize + 1 measures) renders measures slightly smaller.
  const available = Math.max(160, (container.clientWidth || 900) - WRAPPER_PADDING_PX);
  let ppu;
  if (orientation === 'horizontal') {
    const totalW = regions.reduce((s, r) => s + r.w, 0) || 1;
    const gapTotal = HORIZONTAL_GAP_PX * Math.max(0, regions.length - 1);
    ppu = (available - gapTotal) / totalW;
  } else {
    const maxW = Math.max(...regions.map(r => r.w)) || 1;
    ppu = available / maxW;
  }

  for (const r of regions) {
    const targetWidthPx = Math.max(80, Math.round(r.w * ppu));
    const canvas = await source.renderRegion(
      r.pageIdx,
      { x: r.x, y: r.y, w: r.w, h: r.h },
      targetWidthPx,
    );
    wrap.appendChild(canvas);
  }
}

async function renderMidiChunk(source, chunk, container) {
  // Chunk is a list of measures (objects with .num). The first measure number
  // maps to the slice start in the source's bucket array.
  const startNum = chunk[0].num;        // 1-based
  const count = chunk.length;
  const xml = source.toMusicXml(startNum - 1, count);

  // OSMD container needs a stable, non-flex parent so the SVG it injects
  // gets a real width to lay out into. Wrap explicitly.
  const wrap = document.createElement('div');
  wrap.className = 'osmd-container';
  wrap.style.width = '100%';
  container.appendChild(wrap);

  const OSMD = window.opensheetmusicdisplay?.OpenSheetMusicDisplay;
  if (!OSMD) throw new Error('OpenSheetMusicDisplay failed to load');

  // Reuse a single instance to keep DOM churn low — but it binds to a
  // container element, so we recreate when the wrap changes.
  osmdInstance = new OSMD(wrap, {
    autoResize: false,
    backend: 'svg',
    drawTitle: false,
    drawSubtitle: false,
    drawComposer: false,
    drawCredits: false,
    drawPartNames: false,
    drawMeasureNumbers: true,
    drawMeasureNumbersOnlyAtSystemStart: false,
    pageBackgroundColor: '#fdfbf6',
    defaultColorMusic: '#1a1614',
  });

  await osmdInstance.load(xml);
  osmdInstance.render();
}
