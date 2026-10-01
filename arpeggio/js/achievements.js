// Arpeggio Trainer achievements. Same tiers and look as the chord trainer's
// (visible / secret / ultra) but a separate store: these reward *how* you
// play — touch, timing, curiosity, hidden melodies — more than volume.

import { escapeHtml } from '../../js/core/dom.js';

const LS_KEY = 'arpeggioTrainer.achievements';

// visible: metric + target (progress bar). secret/ultra: granted by events.
export const ACH = [
  // ---- Common ----
  { id: 'firstArp',   vis: 'visible', icon: '\u{1F331}', name: 'Hello, Arpeggio',      desc: 'Complete your first arpeggio',                  metric: 'arps.total',     target: 1 },
  { id: 'arps100',    vis: 'visible', icon: '\u{1FA9C}', name: "Jacob's Ladder",       desc: '100 arpeggios completed',                       metric: 'arps.total',     target: 100 },
  { id: 'level1',     vis: 'visible', icon: '\u{2B06}\u{FE0F}', name: 'Stairway',      desc: 'Clear level 1',                                 metric: 'level.1',        target: 1 },
  { id: 'level2',     vis: 'visible', icon: '\u{2B07}\u{FE0F}', name: 'Basement Tapes', desc: 'Clear level 2',                                metric: 'level.2',        target: 1 },
  { id: 'level5',     vis: 'visible', icon: '\u{1F3E2}', name: 'Halfway House',        desc: 'Clear level 5',                                 metric: 'level.5',        target: 1 },
  { id: 'levelsAll',  vis: 'visible', icon: '\u{1F5FA}\u{FE0F}', name: 'Grand Tour',   desc: 'Clear all 15 levels',                           metric: 'levels.cleared', target: 15 },
  { id: 'stars3',     vis: 'visible', icon: '\u{2B50}',  name: 'Three Michelin Stars', desc: 'Earn three stars on any level',                 metric: 'stars3.count',   target: 1 },
  { id: 'combo12',    vis: 'visible', icon: '\u{1F525}', name: 'On Fire',              desc: '12 clean arpeggios in a row',                   metric: 'combo.best',     target: 12 },
  { id: 'weakDone',   vis: 'visible', icon: '\u{1FA79}', name: 'Physiotherapy',        desc: 'Finish a Weak Spots session',                   metric: 'weak.sessions',  target: 1 },

  // ---- Rare: touch & timing ----
  { id: 'feather',    vis: 'secret', icon: '\u{1FAB6}', name: 'Feather Touch',         desc: 'A clean arpeggio, every note pianissimo',       hint: 'Barely there.' },
  { id: 'thunder',    vis: 'secret', icon: '\u{26A1}',  name: "Thor's Hammer",         desc: 'A clean arpeggio, every note fortissimo',       hint: 'Wake the neighbours.' },
  { id: 'bolero',     vis: 'secret', icon: '\u{1F4C8}', name: 'Boléro',           desc: 'A clean arpeggio that grows louder on every note', hint: 'Ravel would approve of the build-up.' },
  { id: 'fade',       vis: 'secret', icon: '\u{1F4C9}', name: 'Fade to Black',         desc: 'A clean arpeggio that softens on every note',   hint: 'Let it die away.' },
  { id: 'swiss',      vis: 'secret', icon: '\u{231A}',  name: 'Swiss Watch',           desc: 'A clean arpeggio with perfectly even spacing',   hint: 'Tick. Tick. Tick. Tick.' },
  { id: 'ritard',     vis: 'secret', icon: '\u{1F40C}', name: 'Ritardando',            desc: 'Each note of an arpeggio later than the last, by a lot', hint: 'Slow down… slower… slower…' },
  { id: 'bumblebee',  vis: 'secret', icon: '\u{1F41D}', name: 'Flight of the Bumblebee', desc: 'A clean 4-note arpeggio in under 350 ms',     hint: 'Bzzz.' },
  { id: 'sloth',      vis: 'secret', icon: '\u{1F9A5}', name: 'Sloth Mode',            desc: 'A clean arpeggio taking more than 12 seconds',  hint: 'No rush. Really, none at all.' },
  { id: 'pedal',      vis: 'secret', icon: '\u{1F9B6}', name: 'Pedal to the Metal',    desc: 'An arpeggio with the sustain pedal down the whole way', hint: 'Your foot wants in on this.' },

  // ---- Rare: geography & story ----
  { id: 'palindrome', vis: 'secret', icon: '\u{1F501}', name: 'Palindrome',            desc: 'Seven notes that read the same backwards',       hint: 'Able was I ere I saw Elba.' },
  { id: 'penrose',    vis: 'secret', icon: '\u{1F300}', name: 'Penrose Stairs',        desc: 'Four ascending arpeggios in a row, each starting above where the last ended', hint: 'Keep climbing. You never seem to arrive.' },
  { id: 'basement',   vis: 'secret', icon: '\u{1F573}\u{FE0F}', name: 'Down Below',    desc: 'A clean arpeggio entirely below C3',            hint: 'Lower. Lower still.' },
  { id: 'clouds',     vis: 'secret', icon: '\u{2601}\u{FE0F}', name: 'Head in the Clouds', desc: 'A clean arpeggio entirely above C6',        hint: 'The air is thin up here.' },
  { id: 'phoenix',    vis: 'secret', icon: '\u{1F426}\u{200D}\u{1F525}', name: 'Phoenix', desc: 'Five clean arpeggios right after a 4-mistake disaster', hint: 'Burn, then rise.' },
  { id: 'blindfold',  vis: 'secret', icon: '\u{1F648}', name: 'Blindfolded',           desc: 'Clear a level with note names and guide keys hidden', hint: 'Who needs labels?' },
  { id: 'cage',       vis: 'secret', icon: '\u{1F92B}', name: '4′3″',          desc: 'Sit in silence for 4 minutes 33 seconds mid-session', hint: 'Sometimes the best note is none.' },
  { id: 'nightOwl',   vis: 'secret', icon: '\u{1F989}', name: 'Night Owl',             desc: 'Complete an arpeggio between 2 and 5 a.m.',      hint: 'The house is asleep. You are not.' },

  // ---- Rare: easter eggs ----
  { id: 'bach',       vis: 'secret', icon: '\u{1F3BC}', name: 'B-A-C-H',               desc: 'Play B♭ A C B',                            hint: 'Sign your name like a Thomaskantor.' },
  { id: 'furElise',   vis: 'secret', icon: '\u{1F48C}', name: 'For Elise, With Love',  desc: 'Play the opening of Für Elise',            hint: 'A famous letter, possibly misaddressed.' },
  { id: 'odeToJoy',   vis: 'secret', icon: '\u{1F942}', name: 'Freude!',               desc: 'Play the Ode to Joy',                           hint: 'All men become brothers.' },
  { id: 'closeEnc',   vis: 'secret', icon: '\u{1F6F8}', name: 'We Come in Peace',      desc: 'Play the Close Encounters greeting',            hint: 'Five notes to greet the visitors.' },
  { id: 'oneUp',      vis: 'secret', icon: '\u{1F344}', name: '1-Up',                  desc: 'Play a certain plumber’s theme',           hint: 'Extra life, mushroom-approved.' },
  { id: 'jaws',       vis: 'secret', icon: '\u{1F988}', name: 'Duun-dun',              desc: 'A low half-step ostinato',                      hint: 'You’re gonna need a bigger piano.' },
  { id: 'tristan',    vis: 'secret', icon: '\u{1F494}', name: 'Liebestod',             desc: 'Hold the Tristan chord (F B D♯ G♯)',   hint: 'One chord, a century of harmony.' },
  { id: 'chromatic',  vis: 'secret', icon: '\u{1F308}', name: 'Chromatic Aberration',  desc: 'Thirteen semitones in a row',                   hint: 'Every colour, in order.' },
  { id: 'glissando',  vis: 'secret', icon: '\u{1F30A}', name: 'Glissando',             desc: 'Sweep eight white keys in a flash',             hint: 'Slide.' },
  { id: 'cluster',    vis: 'secret', icon: '\u{1F4A5}', name: 'Forearm Smash',         desc: 'Ten keys down at once',                         hint: 'Use more of your arm.' },

  // ---- Ultra-rare ----
  { id: 'constell',   vis: 'ultra',  icon: '\u{1F30C}', name: 'Constellation',         desc: 'Three stars on every level',                    hint: 'Forty-five lights in the sky.' },
  { id: 'twelveGates', vis: 'ultra', icon: '\u{1F511}', name: 'Twelve Gates',          desc: 'Clean arpeggios of one quality on all 12 roots in one session', hint: 'Twelve doors, one key.' },
];

const byId = Object.fromEntries(ACH.map(a => [a.id, a]));

let store = { unlocked: {}, counters: {} };

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) store = { unlocked: {}, counters: {}, ...JSON.parse(raw) };
  } catch { /* ignore */ }
}

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

// ---- Toasts (queued so a multi-unlock moment shows each one) ----

let toastEl = null;
const toastQueue = [];
let toastBusy = false;

function pumpToasts() {
  if (toastBusy || !toastEl || !toastQueue.length) return;
  const a = toastQueue.shift();
  toastBusy = true;
  const tier = a.vis === 'ultra' ? 'Ultra-rare unlocked' : a.vis === 'secret' ? 'Secret unlocked' : 'Achievement unlocked';
  toastEl.innerHTML = `
    <div class="ach-toast-icon">${a.icon}</div>
    <div class="ach-toast-text">
      <div class="ach-toast-tier">${tier}</div>
      <div class="ach-toast-name">${escapeHtml(a.name)}</div>
      <div class="ach-toast-desc">${escapeHtml(a.desc)}</div>
    </div>`;
  toastEl.classList.toggle('is-rare', a.vis !== 'visible');
  toastEl.classList.add('visible');
  setTimeout(() => {
    toastEl.classList.remove('visible');
    setTimeout(() => { toastBusy = false; pumpToasts(); }, 400);
  }, 3600);
}

let onUnlock = () => {};
export function setUnlockListener(fn) { onUnlock = fn; }

function unlock(a) {
  if (store.unlocked[a.id]) return false;
  store.unlocked[a.id] = Date.now();
  toastQueue.push(a);
  pumpToasts();
  onUnlock(a);
  return true;
}

function checkCounters() {
  let any = false;
  for (const a of ACH) {
    if (!a.metric || store.unlocked[a.id]) continue;
    if ((store.counters[a.metric] || 0) >= a.target) any = unlock(a) || any;
  }
  return any;
}

// ---- Public API ----

export function grant(id) {
  const a = byId[id];
  if (!a || store.unlocked[id]) return;
  unlock(a);
  save();
  refreshBadge();
}

export function bump(metric, delta = 1) {
  store.counters[metric] = (store.counters[metric] || 0) + delta;
  checkCounters();
  save();
  refreshBadge();
}

export function setMax(metric, value) {
  if ((store.counters[metric] || 0) >= value) return;
  store.counters[metric] = value;
  checkCounters();
  save();
  refreshBadge();
}

export function setValue(metric, value) {
  store.counters[metric] = value;
  checkCounters();
  save();
  refreshBadge();
}

export function isUnlocked(id) { return !!store.unlocked[id]; }

// ---- Modal ----

let modalEl, gridEl, countEl, badgeEl, resetBtnEl;

function refreshBadge() {
  if (badgeEl) badgeEl.textContent = Object.keys(store.unlocked).filter(id => byId[id]).length || '';
}

function tile(a) {
  if (store.unlocked[a.id]) {
    const when = new Date(store.unlocked[a.id]).toLocaleDateString();
    return `<div class="ach-tile ach-tile-unlocked" title="Unlocked ${escapeHtml(when)}">
      <div class="ach-tile-icon">${a.icon}</div>
      <div class="ach-tile-body"><div class="ach-tile-name">${escapeHtml(a.name)}</div><div class="ach-tile-desc">${escapeHtml(a.desc)}</div></div>
    </div>`;
  }
  if (a.vis === 'secret') {
    return `<div class="ach-tile ach-tile-locked ach-tile-secret">
      <div class="ach-tile-icon">?</div>
      <div class="ach-tile-body"><div class="ach-tile-name">???</div><div class="ach-tile-desc">${escapeHtml(a.hint)}</div></div>
    </div>`;
  }
  if (a.vis === 'ultra') {
    return `<div class="ach-tile ach-tile-locked ach-tile-ultra">
      <div class="ach-tile-icon">\u{1F512}</div>
      <div class="ach-tile-body"><div class="ach-tile-tag">Ultra-rare</div><div class="ach-tile-name">—</div><div class="ach-tile-desc">${escapeHtml(a.hint)}</div></div>
      <div class="ach-tile-shimmer" aria-hidden="true"></div>
    </div>`;
  }
  const value = Math.min(store.counters[a.metric] || 0, a.target);
  const pct = Math.round((value / a.target) * 100);
  return `<div class="ach-tile ach-tile-locked">
    <div class="ach-tile-icon">${a.icon}</div>
    <div class="ach-tile-body">
      <div class="ach-tile-name">${escapeHtml(a.name)}</div><div class="ach-tile-desc">${escapeHtml(a.desc)}</div>
      <div class="ach-tile-progress"><div class="ach-tile-bar"><div class="ach-tile-fill" style="width:${pct}%"></div></div><div class="ach-tile-progress-text">${value} / ${a.target}</div></div>
    </div>
  </div>`;
}

const SECTIONS = [
  { vis: 'visible', label: 'Common',     blurb: 'Milestones along the path.' },
  { vis: 'secret',  label: 'Rare',       blurb: 'Touch, timing, curiosity. Some melodies hide in the keys.' },
  { vis: 'ultra',   label: 'Ultra-rare', blurb: 'For the obsessive, the patient and the lucky.' },
];

function render() {
  gridEl.innerHTML = SECTIONS.map(sec => {
    const items = ACH.filter(a => a.vis === sec.vis);
    const done = items.filter(a => store.unlocked[a.id]).length;
    return `<div class="ach-section ach-section-${sec.vis}">
      <div class="ach-section-header"><span class="ach-section-label">${sec.label}</span><span class="ach-section-count">${done} / ${items.length}</span></div>
      <div class="ach-section-blurb">${sec.blurb}</div>
      <div class="ach-grid">${items.map(tile).join('')}</div>
    </div>`;
  }).join('');
  countEl.textContent = `${ACH.filter(a => store.unlocked[a.id]).length} / ${ACH.length}`;
  resetArmed = false;
  resetBtnEl.textContent = 'Reset arpeggio achievements';
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
  store = { unlocked: {}, counters: {} };
  save();
  render();
  refreshBadge();
}

export function openAchievements() {
  render();
  modalEl.hidden = false;
}

export function initAchievements() {
  load();
  modalEl = document.getElementById('achModal');
  gridEl = document.getElementById('achGrid');
  countEl = document.getElementById('achCount');
  badgeEl = document.getElementById('achBadge');
  toastEl = document.getElementById('achToast');
  resetBtnEl = document.getElementById('achResetBtn');
  document.getElementById('achBtn').addEventListener('click', openAchievements);
  document.getElementById('achClose').addEventListener('click', () => { modalEl.hidden = true; });
  modalEl.addEventListener('click', e => { if (e.target === modalEl) modalEl.hidden = true; });
  resetBtnEl.addEventListener('click', handleReset);
  refreshBadge();
}
