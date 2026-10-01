// Read Trainer achievements: same look and tiers as the chord trainer's
// (visible / secret / ultra), separate list and storage. Progress values are
// read from progress.js, so this module only remembers what's unlocked.

import { LEVELS } from './levels.js';
import { counter, levelStars, totalStars, resetProgress } from './progress.js';

const KEY = 'readTrainer.achievements';

const done = (id) => (levelStars(id) >= 1 ? 1 : 0);
const threeStarLevels = () => LEVELS.filter((l) => levelStars(l.id) >= 3).length;

const ACH = [
  // ---- Visible ----
  { id: 'first',    vis: 'visible', icon: '\u{1F440}', name: 'First Sight',        desc: 'Finish your first exercise',               target: 1,    value: () => counter('exercises') },
  { id: 'ex10',     vis: 'visible', icon: '\u{1F4D6}', name: 'Page Turner',        desc: 'Finish 10 exercises',                      target: 10,   value: () => counter('exercises') },
  { id: 'ex50',     vis: 'visible', icon: '\u{1F4DA}', name: 'Bookworm',           desc: 'Finish 50 exercises',                      target: 50,   value: () => counter('exercises') },
  { id: 'notes100', vis: 'visible', icon: '\u{1F3B5}', name: 'Note-worthy',        desc: 'Read 100 notes',                           target: 100,  value: () => counter('notes') },
  { id: 'notes1k',  vis: 'visible', icon: '\u{1F3B6}', name: 'Well Read',          desc: 'Read 1,000 notes',                         target: 1000, value: () => counter('notes') },
  { id: 'notes5k',  vis: 'visible', icon: '\u{1F4DC}', name: 'Library Card',       desc: 'Read 5,000 notes',                         target: 5000, value: () => counter('notes') },
  { id: 'clean',    vis: 'visible', icon: '\u{2728}',  name: 'Clean Sheet',        desc: 'Finish an exercise without a wrong note',  target: 1,    value: () => counter('cleanRuns') },
  { id: 'clean10',  vis: 'visible', icon: '\u{1F9FC}', name: 'Spotless',           desc: '10 exercises without a wrong note',        target: 10,   value: () => counter('cleanRuns') },
  { id: 'tempo1',   vis: 'visible', icon: '\u{23F1}\u{FE0F}', name: 'In Time',     desc: 'Finish an exercise in Tempo mode',         target: 1,    value: () => counter('tempoRuns') },
  { id: 'stars10',  vis: 'visible', icon: '\u{2B50}',  name: 'Rising Star',        desc: 'Collect 10 stars',                         target: 10,   value: totalStars },
  { id: 'stars30',  vis: 'visible', icon: '\u{1F31F}', name: 'Constellation',      desc: 'Collect 30 stars',                         target: 30,   value: totalStars },
  { id: 'both',     vis: 'visible', icon: '\u{1F64C}', name: 'Ambidextrous',       desc: 'Pass Hands Together',                      target: 1,    value: () => done('l6') },
  { id: 'rep1',     vis: 'visible', icon: '\u{1F3AA}', name: 'Salon Debut',        desc: 'Pass Repertoire I',                        target: 1,    value: () => done('rep1') },
  { id: 'keys',     vis: 'visible', icon: '\u{1F511}', name: 'Key Holder',         desc: 'Pass G & F Major',                         target: 1,    value: () => done('l7') },
  { id: 'six',      vis: 'visible', icon: '\u{1F483}', name: 'Six Appeal',         desc: 'Pass Compound Time',                       target: 1,    value: () => done('l10') },
  { id: 'rep3',     vis: 'visible', icon: '\u{1F3BB}', name: 'Recital Ready',      desc: 'Pass Repertoire III',                      target: 1,    value: () => done('rep3') },

  // ---- Secret ----
  { id: 'metronomic', vis: 'secret', icon: '\u{1F916}', name: 'Metronomic',        desc: 'Every note perfectly on time in Tempo mode', hint: 'Become one with the click.',          target: 1, value: () => counter('event.metronomic') },
  { id: 'allegro',    vis: 'secret', icon: '\u{1F3CE}\u{FE0F}', name: 'Allegro Assai', desc: 'Finish a Tempo run at 140 bpm or faster', hint: 'Some like it fast.',                   target: 1, value: () => counter('event.allegro') },
  { id: 'elise',      vis: 'secret', icon: '\u{1F48C}', name: 'Dear Elise',        desc: 'Three stars on Für Elise',                 hint: 'A letter to someone special.',          target: 1, value: () => counter('event.elise') },
  { id: 'again',      vis: 'secret', icon: '\u{1F501}', name: 'Da Capo',           desc: 'Retry the same exercise 5 times in a row', hint: 'Again. And again. And again…',          target: 1, value: () => counter('event.again') },
  { id: 'nocturne',   vis: 'secret', icon: '\u{1F319}', name: 'Nocturne',          desc: 'Practise between midnight and 5 a.m.',     hint: "Chopin's favourite hour.",              target: 1, value: () => counter('event.nocturne') },
  { id: 'line50',     vis: 'secret', icon: '\u{1F9F5}', name: 'Unbroken Line',     desc: '50 correct notes in a row',                hint: "Don't break the line.",                 target: 1, value: () => counter('event.line50') },

  // ---- Ultra ----
  { id: 'prima',   vis: 'ultra', icon: '\u{1F451}', name: 'Prima Vista',           desc: 'Three stars on every level',               hint: 'Every star in the sky.',                target: LEVELS.length, value: threeStarLevels },
];

let unlocked = {};
let modalEl, gridEl, countEl, toastEl, resetBtnEl;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function load() {
  try { unlocked = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { unlocked = {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(unlocked)); } catch { /* ignore */ }
  paintBadge();
}
// Unlocked count next to the header trophy (empty until the first one).
function paintBadge() {
  const el = document.getElementById('achBadge');
  if (el) el.textContent = ACH.filter((a) => unlocked[a.id]).length || '';
}

let toastQueue = Promise.resolve();
function showToast(a) {
  toastQueue = toastQueue.then(() => new Promise((resolve) => {
    toastEl.innerHTML = `
      <div class="ach-toast-icon">${a.icon}</div>
      <div class="ach-toast-text">
        <div class="ach-toast-tier">Achievement unlocked</div>
        <div class="ach-toast-name">${escapeHtml(a.name)}</div>
      </div>`;
    toastEl.classList.add('visible');
    setTimeout(() => { toastEl.classList.remove('visible'); setTimeout(resolve, 400); }, 3200);
  }));
}

// Re-evaluates every achievement; call after anything that changes progress.
export function checkAchievements({ silent = false } = {}) {
  const fresh = [];
  for (const a of ACH) {
    if (unlocked[a.id]) continue;
    if (a.value() >= a.target) {
      unlocked[a.id] = Date.now();
      fresh.push(a);
    }
  }
  if (fresh.length) {
    save();
    if (!silent) fresh.forEach(showToast);
  }
  return fresh;
}

function renderTile(a) {
  if (unlocked[a.id]) {
    return `<div class="ach-tile ach-tile-unlocked"><div class="ach-tile-icon">${a.icon}</div>
      <div class="ach-tile-body"><div class="ach-tile-name">${escapeHtml(a.name)}</div>
      <div class="ach-tile-desc">${escapeHtml(a.desc)}</div></div></div>`;
  }
  if (a.vis === 'secret') {
    return `<div class="ach-tile ach-tile-locked ach-tile-secret"><div class="ach-tile-icon">?</div>
      <div class="ach-tile-body"><div class="ach-tile-name">???</div>
      <div class="ach-tile-desc">${escapeHtml(a.hint)}</div></div></div>`;
  }
  if (a.vis === 'ultra') {
    return `<div class="ach-tile ach-tile-locked ach-tile-ultra"><div class="ach-tile-icon">\u{1F512}</div>
      <div class="ach-tile-body"><div class="ach-tile-tag">Ultra-rare</div><div class="ach-tile-name">—</div>
      <div class="ach-tile-desc">${escapeHtml(a.hint)}</div></div><div class="ach-tile-shimmer" aria-hidden="true"></div></div>`;
  }
  const value = Math.min(a.value(), a.target);
  const pct = Math.round((value / a.target) * 100);
  return `<div class="ach-tile ach-tile-locked"><div class="ach-tile-icon">${a.icon}</div>
    <div class="ach-tile-body"><div class="ach-tile-name">${escapeHtml(a.name)}</div>
    <div class="ach-tile-desc">${escapeHtml(a.desc)}</div>
    <div class="ach-tile-progress"><div class="ach-tile-bar"><div class="ach-tile-fill" style="width:${pct}%"></div></div>
    <div class="ach-tile-progress-text">${value} / ${a.target}</div></div></div></div>`;
}

const SECTIONS = [
  { vis: 'visible', label: 'Common',     blurb: 'Earned through steady practice.' },
  { vis: 'secret',  label: 'Rare',       blurb: 'Trigger conditions are hidden. Some things you stumble on.' },
  { vis: 'ultra',   label: 'Ultra-rare', blurb: 'Reserved for those who go truly far.' },
];

function renderModal() {
  gridEl.innerHTML = SECTIONS.map((sec) => {
    const items = ACH.filter((a) => a.vis === sec.vis);
    const n = items.filter((a) => unlocked[a.id]).length;
    return `<div class="ach-section ach-section-${sec.vis}">
      <div class="ach-section-header"><span class="ach-section-label">${sec.label}</span>
      <span class="ach-section-count">${n} / ${items.length}</span></div>
      <div class="ach-section-blurb">${sec.blurb}</div>
      <div class="ach-grid">${items.map(renderTile).join('')}</div></div>`;
  }).join('');
  countEl.textContent = `${ACH.filter((a) => unlocked[a.id]).length} / ${ACH.length}`;
}

let armed = false, armTimer = null;
function disarm() {
  armed = false;
  clearTimeout(armTimer);
  resetBtnEl.textContent = 'Reset all progress';
  resetBtnEl.classList.remove('armed');
}

export function initAchievements({ onReset }) {
  load();
  paintBadge();
  modalEl = document.getElementById('achModalOverlay');
  gridEl = document.getElementById('achGrid');
  countEl = document.getElementById('achCount');
  toastEl = document.getElementById('achToast');
  resetBtnEl = document.getElementById('achResetBtn');

  const close = () => { modalEl.style.display = 'none'; disarm(); };
  document.getElementById('achBtn').addEventListener('click', () => { renderModal(); modalEl.style.display = 'flex'; });
  document.getElementById('achModalClose').addEventListener('click', close);
  modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalEl.style.display === 'flex') close(); });

  // Two-step confirm: wipes stars, unlocked levels and achievements.
  resetBtnEl.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      resetBtnEl.textContent = 'Click again to erase stars, levels and achievements';
      resetBtnEl.classList.add('armed');
      armTimer = setTimeout(disarm, 5000);
      return;
    }
    unlocked = {};
    save();
    resetProgress();
    renderModal();
    disarm();
    onReset?.();
  });

  checkAchievements({ silent: true });
}
