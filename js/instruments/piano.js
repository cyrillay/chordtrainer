// Piano keyboard rendering + key highlighting + finger labels.
//
// Keys are cached at build time so highlight updates are per-key flips
// instead of repeated querySelectorAll + class sweeps.

import { state } from '../core/state.js';
import { noteToPitchClass, getFingering } from '../core/theory.js';
import { $ } from '../core/dom.js';
import { PIANO_OCTAVES, PIANO_START_OCTAVE } from '../core/constants.js';

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

export function buildPiano() {
  const piano = $('piano');
  piano.innerHTML = '';
  pianoKeys.length = 0;

  const frag = document.createDocumentFragment();
  const whiteKeyCount = PIANO_OCTAVES * WHITE_KEY_NOTES.length;

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

// Cached checkbox reads — flipped once per render instead of per key.
// Invalidated by main.js whenever the show-instrument or show-fingerings
// checkbox changes.
let showInstrumentCache = null;
let showFingeringsCache = null;
export function invalidatePianoCaches() {
  showInstrumentCache = null;
  showFingeringsCache = null;
}

function showInstrumentEnabled() {
  if (showInstrumentCache === null) {
    showInstrumentCache = $('showInstrumentCb').checked;
  }
  return showInstrumentCache;
}

function showFingeringsEnabled() {
  if (showFingeringsCache === null) {
    const cb = $('showFingeringsCb');
    showFingeringsCache = !!(cb && cb.checked);
  }
  return showFingeringsCache;
}

export function updatePianoHighlight() {
  const show = showInstrumentEnabled();
  const heard = state.heardPitchClasses;
  const chord = state.currentChord;

  if (!show || !chord) {
    for (const k of pianoKeys) {
      const cl = k.el.classList;
      if (cl.length) cl.remove('target', 'heard', 'wrong');
      clearFingerLabel(k.el);
    }
    return;
  }

  const targetPcs = chord.pitchClasses;
  const voicing = buildVoicing(chord.orderedNotes);

  // Build a midi → finger map for the current voicing if fingerings are on.
  // Voicing notes are bass→top, so we can pair them with the fingering arrays.
  let fingerByMidi = null;
  if (showFingeringsEnabled()) {
    const { rh, lh } = getFingering(chord);
    const sortedVoicing = [...voicing].sort((a, b) => a - b);
    fingerByMidi = new Map();
    for (let i = 0; i < sortedVoicing.length; i++) {
      fingerByMidi.set(sortedVoicing[i], { rh: rh[i], lh: lh[i] });
    }
  }

  for (const k of pianoKeys) {
    const cl = k.el.classList;
    const shouldTarget = voicing.has(k.midi);
    const shouldHeard = heard.has(k.pc);
    const shouldWrong = shouldHeard && !targetPcs.has(k.pc);

    cl.toggle('target', shouldTarget);
    cl.toggle('heard', shouldHeard);
    cl.toggle('wrong', shouldWrong);

    if (fingerByMidi && shouldTarget) {
      const f = fingerByMidi.get(k.midi);
      setFingerLabel(k.el, f?.rh, f?.lh);
    } else {
      clearFingerLabel(k.el);
    }
  }
}

function setFingerLabel(keyEl, rh, lh) {
  let lbl = keyEl.querySelector('.finger-label');
  if (!lbl) {
    lbl = document.createElement('div');
    lbl.className = 'finger-label';
    keyEl.appendChild(lbl);
  }
  // Compact "RH / LH" badge — shown only on target keys.
  lbl.innerHTML = `<span class="finger-rh">${rh ?? '·'}</span><span class="finger-sep">·</span><span class="finger-lh">${lh ?? '·'}</span>`;
}

function clearFingerLabel(keyEl) {
  const lbl = keyEl.querySelector('.finger-label');
  if (lbl) lbl.remove();
}
