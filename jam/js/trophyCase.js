// Ghost Jam trophy case: remembers what you earned, pops a toast when you
// earn something, and shows the whole case in a modal. Same tiers as the
// other trainers (visible, secret, ultra) with its own store.

import { escapeHtml } from '../../js/core/dom.js';
import { ACH } from './achievements.js';

const LS_KEY = 'ghostJam.achievements';
const byId = Object.fromEntries(ACH.map((a) => [a.id, a]));

// counters: metric -> number. grooves / sGrooves: groove ids finished, and
// finished with rank S.
let store = { unlocked: {}, counters: {}, grooves: [], sGrooves: [] };

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) store = { ...store, ...JSON.parse(raw) };
  } catch { /* private mode */ }
}

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch { /* private mode */ }
}

// ---- Toasts, queued so a big moment shows each one ----

let toastEl = null;
const queue = [];
let busy = false;

function pump() {
  if (busy || !toastEl || !queue.length) return;
  const a = queue.shift();
  busy = true;
  const tier = a.vis === 'ultra' ? 'Ultra-rare unlocked' : a.vis === 'secret' ? 'Secret unlocked' : 'Achievement unlocked';
  toastEl.innerHTML = `<div class="ach-toast-icon">${a.icon}</div>
    <div class="ach-toast-text">
      <div class="ach-toast-tier">${tier}</div>
      <div class="ach-toast-name">${escapeHtml(a.name)}</div>
      <div class="ach-toast-desc">${escapeHtml(a.desc)}</div>
    </div>`;
  toastEl.classList.toggle('is-rare', a.vis !== 'visible');
  toastEl.classList.add('visible');
  setTimeout(() => {
    toastEl.classList.remove('visible');
    setTimeout(() => { busy = false; pump(); }, 400);
  }, 3600);
}

function unlock(id) {
  const a = byId[id];
  if (!a || store.unlocked[id]) return;
  store.unlocked[id] = Date.now();
  queue.push(a);
  pump();
}

function checkCounters() {
  for (const a of ACH) {
    if (a.metric && !store.unlocked[a.id] && (store.counters[a.metric] || 0) >= a.target) unlock(a.id);
  }
}

function commit() {
  checkCounters();
  save();
  refreshBadge();
}

// ---- Public API ----

export function grant(ids) {
  for (const id of ids) unlock(id);
  commit();
}

export function setMax(metric, value) {
  if ((store.counters[metric] || 0) >= value) return;
  store.counters[metric] = value;
  commit();
}

export function bump(metric) {
  store.counters[metric] = (store.counters[metric] || 0) + 1;
  commit();
}

// A set played to the end in this groove, with this rank.
export function setFinished(style, rank) {
  if (!store.grooves.includes(style)) store.grooves.push(style);
  if (rank === 'S' && !store.sGrooves.includes(style)) store.sGrooves.push(style);
  store.counters.grooves = store.grooves.length;
  if (store.sGrooves.length >= 6) unlock('worldTour');
  commit();
}

// ---- Modal ----

let modalEl, gridEl, countEl, badgeEl, resetBtnEl;

function refreshBadge() {
  if (badgeEl) badgeEl.textContent = Object.keys(store.unlocked).filter((id) => byId[id]).length || '';
}

function tile(a) {
  if (store.unlocked[a.id]) {
    const when = new Date(store.unlocked[a.id]).toLocaleDateString();
    return `<div class="ach-tile is-unlocked" title="Unlocked ${escapeHtml(when)}">
      <div class="ach-tile-icon">${a.icon}</div>
      <div class="ach-tile-body"><div class="ach-tile-name">${escapeHtml(a.name)}</div><div class="ach-tile-desc">${escapeHtml(a.desc)}</div></div>
    </div>`;
  }
  if (a.vis !== 'visible') {
    return `<div class="ach-tile is-locked is-${a.vis}">
      <div class="ach-tile-icon">${a.vis === 'ultra' ? '\u{1F512}' : '?'}</div>
      <div class="ach-tile-body"><div class="ach-tile-name">???</div><div class="ach-tile-desc">${escapeHtml(a.hint)}</div></div>
    </div>`;
  }
  const value = Math.min(store.counters[a.metric] || 0, a.target);
  const pct = Math.round((value / a.target) * 100);
  return `<div class="ach-tile is-locked">
    <div class="ach-tile-icon">${a.icon}</div>
    <div class="ach-tile-body">
      <div class="ach-tile-name">${escapeHtml(a.name)}</div><div class="ach-tile-desc">${escapeHtml(a.desc)}</div>
      <div class="ach-tile-progress"><div class="ach-tile-bar"><div class="ach-tile-fill" style="width:${pct}%"></div></div><span>${value} / ${a.target}</span></div>
    </div>
  </div>`;
}

const SECTIONS = [
  { vis: 'visible', label: 'On the bill', blurb: 'Every band has to start somewhere.' },
  { vis: 'secret',  label: 'Secret',      blurb: 'Feel, touch, voicings, and a few stories from the basement.' },
  { vis: 'ultra',   label: 'Ultra-rare',  blurb: 'Legends of the house.' },
];

function render() {
  gridEl.innerHTML = SECTIONS.map((sec) => {
    const items = ACH.filter((a) => a.vis === sec.vis);
    const done = items.filter((a) => store.unlocked[a.id]).length;
    return `<div class="ach-section">
      <div class="ach-section-header"><span class="ach-section-label">${sec.label}</span><span class="ach-section-count">${done} / ${items.length}</span></div>
      <div class="ach-section-blurb">${sec.blurb}</div>
      <div class="ach-grid">${items.map(tile).join('')}</div>
    </div>`;
  }).join('');
  countEl.textContent = `${ACH.filter((a) => store.unlocked[a.id]).length} / ${ACH.length}`;
  resetArmed = false;
  resetBtnEl.textContent = 'Reset Ghost Jam achievements';
  resetBtnEl.classList.remove('armed');
}

let resetArmed = false;
function handleReset() {
  if (!resetArmed) {
    resetArmed = true;
    resetBtnEl.textContent = 'Click again to confirm. This cannot be undone.';
    resetBtnEl.classList.add('armed');
    return;
  }
  store = { unlocked: {}, counters: {}, grooves: [], sGrooves: [] };
  save();
  render();
  refreshBadge();
}

export function initTrophyCase() {
  load();
  modalEl = document.getElementById('achModal');
  gridEl = document.getElementById('achGrid');
  countEl = document.getElementById('achCount');
  badgeEl = document.getElementById('achBadge');
  toastEl = document.getElementById('achToast');
  resetBtnEl = document.getElementById('achResetBtn');
  document.getElementById('achBtn').addEventListener('click', () => { render(); modalEl.hidden = false; });
  document.getElementById('achClose').addEventListener('click', () => { modalEl.hidden = true; });
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) modalEl.hidden = true; });
  resetBtnEl.addEventListener('click', handleReset);
  refreshBadge();
}
