// Tempo as a musician sets it: a metronome mark (♩ = 120), its Italian
// term, the terms themselves as buttons (tap Allegro, get an Allegro), and a
// tap tempo (the Tap button, the space bar or any piano key while tapping).
//
// It dresses an existing <input type="range">: the range stays the source of
// truth and the page keeps listening to its 'input' and 'change' events, so
// a page adopts it with one call:
//
//   const picker = attachTempoPicker(rangeEl, { unit: '♩' });
//   picker.noteOn(t)   a piano key while tapping; returns true if used
//
// The pure parts (terms, tap maths) are tested under `node --test`.

// The usual metronome bands, slowest first. `bpm` is the mark a button sets.
export const TEMPO_TERMS = [
  { name: 'Largo', from: 0, bpm: 50 },
  { name: 'Adagio', from: 60, bpm: 70 },
  { name: 'Andante', from: 76, bpm: 92 },
  { name: 'Moderato', from: 108, bpm: 112 },
  { name: 'Allegro', from: 120, bpm: 132 },
  { name: 'Vivace', from: 156, bpm: 160 },
  { name: 'Presto', from: 176, bpm: 184 },
  { name: 'Prestissimo', from: 200, bpm: 208 },
];

export function tempoTerm(bpm) {
  let term = TEMPO_TERMS[0];
  for (const t of TEMPO_TERMS) if (bpm >= t.from) term = t;
  return term.name;
}

// The terms a range can reach, each with its mark clamped into the range.
// A term whose band lies outside the range is left out.
export function termsInRange(min, max) {
  return TEMPO_TERMS.map((t, i) => {
    const to = (TEMPO_TERMS[i + 1]?.from ?? Infinity) - 1;
    if (to < min || t.from > max) return null;
    return { name: t.name, bpm: Math.min(max, Math.max(min, t.bpm, t.from)) };
  }).filter(Boolean);
}

// Beats per minute from tap times in ms: the median gap of the last taps.
// Null until there are three taps, or when the taps are too uneven.
export const TAP = { maxGap: 2000, keep: 8, minTaps: 3, maxSpread: 0.25 };
export function tapTempo(times, opts = TAP) {
  const taps = times.slice(-opts.keep);
  if (taps.length < opts.minTaps) return null;
  const gaps = [];
  for (let i = 1; i < taps.length; i++) gaps.push(taps[i] - taps[i - 1]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  if (!(med > 0)) return null;
  if (gaps.some((g) => Math.abs(g - med) / med > opts.maxSpread * 2)) return null;
  return Math.round(60000 / med);
}

export const formatMark = (bpm, unit = '♩') => `${unit} = ${Math.round(bpm)}`;

// ---- The widget ----

export function attachTempoPicker(range, { unit = '♩', onTapState } = {}) {
  const min = Number(range.min) || 30;
  const max = Number(range.max) || 240;
  const step = Number(range.step) || 1;
  const wrap = document.createElement('div');
  wrap.className = 'tp';
  wrap.innerHTML = `<div class="tp-mark"><span class="tp-value"></span><span class="tp-term"></span></div>
    <div class="tp-terms" role="group" aria-label="Tempo terms"></div>
    <button type="button" class="tp-tap" aria-pressed="false" title="Tap a few beats on this button, the space bar or any piano key">Tap</button>`;
  range.insertAdjacentElement('afterend', wrap);
  range.classList.add('tp-range');
  const valueEl = wrap.querySelector('.tp-value');
  const termEl = wrap.querySelector('.tp-term');
  const termsEl = wrap.querySelector('.tp-terms');
  const tapBtn = wrap.querySelector('.tp-tap');
  let unitText = unit;

  function renderTerms() {
    const lo = Number(range.min) || min, hi = Number(range.max) || max;
    termsEl.innerHTML = termsInRange(lo, hi).map((t) => `<button type="button" class="tp-term-btn" data-bpm="${t.bpm}">${t.name}</button>`).join('');
    paint();
  }

  function paint() {
    const bpm = Number(range.value);
    valueEl.textContent = formatMark(bpm, unitText);
    const name = tempoTerm(bpm);
    termEl.textContent = name;
    for (const b of termsEl.children) b.classList.toggle('is-on', b.textContent === name);
  }

  function set(bpm) {
    const lo = Number(range.min) || min, hi = Number(range.max) || max;
    const v = Math.min(hi, Math.max(lo, Math.round(bpm / step) * step));
    range.value = String(v);
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    paint();
  }

  // Tapping: on while the button is lit; stops after a quiet moment.
  let taps = [];
  let tapping = false;
  let quietTimer = 0;
  function setTapping(on) {
    tapping = on;
    tapBtn.classList.toggle('is-on', on);
    tapBtn.setAttribute('aria-pressed', String(on));
    tapBtn.textContent = on ? 'Tapping…' : 'Tap';
    if (!on) taps = [];
    onTapState?.(on);
  }
  function tap(t = performance.now()) {
    if (taps.length && t - taps[taps.length - 1] > TAP.maxGap) taps = [];
    taps.push(t);
    const bpm = tapTempo(taps);
    if (bpm) set(bpm);
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => setTapping(false), TAP.maxGap + 400);
  }

  tapBtn.addEventListener('click', (e) => {
    if (!tapping) setTapping(true);
    tap(e.timeStamp || performance.now());
  });
  document.addEventListener('keydown', (e) => {
    if (!tapping || e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    tap(e.timeStamp || performance.now());
  }, true);
  termsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bpm]');
    if (b) set(Number(b.dataset.bpm));
  });
  range.addEventListener('input', paint);

  renderTerms();

  return {
    el: wrap,
    get tapping() { return tapping; },
    // A piano key: a tap while tapping. Returns true when it was used.
    noteOn(t = performance.now()) {
      if (!tapping) return false;
      tap(t);
      return true;
    },
    set,
    // The range's limits or value changed from the page.
    refresh: renderTerms,
    setUnit(u) { unitText = u; paint(); },
  };
}
