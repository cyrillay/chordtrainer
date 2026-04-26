// Rewards module: streak tracking + milestone celebrations.
// Hooks into feedback.js via onSuccess() and onChordChange().

import { onSuccess, onChordChange } from './feedback.js';
import { LS } from '../core/constants.js';

// ---- State ----

let streak = 0;
let best = 0;
let enabled = true;

function load() {
  try {
    const raw = localStorage.getItem(LS.REWARDS);
    if (raw) {
      const d = JSON.parse(raw);
      best = d.best || 0;
    }
  } catch { /* ignore */ }
  try {
    const v = localStorage.getItem(LS.REWARDS_ENABLED);
    if (v !== null) enabled = v !== 'false';
  } catch { /* ignore */ }
}

function saveBest() {
  localStorage.setItem(LS.REWARDS, JSON.stringify({ best }));
}

// ---- Enable / disable ----

export function setRewardsEnabled(on) {
  enabled = on;
  localStorage.setItem(LS.REWARDS_ENABLED, String(on));
  const counter = document.getElementById('streakCounter');
  if (counter) counter.style.display = on ? '' : 'none';
  if (!on) hideReward();
}

export function isRewardsEnabled() { return enabled; }

// ---- Milestones ----
// Each milestone fires once per streak, with escalating intensity.

const MILESTONES = [
  {
    at: 5,
    emoji: '\u{1F3B5}',           // musical note
    label: 'Nice start!',
    tier: 1,
  },
  {
    at: 10,
    emoji: '\u{1F525}',           // fire
    label: 'On fire!',
    tier: 2,
  },
  {
    at: 25,
    emoji: '\u{1F3B9}',           // piano
    label: 'Keyboard wizard!',
    tier: 3,
    confetti: true,
  },
  {
    at: 50,
    emoji: '\u{1F3B8}',           // guitar
    label: 'Rock star!',
    tier: 4,
    confetti: true,
    shake: true,
  },
  {
    at: 100,
    emoji: '\u{1F3BA}',           // trumpet
    label: '"Impressive, bro." \u2014 Miles Davis',
    tier: 5,
    confetti: true,
    shake: true,
  },
  {
    at: 200,
    emoji: '\u{1F3BC}',           // musical score
    label: '"You\'re ready for the stage." \u2014 Bill Evans',
    tier: 6,
    confetti: true,
    shake: true,
  },
  {
    at: 500,
    emoji: '\u{1F451}',           // crown
    label: '"Welcome to the club." \u2014 Oscar Peterson',
    tier: 7,
    confetti: true,
    shake: true,
    fireworks: true,
  },
  {
    at: 1000,
    emoji: '\u{1F30C}',           // milky way
    label: '"You ARE the music." \u2014 John Coltrane',
    tier: 8,
    confetti: true,
    shake: true,
    fireworks: true,
    legendary: true,
  },
];

// ---- DOM references (set once in init) ----

let streakEl, bestEl, rewardOverlay, rewardEmoji, rewardLabel, rewardTier,
    confettiCanvas, confettiCtx;

function buildDOM() {
  // Streak counter (inserted into the stage)
  const counter = document.createElement('div');
  counter.className = 'streak-counter';
  counter.id = 'streakCounter';
  counter.innerHTML = `
    <span class="streak-value" id="streakValue">0</span>
    <span class="streak-label">streak</span>
    <span class="streak-best" id="streakBest"></span>
  `;
  if (!enabled) counter.style.display = 'none';
  // Anchor the streak counter after the whole status row (status + inline meter),
  // not between them — otherwise it splits the row and forces the meter to wrap.
  const status = document.getElementById('status');
  const anchor = status.closest('.status-row') || status;
  anchor.parentNode.insertBefore(counter, anchor.nextSibling);

  streakEl = document.getElementById('streakValue');
  bestEl = document.getElementById('streakBest');

  // Reward overlay (full-screen celebration)
  rewardOverlay = document.createElement('div');
  rewardOverlay.className = 'reward-overlay';
  rewardOverlay.id = 'rewardOverlay';
  rewardOverlay.innerHTML = `
    <div class="reward-content">
      <div class="reward-emoji" id="rewardEmoji"></div>
      <div class="reward-text">
        <div class="reward-tier" id="rewardTier"></div>
        <div class="reward-label" id="rewardLabel"></div>
      </div>
    </div>
  `;
  document.body.appendChild(rewardOverlay);
  rewardOverlay.addEventListener('click', hideReward);

  rewardEmoji = document.getElementById('rewardEmoji');
  rewardLabel = document.getElementById('rewardLabel');
  rewardTier = document.getElementById('rewardTier');

  // Confetti canvas
  confettiCanvas = document.createElement('canvas');
  confettiCanvas.className = 'confetti-canvas';
  confettiCanvas.id = 'confettiCanvas';
  document.body.appendChild(confettiCanvas);
  confettiCtx = confettiCanvas.getContext('2d');

  updateStreakDisplay();
}

// ---- Streak display ----

function updateStreakDisplay() {
  if (!streakEl) return;
  streakEl.textContent = streak;
  const counter = document.getElementById('streakCounter');
  counter.classList.toggle('active', streak > 0);

  // Pulse on increment
  if (streak > 0) {
    streakEl.classList.remove('streak-bump');
    void streakEl.offsetWidth;
    streakEl.classList.add('streak-bump');
  }

  // Best score
  if (best > 0) {
    bestEl.textContent = `best: ${best}`;
    bestEl.style.display = 'inline';
  } else {
    bestEl.style.display = 'none';
  }
}

// ---- Reward celebrations ----

let rewardTimeout = null;

function showReward(milestone) {
  if (!rewardOverlay || !enabled) return;

  rewardTier.textContent = `${milestone.at} streak`;

  // Emoji scales up with tier (compact for toast layout)
  const sizes = [0, 2, 2.2, 2.5, 2.8, 3, 3.2, 3.5, 4];
  rewardEmoji.textContent = milestone.emoji;
  rewardEmoji.style.fontSize = `${sizes[milestone.tier]}rem`;

  rewardLabel.textContent = milestone.label;

  // Apply tier class for escalating visual effects
  rewardOverlay.className = 'reward-overlay visible tier-' + milestone.tier;

  if (milestone.legendary) {
    rewardOverlay.classList.add('legendary');
  }

  // Shake
  if (milestone.shake) {
    document.body.classList.add('reward-shake');
    setTimeout(() => document.body.classList.remove('reward-shake'), 600);
  }

  // Confetti
  if (milestone.confetti) {
    spawnConfetti(milestone.fireworks ? 120 : 60, milestone.tier);
  }

  // Auto-dismiss (longer for higher tiers)
  clearTimeout(rewardTimeout);
  const duration = 2000 + milestone.tier * 500;
  rewardTimeout = setTimeout(hideReward, duration);
}

function hideReward() {
  clearTimeout(rewardTimeout);
  if (rewardOverlay) rewardOverlay.className = 'reward-overlay';
}

// ---- Confetti engine (lightweight, CSS-free) ----

let confettiParticles = [];
let confettiRaf = null;

function spawnConfetti(count, tier) {
  if (!confettiCanvas) return;

  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  confettiCanvas.style.display = 'block';

  const colors = [
    '#c8a464', '#e4c584', '#a03b3b', '#6b8e6b',
    '#f2e9dc', '#FFD700', '#FF6B6B', '#4ECDC4',
  ];

  for (let i = 0; i < count; i++) {
    confettiParticles.push({
      x: Math.random() * confettiCanvas.width,
      y: -20 - Math.random() * 200,
      w: 4 + Math.random() * 6,
      h: 6 + Math.random() * 10,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4 + tier * 0.3,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
    });
  }

  if (!confettiRaf) animateConfetti();
}

function animateConfetti() {
  if (!confettiCtx || confettiParticles.length === 0) {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiCanvas.style.display = 'none';
    confettiRaf = null;
    return;
  }

  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

  confettiParticles = confettiParticles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08; // gravity
    p.rot += p.rotV;
    p.life -= 0.005;

    if (p.y > confettiCanvas.height + 20 || p.life <= 0) return false;

    confettiCtx.save();
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot);
    confettiCtx.globalAlpha = Math.max(0, p.life);
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    confettiCtx.restore();

    return true;
  });

  confettiRaf = requestAnimationFrame(animateConfetti);
}

// ---- Success handler ----

function handleSuccess() {
  if (!enabled) return;
  succeededThisChord = true;
  clearTimeout(resetTimer);

  streak++;

  if (streak > best) {
    best = streak;
    saveBest();
  }

  updateStreakDisplay();

  // Check milestones
  const milestone = MILESTONES.find(m => m.at === streak);
  if (milestone) {
    showReward(milestone);
  }
}

// ---- Streak reset via timeout ----
// When a new chord appears, a 10s timer starts. If the user doesn't nail
// the chord within that window, the streak resets. Success cancels the timer.
// This avoids false resets from mic noise between chords.

let resetTimer = null;
let succeededThisChord = false;

function handleChordChange() {
  if (!enabled) return;
  succeededThisChord = false;
  clearTimeout(resetTimer);
  if (streak > 0) {
    resetTimer = setTimeout(() => {
      if (!succeededThisChord && streak > 0) {
        streak = 0;
        updateStreakDisplay();
      }
    }, 10000);
  }
}

// ---- Public init ----

export function initRewards() {
  load();
  buildDOM();
  onSuccess(handleSuccess);
  onChordChange(handleChordChange);
}
