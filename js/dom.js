// Tiny DOM helpers. Purpose: shorter call sites and cached lookups where it matters.

export const $ = (id) => document.getElementById(id);
export const $$ = (sel, root = document) => root.querySelectorAll(sel);

export function debounce(fn, wait) {
  let t = null;
  const debounced = (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, wait);
  };
  debounced.cancel = () => { if (t) { clearTimeout(t); t = null; } };
  debounced.flush = (...args) => { if (t) { clearTimeout(t); t = null; } fn(...args); };
  return debounced;
}

export function setDisplay(id, shown, shownValue = '') {
  const el = $(id);
  if (el) el.style.display = shown ? shownValue : 'none';
}

export function toggleClass(el, cls, on) {
  if (!el) return;
  el.classList.toggle(cls, on);
}

// SVG node helpers (building SVG with createElementNS is verbose).
const SVG_NS = 'http://www.w3.org/2000/svg';
export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    el.setAttribute(k, v);
  }
  return el;
}
