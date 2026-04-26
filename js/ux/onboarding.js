// First-visit walkthrough: a skippable 4-step pointer at the controls a brand-new
// user needs (chord display, input mode, presets, new-chord button). Persisted via
// LS.ONBOARDED so it never re-fires.

import { $ } from '../core/dom.js';
import { LS } from '../core/constants.js';

const STEPS = [
  {
    title: 'Welcome to Étude',
    body: 'A chord trainer that listens and validates your chords as you play them.',
    target: 'chordDisplay'
  },
  {
    title: 'Pick how you play',
    body: 'Pick the <strong>microphone</strong> (default) or <strong>MIDI</strong> if you have a keyboard plugged in. You can switch any time.',
    target: 'inputSelector'
  },
  {
    title: 'Match your level',
    body: 'Start with a <strong>preset</strong> — First timer locks you to C, F, G majors. Move up as you get comfortable.',
    target: 'presetRow'
  },
  {
    title: 'New chord, anytime',
    body: 'Click <strong>New chord</strong> (or hit Space) to skip ahead. Play the displayed chord on your instrument and the app does the rest.',
    target: 'newChordBtn'
  }
];

export function startOnboarding() {
  if (localStorage.getItem(LS.ONBOARDED) === '1') return;
  const overlay = $('onboardOverlay');
  if (!overlay) return;
  const card = overlay.querySelector('.onboard-card');
  let idx = 0;
  let activeTarget = null;

  const stepEl = $('onboardStep');
  const titleEl = $('onboardTitle');
  const bodyEl = $('onboardBody');
  const nextBtn = $('onboardNext');
  const skipBtn = $('onboardSkip');

  const clearTarget = () => {
    if (activeTarget) {
      activeTarget.classList.remove('onboard-target');
      activeTarget = null;
    }
  };

  // Position the card adjacent to the highlighted target instead of centered,
  // so the user's eye doesn't have to bounce between the spotlight and the
  // instructions. Falls back to centered (CSS flex) when there's no target.
  const placeCard = () => {
    if (!card) return;
    if (!activeTarget) {
      card.style.position = '';
      card.style.top = '';
      card.style.left = '';
      card.style.margin = '';
      return;
    }
    const target = activeTarget.getBoundingClientRect();
    // Reset before measuring so the card's natural width/height is used,
    // not the previous placement's clamped size.
    card.style.position = 'fixed';
    card.style.top = '0px';
    card.style.left = '0px';
    card.style.margin = '0';
    const cardRect = card.getBoundingClientRect();
    const cardW = cardRect.width;
    const cardH = cardRect.height;
    const margin = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer below; fall back to above; final fallback clamps below the viewport edge.
    let top = target.bottom + margin;
    if (top + cardH > vh - margin) {
      const aboveTop = target.top - margin - cardH;
      top = aboveTop >= margin ? aboveTop : Math.max(margin, vh - margin - cardH);
    }
    let left = target.left + target.width / 2 - cardW / 2;
    left = Math.max(margin, Math.min(left, vw - margin - cardW));

    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  };

  const renderStep = () => {
    const s = STEPS[idx];
    stepEl.textContent = `${idx + 1} / ${STEPS.length}`;
    titleEl.textContent = s.title;
    bodyEl.innerHTML = s.body;
    nextBtn.textContent = idx === STEPS.length - 1 ? 'Got it' : 'Next →';
    clearTarget();
    const t = s.target ? $(s.target) : null;
    if (t) {
      t.classList.add('onboard-target');
      activeTarget = t;
      overlay.classList.add('has-target');
      // Use 'auto' (instant) so we can place the card on the same frame —
      // smooth scroll would have us positioning against a stale rect.
      t.scrollIntoView({ behavior: 'auto', block: 'center' });
    } else {
      overlay.classList.remove('has-target');
    }
    // rAF lets the browser settle layout (post-scroll, post-content swap)
    // before we measure for placement.
    requestAnimationFrame(placeCard);
  };

  const onResize = () => placeCard();

  const finish = () => {
    clearTarget();
    overlay.style.display = 'none';
    overlay.classList.remove('has-target');
    window.removeEventListener('resize', onResize);
    localStorage.setItem(LS.ONBOARDED, '1');
    // The last steps scroll to highlighted controls below the fold; bring the
    // user back to the top so they aren't dropped mid-page after the walkthrough.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  nextBtn.onclick = () => {
    idx++;
    if (idx >= STEPS.length) finish();
    else renderStep();
  };
  skipBtn.onclick = finish;

  window.addEventListener('resize', onResize);
  overlay.style.display = 'flex';
  renderStep();
}
