// Click-and-drag UI for marking systems (one music line per rectangle) and
// barlines (vertical clicks inside a system) on each PDF page. Built on
// pointer events so a finger works as well as a mouse: on a phone, one
// finger draws a system and the page still scrolls in barline mode. Coordinates
// are stored normalized (0-1) against the page's intrinsic PDF dimensions
// so they survive zoom changes and re-renders.
//
// Public surface:
//   const m = createMarking({ pdfSource, canvas, overlay, hash, onChange });
//   await m.loadPage(0);
//   m.setMode('system' | 'barline');
//   m.clearPage();
//   m.undo();
//   m.getMarkings();           // serializable state
//   m.setMarkings(prior);      // restore from storage

import { saveMarkings, loadMarkings } from './storage.js';
import { measuresFromMarkings } from './pdfSource.js';

const MIN_SYSTEM_W = 0.06; // ignore tiny accidental drags (6% of page width)
const MIN_SYSTEM_H = 0.015;
const BARLINE_HIT_PX = 6;  // tolerance for clicking on an existing barline to remove it

export function createMarking({ pdfSource, canvas, overlay, hash, onChange }) {
  // markings.pages is sparse-indexed up to numPages-1.
  let markings = { numPages: pdfSource.numPages, pages: [] };
  for (let i = 0; i < pdfSource.numPages; i++) markings.pages.push({ systems: [] });

  let mode = 'system';
  let pageIdx = 0;
  let scale = 1;
  let viewport = null;
  let drag = null; // { x0, y0, el, pointerId }
  overlay.dataset.mode = mode;

  // Undo stack: each entry is the full `markings` state BEFORE the mutation
  // that pushed it. Bounded so a marathon session doesn't blow up memory.
  const HISTORY_LIMIT = 200;
  const history = [];

  // Restore prior markings if present.
  const prior = loadMarkings(hash);
  if (prior && prior.pages?.length === pdfSource.numPages) {
    markings = prior;
  }

  // --- coordinate helpers ----------------------------------------------------
  // Convert a viewport-coords mouse event to canvas-internal pixels (= CSS
  // pixels of the overlay). Using `rect.width / canvas.width` makes the
  // mapping resolution- AND zoom-independent — neither `getBoundingClientRect`
  // nor `clientX` agree on the same scale when `html { zoom: ... }` is in
  // effect, so we route through a ratio instead of taking their difference.
  function eventToCanvasPx(e) {
    const rect = overlay.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(canvas.width,  fx * canvas.width)),
      y: Math.max(0, Math.min(canvas.height, fy * canvas.height)),
    };
  }
  function toPx(nx, ny) {
    return { x: nx * canvas.width, y: ny * canvas.height };
  }

  // --- rendering -------------------------------------------------------------
  function clearOverlay() {
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
  }

  function renderOverlay() {
    clearOverlay();
    const page = markings.pages[pageIdx];
    if (!page) return;

    page.systems.forEach((sys, sIdx) => {
      const { x: px, y: py } = toPx(sys.x, sys.y);
      const w = sys.w * canvas.width;
      const h = sys.h * canvas.height;

      const box = document.createElement('div');
      box.className = 'system-box';
      box.style.left = `${px}px`;
      box.style.top = `${py}px`;
      box.style.width = `${w}px`;
      box.style.height = `${h}px`;

      const label = document.createElement('div');
      label.className = 'system-label';
      // Measure counts include only the implicit start/end (1 measure) when
      // there are no internal barlines yet — count = barlines + 1.
      const measureCount = (sys.barlines?.length || 0) + 1;
      label.textContent = `Sys · ${measureCount}m`;
      box.appendChild(label);

      const rm = document.createElement('button');
      rm.className = 'system-remove';
      rm.type = 'button';
      rm.textContent = '×';
      rm.title = 'Remove this system';
      rm.addEventListener('pointerdown', (e) => e.stopPropagation());
      rm.addEventListener('click', (e) => {
        e.stopPropagation();
        pushHistory();
        page.systems.splice(sIdx, 1);
        commit();
      });
      box.appendChild(rm);

      // Barlines inside this system
      (sys.barlines || []).forEach((bx, bIdx) => {
        const line = document.createElement('div');
        line.className = 'barline';
        const localPx = (bx - sys.x) * canvas.width;
        line.style.left = `${localPx - 1}px`;
        line.style.top = '0';
        line.style.height = `${h}px`;
        line.title = 'Click to remove';
        line.addEventListener('pointerdown', (e) => e.stopPropagation());
        line.addEventListener('click', (e) => {
          e.stopPropagation();
          pushHistory();
          sys.barlines.splice(bIdx, 1);
          commit();
        });
        box.appendChild(line);
      });

      // Measure overlays (read-only visual aid) between consecutive barlines.
      const xs = [sys.x, ...(sys.barlines || []).slice().sort((a, b) => a - b), sys.x + sys.w];
      for (let i = 0; i < xs.length - 1; i++) {
        const mOv = document.createElement('div');
        mOv.className = 'measure-overlay';
        const localStartPx = (xs[i] - sys.x) * canvas.width;
        const localEndPx   = (xs[i + 1] - sys.x) * canvas.width;
        mOv.style.left = `${localStartPx}px`;
        mOv.style.top = '0';
        mOv.style.width = `${localEndPx - localStartPx}px`;
        mOv.style.height = `${h}px`;
        box.appendChild(mOv);
      }

      // Clicks inside the system box in 'barline' mode add a barline; in
      // 'system' mode they do nothing (drag a new system in empty space).
      // 'click' rather than 'pointerdown' so a finger scrolling the page
      // over a system doesn't drop a barline where the swipe started.
      box.addEventListener('click', (e) => {
        if (mode === 'barline') {
          e.stopPropagation();
          // Reuse eventToCanvasPx so this stays zoom-independent and the
          // barline lands exactly under the cursor.
          const pt = eventToCanvasPx(e);
          const localPx = pt.x - (sys.x * canvas.width);
          if (localPx < 4 || localPx > w - 4) return;
          const newNorm = sys.x + (localPx / canvas.width);
          if ((sys.barlines || []).some(bx => Math.abs(bx - newNorm) * canvas.width < BARLINE_HIT_PX)) return;
          pushHistory();
          sys.barlines = [...(sys.barlines || []), newNorm].sort((a, b) => a - b);
          commit();
        }
      });

      overlay.appendChild(box);
    });
  }

  // --- drag-to-create-system -------------------------------------------------
  // All coordinates flow through `eventToCanvasPx` (canvas-internal CSS pixels),
  // and the move/up listeners live on `window` so the drag survives the cursor
  // wandering off the overlay or the page. ESC during a drag aborts cleanly.
  // A second finger landing mid-drag means a pinch or a scroll, not a box.
  function onPointerDown(e) {
    if (mode !== 'system') return;
    if (e.button !== 0) return;
    if (drag) { cancelActiveDrag(); return; }
    const { x: x0, y: y0 } = eventToCanvasPx(e);
    const el = document.createElement('div');
    el.className = 'system-box dragging';
    el.style.left = `${x0}px`;
    el.style.top = `${y0}px`;
    el.style.width = '0px';
    el.style.height = '0px';
    overlay.appendChild(el);
    drag = { x0, y0, el, pointerId: e.pointerId };
  }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { x: x1, y: y1 } = eventToCanvasPx(e);
    const left = Math.min(drag.x0, x1);
    const top  = Math.min(drag.y0, y1);
    drag.el.style.left = `${left}px`;
    drag.el.style.top = `${top}px`;
    drag.el.style.width = `${Math.abs(x1 - drag.x0)}px`;
    drag.el.style.height = `${Math.abs(y1 - drag.y0)}px`;
  }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { x: x1, y: y1 } = eventToCanvasPx(e);
    const left = Math.min(drag.x0, x1);
    const top  = Math.min(drag.y0, y1);
    const w    = Math.abs(x1 - drag.x0);
    const h    = Math.abs(y1 - drag.y0);
    drag.el.remove();
    drag = null;

    const nLeft = left / canvas.width;
    const nTop  = top / canvas.height;
    const nW    = w / canvas.width;
    const nH    = h / canvas.height;
    if (nW < MIN_SYSTEM_W || nH < MIN_SYSTEM_H) return; // accidental click

    pushHistory();
    markings.pages[pageIdx].systems.push({
      x: nLeft, y: nTop, w: nW, h: nH, barlines: [],
    });
    commit();
  }

  function cancelActiveDrag() {
    if (!drag) return false;
    drag.el.remove();
    drag = null;
    return true;
  }

  function onKeyDown(e) {
    if (e.key !== 'Escape') return;
    // Don't steal Escape from form fields or other consumers.
    if (e.target instanceof HTMLInputElement) return;
    // Esc during a drag aborts that drag without touching history.
    if (cancelActiveDrag()) { e.preventDefault(); return; }
    if (history.length) {
      undo();
      e.preventDefault();
    }
  }

  function onPointerCancel(e) {
    if (drag && e.pointerId === drag.pointerId) cancelActiveDrag();
  }

  // iOS Safari may still try to scroll under a one-finger drag; blocking the
  // touchmove keeps the finger on the box (two fingers are left alone).
  function onTouchMove(e) {
    if (drag && e.touches.length === 1) e.preventDefault();
  }

  overlay.addEventListener('pointerdown', onPointerDown);
  overlay.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('keydown', onKeyDown);

  // --- state mutation --------------------------------------------------------
  function deepCloneMarkings(m) {
    return {
      numPages: m.numPages,
      pages: m.pages.map(p => ({
        systems: (p.systems || []).map(s => ({
          x: s.x, y: s.y, w: s.w, h: s.h,
          barlines: (s.barlines || []).slice(),
        })),
      })),
    };
  }
  function pushHistory() {
    history.push(deepCloneMarkings(markings));
    if (history.length > HISTORY_LIMIT) history.shift();
  }
  function undo() {
    const prev = history.pop();
    if (!prev) return;
    markings = prev;
    commit({ pushUndo: false });
  }

  function commit() {
    saveMarkings(hash, markings);
    renderOverlay();
    onChange?.(snapshot());
  }

  function snapshot() {
    return {
      markings,
      measures: measuresFromMarkings(markings),
      pageIdx,
    };
  }

  // --- public API ------------------------------------------------------------
  async function loadPage(idx) {
    pageIdx = idx;
    const wrap = canvas.parentElement.parentElement;
    const maxWidth = Math.max(320, Math.min(wrap.clientWidth - 32, 1100));
    // Probe page width at scale=1 to derive the correct scale for `maxWidth`.
    const probe = await pdfSource.pdf.getPage(idx + 1);
    const base = probe.getViewport({ scale: 1 });
    scale = maxWidth / base.width;
    viewport = await pdfSource.renderPage(idx, scale, canvas);
    overlay.style.width = `${canvas.width}px`;
    overlay.style.height = `${canvas.height}px`;
    renderOverlay();
    onChange?.(snapshot());
  }

  function setMode(next) {
    mode = next;
    overlay.style.cursor = next === 'system' ? 'crosshair' : 'cell';
    overlay.dataset.mode = next;
  }
  function clearPage() {
    pushHistory();
    markings.pages[pageIdx] = { systems: [] };
    commit();
  }
  function getSnapshot() { return snapshot(); }

  return {
    loadPage,
    setMode,
    clearPage,
    undo,
    getSnapshot,
    get canUndo() { return history.length > 0; },
    get pageIdx() { return pageIdx; },
    get numPages() { return pdfSource.numPages; },
    destroy() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
