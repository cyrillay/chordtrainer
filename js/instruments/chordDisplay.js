// Chord display panel: the big chord text, note chips, status line, and the
// glue that fans heard pitch classes out to all instrument views.
//
// Note chips are tracked after each displayChord() so toggling 'heard' on each
// chip is a per-element flip, not a re-render of the whole row.

import { state } from '../core/state.js';
import { pitchClassToDisplay, formatChordHtml } from '../core/theory.js';
import { advanceToNextChord } from '../training/generator.js';
import { updatePianoHighlight } from './piano.js';
import { updateCircleHighlight } from './circle.js';
import { updateGuitarHighlight } from './guitar.js';
import { triggerSuccess, notifyChordChange } from '../ux/feedback.js';
import { $ } from '../core/dom.js';
import {
  MIC_SUCCESS_DELAY_MS, MIDI_SUCCESS_DELAY_MS, SUCCESS_DEDUP_MS
} from '../core/constants.js';

let noteChipEls = []; // chip <span> elements for the current chord

export function renderNextPreview() {
  const el = $('chordDisplayNext');
  const degEl = $('chordDegreeNext');
  if (!el) return;
  const next = state.chordQueue[0];
  el.innerHTML = next ? formatChordHtml(next) : '';
  if (degEl) {
    degEl.textContent = (next && next.meta) ? `(${next.meta.tokens[next.meta.position]})` : '';
  }
}

export function displayChord(chord) {
  state.currentChord = chord;
  state.heardPitchClasses = new Set();
  state.heardHistory = [];
  // New chord = clean slate for the success-dedup window, otherwise playing the
  // next chord within SUCCESS_DEDUP_MS of the previous success (common in MIDI)
  // swallows the match and the advance only fires after the window elapses.
  state.lastSuccessTime = 0;

  const display = $('chordDisplay');
  const notesEl = $('chordNotes');

  if (!chord) {
    display.textContent = '—';
    notesEl.innerHTML = '';
    noteChipEls = [];
    renderNextPreview();
    return;
  }

  display.innerHTML = formatChordHtml(chord);
  renderNextPreview();

  // Re-trigger fade-in animation.
  display.style.animation = 'none';
  void display.offsetHeight;
  display.style.animation = '';

  notesEl.innerHTML = chord.orderedNotes.map(pc =>
    `<span class="note" data-pc="${pc}">${pitchClassToDisplay(pc)}</span>`
  ).join('');
  noteChipEls = Array.from(notesEl.querySelectorAll('.note'));

  updatePianoHighlight();
  updateGuitarHighlight();
  updateCircleHighlight();
  updateStatus();
  notifyChordChange();
}

// Debug shortcut: fake-play the current chord's exact pitch classes.
export function cheatCurrentChord() {
  if (!state.currentChord) return;
  applyHeardPitchClasses(new Set(state.currentChord.pitchClasses));
}

// Source-agnostic update: takes a Set of pitch classes from any input source.
export function applyHeardPitchClasses(stable) {
  state.heardPitchClasses = stable;

  for (const el of noteChipEls) {
    const pc = parseInt(el.dataset.pc, 10);
    el.classList.toggle('heard', stable.has(pc));
  }

  const detected = $('detectedNotes');
  if (detected) {
    if (stable.size === 0) {
      detected.textContent = '—';
    } else {
      const names = [...stable].sort((a, b) => a - b).map(pitchClassToDisplay);
      detected.textContent = names.join(' · ');
    }
  }

  updatePianoHighlight();
  updateGuitarHighlight();
  updateStatus();
}

function isAnyInputActive() {
  return state.isListening || state.midiEnabled;
}

export function updateStatus() {
  const statusEl = $('status');
  if (!state.currentChord) {
    statusEl.textContent = '';
    return;
  }

  if (!isAnyInputActive()) {
    statusEl.innerHTML = 'Enable microphone or MIDI to verify';
    statusEl.className = 'status';
    return;
  }

  const target = state.currentChord.pitchClasses;
  const heard = state.heardPitchClasses;
  const missing = [...target].filter(pc => !heard.has(pc));
  const extra = [...heard].filter(pc => !target.has(pc));

  if (missing.length === 0 && extra.length === 0 && heard.size > 0) {
    statusEl.innerHTML = '◆ Correct ◆';
    statusEl.className = 'status success';

    const now = Date.now();
    const fresh = now - state.lastSuccessTime > SUCCESS_DEDUP_MS;
    if (fresh) {
      state.lastSuccessTime = now;
      triggerSuccess();
    }

    if (state.dynamic.running) {
      state.dynamic.correctThisBar = true;
    } else if (fresh) {
      const delay = state.midiEnabled ? MIDI_SUCCESS_DELAY_MS : MIC_SUCCESS_DELAY_MS;
      setTimeout(() => advanceToNextChord(displayChord), delay);
    }
  } else if (heard.size === 0) {
    statusEl.innerHTML = '<span class="listening-dot"></span>Listening...';
    statusEl.className = 'status listening';
  } else if (extra.length > 0) {
    statusEl.innerHTML = `Wrong notes: ${extra.map(pitchClassToDisplay).join(', ')}`;
    statusEl.className = 'status wrong';
  } else {
    statusEl.innerHTML = `Still missing: ${missing.map(pitchClassToDisplay).join(', ')}`;
    statusEl.className = 'status listening';
  }
}
