// The piano remote for a page of buttons: a list of buttons per screen, a
// cursor that lights one of them, thirds to move it and the fifth to press
// it (js/music-ui/pianoRemote.js). Ghost Jam builds its own richer menu (it
// edits values); Arpeggios and Sight-reading use this.
//
//   const menu = createMenuRemote({
//     items: () => [...buttons] | null,  // what the piano can reach now, or null
//     holdSelect: 0,                      // ms the fifth must be held (0: a tap)
//   });
//   menu.noteOn(midi) / menu.noteOff(midi)  feed it every note; it returns
//                                           true while it owns the keys
//   menu.paint()                           after the screen changed

import { PianoRemote, MenuNav, gestureOf } from './pianoRemote.js';

export function createMenuRemote({ items, holdSelect = 0, focusClass = 'remote-focus' }) {
  let nav = null;
  let list = [];
  let enabled = true;

  const current = () => {
    const els = (items() || []).filter((el) => el && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.offsetParent !== null);
    return els;
  };

  function sync() {
    const els = current();
    const keep = nav?.current ? list[nav.focus] : null;
    list = els;
    const ids = els.map((_, i) => ({ id: i, kind: 'action' }));
    const focusId = keep ? Math.max(0, els.indexOf(keep)) : 0;
    if (!nav) nav = new MenuNav(ids, focusId, { wrap: true });
    else nav.setItems(ids, focusId);
  }

  function paint() {
    for (const el of document.querySelectorAll(`.${focusClass}`)) el.classList.remove(focusClass);
    if (!enabled) return;
    sync();
    const el = list[nav.focus];
    if (el) el.classList.add(focusClass);
  }

  function run(midi) {
    sync();
    if (!list.length) return;
    const fx = nav.handle(gestureOf(midi));
    if (!fx) return;
    if (fx.type === 'activate') list[fx.id]?.click();
    paint();
    if (fx.type === 'focus') list[fx.id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const remote = new PianoRemote({
    onCommand: run,
    repeats: (m) => gestureOf(m) === 'up' || gestureOf(m) === 'down',
    holdMs: (m) => (gestureOf(m) === 'select' ? holdSelect : 0),
  });

  return {
    // Returns whether the remote is listening on this screen.
    noteOn(midi) {
      const on = enabled && current().length > 0;
      remote.noteOn(midi, on && gestureOf(midi) !== null);
      return on;
    },
    noteOff(midi) { remote.noteOff(midi); },
    paint,
    set enabled(v) { enabled = v; paint(); },
    get enabled() { return enabled; },
  };
}
