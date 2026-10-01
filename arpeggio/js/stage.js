// Chord stage — same "vanishing point" carousel as the chord trainer
// (js/instruments/chordDisplay.js): the previous chord shrinks away to the
// left, the current one sits large in the middle, the next ones recede to the
// right. Cards are keyed by task object so the same element slides from
// slot 1 → 0 → -1 instead of being recreated.

import { formatChordHtml } from '../../js/core/theory.js';

const cardEls = new Map();

function slotConfig(slot) {
  if (slot === 0)  return { x: 0,    scale: 1.20, opacity: 1.00, blur: 0,   z: 10 };
  if (slot === -1) return { x: -1.4, scale: 0.45, opacity: 0.32, blur: 0.8, z: 4 };
  if (slot === 1)  return { x: 1.4,  scale: 0.55, opacity: 0.55, blur: 0,   z: 6 };
  if (slot === 2)  return { x: 2.15, scale: 0.36, opacity: 0.28, blur: 0.4, z: 5 };
  if (slot < 0)    return { x: -2.1, scale: 0.18, opacity: 0,    blur: 2,   z: 1 };
  return            { x: 2.8,  scale: 0.18, opacity: 0,    blur: 2,   z: 1 };
}

function applySlot(el, slot) {
  const cfg = slotConfig(slot);
  el.style.setProperty('--xmult', cfg.x);
  el.style.setProperty('--scale', cfg.scale);
  el.style.setProperty('--opacity', cfg.opacity);
  el.style.setProperty('--blur', `${cfg.blur}px`);
  el.style.zIndex = cfg.z;
  el.dataset.slot = String(slot);
}

function createCard(task, pattern) {
  const el = document.createElement('div');
  el.className = 'chord-card';
  el.innerHTML = `<div class="card-chord">${formatChordHtml(task.chord)}</div>`
    + `<div class="card-degree">${pattern(task)}</div>`;
  return el;
}

// entries: [{ task, slot }]. pattern(task) → the small "↑ 3rd" line shown
// under the side cards (the current one has the instruction pill instead).
export function renderStage(track, entries, pattern) {
  const wanted = new Set(entries.map(e => e.task));
  for (const [task, el] of cardEls) {
    if (wanted.has(task)) continue;
    applySlot(el, -3);
    el.classList.remove('is-current', 'is-clean');
    setTimeout(() => el.remove(), 650);
    cardEls.delete(task);
  }
  for (const { task, slot } of entries) {
    let el = cardEls.get(task);
    if (!el) {
      el = createCard(task, pattern);
      track.appendChild(el);
      cardEls.set(task, el);
      // Start one slot further out so the card slides in from the vanishing point.
      applySlot(el, slot + 1);
      void el.offsetHeight;
    }
    applySlot(el, slot);
    el.classList.toggle('is-current', slot === 0);
    if (slot !== 0) el.classList.remove('is-clean');
  }
  requestAnimationFrame(() => adjustStep(track));
}

export function clearStage() {
  for (const el of cardEls.values()) el.remove();
  cardEls.clear();
}

export function currentCard() {
  for (const el of cardEls.values()) if (el.dataset.slot === '0') return el;
  return null;
}

// Side cards sit at ±1.4 steps from center; widen the step when long names
// (F♯m7♭5) would overlap, same measurement as the chord trainer.
const SIDE_XMULT = 1.4;
const CURRENT_SCALE = 1.20;
const SIDE_SCALE = 0.55;
const STEP_GAP_PX = 28;

function adjustStep(track) {
  const stage = track.parentElement;
  let current = null;
  let widestSide = 0;
  for (const el of track.children) {
    const slot = el.dataset.slot;
    if (slot === '0') current = el;
    else if (slot === '1' || slot === '-1') widestSide = Math.max(widestSide, el.offsetWidth * SIDE_SCALE);
  }
  if (!current) return;
  const required = (current.offsetWidth * CURRENT_SCALE + widestSide) / 2 + STEP_GAP_PX;
  const minStep = window.matchMedia('(max-width: 700px)').matches ? 56 : 96;
  stage.style.setProperty('--step', `${Math.max(minStep, required / SIDE_XMULT)}px`);
}

let resizeQueued = false;
window.addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    const track = document.getElementById('stageTrack');
    if (track) adjustStep(track);
  });
});
