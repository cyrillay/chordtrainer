// Read Trainer — orchestrator. Owns the two views (level map, play), the
// MIDI connection and the run loop that ties the score, the scoring engine
// and the metronome together.

import { LEVELS, levelIndex } from './levels.js';
import { EXCERPTS } from './excerpts.js';
import { exerciseFromText, midiName, timeSignature } from './notation.js';
import { generateExercise } from './generator.js';
import { buildTimeline, WaitRun, TempoRun, tempoStars } from './engine.js';
import { renderExercise, refKey } from './renderer.js';
import { connectMidi } from './midi.js';
import { renderMidiHint, DENIED_HELP_HTML } from '../../js/midi/midiHelp.js';
import { scheduleClicks, unlockAudio, outputLatencyMs } from './metronome.js';
import {
  loadProgress, levelStars, isUnlocked, totalStars, recordRun, focusMap,
  getSetting, setSetting, bump, counter,
} from './progress.js';
import { initAchievements, checkAchievements } from './achievements.js';

const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');

// ---- State -----------------------------------------------------------------

const S = {
  levelIdx: 0,
  exercise: null,
  excerptId: null,
  timeline: null,
  layout: null,
  anchors: [],          // [{ beat, x, system, end }] sorted, for the cursor
  groupX: [],           // per timeline group: { x, system }
  mode: 'wait',
  run: null,
  running: false,       // tempo run in progress (count-in included)
  raf: 0,
  stopClicks: null,
  marks: new Map(),     // refKey → class (re-applied after a re-render)
  retries: 0,
  midi: 'off',          // 'off' | 'none' | 'connected' | 'unsupported' | 'denied'
  held: new Set(),
  finished: false,
};

const level = () => LEVELS[S.levelIdx];

// ---- Views -------------------------------------------------------------------

function showView(name) {
  for (const [k, el] of Object.entries({ levels: $('viewLevels'), play: $('viewPlay') })) {
    el.hidden = k !== name;
    el.classList.remove('is-entering');
  }
  requestAnimationFrame(() => $(name === 'levels' ? 'viewLevels' : 'viewPlay').classList.add('is-entering'));
}

const starsHtml = (n, max = 3) =>
  Array.from({ length: max }, (_, i) => `<span class="star${i < n ? ' on' : ''}">★</span>`).join('');

function renderLevels() {
  const grid = $('levelGrid');
  grid.innerHTML = LEVELS.map((l, i) => {
    const open = isUnlocked(i);
    const stars = levelStars(l.id);
    const cls = ['level-card', l.repertoire ? 'is-rep' : '', open ? '' : 'is-locked', stars === 3 ? 'is-gold' : ''].join(' ');
    return `<li><button type="button" class="${cls}" data-idx="${i}" ${open ? '' : 'aria-disabled="true"'}>
      <span class="lc-num">${l.repertoire ? '♫' : i + 1 - LEVELS.slice(0, i).filter((x) => x.repertoire).length}</span>
      <span class="lc-body">
        <span class="lc-name">${l.name}</span>
        <span class="lc-blurb">${l.blurb}</span>
      </span>
      <span class="lc-stars">${open ? starsHtml(stars) : '<span class="lc-lock" aria-label="Locked">🔒</span>'}</span>
    </button></li>`;
  }).join('');
  const total = totalStars();
  $('heroStats').innerHTML = `<span><strong>${total}</strong> / ${LEVELS.length * 3} stars</span>`
    + `<span class="dot">·</span><span><strong>${counter('notes')}</strong> notes read</span>`;
}

$('levelGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('.level-card');
  if (!btn) return;
  const i = Number(btn.dataset.idx);
  if (!isUnlocked(i)) {
    btn.classList.remove('shake');
    void btn.offsetWidth;
    btn.classList.add('shake');
    return;
  }
  openLevel(i);
});

function openLevel(i) {
  S.levelIdx = i;
  setSetting('lastLevel', level().id);
  showView('play');
  newExercise();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('backBtn').addEventListener('click', () => {
  stopRun();
  renderLevels();
  showView('levels');
});

// ---- Exercises ----------------------------------------------------------------

let lastExcerpt = null;

function newExercise() {
  const l = level();
  if (l.repertoire) {
    const pool = EXCERPTS.filter((e) => e.level === l.id);
    const choices = pool.length > 1 ? pool.filter((e) => e.id !== lastExcerpt) : pool;
    const def = choices[Math.floor(Math.random() * choices.length)];
    lastExcerpt = def.id;
    S.excerptId = def.id;
    S.exercise = exerciseFromText(def);
  } else {
    S.excerptId = null;
    S.exercise = generateExercise(l, { focus: focusMap() });
  }
  S.retries = 0;
  prepare();
}

const targetTempo = () => S.exercise.tempo || level().tempo;
const tempoKey = () => `bpm.${S.excerptId || level().id}`;

function prepare() {
  stopRun();
  S.finished = false;
  $('results').hidden = true;
  const l = level();
  const ex = S.exercise;
  const num = l.repertoire ? '' : `Level ${LEVELS.slice(0, S.levelIdx + 1).filter((x) => !x.repertoire).length} · `;
  $('playLevel').textContent = `${num}${l.name}`;
  $('playTitle').textContent = ex.title;
  $('playSubtitle').textContent = ex.subtitle;
  $('playStars').innerHTML = starsHtml(levelStars(l.id));

  // Tempo control defaults to the target tempo of this level / piece.
  const { beatUnit } = timeSignature(ex.time);
  $('tempoUnit').textContent = beatUnit === 1.5 ? '♩./min' : beatUnit === 0.5 ? '♪/min' : '♩/min';
  const bpm = getSetting(tempoKey(), targetTempo());
  $('tempoSlider').value = bpm;
  $('tempoVal').textContent = bpm;
  $('tempoTarget').textContent = `★★★ at ${targetTempo()}`;

  S.marks = new Map();
  S.timeline = buildTimeline(ex);
  draw();
  armRun();
}

function draw() {
  if (!window.Vex) {
    $('scoreRender').innerHTML = '<p class="load-error">The notation engine (VexFlow) could not be loaded. Check your connection and reload the page.</p>';
    throw new Error('VexFlow not loaded');
  }
  S.layout = renderExercise($('scoreRender'), S.exercise);
  computePositions();
  for (const [k, cls] of S.marks) S.layout.noteEl(k)?.classList.add(...cls.split(' '));
}

function computePositions() {
  const { timeline: tl, layout } = S;
  const anchors = [];
  for (const a of tl.anchors) {
    const xs = a.events.map((e) => layout.noteX(refKey(e.staff, e.voice, e.measure, e.index))).filter(Number.isFinite);
    if (!xs.length) continue;
    anchors.push({ beat: a.beat, x: Math.min(...xs), system: layout.measureBox[a.measure].system, end: false });
  }
  S.exercise.measures.forEach((m, i) => {
    const end = i + 1 < tl.measureStarts.length ? tl.measureStarts[i + 1] : tl.totalBeats;
    anchors.push({ beat: end, x: layout.measureBox[i].x1 - 6, system: layout.measureBox[i].system, end: true });
  });
  // At a barline, the end of the old bar sorts before the start of the new.
  anchors.sort((a, b) => a.beat - b.beat || (b.end - a.end));
  S.anchors = anchors;
  S.groupX = tl.groups.map((g) => anchors.find((a) => !a.end && Math.abs(a.beat - g.onset) < 1e-6));
}

// ---- Cursor & marks -----------------------------------------------------------

function placeCursor(x, system) {
  const cur = $('cursor');
  const { svg, width, systems } = S.layout;
  const paper = cur.parentElement.getBoundingClientRect();
  const r = svg.getBoundingClientRect();
  const k = r.width / width;
  const sys = systems[system];
  cur.hidden = false;
  cur.style.left = `${r.left - paper.left + x * k}px`;
  cur.style.top = `${r.top - paper.top + (sys.top + 18) * k}px`;
  cur.style.height = `${(sys.bottom - sys.top - 6) * k}px`;
  if (cur.dataset.system !== String(system)) {
    cur.dataset.system = system;
    const rect = cur.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 40 || rect.top < 0) {
      window.scrollBy({ top: rect.top - window.innerHeight * 0.3, behavior: 'smooth' });
    }
  }
}

function cursorAtBeat(beat) {
  const A = S.anchors;
  if (!A.length) return;
  let i = 0;
  while (i + 1 < A.length && A[i + 1].beat <= beat) i++;
  const a = A[i], b = A[i + 1];
  let x = a.x;
  if (b && b.system === a.system && b.beat > a.beat && beat > a.beat) {
    x = a.x + (b.x - a.x) * Math.min(1, (beat - a.beat) / (b.beat - a.beat));
  }
  placeCursor(x, a.system);
}

function mark(key, cls, replace = []) {
  const prev = (S.marks.get(key) || '').split(' ').filter((c) => c && !replace.includes(c));
  if (!prev.includes(cls)) prev.push(cls);
  S.marks.set(key, prev.join(' '));
  const el = S.layout.noteEl(key);
  if (el) { el.classList.remove(...replace); el.classList.add(cls); }
}

const groupKeys = (g, midi = null) => [...new Set(g.notes
  .filter((n) => n.required && (midi === null || n.midi === midi))
  .map((n) => refKey(n.staff, n.voice, n.measure, n.index)))];

function flashWrong(midi) {
  const stage = $('scoreStage');
  stage.classList.remove('flash-wrong');
  void stage.offsetWidth;
  stage.classList.add('flash-wrong');
  setStatus(`<span class="wrong">${midiName(midi)}</span> — not that one.`);
}

function setStatus(html) { $('status').innerHTML = html; }

// ---- Runs ---------------------------------------------------------------------

function stopRun() {
  cancelAnimationFrame(S.raf);
  S.stopClicks?.();
  S.stopClicks = null;
  S.running = false;
  $('countIn').hidden = true;
  $('scoreStage').classList.remove('is-running');
}

function readAhead() { return $('readAhead').checked; }

// Prepares (but doesn't start) a run in the current mode.
function armRun() {
  stopRun();
  S.finished = false;
  $('results').hidden = true;
  for (const [k] of S.marks) S.layout.noteEl(k)?.classList.remove('is-current', 'is-hit', 'is-good', 'is-miss', 'is-hidden');
  S.marks = new Map();
  $('cursor').dataset.system = '';

  if (S.mode === 'wait') {
    S.run = new WaitRun(S.timeline);
    highlightCurrent();
    $('startBtn').textContent = 'Restart';
    setStatus(S.midi === 'connected'
      ? 'Play the highlighted notes — the score waits for you.'
      : 'Connect your MIDI keyboard (top right) to play.');
  } else {
    S.run = null;
    const first = S.groupX[0];
    if (first) placeCursor(first.x, first.system);
    $('startBtn').textContent = 'Start';
    setStatus(S.midi === 'connected'
      ? 'Press <kbd>Space</kbd> or Start: one bar of count-in, then play along.'
      : 'Connect your MIDI keyboard (top right) to play.');
  }
}

function highlightCurrent() {
  const run = S.run;
  const g = run.current;
  if (!g) return;
  for (const k of groupKeys(g)) mark(k, 'is-current');
  const pos = S.groupX[run.index];
  if (pos) placeCursor(pos.x, pos.system);
  // Read ahead: what you've reached disappears (except the very first notes).
  if (readAhead() && run.index > 0) for (const k of groupKeys(g)) mark(k, 'is-hidden');
}

function startTempo() {
  if (S.mode !== 'tempo') return;
  unlockAudio();
  armRun();
  const tl = S.timeline;
  const bpm = Number($('tempoSlider').value);
  const pickupLead = tl.pickupBeats ? tl.measureBeats - tl.pickupBeats : 0;
  const leadIn = tl.measureBeats + pickupLead;
  const run = new TempoRun(tl, { bpm, leadInBeats: leadIn });
  const t0 = performance.now() + 250;
  run.start(t0 + outputLatencyMs());
  S.run = run;
  S.running = true;
  $('scoreStage').classList.add('is-running');
  $('startBtn').textContent = 'Stop';
  setStatus('Count-in…');

  // Clicks on every beat unit, from the count-in to the last bar.
  const unit = tl.beatUnit;
  const times = [], accents = [], countLabels = [];
  // Beat 0 of the exercise sits `pickupLead` into a bar, so the downbeats of
  // the click track fall on multiples of a bar from the very first click.
  for (let b = 0; b < leadIn + tl.totalBeats - 1e-6; b += unit) {
    const inBar = b % tl.measureBeats;
    times.push(t0 + b * run.msPerBeat);
    accents.push(inBar < 1e-6 || tl.measureBeats - inBar < 1e-6);
    countLabels.push(b < tl.measureBeats - 1e-6 ? Math.round(b / unit) + 1 : null);
  }
  S.stopClicks = scheduleClicks(times, accents);

  const countEl = $('countIn');
  const loop = () => {
    const now = performance.now();
    const beat = run.beatAt(now);
    if (beat < 0) {
      const idx = Math.floor((now - t0) / (run.msPerBeat * unit));
      const label = countLabels[idx];
      countEl.hidden = !label;
      if (label) countEl.textContent = label;
    } else {
      countEl.hidden = true;
      if ($('status').textContent === 'Count-in…') setStatus('Keep going — don\'t stop for mistakes.');
    }
    for (const e of run.tick(now)) {
      for (const k of groupKeys(tl.groups[e.group], e.midi)) mark(k, 'is-miss', ['is-current']);
    }
    // Light up what's under the cursor; hide what's passed when reading ahead.
    tl.groups.forEach((g, gi) => {
      if (g.onset <= beat + 0.02 && !g._lit) {
        g._lit = true;
        for (const k of groupKeys(g)) if (!S.marks.get(k)) mark(k, 'is-current');
        if (readAhead() && gi > 0) for (const k of groupKeys(g)) mark(k, 'is-hidden');
      }
    });
    cursorAtBeat(Math.max(beat, -0.001));
    if (run.isFinished(now)) { finish(); return; }
    S.raf = requestAnimationFrame(loop);
  };
  tl.groups.forEach((g) => { g._lit = false; });
  S.raf = requestAnimationFrame(loop);
}

// ---- Input --------------------------------------------------------------------

function onNoteOn(midi, velocity, t) {
  S.held.add(midi);
  renderHeard();
  if (S.finished || $('viewPlay').hidden) return;

  if (S.mode === 'wait' && S.run instanceof WaitRun) {
    const g = S.run.current;
    const res = S.run.noteOn(midi, t);
    if (res.kind === 'wrong') { flashWrong(midi); return; }
    if (res.kind !== 'hit') return;
    for (const k of groupKeys(g, midi)) mark(k, 'is-hit', ['is-current']);
    if (res.advanced) {
      setStatus(S.run.streak >= 10 ? `<span class="good">${S.run.streak} in a row</span>` : 'Play the highlighted notes — the score waits for you.');
      if (res.done) finish();
      else highlightCurrent();
    }
    return;
  }

  if (S.mode === 'tempo' && S.running && S.run instanceof TempoRun) {
    const res = S.run.noteOn(midi, t);
    if (res.kind === 'extra') {
      if (S.run.beatAt(t) > -0.5) flashWrong(midi);
      return;
    }
    const g = S.timeline.groups[res.expected.group];
    for (const k of groupKeys(g, midi)) mark(k, res.grade === 'perfect' ? 'is-hit' : 'is-good', ['is-current']);
  }
}

function onNoteOff(midi) {
  S.held.delete(midi);
  renderHeard();
}

function renderHeard() {
  const notes = [...S.held].sort((a, b) => a - b).map(midiName);
  $('heard').textContent = notes.length ? `♪ ${notes.join(' ')}` : '';
}

// ---- Results ------------------------------------------------------------------

function finish() {
  if (S.finished) return;
  S.finished = true;
  stopRun();
  $('cursor').hidden = true;
  // Reveal what "read ahead" hid, so the marks can be reviewed.
  for (const [k, cls] of S.marks) {
    if (cls.includes('is-hidden')) {
      S.marks.set(k, cls.replace('is-hidden', '').trim());
      S.layout.noteEl(k)?.classList.remove('is-hidden');
    }
  }
  const result = S.run.result();
  if (result.mode === 'tempo') result.stars = tempoStars(result.accuracy, result.bpm, targetTempo());
  const l = level();
  const before = levelStars(l.id);
  const rec = recordRun(l.id, result, { excerptId: S.excerptId });

  // Achievement events.
  if (result.mode === 'tempo' && result.total && result.perfect === result.total && result.wrong === 0) bump('event.metronomic');
  if (result.mode === 'tempo' && result.bpm * S.timeline.beatUnit >= 140 && result.stars >= 1) bump('event.allegro');
  if (S.excerptId === 'fur-elise' && result.stars >= 3) bump('event.elise');
  if (S.retries >= 4) bump('event.again');
  if (new Date().getHours() < 5) bump('event.nocturne');
  if (result.bestStreak >= 50) bump('event.line50');
  checkAchievements();

  showResults(result, rec, before);
}

function showResults(r, rec, before) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  $('resStars').innerHTML = starsHtml(r.stars);
  $('resStars').querySelectorAll('.star.on').forEach((s, i) => { s.style.animationDelay = `${0.15 + i * 0.18}s`; });
  const headlines = ['Not quite — try it slower.', 'Good reading.', 'Very clean.', 'Prima vista!'];
  let headline = headlines[r.stars];
  if (r.mode === 'wait' && r.stars === 2) headline = 'Very clean. Try Tempo mode for the third star.';
  if (r.mode === 'tempo' && r.stars === 2 && r.accuracy >= 0.95) headline = `Spotless — now at ${targetTempo()} for the third star.`;
  $('resHeadline').textContent = headline;

  const cells = [
    ['Accuracy', pct(r.accuracy)],
    ['Notes', `${r.correct} / ${r.total}`],
    ['Wrong keys', r.wrong],
  ];
  if (r.mode === 'tempo') {
    cells.push(['On the beat', r.perfect], ['Close', r.good], ['Missed', r.missed]);
    if (r.perfect + r.good > 3) {
      const ms = Math.round(r.meanOffset);
      cells.push(['Timing', Math.abs(ms) < 15 ? 'centred' : `${Math.abs(ms)} ms ${ms > 0 ? 'late' : 'early'}`]);
    }
  } else {
    cells.push(['Time', `${Math.round(r.durationMs / 1000)} s`], ['Best run', `${r.bestStreak} notes`]);
  }
  $('resGrid').innerHTML = cells.map(([k, v]) => `<div class="rg-cell"><div class="rg-val">${v}</div><div class="rg-key">${k}</div></div>`).join('');

  const weak = Object.entries(r.errorsByMidi).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => midiName(Number(m)));
  $('resWeak').innerHTML = weak.length ? `Tricky this time: <strong>${weak.join(', ')}</strong> — they'll come up more often.` : '';
  if (rec.unlockedNext) $('resWeak').innerHTML += `<div class="unlock-msg">🔓 ${LEVELS[S.levelIdx + 1].name} unlocked!</div>`;
  else if (rec.stars > before && before > 0) $('resWeak').innerHTML += '<div class="unlock-msg">New best for this level.</div>';

  const next = S.levelIdx + 1;
  $('nextLevelBtn').hidden = !(next < LEVELS.length && isUnlocked(next));
  $('playStars').innerHTML = starsHtml(levelStars(level().id));
  $('results').hidden = false;
  $('startBtn').textContent = 'Retry';
  setStatus('Space to retry · N for a new exercise');
}

$('retryBtn').addEventListener('click', retry);
$('nextExBtn').addEventListener('click', newExercise);
$('newExBtn').addEventListener('click', newExercise);
$('nextLevelBtn').addEventListener('click', () => openLevel(S.levelIdx + 1));

function retry() {
  S.retries++;
  armRun();
  if (S.mode === 'tempo') startTempo();
}

$('startBtn').addEventListener('click', () => {
  if (S.finished) return retry();
  if (S.mode === 'wait') return armRun();
  if (S.running) { stopRun(); armRun(); return; }
  startTempo();
});

// ---- Controls -----------------------------------------------------------------

function setMode(mode) {
  S.mode = mode;
  setSetting('mode', mode);
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('tempoCtl').hidden = mode !== 'tempo';
  if (S.exercise) armRun();
}
document.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

$('tempoSlider').addEventListener('input', (e) => {
  $('tempoVal').textContent = e.target.value;
  setSetting(tempoKey(), Number(e.target.value));
});

$('readAhead').addEventListener('change', (e) => {
  setSetting('readAhead', e.target.checked);
  if (S.exercise && !S.running) armRun();
});

document.addEventListener('keydown', (e) => {
  if ($('viewPlay').hidden || e.target.matches('input, textarea') || e.metaKey || e.ctrlKey) return;
  if (document.getElementById('achModalOverlay').style.display === 'flex') return;
  if (e.code === 'Space') { e.preventDefault(); $('startBtn').click(); }
  else if (e.key === 'n' || e.key === 'N') newExercise();
  else if (e.key === 'Escape') $('backBtn').click();
});

let resizeTimer = null;
let lastWidth = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const w = $('scoreRender').clientWidth;
    if (!S.exercise || $('viewPlay').hidden || Math.abs(w - lastWidth) < 4) return;
    lastWidth = w;
    draw();
    if (S.mode === 'wait' && S.run instanceof WaitRun && !S.finished) highlightCurrent();
  }, 150);
});

// ---- MIDI ---------------------------------------------------------------------

function midiStatus({ state, names }) {
  S.midi = state;
  const btn = $('midiBtn');
  const help = $('midiHelp');
  btn.classList.toggle('is-on', state === 'connected');
  btn.setAttribute('aria-pressed', String(state === 'connected'));
  $('midiLabel').textContent = state === 'connected' ? names.join(' · ') : 'Connect MIDI';
  help.hidden = state === 'connected';
  if (state === 'none') renderMidiHint(help, 'No device found', { open: true });
  else if (state === 'unsupported') renderMidiHint(help, 'MIDI not supported here', { open: true });
  else if (state === 'denied') renderMidiHint(help, 'MIDI access denied', { open: true, html: DENIED_HELP_HTML });
  if (state === 'connected') setSetting('midiAuto', true);
  if (S.exercise && !S.running && !S.finished) armRun();
}

$('midiBtn').addEventListener('click', () => {
  unlockAudio();
  connectMidi({ onNoteOn, onNoteOff, onStatus: midiStatus });
});

// ---- Boot -----------------------------------------------------------------------

loadProgress();
initAchievements({ onReset: renderLevels });
$('readAhead').checked = !!getSetting('readAhead', false);
setMode(getSetting('mode', 'wait'));
renderLevels();
showView('levels');
if (getSetting('midiAuto', false)) connectMidi({ onNoteOn, onNoteOff, onStatus: midiStatus });

// ?debug exposes a hook for automated tests and play without a keyboard.
if (DEBUG) {
  window.__read = {
    S, noteOn: (m) => onNoteOn(m, 100, performance.now()), noteOff: onNoteOff,
    openLevel, levelIndex, connected: () => midiStatus({ state: 'connected', names: ['Debug'] }),
  };
}
