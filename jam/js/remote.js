// Ghost Jam: the piano as a TV remote for the menus, in intervals from
// middle C. A third below (A or A♭ under middle C) moves down the menu, a
// third above (E or E♭) moves up, the fifth (G) selects. Once a setting is
// selected, the thirds change its value (above: more, below: less) and the
// fifth again lets go. A key counts only when pressed and released on its
// own, so chords are just music, and nothing listens while a set plays.

export const MIDDLE_C = 60;

const GESTURES = {
  [MIDDLE_C - 4]: 'down', [MIDDLE_C - 3]: 'down',  // A♭3, A3
  [MIDDLE_C + 3]: 'up', [MIDDLE_C + 4]: 'up',      // E♭4, E4
  [MIDDLE_C + 7]: 'select',                        // G4
};
export const gestureOf = (midi) => GESTURES[midi] ?? null;

// Single keys only: returns the MIDI note once every key is up, or null.
export class PianoRemote {
  constructor() {
    this.held = new Set();
    this.armed = null;    // the key that opened the gesture, if it can be a command
    this.spoiled = false; // another key joined in: it was a chord
  }

  // enabled: whether a command may start now (a menu is on screen).
  noteOn(midi, enabled) {
    if (this.held.size === 0) {
      this.armed = enabled ? midi : null;
      this.spoiled = false;
    } else {
      this.spoiled = true;
    }
    this.held.add(midi);
  }

  noteOff(midi) {
    this.held.delete(midi);
    if (this.held.size) return null;
    const m = this.armed;
    this.armed = null;
    return m === null || this.spoiled ? null : m;
  }
}

// The menu cursor. items: [{ id, kind: 'value' | 'action' }], top to bottom.
// handle() turns a gesture into what the page should do:
//   { type: 'focus', id }           the cursor moved
//   { type: 'edit', id, on }        a setting was taken or let go
//   { type: 'change', id, dir }     the selected setting goes up (+1) or down (-1)
//   { type: 'activate', id }        a button was pressed
export class MenuNav {
  constructor(items, focusId) {
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
    const to = Math.max(0, Math.min(this.items.length - 1, this.focus + (gesture === 'down' ? 1 : -1)));
    this.focus = to;
    return { type: 'focus', id: this.items[to].id };
  }
}

// Step through a list with wrap-around.
export const step = (list, current, dir) => {
  const i = list.indexOf(current);
  return list[((i < 0 ? 0 : i + dir) % list.length + list.length) % list.length];
};
