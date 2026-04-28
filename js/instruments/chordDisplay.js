// Chord display: the "vanishing point" stage that shows previous + current +
// upcoming chords as a single composed visual. Each chord is a card; cards
// are positioned by slot (-1 = previous, 0 = current, ≥1 = upcoming) and CSS
// transitions move them whenever the slots are reassigned. DOM nodes are
// reused across renders (Map keyed by stable identity — chord object in
// random mode, progression+cycle+tokenIndex string in progression mode) so
// the same element animates from slot 1 → slot 0 instead of being recreated.
//
// Note chips below the stage track which pitch classes have been heard, and
// stay attached to the current chord. Toggling 'heard' on each chip is a
// per-element flip — we don't re-render the chips on every detection update.

import { state } from '../core/state.js';
import { pitchClassToDisplay, formatChordHtml, spellChordTones, NOTE_DISPLAY } from '../core/theory.js';
import { romanToChord } from '../training/progressions.js';
import { advanceToNextChord } from '../training/generator.js';
import { updatePianoHighlight } from './piano.js';
import { updateCircleHighlight } from './circle.js';
import { updateGuitarHighlight } from './guitar.js';
import { isSheetActive, renderSheet, updateSheetHighlight } from './sheetMusic.js';
import { triggerSuccess, notifyChordChange } from '../ux/feedback.js';
import { $ } from '../core/dom.js';
import {
  MIC_SUCCESS_DELAY_MS, MIDI_SUCCESS_DELAY_MS, SUCCESS_DEDUP_MS
} from '../core/constants.js';

let noteChipEls = []; // chip <span> elements for the current chord

// Keyed by stable entry-key (chord object in random mode, string in
// progression mode) so the same DOM element follows a chord across slots
// (queue → current → previous), keeping its transition smooth.
const cardEls = new Map();

// Visible slots on the stage: just the previous chord (-1), the current (0),
// and the immediate next (1). Anything outside is the off-stage exit state.
function slotConfig(slot) {
  if (slot === 0)  return { x: 0,     scale: 1.20, opacity: 1.00, blur: 0,   z: 10 };
  if (slot === -1) return { x: -1.4,  scale: 0.45, opacity: 0.32, blur: 0.8, z: 4  };
  if (slot === 1)  return { x:  1.4,  scale: 0.55, opacity: 0.55, blur: 0,   z: 6  };
  // Off-stage: used for the exit animation (slide further out + fade).
  if (slot < 0)    return { x: -2.1,  scale: 0.18, opacity: 0,    blur: 2,   z: 1  };
  return            { x:  2.1,  scale: 0.18, opacity: 0,    blur: 2,   z: 1  };
}

function applySlot(el, slot) {
  const cfg = slotConfig(slot);
  el.style.setProperty('--xmult', cfg.x);
  el.style.setProperty('--scale', cfg.scale);
  el.style.setProperty('--opacity', cfg.opacity);
  el.style.setProperty('--blur', `${cfg.blur}px`);
  el.style.zIndex = cfg.z;
  el.dataset.slot = String(slot);
}

function createCard(chord, degree) {
  const el = document.createElement('div');
  el.className = 'chord-card';

  const chordEl = document.createElement('div');
  chordEl.className = 'card-chord';
  chordEl.innerHTML = chord ? formatChordHtml(chord) : '—';
  el.appendChild(chordEl);

  if (degree) {
    const degEl = document.createElement('div');
    degEl.className = 'card-degree';
    degEl.textContent = degree;
    el.appendChild(degEl);
  }
  return el;
}

// Build the stage entries: previous + current + immediate next. The full
// progression / queue panel below the stage shows the broader context.
//
// Keys are stable across advances so the same DOM node animates between
// slots instead of being recreated. In progression mode we key by
// progression+cycle+tokenIndex (since tokens get re-resolved into new chord
// objects each render); in random mode the chord object reference itself is
// stable as it flows queue → current → previous.
function computeStage() {
  const cur = state.currentChord;
  if (!cur) return { entries: [] };

  const meta = cur.meta;
  if (meta) {
    const entries = [];
    const tokenAt = (i) => {
      if (i < 0 || i >= meta.tokens.length) return null;
      const inv = (meta.inversions && meta.inversions[i]) || 0;
      const chord = i === meta.position ? cur : romanToChord(meta.tokens[i], meta.key, meta.mode, inv);
      if (!chord) return null;
      return {
        key: `prog:${meta.progression}:${meta.key}:${meta.cycle}:${i}`,
        chord,
        slot: i - meta.position,
        // Degrees are shown in the "Coming up" queue panel below, so we
        // omit them on the stage to keep it clean.
        degree: null
      };
    };
    const prev = tokenAt(meta.position - 1);
    if (prev) entries.push(prev);
    const curEntry = tokenAt(meta.position);
    if (curEntry) entries.push(curEntry);
    const next = tokenAt(meta.position + 1);
    if (next) entries.push(next);
    return { entries };
  }

  // Random mode: previous + current + immediate next (queue head).
  const entries = [];
  if (state.previousChord) {
    entries.push({ key: state.previousChord, chord: state.previousChord, slot: -1, degree: null });
  }
  entries.push({ key: cur, chord: cur, slot: 0, degree: null });
  if (state.chordQueue.length > 0) {
    const c = state.chordQueue[0];
    entries.push({ key: c, chord: c, slot: 1, degree: null });
  }
  return { entries };
}

export function renderStage() {
  const track = $('stageTrack');
  if (!track) return;

  const { entries } = computeStage();

  // Diff: keep the desired set, exit the rest.
  const wantedKeys = new Set(entries.map(e => e.key));

  for (const [key, el] of cardEls) {
    if (!wantedKeys.has(key)) {
      // Slide off-stage to the left, then remove once the transition settles.
      applySlot(el, -3);
      el.classList.remove('is-current');
      const stale = el;
      setTimeout(() => {
        if (stale.parentNode) stale.parentNode.removeChild(stale);
      }, 650);
      cardEls.delete(key);
    }
  }

  // Add or update cards for every desired entry.
  let currentEl = null;
  for (const entry of entries) {
    let el = cardEls.get(entry.key);
    if (!el) {
      el = createCard(entry.chord, entry.degree);
      track.appendChild(el);
      cardEls.set(entry.key, el);
      // Initialize one slot further out so the card appears to slide in
      // from the vanishing point. (For the very first render, no transition
      // would have time to set up; the user just sees the cards in place.)
      applySlot(el, entry.slot + 1);
      // Force reflow so the subsequent slot change triggers a transition.
      void el.offsetHeight;
    } else {
      // Refresh the chord glyph itself: when keys are stable across renders
      // the chord object may differ (progression mode rebuilds them), but
      // for the same (progression, cycle, tokenIndex) the rendered chord
      // is identical so this is a cheap no-op in practice.
      const chordEl = el.querySelector('.card-chord');
      if (chordEl) chordEl.innerHTML = entry.chord ? formatChordHtml(entry.chord) : '—';

      // Sync degree label if it changed.
      const existingDegree = el.querySelector('.card-degree');
      if (entry.degree && !existingDegree) {
        const degEl = document.createElement('div');
        degEl.className = 'card-degree';
        degEl.textContent = entry.degree;
        el.appendChild(degEl);
      } else if (!entry.degree && existingDegree) {
        existingDegree.remove();
      } else if (entry.degree && existingDegree && existingDegree.textContent !== entry.degree) {
        existingDegree.textContent = entry.degree;
      }
    }
    applySlot(el, entry.slot);
    el.classList.toggle('is-current', entry.slot === 0);
    if (entry.slot === 0) currentEl = el;
  }

  // Move the legacy id="chordDisplay" hook onto the current card so the
  // onboarding spotlight + feedback flash + status message keep tracking it.
  const prevAnchor = document.getElementById('chordDisplay');
  if (prevAnchor && prevAnchor !== currentEl) prevAnchor.removeAttribute('id');
  if (currentEl) currentEl.id = 'chordDisplay';

  // Run after layout so offsetWidth reflects the new chord text.
  requestAnimationFrame(adjustStageStep);
}

// Backwards-compatible alias kept for callers (main.js, generator.js
// regeneration paths) that want to nudge the upcoming preview.
export function renderNextPreview() { renderStage(); }

// Side cards are positioned at xmult ±1.4 from center and rendered at the
// scale below. We need the gap between current and side card to clear the
// rendered widths of both, otherwise long chords like "G#m/D#" overlap the
// next card. The CSS clamp for --step is a viewport-only heuristic and ends
// up too small at most viewport widths, so we override it from measured
// layout widths after each render and on resize.
const SIDE_XMULT = 1.4;
const CURRENT_SCALE = 1.20;
const SIDE_SCALE = 0.55;
const STEP_GAP_PX = 28;

function adjustStageStep() {
  const stage = $('chordStage');
  const track = $('stageTrack');
  if (!stage || !track) return;

  let current = null;
  let widestSide = 0;
  for (const el of track.children) {
    if (!el.classList.contains('chord-card')) continue;
    const slot = el.dataset.slot;
    if (slot === '0') current = el;
    else if (slot === '1' || slot === '-1') {
      // offsetWidth ignores transforms — gives the natural layout width.
      widestSide = Math.max(widestSide, el.offsetWidth * SIDE_SCALE);
    }
  }
  if (!current) return;

  const currentRendered = current.offsetWidth * CURRENT_SCALE;
  const required = (currentRendered + widestSide) / 2 + STEP_GAP_PX;
  const step = required / SIDE_XMULT;
  const minStep = window.matchMedia('(max-width: 700px)').matches ? 56 : 96;
  stage.style.setProperty('--step', `${Math.max(minStep, step)}px`);
}

// Re-measure on viewport resize. The custom prop is a one-shot value; the
// CSS clamp would otherwise stay overridden after the viewport changes.
let resizeScheduled = false;
window.addEventListener('resize', () => {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(() => {
    resizeScheduled = false;
    adjustStageStep();
  });
});

// Renders the notes section under the current chord — either the letter chips
// or a staff, depending on the sheet-music mode. Called on chord change and
// whenever the user flips the mode in Options. Also re-applies the heard
// highlights so a flip mid-chord doesn't lose the already-played notes.
export function renderNotesView() {
  const notesEl = $('chordNotes');
  const chord = state.currentChord;
  if (!notesEl) {
    noteChipEls = [];
    return;
  }
  if (!chord) {
    notesEl.innerHTML = '';
    noteChipEls = [];
    return;
  }
  if (isSheetActive()) {
    renderSheet(chord, notesEl);
    noteChipEls = [];
    updateSheetHighlight(notesEl);
  } else {
    const tones = spellChordTones(chord);
    notesEl.innerHTML = chord.orderedNotes.map((pc, i) =>
      `<span class="note" data-pc="${pc}">${tones[i].display}</span>`
    ).join('');
    noteChipEls = Array.from(notesEl.querySelectorAll('.note'));
    const heard = state.heardPitchClasses;
    for (const el of noteChipEls) {
      const pc = parseInt(el.dataset.pc, 10);
      el.classList.toggle('heard', heard.has(pc));
    }
  }
}

export function displayChord(chord) {
  state.previousChord = state.currentChord;
  state.currentChord = chord;
  state.heardPitchClasses = new Set();
  state.heardHistory = [];
  // New chord = clean slate for the success-dedup window, otherwise playing the
  // next chord within SUCCESS_DEDUP_MS of the previous success (common in MIDI)
  // swallows the match and the advance only fires after the window elapses.
  state.lastSuccessTime = 0;

  const notesEl = $('chordNotes');

  if (!chord) {
    if (notesEl) notesEl.innerHTML = '';
    noteChipEls = [];
    renderStage();
    return;
  }

  renderStage();

  renderNotesView();

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

  if (isSheetActive()) {
    updateSheetHighlight($('chordNotes'));
  } else {
    for (const el of noteChipEls) {
      const pc = parseInt(el.dataset.pc, 10);
      el.classList.toggle('heard', stable.has(pc));
    }
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
