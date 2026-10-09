// The achievements kit: one store, one toast, one grid for every trainer.
// Each app keeps its own list and its own rules (what counts, when to
// grant); the kit remembers what is unlocked, counts, pops the toasts, and
// draws the case in the app's modal.
//
// An achievement: { id, vis: 'visible' | 'secret' | 'ultra', icon, name,
// desc, hint?, metric?, target? , value?(store) }.
//   visible  shown greyed while locked, with a progress bar when it has a target
//   secret   "???" and its hint while locked
//   ultra    a locked riddle while locked
// It unlocks when its value (value(store), or the counter named by metric)
// reaches target, or when the app grants it.
//
// The pure helpers at the top run under `node --test` and on the
// Statistics page, which shows every app's case from the saved stores.

import { escapeHtml } from '../core/dom.js';
import { read, write } from '../core/store.js';

export const TIERS = ['visible', 'secret', 'ultra'];

export const emptyStore = () => ({ unlocked: {}, counters: {} });

// Saved stores, whatever their age. Sight-reading used to save a flat
// { id: time } map of unlocked achievements.
export function normalizeStore(saved) {
  if (!saved || typeof saved !== 'object') return emptyStore();
  if (!('unlocked' in saved) && !('counters' in saved)) {
    const unlocked = {};
    for (const [k, v] of Object.entries(saved)) if (v) unlocked[k] = typeof v === 'number' ? v : Date.now();
    return { ...emptyStore(), unlocked };
  }
  return { ...saved, unlocked: { ...(saved.unlocked || {}) }, counters: { ...(saved.counters || {}) } };
}

export const isUnlockedIn = (store, id) => !!store.unlocked[id];

export function unlockedCount(list, store) {
  return list.filter((a) => store.unlocked[a.id]).length;
}

// How far a locked achievement is, from the store alone: null when it has no
// target to measure.
export function progressOf(a, store, metricValue = (m, s) => s.counters[m] || 0) {
  if (!a.target) return null;
  const raw = a.value ? a.value(store) : a.metric ? metricValue(a.metric, store) : 0;
  return { value: Math.min(raw || 0, a.target), target: a.target };
}

// The achievements newly earned by their values, in list order.
export function dueUnlocks(list, store, metricValue) {
  return list.filter((a) => {
    if (store.unlocked[a.id] || !a.target || (!a.value && !a.metric)) return false;
    const p = progressOf(a, store, metricValue);
    return p && p.value >= p.target;
  });
}

const TOAST_TIER = { visible: 'Achievement unlocked', secret: 'Secret unlocked', ultra: 'Ultra-rare unlocked' };

// One tile. `cls` maps the states to the page's class names, so Ghost Jam
// keeps its arcade skin.
export const DEFAULT_CLASSES = { unlocked: 'ach-tile-unlocked', locked: 'ach-tile-locked', secret: 'ach-tile-secret', ultra: 'ach-tile-ultra' };

export function tileHtml(a, store, { cls = DEFAULT_CLASSES, metricValue } = {}) {
  if (store.unlocked[a.id]) {
    const when = new Date(store.unlocked[a.id]).toLocaleDateString();
    return `<div class="ach-tile ${cls.unlocked}" title="Unlocked ${escapeHtml(when)}">
      <div class="ach-tile-icon">${a.icon}</div>
      <div class="ach-tile-body"><div class="ach-tile-name">${escapeHtml(a.name)}</div><div class="ach-tile-desc">${escapeHtml(a.desc)}</div></div>
    </div>`;
  }
  if (a.vis === 'secret') {
    return `<div class="ach-tile ${cls.locked} ${cls.secret}">
      <div class="ach-tile-icon">?</div>
      <div class="ach-tile-body"><div class="ach-tile-name">???</div><div class="ach-tile-desc">${escapeHtml(a.hint || '')}</div></div>
    </div>`;
  }
  if (a.vis === 'ultra') {
    return `<div class="ach-tile ${cls.locked} ${cls.ultra}">
      <div class="ach-tile-icon">\u{1F512}</div>
      <div class="ach-tile-body"><div class="ach-tile-tag">Ultra-rare</div><div class="ach-tile-name">—</div><div class="ach-tile-desc">${escapeHtml(a.hint || '')}</div></div>
      <div class="ach-tile-shimmer" aria-hidden="true"></div>
    </div>`;
  }
  const p = progressOf(a, store, metricValue);
  const bar = p ? `<div class="ach-tile-progress"><div class="ach-tile-bar"><div class="ach-tile-fill" style="width:${Math.round((p.value / p.target) * 100)}%"></div></div><div class="ach-tile-progress-text">${p.value} / ${p.target}</div></div>` : '';
  return `<div class="ach-tile ${cls.locked}">
    <div class="ach-tile-icon">${a.icon}</div>
    <div class="ach-tile-body"><div class="ach-tile-name">${escapeHtml(a.name)}</div><div class="ach-tile-desc">${escapeHtml(a.desc)}</div>${bar}</div>
  </div>`;
}

// The sections of a case: one per tier, with its count.
export function sectionsHtml(list, store, sections, opts = {}) {
  return sections.map((sec) => {
    const items = list.filter((a) => a.vis === sec.vis);
    if (!items.length) return '';
    return `<div class="ach-section ach-section-${sec.vis}">
      <div class="ach-section-header"><span class="ach-section-label">${sec.label}</span><span class="ach-section-count">${unlockedCount(items, store)} / ${items.length}</span></div>
      <div class="ach-section-blurb">${sec.blurb}</div>
      <div class="ach-grid">${items.map((a) => tileHtml(a, store, opts)).join('')}</div>
    </div>`;
  }).join('');
}

// ---- The live case, in a page ----
//
// options:
//   list, key, sections         the app's achievements, its store key, its tiers' copy
//   fresh()                     a new store (default { unlocked, counters })
//   metricValue(metric, store)  how to read a metric (default: its counter)
//   ids                         element ids: btn, badge, modal, grid, count, close, toast, reset
//   classes                     tile classes (DEFAULT_CLASSES)
//   resetLabel, resetConfirm    the reset button's two steps
//   onReset()                   after the store is wiped (an app may wipe more)
//   onUnlock(a)                 after each unlock
export function createAchievements(options) {
  const {
    list, key, sections,
    fresh = emptyStore,
    metricValue = (m, s) => s.counters[m] || 0,
    classes = DEFAULT_CLASSES,
    resetLabel = 'Reset achievements',
    resetConfirm = 'Click again to confirm. This cannot be undone.',
    onReset = () => {},
  } = options;
  const ids = { btn: 'achBtn', badge: 'achBadge', modal: 'achModal', grid: 'achGrid', count: 'achCount', close: 'achClose', toast: 'achToast', reset: 'achResetBtn', ...options.ids };
  const byId = Object.fromEntries(list.map((a) => [a.id, a]));
  let onUnlock = options.onUnlock || (() => {});

  let store = { ...fresh(), ...normalizeStore(read(key, null)) };
  const el = (name) => (typeof document === 'undefined' ? null : document.getElementById(ids[name]));

  const save = () => write(key, store);

  function paintBadge() {
    const b = el('badge');
    if (b) b.textContent = unlockedCount(list, store) || '';
  }

  // Toasts, queued so a big moment shows each one.
  const queue = [];
  let busy = false;
  let quiet = false;
  function pump() {
    const toast = el('toast');
    if (busy || !toast || !queue.length) return;
    const a = queue.shift();
    busy = true;
    toast.innerHTML = `<div class="ach-toast-icon">${a.icon}</div>
      <div class="ach-toast-text">
        <div class="ach-toast-tier">${TOAST_TIER[a.vis] || TOAST_TIER.visible}</div>
        <div class="ach-toast-name">${escapeHtml(a.name)}</div>
        <div class="ach-toast-desc">${escapeHtml(a.desc)}</div>
      </div>`;
    toast.classList.toggle('is-rare', a.vis !== 'visible');
    toast.classList.add('visible');
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => { busy = false; pump(); }, 400);
    }, 3600);
  }

  function unlock(a) {
    if (!a || store.unlocked[a.id]) return false;
    store.unlocked[a.id] = Date.now();
    if (!quiet) { queue.push(a); pump(); }
    onUnlock(a);
    return true;
  }

  // Re-checks every value-based achievement. Returns the new ones.
  function check({ silent = false } = {}) {
    quiet = silent;
    const fresh = dueUnlocks(list, store, metricValue).filter(unlock);
    quiet = false;
    if (fresh.length) { save(); paintBadge(); if (isOpen()) render(); }
    return fresh;
  }

  function commit() {
    check();
    save();
    paintBadge();
  }

  // ---- Modal ----

  const modal = () => el('modal');
  // Pages show the modal either with the hidden attribute or with
  // display: flex; follow whichever the markup starts with.
  const usesHidden = () => modal()?.hasAttribute('hidden') || modal()?.hidden === true || modal()?.dataset.kitHidden === '1';
  function isOpen() {
    const m = modal();
    if (!m) return false;
    return m.dataset.kitHidden === '1' ? !m.hidden : m.style.display === 'flex';
  }

  let armed = false, armTimer = null;
  function disarm() {
    armed = false;
    clearTimeout(armTimer);
    const r = el('reset');
    if (r) { r.textContent = resetLabel; r.classList.remove('armed'); }
  }

  function render() {
    const grid = el('grid');
    if (!grid) return;
    grid.innerHTML = sectionsHtml(list, store, sections, { cls: classes, metricValue });
    const count = el('count');
    if (count) count.textContent = `${unlockedCount(list, store)} / ${list.length}`;
  }

  function open() {
    const m = modal();
    if (!m) return;
    render();
    disarm();
    if (m.dataset.kitHidden === '1') m.hidden = false; else m.style.display = 'flex';
  }
  function close() {
    const m = modal();
    if (!m) return;
    if (m.dataset.kitHidden === '1') m.hidden = true; else m.style.display = 'none';
    disarm();
  }

  function reset() {
    store = fresh();
    save();
    onReset();
    render();
    paintBadge();
  }

  function init() {
    const m = modal();
    if (m && usesHidden()) m.dataset.kitHidden = '1';
    el('btn')?.addEventListener('click', open);
    el('close')?.addEventListener('click', close);
    m?.addEventListener('click', (e) => { if (e.target === m) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
    el('reset')?.addEventListener('click', () => {
      const r = el('reset');
      if (!armed) {
        armed = true;
        r.textContent = resetConfirm;
        r.classList.add('armed');
        clearTimeout(armTimer);
        armTimer = setTimeout(disarm, 5000);
        return;
      }
      disarm();
      reset();
    });
    disarm();
    check({ silent: true });
    paintBadge();
  }

  return {
    init, open, close, render, check, save, reset,
    get store() { return store; },
    set onUnlock(fn) { onUnlock = fn; },
    isUnlocked: (id) => !!store.unlocked[id],
    // Grants one id or several, by the app's own rules.
    grant(idOrIds) {
      for (const id of [].concat(idOrIds)) unlock(byId[id]);
      commit();
    },
    bump(metric, delta = 1) {
      store.counters[metric] = (store.counters[metric] || 0) + delta;
      commit();
    },
    setMax(metric, value) {
      if ((store.counters[metric] || 0) >= value) return;
      store.counters[metric] = value;
      commit();
    },
    setValue(metric, value) {
      store.counters[metric] = value;
      commit();
    },
    // For apps with richer stores (Chords' root sets and time windows):
    // change the store, then call commit().
    commit,
  };
}
