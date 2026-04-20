// DOM rendering for the chord display, piano, and status line.
import { state } from './state.js';
import { CHORD_FORMULAS, NOTE_DISPLAY, noteToPitchClass, pitchClassToDisplay } from './theory.js';
import { advanceToNextChord } from './generator.js';
import { updateCircleHighlight } from './circle.js';
import { updateGuitarHighlight } from './guitar.js';
import { triggerSuccess } from './feedback.js';

export function buildPiano() {
  const piano = document.getElementById('piano');
  piano.innerHTML = '';

  const octaves = 3;
  const startOctave = 3;
  const whiteKeyNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const blackKeyPositions = [
    { after: 'C', note: 'C#' },
    { after: 'D', note: 'D#' },
    { after: 'F', note: 'F#' },
    { after: 'G', note: 'G#' },
    { after: 'A', note: 'A#' }
  ];

  let whiteKeyCount = 0;
  for (let o = 0; o < octaves; o++) {
    for (const n of whiteKeyNotes) {
      const key = document.createElement('div');
      key.className = 'key-white';
      key.dataset.note = n;
      key.dataset.octave = startOctave + o;
      if (n === 'C') {
        const lbl = document.createElement('div');
        lbl.className = 'key-label';
        lbl.textContent = n + (startOctave + o);
        key.appendChild(lbl);
      }
      piano.appendChild(key);
      whiteKeyCount++;
    }
  }

  const blackKeysContainer = document.createElement('div');
  blackKeysContainer.className = 'black-keys';
  const whiteKeyWidth = 100 / whiteKeyCount;

  let whiteIndex = 0;
  for (let o = 0; o < octaves; o++) {
    for (let w = 0; w < whiteKeyNotes.length; w++) {
      const note = whiteKeyNotes[w];
      const blackAfter = blackKeyPositions.find(b => b.after === note);
      if (blackAfter) {
        const bk = document.createElement('div');
        bk.className = 'key-black';
        bk.dataset.note = blackAfter.note;
        bk.dataset.octave = startOctave + o;
        const leftPct = (whiteIndex + 1) * whiteKeyWidth - (whiteKeyWidth * 0.3);
        bk.style.left = leftPct + '%';
        bk.style.width = (whiteKeyWidth * 0.6) + '%';
        blackKeysContainer.appendChild(bk);
      }
      whiteIndex++;
    }
  }
  piano.appendChild(blackKeysContainer);
}

// Single-voicing helper: bass in octave 4, other notes stack upward.
// Returns a Set of MIDI numbers covering exactly one occurrence of each chord note.
function buildVoicing(orderedNotes) {
  const bassOctave = 4; // C4 = MIDI 60
  let last = (bassOctave + 1) * 12 + orderedNotes[0];
  const voicing = new Set([last]);
  for (let i = 1; i < orderedNotes.length; i++) {
    const pc = orderedNotes[i];
    let m = last - (last % 12) + pc;
    while (m <= last) m += 12;
    voicing.add(m);
    last = m;
  }
  return voicing;
}

function keyToMidi(noteName, octave) {
  return (parseInt(octave) + 1) * 12 + noteToPitchClass(noteName);
}

export function updatePianoHighlight() {
  const showInstrument = document.getElementById('showInstrumentCb').checked;
  const allKeys = document.querySelectorAll('.key-white, .key-black');
  allKeys.forEach(k => k.classList.remove('target', 'heard', 'wrong'));

  if (!showInstrument || !state.currentChord) return;

  const targetPcs = state.currentChord.pitchClasses;
  const voicing = buildVoicing(state.currentChord.orderedNotes);

  allKeys.forEach(k => {
    const pc = noteToPitchClass(k.dataset.note);
    const midi = keyToMidi(k.dataset.note, k.dataset.octave);

    if (voicing.has(midi)) {
      k.classList.add('target');
    }
    if (state.heardPitchClasses.has(pc)) {
      k.classList.add('heard');
      if (!targetPcs.has(pc)) {
        k.classList.add('wrong');
      }
    }
  });
}

function formatChordHtml(chord) {
  const formula = CHORD_FORMULAS[chord.quality];
  const rootDisplay = NOTE_DISPLAY[chord.root];
  const suffix = formula.suffix;
  const bassNote = chord.orderedNotes[0] !== noteToPitchClass(chord.root)
    ? '/' + pitchClassToDisplay(chord.orderedNotes[0])
    : '';
  return `${rootDisplay}<span class="accent">${suffix}</span>${bassNote ? '<span class="accent">' + bassNote + '</span>' : ''}`;
}

export function renderNextPreview() {
  const el = document.getElementById('chordDisplayNext');
  if (!el) return;
  const next = state.chordQueue[0];
  el.innerHTML = next ? formatChordHtml(next) : '';
}

export function displayChord(chord) {
  state.currentChord = chord;
  state.heardPitchClasses = new Set();
  state.heardHistory = [];

  const display = document.getElementById('chordDisplay');
  const notesEl = document.getElementById('chordNotes');

  if (!chord) {
    display.textContent = '—';
    notesEl.innerHTML = '';
    renderNextPreview();
    return;
  }

  display.innerHTML = formatChordHtml(chord);
  renderNextPreview();

  // Re-trigger fade-in animation.
  display.style.animation = 'none';
  display.offsetHeight;
  display.style.animation = '';

  // Note chips are always shown now (the option was removed).
  notesEl.innerHTML = chord.orderedNotes.map(pc =>
    `<span class="note" data-pc="${pc}">${pitchClassToDisplay(pc)}</span>`
  ).join('');

  // Progression metadata, if this chord came from a progression.
  const progEl = document.getElementById('progressionInfo');
  if (progEl) {
    if (chord.meta) {
      const m = chord.meta;
      const keyDisp = NOTE_DISPLAY[m.key];
      progEl.innerHTML = `<em>${m.progression}</em> · in ${keyDisp} · ${m.token} <span class="prog-pos">(${m.position + 1}/${m.total})</span>`;
      progEl.style.display = 'block';
    } else {
      progEl.style.display = 'none';
    }
  }

  updatePianoHighlight();
  updateGuitarHighlight();
  updateCircleHighlight();
  updateStatus();
}

// Source-agnostic update: takes a Set of pitch classes from any input source.
export function applyHeardPitchClasses(stable) {
  state.heardPitchClasses = stable;

  document.querySelectorAll('.chord-notes .note').forEach(el => {
    const pc = parseInt(el.dataset.pc);
    el.classList.remove('heard', 'wrong');
    if (stable.has(pc)) el.classList.add('heard');
  });

  const names = [...stable].sort((a, b) => a - b).map(pc => pitchClassToDisplay(pc));
  const detected = document.getElementById('detectedNotes');
  if (detected) detected.textContent = names.length > 0 ? names.join(' · ') : '—';

  updatePianoHighlight();
  updateGuitarHighlight();
  updateStatus();
}

function isAnyInputActive() {
  return state.isListening || state.midiEnabled;
}

export function updateStatus() {
  const statusEl = document.getElementById('status');
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
    const fresh = now - state.lastSuccessTime > 1500;
    if (fresh) {
      state.lastSuccessTime = now;
      triggerSuccess();
    }

    if (state.dynamic.running) {
      // Metronome controls progression; just record success for the bar.
      state.dynamic.correctThisBar = true;
    } else if (fresh) {
      // MIDI is deterministic — advance almost immediately. Mic gets a small
      // delay to let the visual feedback land before the chord changes.
      const delay = state.midiEnabled ? 200 : 700;
      setTimeout(() => advanceToNextChord(displayChord), delay);
    }
  } else if (heard.size === 0) {
    statusEl.innerHTML = '<span class="listening-dot"></span>Listening...';
    statusEl.className = 'status listening';
  } else if (extra.length > 0) {
    const wrongNames = extra.map(pc => pitchClassToDisplay(pc)).join(', ');
    statusEl.innerHTML = `Wrong notes: ${wrongNames}`;
    statusEl.className = 'status wrong';
  } else {
    const missingNames = missing.map(pc => pitchClassToDisplay(pc)).join(', ');
    statusEl.innerHTML = `Still missing: ${missingNames}`;
    statusEl.className = 'status listening';
  }
}
