// Daily goal: a single, date-seeded objective.
//
// Surface: a compact pill placed near the streak counter (low intrusion).
// Tap the pill → modal with full goal details, tier ladder, completion streak,
// 14-day history dot grid, and a "Set up my session" shortcut.
//
// Goal types (v1):
//   quality  — N successful chords of a given quality (e.g. 10 minor)
//   rootSet  — a given quality played on N distinct roots (e.g. mMaj7 on 4)
//
// Tiers per day:
//   bronze = target (1×) — also: increments the multi-day completion streak
//   silver = target × 1.5
//   gold   = target × 2
// Confetti fires on every tier-up; intensity scales with tier.
// rootSet tiers are clamped at 12 (you can't play more than 12 distinct roots).

import { state } from '../core/state.js';
import { onSuccess } from './feedback.js';
import { celebrate } from './rewards.js';
import { LS } from '../core/constants.js';
import { $, $$ } from '../core/dom.js';

// ---- Goal pool ----------------------------------------------------------

const GOALS = [
  { id: 'maj10',    type: 'quality', quality: 'maj',   target: 10, label: '10 major chords' },
  { id: 'min10',    type: 'quality', quality: 'min',   target: 10, label: '10 minor chords' },
  { id: 'maj7_8',   type: 'quality', quality: 'maj7',  target: 8,  label: '8 major 7th chords' },
  { id: 'min7_8',   type: 'quality', quality: 'min7',  target: 8,  label: '8 minor 7th chords' },
  { id: 'dom7_10',  type: 'quality', quality: 'dom7',  target: 10, label: '10 dominant 7th chords' },
  { id: 'm7b5_5',   type: 'quality', quality: 'm7b5',  target: 5,  label: '5 half-diminished chords' },
  { id: 'aug_5',    type: 'quality', quality: 'aug',   target: 5,  label: '5 augmented chords' },
  { id: 'mMaj7_5',  type: 'quality', quality: 'mMaj7', target: 5,  label: '5 minor-major 7th chords' },
  { id: 'dim_5',    type: 'quality', quality: 'dim',   target: 5,  label: '5 diminished chords' },

  { id: 'majAll',   type: 'rootSet', quality: 'maj',   target: 12, label: 'major on all 12 roots' },
  { id: 'maj7_6r',  type: 'rootSet', quality: 'maj7',  target: 6,  label: 'major 7th on 6 different roots' },
  { id: 'min7_6r',  type: 'rootSet', quality: 'min7',  target: 6,  label: 'minor 7th on 6 different roots' },
  { id: 'dom7_7r',  type: 'rootSet', quality: 'dom7',  target: 7,  label: 'dominant 7th on 7 different roots' },
  { id: 'm7b5_4r',  type: 'rootSet', quality: 'm7b5',  target: 4,  label: 'half-diminished on 4 different roots' },
  { id: 'aug_4r',   type: 'rootSet', quality: 'aug',   target: 4,  label: 'augmented on 4 different roots' },
];

// ---- Date helpers -------------------------------------------------------

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayStr() { return ymd(new Date()); }
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Pick today's goal, deterministic from the date but skipping any goal that
// landed in the last `recentIds` window. With 15 goals and a 7-day window,
// the user never sees the same goal twice in a week — yet the choice stays
// reproducible from the date alone (given the same recent log).
function pickGoalFor(dateStr, recentIds = []) {
  const start = hashStr(dateStr) % GOALS.length;
  for (let i = 0; i < GOALS.length; i++) {
    const candidate = GOALS[(start + i) % GOALS.length];
    if (!recentIds.includes(candidate.id)) return candidate;
  }
  return GOALS[start];
}

// Last `days` goalIds the user was assigned (excluding today). Reads from
// store.goalHistory which is updated whenever a new day starts.
function recentGoalIds(goalHistory, days = 7) {
  if (!goalHistory) return [];
  const out = [];
  for (let i = 1; i <= days; i++) {
    const id = goalHistory[daysAgoStr(i)];
    if (id) out.push(id);
  }
  return out;
}

// ---- Tier model ---------------------------------------------------------

const TIER_NAMES = { 1: 'Bronze', 2: 'Silver', 3: 'Gold' };

// Compute the absolute count required for each tier. For rootSet goals,
// silver/gold are clamped to 12 (the max distinct roots) and may collapse to
// equal bronze — `availableTiers()` flattens that to a single tier so the UI
// doesn't promise targets that can't be hit.
function tierTargets(g) {
  const base = g.target;
  if (g.type === 'rootSet') {
    return {
      1: Math.min(12, base),
      2: Math.min(12, Math.ceil(base * 1.5)),
      3: Math.min(12, base * 2),
    };
  }
  return { 1: base, 2: Math.ceil(base * 1.5), 3: base * 2 };
}

function availableTiers(g) {
  const t = tierTargets(g);
  if (t[2] <= t[1] && t[3] <= t[1]) return [1];
  if (t[3] <= t[2]) return [1, 2];
  return [1, 2, 3];
}

// ---- State + persistence -----------------------------------------------

let store = null;
// store shape:
// {
//   date, goalId,
//   progress,            // for quality type
//   rootsHit,            // for rootSet type
//   tier,                // 0..3 (highest reached today)
//   streak,              // consecutive days with bronze+
//   lastCompletionDate,  // YYYY-MM-DD of last bronze
//   history,             // { 'YYYY-MM-DD': tier }
// }
let goal = null;

function defaultStoreFor(dateStr, prevStore) {
  const goalHistory = { ...(prevStore?.goalHistory || {}) };
  const recent = recentGoalIds(goalHistory, 7);
  const g = pickGoalFor(dateStr, recent);
  goalHistory[dateStr] = g.id;
  return {
    date: dateStr,
    goalId: g.id,
    progress: 0,
    rootsHit: [],
    tier: 0,
    // Carry streak/history forward across days; only progress resets.
    streak: prevStore?.streak ?? 0,
    lastCompletionDate: prevStore?.lastCompletionDate ?? null,
    history: prevStore?.history ?? {},
    goalHistory,
  };
}

function load() {
  const today = todayStr();
  let raw = null;
  try { raw = localStorage.getItem(LS.DAILY_GOAL); } catch { /* ignore */ }
  let prev = null;
  if (raw) {
    try { prev = JSON.parse(raw); } catch { /* ignore */ }
  }

  if (prev) {
    if (prev.date === today) {
      store = prev;
      store.rootsHit ||= [];
      store.history ||= {};
      store.goalHistory ||= {};
      // Anchor today in goalHistory so tomorrow's anti-repetition window
      // can see today's goal (older stores predate this field).
      if (!store.goalHistory[today] && store.goalId) {
        store.goalHistory[today] = store.goalId;
      }
      store.streak ??= 0;
      store.tier ??= 0;
    } else {
      // New day — carry streak/history forward; today's progress resets.
      store = defaultStoreFor(today, prev);
    }
  } else {
    store = defaultStoreFor(today, null);
  }

  // Streak decay: if the last bronze-day was older than yesterday, the streak
  // is dead. Doing this on load (not on next-bronze) means the pill shows the
  // honest number from the moment the page opens, instead of a stale value.
  if (store.lastCompletionDate) {
    const yesterday = daysAgoStr(1);
    if (store.lastCompletionDate !== today && store.lastCompletionDate < yesterday) {
      store.streak = 0;
    }
  }

  goal = GOALS.find(g => g.id === store.goalId);
  if (!goal) {
    // Pool changed; re-pick today.
    store = defaultStoreFor(today, store);
    goal = GOALS.find(g => g.id === store.goalId);
  }
  trimHistory();
}

function save() {
  try { localStorage.setItem(LS.DAILY_GOAL, JSON.stringify(store)); } catch { /* ignore */ }
}

function trimHistory() {
  const cutoff = daysAgoStr(60); // generous window — UI shows 14, keep 60
  if (store.history) {
    for (const k of Object.keys(store.history)) {
      if (k < cutoff) delete store.history[k];
    }
  }
  if (store.goalHistory) {
    // 14 days is enough for a 7-day anti-repetition window with margin.
    const goalCutoff = daysAgoStr(14);
    for (const k of Object.keys(store.goalHistory)) {
      if (k < goalCutoff) delete store.goalHistory[k];
    }
  }
}

// ---- Tracking -----------------------------------------------------------

function progressValue() {
  return goal.type === 'rootSet' ? store.rootsHit.length : store.progress;
}

function currentTier() {
  const v = progressValue();
  const t = tierTargets(goal);
  const tiers = availableTiers(goal);
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (v >= t[tiers[i]]) return tiers[i];
  }
  return 0;
}

function progressCap() {
  // Stop incrementing past the highest available tier so the bar never
  // overflows and the chord doesn't keep counting after gold.
  const tiers = availableTiers(goal);
  return tierTargets(goal)[tiers[tiers.length - 1]];
}

function handleSuccess() {
  if (!goal) return;
  const chord = state.currentChord;
  if (!chord || chord.quality !== goal.quality) return;

  const cap = progressCap();
  if (goal.type === 'quality') {
    if (store.progress >= cap) return;
    store.progress += 1;
  } else {
    if (store.rootsHit.length >= cap) return;
    if (store.rootsHit.includes(chord.root)) return;
    store.rootsHit.push(chord.root);
  }

  const t = currentTier();
  if (t > store.tier) {
    onTierReached(t);
    store.tier = t;
  }

  save();
  renderPill();
  if (modalOverlayEl && modalOverlayEl.style.display === 'flex') renderModal();
}

function onTierReached(tier) {
  // Update day-level streak only on first bronze of the day.
  if (tier === 1) {
    const today = store.date;
    if (store.lastCompletionDate !== today) {
      const yesterday = daysAgoStr(1);
      store.streak = store.lastCompletionDate === yesterday ? (store.streak + 1) : 1;
      store.lastCompletionDate = today;
    }
  }
  store.history[store.date] = tier;
  trimHistory();

  // Confetti — escalates with tier. We pipe through rewards.js's celebrate()
  // so it respects the user's "rewards enabled" preference.
  const counts = { 1: 40, 2: 80, 3: 140 };
  const visualTiers = { 1: 3, 2: 5, 3: 7 };
  celebrate({ count: counts[tier], tier: visualTiers[tier] });

  pingPill();
}

// ---- Pill DOM -----------------------------------------------------------

let pillEl, pillProgressEl, pillStreakEl;

function buildPill() {
  pillEl = document.createElement('button');
  pillEl.type = 'button';
  pillEl.className = 'goal-pill';
  pillEl.id = 'goalPill';
  pillEl.setAttribute('aria-label', 'Open daily goal');
  pillEl.innerHTML = `
    <span class="goal-pill-icon" aria-hidden="true">\u{1F3AF}</span>
    <span class="goal-pill-progress" id="goalPillProgress"></span>
    <span class="goal-pill-streak" id="goalPillStreak"></span>
  `;
  pillEl.addEventListener('click', openModal);

  // Anchor: right after the streak counter (built by rewards.js). Falls back
  // to the status row if the streak counter isn't there yet.
  const anchor = document.getElementById('streakCounter')
              || document.querySelector('.status-row')
              || document.querySelector('.stage');
  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(pillEl, anchor.nextSibling);
  }

  pillProgressEl = $('goalPillProgress');
  pillStreakEl = $('goalPillStreak');
}

function renderPill() {
  if (!pillEl) return;
  const v = progressValue();
  const tiers = availableTiers(goal);
  const cap = tierTargets(goal)[tiers[tiers.length - 1]];

  // Progress label is current/bronze when below bronze, otherwise current/cap.
  const denom = store.tier === 0 ? tierTargets(goal)[1] : cap;
  pillProgressEl.textContent = store.tier >= tiers[tiers.length - 1]
    ? '\u2605'
    : `${v}/${denom}`;

  if (store.streak > 1) {
    pillStreakEl.innerHTML = `<span class="goal-pill-flame" aria-hidden="true">\u{1F525}</span>${store.streak}`;
    pillStreakEl.style.display = '';
  } else {
    pillStreakEl.style.display = 'none';
  }

  pillEl.classList.toggle('tier-1', store.tier === 1);
  pillEl.classList.toggle('tier-2', store.tier === 2);
  pillEl.classList.toggle('tier-3', store.tier === 3);
}

function pingPill() {
  if (!pillEl) return;
  pillEl.classList.remove('goal-pill-ping');
  void pillEl.offsetWidth;
  pillEl.classList.add('goal-pill-ping');
}

// ---- Modal DOM ----------------------------------------------------------

let modalOverlayEl, modalLabelEl, modalProgressBarEl, modalProgressFillEl,
    modalProgressTextEl, modalTiersEl, modalStreakEl, modalCalendarEl,
    modalConfigureBtnEl, modalCloseBtnEl;

function buildModal() {
  modalOverlayEl = document.createElement('div');
  modalOverlayEl.className = 'goal-modal-overlay';
  modalOverlayEl.id = 'goalModalOverlay';
  modalOverlayEl.innerHTML = `
    <div class="goal-modal" role="dialog" aria-modal="true" aria-label="Daily goal">
      <button class="goal-modal-close" id="goalModalClose" type="button" aria-label="Close">&times;</button>
      <div class="goal-modal-eyebrow">Today's goal</div>
      <div class="goal-modal-title" id="goalModalTitle"></div>

      <div class="goal-progress-row">
        <div class="goal-progress-track">
          <div class="goal-progress-fill" id="goalModalFill"></div>
          <div class="goal-progress-ticks" id="goalModalTicks"></div>
        </div>
        <div class="goal-progress-text" id="goalModalText"></div>
      </div>

      <div class="goal-tier-ladder" id="goalModalTiers"></div>

      <button class="goal-modal-configure" id="goalModalConfigure" type="button">Set up my session</button>

      <div class="goal-streak-row" id="goalModalStreak"></div>

      <div class="goal-calendar">
        <div class="goal-calendar-label">Last 14 days</div>
        <div class="goal-calendar-dots" id="goalModalCalendar"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlayEl);

  modalCloseBtnEl     = $('goalModalClose');
  modalLabelEl        = $('goalModalTitle');
  modalProgressFillEl = $('goalModalFill');
  modalProgressTextEl = $('goalModalText');
  modalTiersEl        = $('goalModalTiers');
  modalStreakEl       = $('goalModalStreak');
  modalCalendarEl     = $('goalModalCalendar');
  modalConfigureBtnEl = $('goalModalConfigure');
  modalProgressBarEl  = modalProgressFillEl?.parentElement;

  modalCloseBtnEl.addEventListener('click', closeModal);
  modalOverlayEl.addEventListener('click', (e) => {
    if (e.target === modalOverlayEl) closeModal();
  });
  modalConfigureBtnEl.addEventListener('click', () => {
    configureSession();
    // Brief acknowledgement, then close so the user sees the new chord queue.
    modalConfigureBtnEl.textContent = 'Configured \u2713';
    setTimeout(() => {
      if (modalConfigureBtnEl) modalConfigureBtnEl.textContent = 'Set up my session';
      closeModal();
    }, 700);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlayEl.style.display === 'flex') closeModal();
  });
}

function renderModal() {
  if (!modalOverlayEl || !goal) return;

  modalLabelEl.textContent = goal.label;

  const v = progressValue();
  const targets = tierTargets(goal);
  const tiers = availableTiers(goal);
  const cap = targets[tiers[tiers.length - 1]];
  const pct = Math.min(100, Math.round((v / cap) * 100));
  modalProgressFillEl.style.width = `${pct}%`;
  modalProgressFillEl.className = `goal-progress-fill tier-${store.tier || 0}`;
  modalProgressTextEl.textContent = `${v} / ${cap}`;

  // Tick marks on the progress bar at silver/gold positions.
  const ticksContainer = $('goalModalTicks');
  if (ticksContainer) {
    ticksContainer.innerHTML = tiers.slice(1).map(tier => {
      const pos = Math.min(100, Math.round((targets[tier] / cap) * 100));
      return `<div class="goal-progress-tick" style="left:${pos}%"></div>`;
    }).join('');
  }

  // Tier ladder
  modalTiersEl.innerHTML = tiers.map(tier => {
    const reached = store.tier >= tier;
    return `
      <div class="goal-tier-step tier-${tier} ${reached ? 'reached' : ''}">
        <div class="goal-tier-medal">${reached ? '\u2605' : tier}</div>
        <div class="goal-tier-name">${TIER_NAMES[tier]}</div>
        <div class="goal-tier-target">${targets[tier]}</div>
      </div>`;
  }).join('');

  // Streak
  if (store.streak > 0) {
    const word = store.streak === 1 ? 'day' : 'days';
    const today = store.date;
    const onFire = store.lastCompletionDate === today;
    modalStreakEl.innerHTML = `
      <span class="goal-streak-flame ${onFire ? 'lit' : ''}">\u{1F525}</span>
      <span class="goal-streak-count">${store.streak}</span>
      <span class="goal-streak-label">${word} in a row</span>
    `;
    modalStreakEl.style.display = '';
  } else {
    modalStreakEl.innerHTML = `<span class="goal-streak-empty">Reach bronze to start a streak.</span>`;
    modalStreakEl.style.display = '';
  }

  // Calendar — last 14 days, oldest → newest
  const dots = [];
  for (let i = 13; i >= 0; i--) {
    const d = daysAgoStr(i);
    const tier = store.history[d] || 0;
    const isToday = i === 0;
    dots.push(`<span class="goal-day tier-${tier} ${isToday ? 'today' : ''}" title="${d}${tier ? ' \u2014 ' + TIER_NAMES[tier] : ''}"></span>`);
  }
  modalCalendarEl.innerHTML = dots.join('');

  // Configure button hidden once everything is gold (no point reconfiguring).
  modalConfigureBtnEl.style.display = (store.tier >= tiers[tiers.length - 1]) ? 'none' : '';
}

function openModal() {
  if (!modalOverlayEl) return;
  renderModal();
  modalOverlayEl.style.display = 'flex';
  // Defer to next frame so the entrance transition triggers.
  requestAnimationFrame(() => modalOverlayEl.classList.add('visible'));
}

function closeModal() {
  if (!modalOverlayEl) return;
  modalOverlayEl.classList.remove('visible');
  setTimeout(() => {
    if (modalOverlayEl) modalOverlayEl.style.display = 'none';
  }, 200);
}

// ---- Configure session --------------------------------------------------

function setCheckboxIfChanged(cb, want) {
  if (!cb || cb.checked === want) return;
  cb.checked = want;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
}

function configureSession() {
  $$('[data-quality]').forEach(cb => {
    setCheckboxIfChanged(cb, cb.dataset.quality === goal.quality);
  });
  const progCb = $('progressionsCb');
  if (progCb && progCb.checked) setCheckboxIfChanged(progCb, false);
}

// ---- Public init --------------------------------------------------------
// Defer the pill DOM until onboarding has completed so first-visit users see
// the tour cleanly. Tracking still runs from t=0 so any chord they play
// during onboarding counts.

export function initDailyGoal() {
  load();
  onSuccess(handleSuccess);

  const onboarded = localStorage.getItem(LS.ONBOARDED) === '1';
  const buildAll = () => {
    buildPill();
    buildModal();
    renderPill();
  };
  if (onboarded) buildAll();
  else document.addEventListener('etude:onboarded', buildAll, { once: true });
}
