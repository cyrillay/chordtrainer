// A one-octave clickable keyboard to pick notes (pitch classes) the way a
// pianist would: tap a key to take it or let it go, or play it on the piano
// while the keyboard has focus. Several keys can be on; never none.
//
//   const kb = createNoteKeyboard(el, {
//     value: ['C', 'E', 'G'],          // NOTE_NAMES spellings (C, C#, D…)
//     onChange: (names) => {},
//   });
//   kb.set(names)        redraw with another selection
//   kb.noteOn(midi)      a piano key; returns true when the keyboard took it
//   kb.listening         true while it has focus (then the menu remote waits)
//
// The pure toggle lives in toggleNote() for the tests.

import { NOTE_NAMES, NOTE_DISPLAY } from '../core/theory.js';

const BLACK = new Set([1, 3, 6, 8, 10]);
// White keys are columns 0..6; a black key sits on the line between two.
const WHITE_INDEX = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const BLACK_AFTER = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };

// Adds or removes a note, keeping the list in pitch order and never empty.
export function toggleNote(names, name) {
  const set = new Set(names);
  if (set.has(name)) {
    if (set.size === 1) return names.slice();
    set.delete(name);
  } else set.add(name);
  return NOTE_NAMES.filter((n) => set.has(n));
}

export function createNoteKeyboard(el, { value = ['C'], onChange = () => {}, label = 'Notes' } = {}) {
  let names = NOTE_NAMES.filter((n) => value.includes(n));
  el.classList.add('nk');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', label);
  el.tabIndex = 0;
  el.innerHTML = NOTE_NAMES.map((n, pc) => {
    const black = BLACK.has(pc);
    const left = black ? `calc(${(BLACK_AFTER[pc] + 1) * (100 / 7)}% - var(--nk-black-w) / 2)` : `${WHITE_INDEX[pc] * (100 / 7)}%`;
    return `<button type="button" class="nk-key ${black ? 'nk-black' : 'nk-white'}" data-note="${n}" style="left:${left}" aria-pressed="false" tabindex="-1"><span>${NOTE_DISPLAY[n]}</span></button>`;
  }).join('');

  function paint() {
    for (const b of el.querySelectorAll('.nk-key')) {
      const on = names.includes(b.dataset.note);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  function toggle(name) {
    const next = toggleNote(names, name);
    if (next.length === names.length && next.every((n, i) => n === names[i])) {
      const k = el.querySelector(`[data-note="${name}"]`);
      k?.classList.remove('nk-refuse'); void k?.offsetWidth; k?.classList.add('nk-refuse');
      return;
    }
    names = next;
    paint();
    onChange(names.slice());
  }

  el.addEventListener('click', (e) => {
    const k = e.target.closest('.nk-key');
    if (k) { toggle(k.dataset.note); el.focus({ preventScroll: true }); }
  });
  el.addEventListener('keydown', (e) => {
    // Letters from the computer keyboard: C D E F G A B, with Shift for the sharp.
    const letter = e.key.length === 1 ? e.key.toUpperCase() : '';
    if (!'CDEFGAB'.includes(letter) || !letter || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = e.shiftKey ? `${letter}#` : letter;
    if (!NOTE_NAMES.includes(n)) return;
    e.preventDefault();
    e.stopPropagation();
    toggle(n);
  });

  paint();

  return {
    el,
    get value() { return names.slice(); },
    set(next) { names = NOTE_NAMES.filter((n) => next.includes(n)); paint(); },
    get listening() { return document.activeElement === el || el.contains(document.activeElement); },
    noteOn(midi) {
      if (!this.listening) return false;
      toggle(NOTE_NAMES[((midi % 12) + 12) % 12]);
      return true;
    },
  };
}
