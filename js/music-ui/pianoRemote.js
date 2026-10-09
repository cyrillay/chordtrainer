// The piano as a TV remote for the menus, in intervals from C,
// in any octave. A third below C (A or A♭) moves down the menu, a third
// above (E or E♭) moves up, the fifth (G) selects. Once a setting is
// selected, the thirds change its value (above: more, below: less) and the
// fifth again lets go. A key counts only when played on its own, so chords
// are just music, and nothing listens while a set plays. Hold a third and it
// repeats, faster and faster.

export const MIDDLE_C = 60;

// By pitch class, so any octave works.
const GESTURES = {
  8: 'down', 9: 'down',   // A♭, A
  3: 'up', 4: 'up',       // E♭, E
  7: 'select',            // G
};
export const gestureOf = (midi) => GESTURES[((midi % 12) + 12) % 12] ?? null;

// Single keys only. onCommand(midi) fires when a key is released having been
// pressed alone. A key that repeats (the thirds) also fires while held: after
// REPEAT.delay, then every REPEAT.interval, faster after REPEAT.rushAfter
// repeats; letting go then fires nothing more. A second key cancels it all.
export const REPEAT = { delay: 350, interval: 90, rush: 35, rushAfter: 8 };

// holdMs(midi): how long that key must be held for its command to count
// (0 for a tap). Arpeggios asks for a held fifth, so its hidden melodies
// can't start a level by accident.
export class PianoRemote {
  constructor({ onCommand = () => {}, repeats = () => false, holdMs = () => 0, now = () => performance.now() } = {}) {
    this.onCommand = onCommand;
    this.repeats = repeats;
    this.holdMs = holdMs;
    this.now = now;
    this.armedAt = 0;
    this.held = new Set();
    this.armed = null;     // the key that opened the gesture, if it can be a command
    this.spoiled = false;  // another key joined in: it was a chord
    this.fired = 0;        // repeats already fired by this hold
    this.timer = 0;
  }

  // enabled: whether a command may start now (a menu is on screen).
  noteOn(midi, enabled) {
    if (this.held.size === 0) {
      this.armed = enabled ? midi : null;
      this.armedAt = this.now();
      this.spoiled = false;
      this.fired = 0;
      if (this.armed !== null && this.repeats(midi)) this.#schedule(REPEAT.delay);
    } else {
      this.spoiled = true;
      this.#stop();
    }
    this.held.add(midi);
  }

  noteOff(midi) {
    this.held.delete(midi);
    if (this.held.size) return;
    this.#stop();
    const m = this.armed;
    this.armed = null;
    if (m === null || this.spoiled || this.fired) return;
    if (this.now() - this.armedAt < this.holdMs(m)) return;
    this.onCommand(m);
  }

  #schedule(ms) {
    this.timer = setTimeout(() => {
      this.fired++;
      this.onCommand(this.armed);
      this.#schedule(this.fired >= REPEAT.rushAfter ? REPEAT.rush : REPEAT.interval);
    }, ms);
  }

  #stop() { clearTimeout(this.timer); this.timer = 0; }
}

// The menu cursor. items: [{ id, kind: 'value' | 'action' }], top to bottom.
// wrap: moving past the last item comes back to the first, and the other way.
// handle() turns a gesture into what the page should do:
//   { type: 'focus', id }           the cursor moved
//   { type: 'edit', id, on }        a setting was taken or let go
//   { type: 'change', id, dir }     the selected setting goes up (+1) or down (-1)
//   { type: 'activate', id }        a button was pressed
export class MenuNav {
  constructor(items, focusId, { wrap = false } = {}) {
    this.wrap = wrap;
    this.items = [];
    this.focus = 0;
    this.editing = false;
    this.setItems(items, focusId);
  }

  get current() { return this.items[this.focus] ?? null; }

  // Swap the item list (an item can come and go), keeping the cursor on the same item.
  setItems(items, focusId = this.current?.id) {
    this.items = items;
    const i = items.findIndex((it) => it.id === focusId);
    this.focus = i >= 0 ? i : 0;
    if (i < 0) this.editing = false;
  }

  handle(gesture) {
    const it = this.current;
    if (!it) return null;
    if (this.editing) {
      if (gesture === 'select') { this.editing = false; return { type: 'edit', id: it.id, on: false }; }
      return { type: 'change', id: it.id, dir: gesture === 'up' ? 1 : -1 };
    }
    if (gesture === 'select') {
      if (it.kind === 'action') return { type: 'activate', id: it.id };
      this.editing = true;
      return { type: 'edit', id: it.id, on: true };
    }
    const n = this.items.length;
    const next = this.focus + (gesture === 'down' ? 1 : -1);
    const to = this.wrap ? (next + n) % n : Math.max(0, Math.min(n - 1, next));
    this.focus = to;
    return { type: 'focus', id: this.items[to].id };
  }
}

// Step through a list with wrap-around.
export const step = (list, current, dir) => {
  const i = list.indexOf(current);
  return list[((i < 0 ? 0 : i + dir) % list.length + list.length) % list.length];
};

// The legend: one octave around a C, F to A, the keys that do something
// labelled. Returns the keys' markup and the number of grid columns.
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
export function remoteLegend({ select = 'OK' } = {}) {
  const LABELS = { [MIDDLE_C - 4]: '↓', [MIDDLE_C - 3]: '↓', [MIDDLE_C]: 'C', [MIDDLE_C + 3]: '↑', [MIDDLE_C + 4]: '↑', [MIDDLE_C + 7]: select };
  let html = '';
  let white = 0;
  for (let m = MIDDLE_C - 7; m <= MIDDLE_C + 9; m++) {
    const black = BLACK_PCS.has(m % 12);
    const col = black ? white * 2 : white * 2 + 1;
    if (!black) white++;
    const g = gestureOf(m);
    html += `<span class="rk ${black ? 'rk-black' : 'rk-white'}${g ? ` rk-${g}` : ''}${m === MIDDLE_C ? ' rk-home' : ''}" style="grid-column:${col} / span 2">${LABELS[m] ?? ''}</span>`;
  }
  return { html, columns: white * 2 };
}

// Draws the legend into an element.
export function renderRemoteLegend(el, opts) {
  const { html, columns } = remoteLegend(opts);
  el.innerHTML = html;
  el.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
}
