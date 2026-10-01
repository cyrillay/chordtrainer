// Full-width piano strip (C2–C7) showing what is pressed, what was right or
// wrong, and — when guide keys are on — where the next note lives.

const LOW = 36;   // C2
const HIGH = 96;  // C7
const BLACK = new Set([1, 3, 6, 8, 10]);

export function createKeyboard(container) {
  const keys = new Map(); // midi -> element
  container.innerHTML = '';
  const whites = [];
  for (let m = LOW; m <= HIGH; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const w = 100 / whites.length;

  whites.forEach((m, i) => {
    const el = document.createElement('div');
    el.className = 'kb-white';
    el.style.left = `${i * w}%`;
    el.style.width = `${w}%`;
    if (m % 12 === 0) {
      const lbl = document.createElement('span');
      lbl.className = 'kb-label';
      lbl.textContent = `C${m / 12 - 1}`;
      el.appendChild(lbl);
    }
    container.appendChild(el);
    keys.set(m, el);
  });
  whites.forEach((m, i) => {
    const b = m + 1;
    if (b > HIGH || !BLACK.has(b % 12)) return;
    const el = document.createElement('div');
    el.className = 'kb-black';
    el.style.left = `${(i + 1) * w - w * 0.32}%`;
    el.style.width = `${w * 0.64}%`;
    container.appendChild(el);
    keys.set(b, el);
  });

  let hinted = [];
  let toneMarked = [];

  function flash(midi, kind) {
    const el = keys.get(midi);
    if (!el) return;
    el.classList.remove('is-ok', 'is-bad');
    void el.offsetWidth; // restart the animation
    el.classList.add(kind === 'ok' ? 'is-ok' : 'is-bad');
  }

  function setDown(midi, down) {
    keys.get(midi)?.classList.toggle('is-down', down);
  }

  // midis: exact keys to glow; or pc: every key of that pitch class.
  function setHint({ midi = null, pc = null } = {}) {
    for (const el of hinted) el.classList.remove('is-hint');
    hinted = [];
    if (midi !== null && keys.has(midi)) hinted.push(keys.get(midi));
    else if (pc !== null) for (const [m, el] of keys) if (m % 12 === pc) hinted.push(el);
    for (const el of hinted) el.classList.add('is-hint');
  }

  // Faint dots on every key that belongs to the current chord.
  function setChordTones(pcs) {
    for (const el of toneMarked) el.classList.remove('is-tone');
    toneMarked = [];
    if (pcs) for (const [m, el] of keys) if (pcs.has(m % 12)) { el.classList.add('is-tone'); toneMarked.push(el); }
  }

  function clearAll() {
    for (const el of keys.values()) el.classList.remove('is-down', 'is-ok', 'is-bad', 'is-hint', 'is-tone');
    hinted = []; toneMarked = [];
  }

  // On narrow screens the strip scrolls inside its frame; keep the last
  // played note in view.
  function reveal(midi) {
    const el = keys.get(midi);
    const frame = container.parentElement;
    if (!el || !frame || frame.scrollWidth <= frame.clientWidth) return;
    const x = el.offsetLeft + el.offsetWidth / 2 - frame.clientWidth / 2;
    frame.scrollTo({ left: x, behavior: 'smooth' });
  }

  return { flash, setDown, setHint, setChordTones, clearAll, reveal };
}
