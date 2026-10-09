// The key picker, a circle of fifths. The mode (major or minor) is given,
// so its ring is the outer one (the one you click) and the relative keys sit
// inside it. Playing a note on the piano picks that tonic. Ghost Jam uses it
// for the tune's key; any page can, with the markup below and music-ui.css.
//
//   <div class="modal" hidden>  (any overlay; a click on it closes)
//     <div class="kw-box"><span class="kw-title"></span><button class="kw-close"></button>
//     <svg class="kw-wheel" viewBox="-100 -100 200 200"></svg></div>
//   </div>

import { NOTE_NAMES, TONIC_NAMES, tonicName } from '../core/theory.js';

// Pitch classes clockwise from the top: C G D A E B F♯ D♭ A♭ E♭ B♭ F.
export const FIFTHS = Array.from({ length: 12 }, (_, i) => (i * 7) % 12);

// How each tonic is spelled on the circle, by mode: theory.js's
// TONIC_NAMES, the spelling with the shorter key signature.
export { TONIC_NAMES, tonicName };

const SIX = { major: { '♯': 'F♯', '♭': 'G♭' }, minor: { '♯': 'D♯', '♭': 'E♭' } };

const pcOf = (key) => NOTE_NAMES.indexOf(key);
const relative = (pc, mode) => (mode === 'minor' ? pc + 3 : pc + 9) % 12;

export const keyLabel = (key, mode) => `${tonicName(key, mode)} ${mode}`;

// The key signature: { count, acc: '♯' | '♭' | '' }. Six is written ♯ for
// F♯ major / D♯ minor spelled with sharps, ♭ for E♭ minor.
export function keySignature(key, mode) {
  const majorPc = mode === 'minor' ? relative(pcOf(key), 'minor') : pcOf(key);
  const i = FIFTHS.indexOf(majorPc);
  if (i === 0) return { count: 0, acc: '' };
  if (i < 6) return { count: i, acc: '♯' };
  if (i > 6) return { count: 12 - i, acc: '♭' };
  return { count: 6, acc: tonicName(key, mode).includes('♭') ? '♭' : '♯' };
}
export const signatureText = ({ count, acc }) => (count ? `${count}${acc}` : '♮');

// The circle's slots, clockwise from the top, for a mode: the key in the
// outer ring and its relative key inside.
export function wheelSlots(mode) {
  const other = mode === 'minor' ? 'major' : 'minor';
  const startPc = mode === 'minor' ? 9 : 0; // A minor shares the top with C major
  return FIFTHS.map((step) => {
    const pc = (startPc + step) % 12;
    const key = NOTE_NAMES[pc];
    const sig = keySignature(key, mode);
    // At six the relative takes the same accidental as the key (F♯ and D♯m, E♭m and G♭).
    const relPc = relative(pc, mode);
    const rel = sig.count === 6 ? SIX[other][sig.acc] : tonicName(NOTE_NAMES[relPc], other);
    return { key, name: tonicName(key, mode), sig: signatureText(sig), relName: rel + (other === 'minor' ? 'm' : '') };
  });
}

// ---- The popup ----

const R = { out: 96, mid: 62, in: 36 };
const polar = (r, deg) => {
  const a = (deg - 90) * Math.PI / 180;
  return [+(r * Math.cos(a)).toFixed(2), +(r * Math.sin(a)).toFixed(2)];
};
function wedge(r1, r2, a1, a2) {
  const [x1, y1] = polar(r2, a1); const [x2, y2] = polar(r2, a2);
  const [x3, y3] = polar(r1, a2); const [x4, y4] = polar(r1, a1);
  return `M${x1} ${y1}A${r2} ${r2} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 0 0 ${x4} ${y4}Z`;
}

export class KeyWheel {
  // modal: the .modal element; onPick(key) gets a NOTE_NAMES name or 'random'.
  constructor({ modal, onPick }) {
    this.modal = modal;
    this.onPick = onPick;
    this.svg = modal.querySelector('.kw-wheel');
    this.title = modal.querySelector('.kw-title');
    this.closeTimer = 0;
    this.returnFocus = null;
    this.svg.addEventListener('click', (e) => {
      const seg = e.target.closest('[data-key]');
      if (seg) this.pick(seg.dataset.key);
    });
    this.svg.addEventListener('keydown', (e) => {
      const seg = e.target.closest('[data-key]');
      if (!seg) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.pick(seg.dataset.key); }
      // Arrows walk round the circle: right and down clockwise (sharpwards).
      const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (dir && seg.dataset.slot) {
        e.preventDefault();
        this.svg.querySelector(`[data-slot="${(Number(seg.dataset.slot) + dir + 12) % 12}"]`).focus();
      }
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) this.close(); });
    modal.querySelector('.kw-close').addEventListener('click', () => this.close());
  }

  get isOpen() { return !this.modal.hidden; }

  open(current, mode) {
    clearTimeout(this.closeTimer);
    this.render(current, mode);
    this.returnFocus = document.activeElement;
    this.modal.hidden = false;
    (this.svg.querySelector('.is-on') || this.svg.querySelector('[data-key]')).focus({ preventScroll: true });
  }

  close() {
    clearTimeout(this.closeTimer);
    if (this.modal.hidden) return;
    this.modal.hidden = true;
    this.returnFocus?.focus?.({ preventScroll: true });
  }

  // A key from the piano: its pitch class is the tonic.
  playNote(midi) {
    if (this.isOpen) this.pick(NOTE_NAMES[midi % 12]);
  }

  // Light the pick for a beat so it reads, then hand it over.
  pick(key) {
    for (const el of this.svg.querySelectorAll('.is-on')) el.classList.remove('is-on');
    this.svg.querySelector(`[data-key="${key}"]`)?.classList.add('is-on', 'is-picked');
    this.onPick(key);
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.close(), 380);
  }

  render(current, mode) {
    this.title.textContent = `Key · ${mode}`;
    const half = 15;
    let out = '';
    wheelSlots(mode).forEach((s, i) => {
      const a = i * 30;
      const on = s.key === current;
      const [nx, ny] = polar((R.out + R.mid) / 2 + 3, a);
      const [sx, sy] = polar((R.out + R.mid) / 2 - 11, a);
      const [rx, ry] = polar((R.mid + R.in) / 2, a);
      out += `<g class="kw-seg${on ? ' is-on' : ''}" data-key="${s.key}" data-slot="${i}" tabindex="0" role="button" aria-label="${s.name} ${mode}, ${s.sig === '♮' ? 'no sharps or flats' : s.sig}">
        <path class="kw-out" d="${wedge(R.mid, R.out, a - half, a + half)}"/>
        <path class="kw-in" d="${wedge(R.in, R.mid, a - half, a + half)}"/>
        <text class="kw-name" x="${nx}" y="${ny}">${s.name}</text>
        <text class="kw-sig" x="${sx}" y="${sy}">${s.sig}</text>
        <text class="kw-rel" x="${rx}" y="${ry}">${s.relName}</text>
      </g>`;
    });
    out += `<g class="kw-seg kw-random${current === 'random' ? ' is-on' : ''}" data-key="random" tabindex="0" role="button" aria-label="Random key">
      <circle r="${R.in - 4}"/>
      <text class="kw-die" y="-3">?</text>
      <text class="kw-rand" y="13">Random</text>
    </g>`;
    this.svg.innerHTML = out;
  }
}
