// First-visit walkthrough: a skippable pointer tour at the controls a brand-new
// user needs (chord display, input mode, instrument, presets, new-chord button).
// Persisted via LS.ONBOARDED so it never re-fires.

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
    body: 'Pick the <strong>microphone</strong> (default) or <strong>MIDI</strong> if you have a keyboard plugged in (also works in bluetooth)',
    target: 'inputSelector'
  },
  {
    title: 'Choose your instrument',
    body: 'Switch between <strong>piano</strong> and <strong>guitar</strong>, the fingerings update to match.',
    target: 'instrumentSelector'
  },
  {
    title: 'Match your level',
    body: 'Start with a <strong>preset</strong> — First timer locks you to C, F, G majors. Move up as you get comfortable.',
    target: 'presetRow'
  },
  {
    title: 'New chord, anytime',
    body: 'Click <strong>New chord</strong> (or hit <strong>Space</strong> on desktop, <strong>triple-tap</strong> on mobile) to skip ahead. Play the displayed chord on your instrument and the app does the rest.',
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
  //
  // Crucially, if the card wouldn't fit below the target without overlapping,
  // we scroll the page so the target sits near the top — that way the card
  // always has room below and never covers the button it's pointing at.
  const placeCard = () => {
    if (!card) return;
    if (!activeTarget) {
      card.style.position = '';
      card.style.top = '';
      card.style.left = '';
      card.style.margin = '';
      return;
    }
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
    // ringOffset = .onboard-target's outline-offset (8) + outline width (3) +
    // glow halo (~6). ringGap is the visible empty space we want between the
    // ring's outer edge and the card.
    const ringOffset = 17;
    const ringGap = 28;
    const totalGap = ringOffset + ringGap;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let target = activeTarget.getBoundingClientRect();

    // Always scroll so the target sits near the top of the viewport — that
    // way the card has the entire bottom of the viewport to live in, well
    // below the highlighted ring. Skipped only when the target is already
    // close to the top.
    const wantedTargetTop = margin + 8;
    if (target.top > wantedTargetTop + 8 || target.top < margin) {
      window.scrollBy({ top: target.top - wantedTargetTop, behavior: 'auto' });
      target = activeTarget.getBoundingClientRect();
    }

    let top = target.bottom + totalGap;
    // Last-resort fallback: if even after scrolling the viewport is too short
    // (e.g. tiny mobile landscape), prefer above the target rather than overlap.
    if (top + cardH > vh - margin) {
      const aboveTop = target.top - totalGap - cardH;
      if (aboveTop >= margin) top = aboveTop;
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
