// "?" help bubbles on the companion pages: open on click (or Enter/Space
// when focused), close on a second click, a click elsewhere or Escape.
// Markup: <span class="info-tip" tabindex="0" role="button">
//           <span class="info-tip-icon">?</span>
//           <span class="info-tip-bubble" role="tooltip">…</span></span>

let bound = false;

export function bindInfoTips() {
  if (bound) return;
  bound = true;
  const closeAll = (except) => {
    for (const tip of document.querySelectorAll('.info-tip.open')) {
      if (tip !== except) tip.classList.remove('open');
    }
  };
  document.addEventListener('click', (e) => {
    const tip = e.target.closest('.info-tip');
    // Links and text inside an open bubble stay usable.
    if (tip && e.target.closest('.info-tip-bubble')) return;
    closeAll(tip);
    if (tip) {
      e.preventDefault();
      tip.classList.toggle('open');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll(null);
    const tip = e.target.closest?.('.info-tip');
    if (tip && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      closeAll(tip);
      tip.classList.toggle('open');
    }
  });
}
