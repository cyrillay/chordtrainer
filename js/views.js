// DOM rendering for the chord display, piano, and status line.
//
// Piano keys are cached at build time so highlight updates are per-key flips
// instead of repeated querySelectorAll + class sweeps. Chord notes chips are
// likewise tracked after each displayChord().

import { state } from './state.js';
import { noteToPitchClass, pitchClassToDisplay, formatChordHtml } from './theory.js';
import { advanceToNextChord } from './generator.js';
import { updateCircleHighlight } from './circle.js';
import { updateGuitarHighlight } from './guitar.js';
import { triggerSuccess, notifyChordChange } from './feedback.js';
import { $ } from './dom.js';
import {
  PIANO_OCTAVES, PIANO_START_OCTAVE,
  MIC_SUCCESS_DELAY_MS, MIDI_SUCCESS_DELAY_MS, SUCCESS_DEDUP_MS
} from './constants.js';

const WHITE_KEY_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_KEY_MAP = [
  { after: 'C', note: 'C#' },
  { after: 'D', note: 'D#' },
  { after: 'F', note: 'F#' },
  { after: 'G', note: 'G#' },
  { after: 'A', note: 'A#' }
];

// Built once in buildPiano, then mutated in updatePianoHighlight.
const pianoKeys = []; // { el, pc, midi }
let noteChipEls = []; // chip <span> elements for the current chord

export function buildPiano() {
  const piano = $('piano');
  piano.innerHTML = '';
  pianoKeys.length = 0;

  const frag = document.createDocumentFragment();
  let whiteKeyCount = 0;

  for (let o = 0; o < PIANO_OCTAVES; o++) {
    const octave = PIANO_START_OCTAVE + o;
    for (const n of WHITE_KEY_NOTES) {
      const key = document.createElement('div');
      key.className = 'key-white';
      if (n === 'C') {
        const lbl = document.createElement('div');
        lbl.className = 'key-label';
        lbl.textContent = n + octave;
        key.appendChild(lbl);
      }
      frag.appendChild(key);
      pianoKeys.push({
        el: key,
        pc: noteToPitchClass(n),
        midi: (octave + 1) * 12 + noteToPitchClass(n),
      });
      whiteKeyCount++;
    }
  }

  const blackKeysContainer = document.createElement('div');
  blackKeysContainer.className = 'black-keys';
  const whiteKeyWidth = 100 / whiteKeyCount;

  let whiteIndex = 0;
  for (let o = 0; o < PIANO_OCTAVES; o++) {
    const octave = PIANO_START_OCTAVE + o;
    for (const note of WHITE_KEY_NOTES) {
      const blackAfter = BLACK_KEY_MAP.find(b => b.after === note);
      if (blackAfter) {
        const bk = document.createElement('div');
        bk.className = 'key-black';
        const leftPct = (whiteIndex + 1) * whiteKeyWidth - (whiteKeyWidth * 0.3);
        bk.style.left = leftPct + '%';
        bk.style.width = (whiteKeyWidth * 0.6) + '%';
        blackKeysContainer.appendChild(bk);
        pianoKeys.push({
          el: bk,
          pc: noteToPitchClass(blackAfter.note),
          midi: (octave + 1) * 12 + noteToPitchClass(blackAfter.note),
        });
      }
      whiteIndex++;
    }
  }

  piano.appendChild(frag);
  piano.appendChild(blackKeysContainer);
}

// Single-voicing helper: bass in octave 4, other notes stack upward.
function buildVoicing(orderedNotes) {
  const bassOctave = 4;
  let last = (bassOctave + 1) * 12 + orderedNotes[0];
  const voicing = new Set([last]);
  for (let i = 1; i < orderedNotes.length; i++) {
    let m = last - (last % 12) + orderedNotes[i];
    while (m <= last) m += 12;
    voicing.add(m);
    last = m;
  }
  return voicing;
}

let showInstrumentCache = null;
export function invalidateShowInstrument() { showInstrumentCache = null; }

function showInstrumentEnabled() {
  if (showInstrumentCache === null) {
    showInstrumentCache = $('showInstrumentCb').checked;
  }
  return showInstrumentCache;
}

export function updatePianoHighlight() {
  const show = showInstrumentEnabled();
  const heard = state.heardPitchClasses;
  const chord = state.currentChord;

  if (!show || !chord) {
    for (const k of pianoKeys) {
      const cl = k.el.classList;
      if (cl.length) cl.remove('target', 'heard', 'wrong');
    }
    return;
  }

  const targetPcs = chord.pitchClasses;
  const voicing = buildVoicing(chord.orderedNotes);

  for (const k of pianoKeys) {
    const cl = k.el.classList;
    const shouldTarget = voicing.has(k.midi);
    const shouldHeard = heard.has(k.pc);
    const shouldWrong = shouldHeard && !targetPcs.has(k.pc);

    cl.toggle('target', shouldTarget);
    cl.toggle('heard', shouldHeard);
    cl.toggle('wrong', shouldWrong);
  }
}

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
