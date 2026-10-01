// Arpeggio Trainer — page controller. Views: the level path (map) and the
// play stage. MIDI is required to play; everything else is local state.

import { CHORD_FORMULAS, NOTE_NAMES, NOTE_DISPLAY } from '../../js/core/theory.js';
import { ArpeggioMatcher, scoreArpeggio, comboMultiplier, starsFor, degreeName, STAR_RULES } from './engine.js';
import {
  LEVELS, levelById, levelLength, makeTask, poolFrom, levelPool, timeLimitMs,
  weakList, makeWeakTask, recordWeak, rootsUpTo,
} from './levels.js';
import { createKeyboard } from './keyboard.js';
import { renderStage, clearStage, currentCard } from './stage.js';
import { renderMidiHint, gateCopy, DENIED_HELP_HTML } from '../../js/midi/midiHelp.js';
import { bindInfoTips } from '../../js/ux/infoTip.js';
import { createMidi, attachComputerKeyboard } from './midi.js';
import { loadSettings, saveSettings, loadProgress, saveProgress, loadWeak, saveWeak, clearWeak } from './storage.js';
import { initAchievements, grant, bump, setMax, setValue } from './achievements.js';
import * as eggs from './eggs.js';

const $ = (id) => document.getElementById(id);

const settings = loadSettings();
const keyboard = createKeyboard($('keyboard'));
const progress = loadProgress();
let weakStats = loadWeak();

const WEAK_SESSION_LENGTH = 12;
const QUALITY_ORDER = ['maj', 'min', 'dim', 'aug', 'maj7', 'min7', 'dom7', 'm7b5', 'mMaj7'];
// Same list and wording as the Chords trainer's "Chord qualities" grid.
const QUALITY_LABELS = {
  maj: 'Major', min: 'Minor', dim: 'Diminished', aug: 'Augmented',
  maj7: 'Major 7th', min7: 'Minor 7th', dom7: 'Dominant 7th',
  m7b5: 'Half-diminished (ø)', mMaj7: 'Minor major 7th',
};
const Q_PRESETS = {
  triads: ['maj', 'min'],
  allTriads: ['maj', 'min', 'dim', 'aug'],
  sevenths: ['maj7', 'min7', 'dom7', 'm7b5'],
  all: QUALITY_ORDER,
};
const R_PRESETS = {
  naturals: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  acc1: rootsUpTo(1),
  acc3: rootsUpTo(3),
  acc5: rootsUpTo(5),
  acc6: NOTE_NAMES,
};
const DIR_LABELS = { up: 'Ascending', down: 'Descending', updown: 'Up & back' };
const START_LABELS = { root: 'Root', third: '3rd', fifth: '5th', seventh: '7th / top' };

// ---- MIDI ----

let midiState = 'off';
const held = new Set();
let pedalDown = false;
const history = []; // recent note-ons: { midi, t }

const midi = createMidi({
  onNoteOn: handleNoteOn,
  onNoteOff: handleNoteOff,
  onPedal: (down) => { pedalDown = down; if (!down && session) session.pedalHeld = false; },
  onStatus: renderMidiStatus,
});

function renderMidiStatus({ state, names }) {
  midiState = state;
  const btn = $('midiBtn');
  btn.classList.toggle('is-connected', state === 'connected');
  btn.classList.toggle('is-error', ['nodevice', 'denied', 'unsupported'].includes(state));
  const label = state === 'connected' ? names.join(' · ') : 'Connect MIDI';
  $('midiLabel').textContent = label;
  btn.title = state === 'connected' ? 'MIDI connected' : 'Connect a MIDI keyboard';

  const gate = $('midiGate');
  gate.hidden = state === 'connected';
  const status = $('midiStatus');
  status.hidden = state === 'connected' || state === 'off';
  if (state === 'nodevice') renderMidiHint(status, 'No device found');
  else if (state === 'unsupported') renderMidiHint(status, 'MIDI not supported here');
  else if (state === 'denied') renderMidiHint(status, 'MIDI access denied', { html: DENIED_HELP_HTML });
  const copy = gateCopy(state);
  $('gateTitle').textContent = copy.title;
  $('gateSub').textContent = copy.sub;
  document.body.classList.toggle('midi-ready', state === 'connected');
}

$('midiBtn').addEventListener('click', () => { if (midiState !== 'connected') midi.connect(); });
$('gateConnectBtn').addEventListener('click', () => midi.connect());

const devKeys = new URLSearchParams(location.search).has('keys');
if (devKeys) {
  attachComputerKeyboard({ onNoteOn: handleNoteOn, onNoteOff: handleNoteOff });
  renderMidiStatus({ state: 'connected', names: ['Computer keyboard (dev)'] });
} else if (midi.previouslyGranted()) {
  midi.connect();
}

// ---- Audio (tiny reward chimes, synthesized) ----

let ctx = null;
function chime(freqs, { gain = 0.08, dur = 0.5, type = 'sine', spread = 0.06 } = {}) {
  if (!settings.sound) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      const s = t0 + i * spread;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(gain, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(s);
      osc.stop(s + dur + 0.05);
    });
  } catch { /* audio is optional */ }
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---- Session ----
// kind: 'level' | 'free' | 'weak'

let session = null;

function newSession(kind, level = null) {
  return {
    kind, level,
    length: kind === 'level' ? levelLength(level) : kind === 'weak' ? WEAK_SESSION_LENGTH : Infinity,
    index: 0,
    task: null,
    queue: [],
    matcher: null,
    score: 0,
    combo: 0,
    bestCombo: 0,
    correct: 0,
    mistakes: 0,
    gapSum: 0,
    gapCount: 0,
    timeouts: 0,
    results: [],
    taskShownAt: 0,
    timerId: null,
    pedalHeld: false,
    // achievement trackers
    lastAscentTop: null,
    penroseRun: 0,
    phoenixArmed: false,
    phoenixRun: 0,
    rootsByQuality: {},
    namesEverShown: settings.showNames || settings.guideKeys,
    lastNoteAt: performance.now(),
    weakPool: kind === 'weak' ? weakList(weakStats, 8) : null,
    transitioning: false,
  };
}

function spec() {
  if (session.kind === 'level') return session.level;
  return { directions: settings.freeDirections, starts: settings.freeStarts };
}

function generate(prev, k) {
  if (session.kind === 'weak') return makeWeakTask(session.weakPool, prev);
  const pool = session.kind === 'level' ? levelPool(session.level) : poolFrom(settings);
  return makeTask(spec(), pool, k, prev);
}

function fillQueue() {
  while (session.queue.length < 3) {
    const prev = session.queue[session.queue.length - 1] || session.task;
    const k = session.index + session.queue.length + (session.task ? 1 : 0);
    session.queue.push(generate(prev, k));
  }
}

function startSession(kind, level = null) {
  if (midiState !== 'connected') {
    $('midiGate').classList.remove('shake');
    void $('midiGate').offsetWidth;
    $('midiGate').classList.add('shake');
    if (midiState === 'off') midi.connect();
    return;
  }
  if (kind === 'weak' && !weakList(weakStats).length) return;
  session = newSession(kind, level);
  $('viewMap').hidden = true;
  $('viewPlay').hidden = false;
  $('resultModal').hidden = true;
  $('playTitle').textContent = kind === 'level'
    ? `Level ${level.id} · ${level.name}`
    : kind === 'weak' ? 'Weak spots' : 'Free practice';
  renderDots();
  renderHud();
  keyboard.clearAll();
  clearStage();
  requestAnimationFrame(() => keyboard.reveal(60));
  fillQueue();
  nextTask();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exitSession() {
  if (session?.timerId) cancelAnimationFrame(session.timerId);
  session = null;
  clearStage();
  $('viewPlay').hidden = true;
  $('viewMap').hidden = false;
  $('resultModal').hidden = true;
  renderMap();
}

function nextTask() {
  if (session.index >= session.length) return finishSession();
  session.prevTask = session.task;
  session.task = session.queue.shift();
  fillQueue();
  session.matcher = new ArpeggioMatcher(session.task);
  session.taskShownAt = performance.now();
  session.pedalHeld = pedalDown;
  session.transitioning = false;
  renderTask();
  if (session.kind === 'level' && session.level.timed) startTimer();
}

// ---- Timer (timed levels) ----

function startTimer() {
  const limit = timeLimitMs(session.task);
  const fill = $('timerFill');
  $('timer').hidden = false;
  const s = session;
  const tick = () => {
    if (session !== s || s.transitioning) return;
    const left = 1 - (performance.now() - s.taskShownAt) / limit;
    fill.style.transform = `scaleX(${Math.max(0, left)})`;
    fill.classList.toggle('is-low', left < 0.3);
    if (left <= 0) return timeout();
    s.timerId = requestAnimationFrame(tick);
  };
  s.timerId = requestAnimationFrame(tick);
}

function timeout() {
  const m = session.matcher;
  const missing = session.task.steps.length - m.index;
  session.timeouts++;
  session.mistakes += missing;
  m.mistakes += missing;
  feedback('Time!', 'bad');
  chime([220, 185], { type: 'triangle', gain: 0.06, dur: 0.35, spread: 0.12 });
  completeTask(m.result(), { timedOut: true });
}

// ---- Rendering: play view ----

function renderDots() {
  const el = $('playDots');
  if (!Number.isFinite(session.length)) { el.innerHTML = ''; return; }
  el.innerHTML = Array.from({ length: session.length }, (_, i) => `<span class="dot" data-i="${i}"></span>`).join('');
}

function markDot(i, kind) {
  const dot = $('playDots').querySelector(`[data-i="${i}"]`);
  if (dot) dot.className = `dot is-${kind}`;
}

function renderHud() {
  $('hudScore').textContent = session.score.toLocaleString();
  $('hudCombo').textContent = session.combo;
  const mult = comboMultiplier(session.combo);
  $('hudMult').textContent = mult > 1 ? `×${mult}` : '';
  $('hudComboCell').classList.toggle('is-hot', session.combo >= 4);
  $('hudComboCell').classList.toggle('is-blazing', session.combo >= 12);
  const total = session.correct + session.mistakes;
  $('hudAcc').textContent = total ? `${Math.round((session.correct / total) * 100)}%` : '—';
}

const ARROWS = { up: '↑', down: '↓', updown: '↕' };

function startLabel(task) {
  const name = degreeName(task.start);
  return name === 'root' ? 'root' : name;
}

function renderTask() {
  const t = session.task;
  const instr = $('instruction');
  instr.dataset.dir = t.direction;
  $('instrArrow').textContent = ARROWS[t.direction];
  $('instrDir').textContent = DIR_LABELS[t.direction];
  $('instrFrom').textContent = startLabel(t);
  instr.classList.remove('pop');
  void instr.offsetWidth;
  instr.classList.add('pop');

  renderChordStage();

  const showNames = settings.showNames;
  $('steps').innerHTML = t.steps.map((s, i) => `
    <span class="step" data-i="${i}">
      ${i > 0 ? `<span class="step-dir">${s.dir === 'up' ? '↗' : '↘'}</span>` : ''}
      <span class="step-box"><span class="step-note">${showNames ? s.label : '•'}</span><span class="step-deg">${s.degree}</span></span>
    </span>`).join('');
  $('steps').classList.toggle('hide-names', !showNames);
  feedback(' ');

  keyboard.setChordTones(settings.guideKeys ? t.chord.pitchClasses : null);
  updateHint();
  $('timer').hidden = !(session.kind === 'level' && session.level.timed);
}

// Previous, current and the next two chords, chord-trainer style. Upcoming
// cards carry their pattern (↑ 3rd) so the next move can be planned ahead.
function renderChordStage() {
  const entries = [];
  if (session.prevTask) entries.push({ task: session.prevTask, slot: -1 });
  entries.push({ task: session.task, slot: 0 });
  session.queue.slice(0, 2).forEach((task, i) => entries.push({ task, slot: i + 1 }));
  renderStage($('stageTrack'), entries, t => `${ARROWS[t.direction]} ${startLabel(t)}`);
}

function updateHint() {
  if (!settings.guideKeys || !session?.matcher || session.matcher.done) { keyboard.setHint(); return; }
  const m = session.matcher;
  const exact = m.expectedMidi();
  if (exact !== null) keyboard.setHint({ midi: exact });
  else keyboard.setHint({ pc: m.expected.pc });
}

function feedback(text, kind = '') {
  const el = $('feedbackLine');
  el.textContent = text;
  el.className = `feedback-line ${kind ? 'is-' + kind : ''}`;
}

function floatText(text, kind = '') {
  const el = document.createElement('div');
  el.className = `float ${kind}`;
  el.textContent = text;
  $('floatLayer').appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

const REASONS = {
  pitch: 'Not a chord tone here',
  direction: 'Wrong way',
};

// ---- Input ----

function handleNoteOn(midiNote, velocity, t) {
  held.add(midiNote);
  history.push({ midi: midiNote, t });
  if (history.length > 40) history.shift();
  keyboard.setDown(midiNote, true);
  keyboard.reveal(midiNote);
  checkEggs();

  if (!session || session.transitioning || !session.matcher) return;
  const silence = t - session.lastNoteAt;
  session.lastNoteAt = t;
  if (silence >= 273000) grant('cage');

  const r = session.matcher.press(midiNote, velocity, t);
  if (r.type === 'ignore') return;
  const stepEl = $('steps').querySelector(`[data-i="${r.index}"]`);

  if (r.type === 'wrong') {
    session.mistakes++;
    session.combo = 0;
    keyboard.flash(midiNote, 'bad');
    if (stepEl) { stepEl.classList.remove('shake'); void stepEl.offsetWidth; stepEl.classList.add('shake'); }
    feedback(REASONS[r.reason], 'bad');
    renderHud();
    return;
  }

  session.correct++;
  keyboard.flash(midiNote, 'ok');
  if (stepEl) stepEl.classList.add('is-done');
  feedback(' ');
  updateHint();
  renderHud();
  if (r.done) completeTask(session.matcher.result());
}

function handleNoteOff(midiNote) {
  held.delete(midiNote);
  keyboard.setDown(midiNote, false);
}

// Called continuously: idle-silence check for 4′33″ while on the play view.
setInterval(() => {
  if (session && !session.transitioning && performance.now() - session.lastNoteAt >= 273000) {
    grant('cage');
    session.lastNoteAt = performance.now();
  }
}, 5000);

function checkEggs() {
  const melody = eggs.detectMelody(history);
  if (melody === 'furElise') grant('furElise');
  else if (melody === 'odeToJoy') grant('odeToJoy');
  else if (melody === 'closeEncounters') grant('closeEnc');
  else if (melody === 'oneUp') grant('oneUp');
  if (eggs.detectBach(history)) grant('bach');
  if (eggs.detectTristan(held)) grant('tristan');
  if (eggs.detectJaws(history)) grant('jaws');
  if (eggs.detectChromatic(history)) grant('chromatic');
  if (eggs.detectGlissando(history)) grant('glissando');
  if (eggs.detectCluster(held)) grant('cluster');
  if (eggs.detectPalindrome(history)) grant('palindrome');
}

// ---- Completing an arpeggio ----

function completeTask(result, { timedOut = false } = {}) {
  const s = session;
  s.transitioning = true;
  if (s.timerId) cancelAnimationFrame(s.timerId);
  keyboard.setHint();

  const clean = result.clean && !timedOut;
  s.combo = clean ? s.combo + 1 : 0;
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  const pts = timedOut ? 0 : scoreArpeggio(result, s.combo);
  s.score += pts;
  if (result.gaps.length && !timedOut) { s.gapSum += result.durationMs; s.gapCount += result.gaps.length; }
  s.results.push({ ...result, timedOut });

  // Weak-spot memory (not on timeouts with zero notes — those say nothing about the pattern).
  if (!(timedOut && result.correct === 0)) {
    recordWeak(weakStats, { ...result, clean });
    saveWeak(weakStats);
  }

  markDot(s.index, clean ? 'clean' : timedOut ? 'miss' : 'rough');
  if (!timedOut) {
    floatText(`+${pts}`, clean ? 'gold' : '');
    currentCard()?.classList.toggle('is-clean', clean);
    if (clean) {
      const top = result.notes[result.notes.length - 1]?.midi ?? 72;
      const step = Math.min(s.combo, 8);
      chime([hz(top + 12), hz(top + 12 + (step >= 4 ? 7 : 4)), hz(top + 24)], { gain: 0.05 + Math.min(step, 8) * 0.004 });
      if (s.combo > 0 && s.combo % 4 === 0) floatText(`${s.combo} combo!`, 'combo');
    }
    feedback(clean ? praise(result, s.combo) : `${result.mistakes} slip${result.mistakes > 1 ? 's' : ''}, keep going`, clean ? 'good' : 'meh');
  }
  renderHud();
  arpeggioAchievements(result, clean, timedOut);

  s.index++;
  const delay = clean ? 450 : 750;
  setTimeout(() => { if (session === s) nextTask(); }, delay);
}

const PRAISE = ['Clean', 'Nice', 'Smooth', 'Lovely', 'Crisp', 'Bravo', 'Elegant', 'Spot on'];
function praise(result, combo) {
  if (combo >= 12) return 'Unstoppable';
  if (combo >= 8) return 'On fire';
  if (result.avgGapMs && result.avgGapMs < 220) return 'Lightning';
  return PRAISE[Math.floor(Math.random() * PRAISE.length)];
}

function arpeggioAchievements(result, clean, timedOut) {
  const s = session;
  const now = new Date();
  if (timedOut) { s.penroseRun = 0; return; }
  bump('arps.total');
  setMax('combo.best', s.combo);
  if (now.getHours() >= 2 && now.getHours() < 5) grant('nightOwl');

  const notes = result.notes;
  const midis = notes.map(n => n.midi);
  if (s.pedalHeld && pedalDown) grant('pedal');

  if (!clean) {
    if (result.mistakes >= 4) { s.phoenixArmed = true; s.phoenixRun = 0; }
    else if (s.phoenixArmed) s.phoenixRun = 0;
    s.penroseRun = 0;
    return;
  }

  if (eggs.isFeather(notes)) grant('feather');
  if (eggs.isThunder(notes)) grant('thunder');
  if (eggs.isCrescendo(notes)) grant('bolero');
  if (eggs.isDiminuendo(notes)) grant('fade');
  if (eggs.isMetronomic(result.gaps)) grant('swiss');
  if (eggs.isRitardando(result.gaps)) grant('ritard');
  if (notes.length >= 4 && result.durationMs > 0 && result.durationMs < 350) grant('bumblebee');
  if (result.durationMs > 12000) grant('sloth');
  if (Math.max(...midis) < 48) grant('basement');
  if (Math.min(...midis) > 84) grant('clouds');

  // Penrose: consecutive ascending arpeggios, each starting above the last one's top.
  if (result.task.direction === 'up') {
    s.penroseRun = s.lastAscentTop !== null && midis[0] > s.lastAscentTop ? s.penroseRun + 1 : 1;
    s.lastAscentTop = midis[midis.length - 1];
    if (s.penroseRun >= 4) grant('penrose');
  } else {
    s.penroseRun = 0;
    s.lastAscentTop = null;
  }

  if (s.phoenixArmed && ++s.phoenixRun >= 5) { grant('phoenix'); s.phoenixArmed = false; }

  const q = result.task.quality;
  const roots = s.rootsByQuality[q] ||= new Set();
  roots.add(result.task.root);
  if (roots.size >= 12) grant('twelveGates');
}

// ---- Finishing a session ----

function finishSession() {
  const s = session;
  s.transitioning = true;
  const total = s.correct + s.mistakes;
  const accuracy = total ? s.correct / total : 0;
  const avgGapMs = s.gapCount ? s.gapSum / s.gapCount : Infinity;
  const stars = s.kind === 'level' ? starsFor({ accuracy, avgGapMs, timeouts: s.timeouts }) : null;

  let note = '';
  if (s.kind === 'level') {
    const id = s.level.id;
    const prev = progress.levels[id] || { stars: 0, best: 0, accuracy: 0 };
    const improved = stars > prev.stars;
    progress.levels[id] = {
      stars: Math.max(prev.stars, stars),
      best: Math.max(prev.best, s.score),
      accuracy: Math.max(prev.accuracy, accuracy),
    };
    saveProgress(progress);
    if (stars > 0) {
      setMax(`level.${id}`, 1);
      setValue('levels.cleared', LEVELS.filter(l => (progress.levels[l.id]?.stars || 0) > 0).length);
      if (!s.namesEverShown) grant('blindfold');
    }
    if (stars === 3) setValue('stars3.count', LEVELS.filter(l => progress.levels[l.id]?.stars === 3).length);
    if (LEVELS.every(l => progress.levels[l.id]?.stars === 3)) grant('constell');

    if (stars === 0) note = `Reach ${Math.round(STAR_RULES.one * 100)}% accuracy to clear the level.`;
    else if (stars < 3) note = stars === 1
      ? `${Math.round(STAR_RULES.two * 100)}% for two stars.`
      : `Three stars: ${Math.round(STAR_RULES.three * 100)}%+ accuracy and under ${STAR_RULES.threeGapMs} ms between notes.`;
    else note = improved ? 'Perfect. On to the next one.' : 'Still perfect.';
    if (s.score > prev.best && prev.best > 0) note = `New best score! ${note}`;
  } else if (s.kind === 'weak') {
    bump('weak.sessions');
    const left = weakList(weakStats).length;
    note = left ? `${left} pattern${left > 1 ? 's' : ''} still on the list.` : 'Nothing left on the list. Well played.';
  }

  showResult(s, { accuracy, avgGapMs, stars, note });
}

function showResult(s, { accuracy, avgGapMs, stars, note }) {
  $('resultEyebrow').textContent = s.kind === 'level' ? `Level ${s.level.id} · ${s.level.name}` : 'Weak spots';
  $('resultTitle').textContent = stars === null ? 'Session complete' : stars > 0 ? 'Level cleared' : 'Not quite';
  const starsEl = $('resultStars');
  starsEl.hidden = stars === null;
  starsEl.innerHTML = [0, 1, 2].map(i => `<span class="star ${i < stars ? 'on' : ''}" style="--d:${i * 0.25}s">★</span>`).join('');
  const cleanCount = s.results.filter(r => r.clean && !r.timedOut).length;
  $('resultStats').innerHTML = `
    <div><b>${s.score.toLocaleString()}</b><span>score</span></div>
    <div><b>${Math.round(accuracy * 100)}%</b><span>accuracy</span></div>
    <div><b>${cleanCount}/${s.results.length}</b><span>clean</span></div>
    <div><b>${s.bestCombo}</b><span>best combo</span></div>
    <div><b>${Number.isFinite(avgGapMs) ? Math.round(avgGapMs) + ' ms' : '—'}</b><span>between notes</span></div>`;
  $('resultNote').textContent = note;

  const next = s.kind === 'level' ? levelById(s.level.id + 1) : null;
  const nextBtn = $('resultNextBtn');
  nextBtn.hidden = !(next && isUnlocked(next));
  $('resultRetryBtn').textContent = s.kind === 'weak' ? 'Again' : 'Retry';
  $('resultModal').hidden = false;
  if (stars) chime([523.25, 659.25, 783.99, 1046.5].slice(0, stars + 1), { gain: 0.06, dur: 0.9, spread: 0.18 });
}

$('resultMapBtn').addEventListener('click', exitSession);
$('resultRetryBtn').addEventListener('click', () => {
  const { kind, level } = session;
  startSession(kind, level);
});
$('resultNextBtn').addEventListener('click', () => {
  const next = levelById(session.level.id + 1);
  if (next) startSession('level', next);
});
$('exitBtn').addEventListener('click', exitSession);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && session && !devKeys) exitSession();
});

// ---- Map view ----

function isUnlocked(level) {
  if (level.id === 1 || progress.unlockAll) return true;
  return (progress.levels[level.id - 1]?.stars || 0) > 0;
}

function renderMap() {
  const path = $('levelPath');
  let currentMarked = false;
  path.innerHTML = LEVELS.map(level => {
    const p = progress.levels[level.id];
    const unlocked = isUnlocked(level);
    const stars = p?.stars || 0;
    const current = unlocked && !stars && !currentMarked;
    if (current) currentMarked = true;
    const cls = ['level', unlocked ? 'is-open' : 'is-locked', stars ? 'is-cleared' : '', current ? 'is-current' : ''].join(' ');
    const dirs = level.directions.map(d => ARROWS[d]).join(level.alternate ? '' : ' ');
    return `<li class="${cls}">
      <button type="button" class="level-btn" data-level="${level.id}" ${unlocked ? '' : 'disabled'}>
        <span class="level-num">${unlocked ? level.id : '\u{1F512}'}</span>
        <span class="level-body">
          <span class="level-name">${level.name}${level.timed ? ' <span class="level-tag">timed</span>' : ''}</span>
          <span class="level-blurb">${level.blurb}</span>
          <span class="level-pool">${poolLabel(level)}</span>
        </span>
        <span class="level-meta">
          <span class="level-dirs">${dirs}</span>
          <span class="level-stars">${[0, 1, 2].map(i => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('')}</span>
          ${p?.best ? `<span class="level-best">${p.best.toLocaleString()}</span>` : ''}
        </span>
      </button>
    </li>`;
  }).join('');
  renderWeak();
}

$('levelPath').addEventListener('click', (e) => {
  const btn = e.target.closest('.level-btn');
  if (!btn || btn.disabled) return;
  startSession('level', levelById(Number(btn.dataset.level)));
});
$('freeCard').addEventListener('click', () => startSession('free'));
$('weakCard').addEventListener('click', () => startSession('weak'));

// "C · Cm · Cdim — up to 2♯/♭" under each level.
function poolLabel(level) {
  const chords = level.qualities.length >= 8 ? 'every quality'
    : level.qualities.map(q => `C${CHORD_FORMULAS[q].suffix}`).join(' · ');
  const keys = level.keys >= 6 ? 'all 12 keys' : `up to ${level.keys}&#9839;/&#9837;`;
  return `${chords} · ${keys}`;
}

const DIR_NAMES = { up: 'up', down: 'down', updown: 'up & back' };

function renderWeak() {
  const list = weakList(weakStats, 8);
  $('weakCount').textContent = list.length ? `(${list.length})` : '';
  $('weakCard').disabled = !list.length;
  $('weakDesc').textContent = list.length
    ? 'Drills the chords and patterns you miss the most.'
    : 'Play a few levels first. Your misses are remembered here.';
  $('weakList').innerHTML = list.length
    ? list.map(w => {
      const name = NOTE_DISPLAY[w.root] + CHORD_FORMULAS[w.quality].suffix;
      const missed = w.stats.tries - w.stats.clean;
      return `<li><span class="weak-chord">${name}</span><span class="weak-pattern">${ARROWS[w.direction]} ${DIR_NAMES[w.direction]} from the ${degreeName(w.start)}</span><span class="weak-stat">${missed}/${w.stats.tries} missed</span><span class="weak-bar"><span style="width:${Math.round(w.score * 100)}%"></span></span></li>`;
    }).join('')
    : '<li class="weak-empty">Nothing yet. Misses will show up here.</li>';
}

$('weakResetBtn').addEventListener('click', () => {
  weakStats = {};
  clearWeak();
  renderWeak();
});
$('unlockAllBtn').addEventListener('click', () => {
  progress.unlockAll = true;
  saveProgress(progress);
  renderMap();
});

// ---- Settings ----

function chip(group, value, label, on) {
  return `<label class="chip"><input type="checkbox" data-group="${group}" value="${value}" ${on ? 'checked' : ''}><span>${label}</span></label>`;
}

function renderSettings() {
  $('qualityChips').innerHTML = QUALITY_ORDER.map(q =>
    `<label class="checkbox-item"><input type="checkbox" data-group="qualities" value="${q}" ${settings.qualities.includes(q) ? 'checked' : ''}>${QUALITY_LABELS[q]}</label>`).join('');
  $('rootChips').innerHTML = NOTE_NAMES.map(r => chip('roots', r, NOTE_DISPLAY[r], settings.roots.includes(r))).join('');
  $('freeDirChips').innerHTML = Object.entries(DIR_LABELS).map(([d, l]) => chip('freeDirections', d, `${ARROWS[d]} ${l}`, settings.freeDirections.includes(d))).join('');
  $('freeStartChips').innerHTML = Object.entries(START_LABELS).map(([st, l]) => chip('freeStarts', st, `from ${l}`, settings.freeStarts.includes(st))).join('');
  $('showNamesCb').checked = settings.showNames;
  $('guideKeysCb').checked = settings.guideKeys;
  $('soundCb').checked = settings.sound;
  const nQ = settings.qualities.length, nR = settings.roots.length;
  $('poolSummary').textContent = `${nQ} qualit${nQ > 1 ? 'ies' : 'y'} · ${nR} root${nR > 1 ? 's' : ''}`;
}

$('settingsPanel').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.group) {
    const group = el.dataset.group;
    const vals = [...document.querySelectorAll(`input[data-group="${group}"]:checked`)].map(i => i.value);
    if (!vals.length) { el.checked = true; return; } // never empty a group
    settings[group] = vals;
  } else if (el.id === 'showNamesCb') settings.showNames = el.checked;
  else if (el.id === 'guideKeysCb') settings.guideKeys = el.checked;
  else if (el.id === 'soundCb') settings.sound = el.checked;
  saveSettings(settings);
  renderSettings();
});

$('settingsPanel').addEventListener('click', (e) => {
  const q = e.target.closest('[data-qpreset]');
  const r = e.target.closest('[data-rpreset]');
  if (q) settings.qualities = Q_PRESETS[q.dataset.qpreset].slice();
  else if (r) settings.roots = R_PRESETS[r.dataset.rpreset].slice();
  else return;
  saveSettings(settings);
  renderSettings();
});

// ---- Boot ----

initAchievements();
bindInfoTips();
renderSettings();
renderMap();
