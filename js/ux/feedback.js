// Success feedback: a brief visual pulse on the chord display + a soft chime.
// Sound output shares the tones.js AudioContext so we don't leak one context
// per module (the previous setup created two that were never closed).

import { playArpeggio } from '../audio/tones.js';
import { $ } from '../core/dom.js';

// Observer pattern: other modules (e.g. rewards) can react to events.
const successObservers = [];
export function onSuccess(fn) { successObservers.push(fn); }

const chordChangeObservers = [];
export function onChordChange(fn) { chordChangeObservers.push(fn); }
export function notifyChordChange() { chordChangeObservers.forEach(fn => fn()); }

function retrigger(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // force reflow so the animation replays
  el.classList.add(cls);
}

export function flashSuccess() {
  retrigger($('chordDisplay'), 'flash-success');
  retrigger(document.querySelector('.stage'), 'flash-success');
  retrigger($('successBurst'), 'burst');
}

export function triggerSuccess() {
  flashSuccess();
  playArpeggio();
  for (const fn of successObservers) fn();
}
