// Prototype: comping on a rhythm in Ghost Jam. A small band of its own
// (Web Audio, nothing shared with jam/js/band.js) plays a bossa or a salsa,
// and you play each chord on the comp you picked. The judging is the real
// thing, jam/js/comping.js, the same module the game would use.
//
// URL: ?style=salsa&comp=montuno&tempo=170 to preselect, ?keys for the
// computer keyboard piano, ?demo to let a ghost pianist play (for the
// screenshots), ?autoplay to start right away.

import { buildChord, formatChordHtml } from '../../js/core/theory.js';
import { COMPS, compById, stabsFor, stabTimeline, stabAt, CompJudge, STEPS } from '../../jam/js/comping.js';
import { keysVoicing, bassRoot } from '../../jam/js/styles.js';
import { hintVoicing, chordTargets } from '../../jam/js/judge.js';
import { connectMidi } from '../../sightreading/js/midi.js';
import { attachComputerKeyboard } from '../../arpeggio/js/midi.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---- The two grooves ----
// clave: the band's timeline, two bars of steps, drawn on the "Band" row.

const ch = (root, q) => buildChord(root, q);
const GROOVES = {
  bossa: {
    name: 'Bossa', icon: '🌴', blurb: 'Rim on the bossa clave, surdo, shaker.',
    tempo: { min: 100, max: 160, def: 128 },
    tune: [ch('D', 'min7'), ch('G', 'dom7'), ch('C', 'maj7'), ch('A', 'dom7')],
    clave: [[0, 3, 6, 10, 13], [0, 3, 6, 10, 13]], claveName: 'Rim',
  },
  salsa: {
    name: 'Salsa', icon: '🎺', blurb: 'Son clave 2-3, cowbell, congas, tumbao bass.',
    tempo: { min: 140, max: 200, def: 170 },
    tune: [ch('C', 'maj'), ch('F', 'maj'), ch('G', 'dom7'), ch('F', 'maj')],
    clave: [[4, 8], [0, 6, 12]], claveName: 'Clave',
  },
};

const settings = {
  style: GROOVES[params.get('style')] ? params.get('style') : 'salsa',
  comp: params.get('comp') || 'montuno',
  guide: params.has('guide'),
};
settings.comp = compById(settings.style, settings.comp).id;
let tempo = Number(params.get('tempo')) || GROOVES[settings.style].tempo.def;

// ---- Audio: a tiny band ----

let ctx = null;
let master = null;
let noiseBuf = null;

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const latency = () => (ctx ? ctx.outputLatency || ctx.baseLatency || 0 : 0);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

function env(t, peak, d, a = 0.003) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  g.connect(master);
  return g;
}
function osc(type, f, t, dur, dest) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}
function filt(type, f, q, dest) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.connect(dest);
  return b;
}
function noise(t, dur, dest) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur);
}

const DRUM = {
  clave: (t, v) => osc('sine', 2500, t, 0.06, env(t, 0.32 * v, 0.06)),
  rim: (t, v) => osc('square', 1650, t, 0.05, filt('bandpass', 1650, 4, env(t, 0.22 * v, 0.035))),
  sticks: (t, v) => osc('square', 2400, t, 0.06, filt('bandpass', 2600, 5, env(t, 0.3 * v, 0.04))),
  kick: (t, v) => {
    const o = osc('sine', 120, t, 0.35, env(t, 0.7 * v, 0.3));
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  },
  cowbell: (t, v) => {
    const bp = filt('bandpass', 900, 2.5, env(t, 0.13 * v, 0.14));
    osc('square', 562, t, 0.16, bp);
    osc('square', 845, t, 0.16, bp);
  },
  conga: (t, v) => {
    const o = osc('sine', 230, t, 0.25, env(t, 0.38 * v, 0.2));
    o.frequency.exponentialRampToValueAtTime(190, t + 0.08);
  },
  slap: (t, v) => noise(t, 0.06, filt('bandpass', 1800, 1.2, env(t, 0.3 * v, 0.05))),
  shaker: (t, v) => noise(t, 0.05, filt('highpass', 6500, 0.7, env(t, 0.07 * v, 0.04, 0.01))),
};

function bass(midi, t, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.42, t + 0.012);
  g.gain.setTargetAtTime(0.22, t + 0.05, 0.15);
  g.gain.setTargetAtTime(0, t + dur, 0.04);
  const lp = filt('lowpass', 650, 0.9, g);
  g.connect(master);
  osc('triangle', hz(midi), t, dur + 0.2, lp);
  osc('sine', hz(midi), t, dur + 0.2, lp);
}

function piano(notes, t, dur, peak = 0.06) {
  for (const m of notes) {
    const g = env(t, peak, Math.max(0.12, dur), 0.004);
    const lp = filt('lowpass', 2600, 0.5, g);
    osc('triangle', hz(m), t, dur + 0.1, lp);
    osc('sine', hz(m) * 2, t, dur + 0.1, filt('lowpass', 2600, 0.5, env(t, peak * 0.3, dur * 0.6)));
  }
}

// ---- Theory helpers ----

const fifthAbove = (c) => bassRoot(c) + (c.quality === 'm7b5' || c.quality === 'dim' ? 6 : 7);
const lowFifth = (c) => (fifthAbove(c) - 12 >= 28 ? fifthAbove(c) - 12 : fifthAbove(c));

// One bar of the band, as [step, fn(t)] pairs. `c` is the chord, `n` the
// next one: the tumbao already plays its root on beat 4.
function barParts(style, bar, c, n, stepDur) {
  const out = [];
  const g = GROOVES[style];
  for (const s of g.clave[bar % 2]) out.push([s, (t) => DRUM[style === 'salsa' ? 'clave' : 'rim'](t, 1)]);
  if (style === 'bossa') {
    for (const [s, v] of [[0, 1], [3, 0.4], [4, 0.5], [7, 0.4], [8, 1], [11, 0.4], [12, 0.5], [15, 0.4]]) out.push([s, (t) => DRUM.kick(t, v)]);
    for (let s = 0; s < 16; s += 2) out.push([s, (t) => DRUM.shaker(t, s % 4 ? 0.6 : 1)]);
    out.push([0, (t) => bass(bassRoot(c), t, 6 * stepDur)]);
    out.push([6, (t) => bass(lowFifth(c), t, 2 * stepDur)]);
    out.push([8, (t) => bass(lowFifth(c), t, 6 * stepDur)]);
    out.push([14, (t) => bass(bassRoot(n), t, 2 * stepDur)]);
  } else {
    for (const s of [0, 4, 8, 12]) out.push([s, (t) => DRUM.cowbell(t, s % 8 ? 0.7 : 1)]);
    out.push([4, (t) => DRUM.slap(t, 0.8)]);
    for (const s of [0, 8]) out.push([s, (t) => DRUM.conga(t, 0.3)]);
    for (const s of [12, 14]) out.push([s, (t) => DRUM.conga(t, 1)]);
    // Tumbao: nothing on 1, the fifth on the and of 2, the next root on 4.
    out.push([6, (t) => bass(fifthAbove(c) > 40 ? fifthAbove(c) - 12 : fifthAbove(c), t, 5.5 * stepDur)]);
    out.push([12, (t) => bass(bassRoot(n), t, 9.5 * stepDur)]);
  }
  return out;
}

// ---- Game state ----

const SLOTS = 32;            // eight choruses of four chords
let game = null;
const held = new Map();      // midi -> true

const groove = () => GROOVES[settings.style];
const comp = () => compById(settings.style, settings.comp);
const chordOf = (k) => groove().tune[((k % 4) + 4) % 4];

function start() {
  audio();
  stop();
  const beat = 60 / tempo;
  game = {
    style: settings.style, comp: comp(), beat, barDur: beat * 4, stepDur: beat / 4,
    startAt: ctx.currentTime + 0.15,
    nextBar: -1,
    timeline: stabTimeline(comp(), SLOTS),
    guideAt: 0,
    judges: new Map(), results: new Map(), strays: [],
    graded: 0, page: null, demoAt: 0, raf: 0,
  };
  game.slot0 = game.startAt + game.barDur;
  game.timer = setInterval(schedule, 25);
  schedule();
  $('playBtn').textContent = 'Stop';
  $('strip').innerHTML = '';
  $('shout').textContent = '';
  game.raf = requestAnimationFrame(loop);
}

function stop() {
  if (!game) return;
  clearInterval(game.timer);
  cancelAnimationFrame(game.raf);
  game.over = true;
  $('playBtn').textContent = 'Play';
}

const barStart = (b) => game.slot0 + b * game.barDur;
const beatAt = (t) => (t - game.slot0) / game.beat;

function schedule() {
  const ahead = ctx.currentTime + 0.2;
  while (game.nextBar < SLOTS && barStart(game.nextBar) < ahead) {
    const b = game.nextBar++;
    const t0 = barStart(b);
    if (b < 0) {
      for (let i = 0; i < 4; i++) DRUM.sticks(t0 + i * game.beat, i ? 0.7 : 1);
      continue;
    }
    for (const [s, fn] of barParts(game.style, b, chordOf(b), chordOf(b + 1), game.stepDur)) fn(t0 + s * game.stepDur);
  }
  if (!game.over && game.nextBar >= SLOTS && ctx.currentTime > barStart(SLOTS)) stop();
  // The piano guide plays the comp itself, each stab with its own chord.
  const tl = game.timeline;
  while (game.guideAt < tl.length && game.slot0 + tl[game.guideAt].beat * game.beat < ahead) {
    const s = tl[game.guideAt++];
    if (settings.guide) piano(keysVoicing(chordOf(s.slot)), game.slot0 + s.beat * game.beat, game.stepDur * 1.6);
  }
}

function judgeFor(k) {
  if (k < 0 || k >= SLOTS) return null;
  let j = game.judges.get(k);
  if (!j) {
    j = new CompJudge({
      chord: chordOf(k), prevChord: k > 0 ? chordOf(k - 1) : null,
      start: (game.slot0 + k * game.barDur) * 1000, beatMs: game.beat * 1000,
      stabs: stabsFor(game.comp, k), window: game.comp.window,
    });
    game.judges.set(k, j);
  }
  return j;
}

// The slot a moment belongs to: its stab's, else the chord sounding then
// (anticipation included), for a stray note.
function slotAt(beat) {
  const i = stabAt(game.timeline, beat, game.comp.window);
  return i >= 0 ? game.timeline[i].slot : Math.floor((beat + game.comp.push / 4) / 4);
}

function onNoteOn(midi, vel = 80, tPerf = performance.now()) {
  held.set(midi, true);
  if (!game || game.over || !ctx) return;
  const t = ctx.currentTime + (tPerf - performance.now()) / 1000 - latency();
  const beat = beatAt(t);
  const k = slotAt(beat);
  if (k < game.graded) return;
  const j = judgeFor(k);
  if (!j) return;
  const pcs = new Set([...held.keys()].map((m) => m % 12));
  const r = j.noteOn(midi % 12, t * 1000, pcs);
  if (r.stab < 0 && !game.strays.some((s) => Math.abs(s - beat) < 0.15)) game.strays.push(beat);
  renderGrid(true);
}
function onNoteOff(midi) { held.delete(midi); }

// ---- Frame loop ----

function loop() {
  if (!game || game.over) return;
  const heard = ctx.currentTime - latency();
  const beat = beatAt(heard);
  // The chord changes on screen when its first stab comes, anticipation included.
  const k = Math.floor((beat + game.comp.push / 4 + 0.25) / 4);
  $('chord').innerHTML = k < 0 ? `<span class="lc-count">${Math.floor(beat + 4) + 1}</span>` : formatChordHtml(chordOf(k));
  $('next').innerHTML = `<span>Next</span> ${formatChordHtml(chordOf(Math.max(0, k + 1)))}`;
  renderGrid(false, beat);
  if (params.has('demo')) demo(beat);

  while (game.graded < SLOTS) {
    const g = game.graded;
    const stabs = stabsFor(game.comp, g);
    const closes = g * 4 + Math.max(...stabs) + game.comp.window.late;
    if (beat < closes) break;
    grade(g);
    game.graded++;
  }
  game.raf = requestAnimationFrame(loop);
}

const WORD = { perfect: 'In the clave!', good: 'Groovy', late: 'Half there', miss: 'Off the clave' };

function grade(k) {
  const res = judgeFor(k).result();
  game.results.set(k, res);
  const n = res.stabs.length;
  const hit = res.stabs.filter((s) => s.offset !== null).length;
  const sh = $('shout');
  sh.className = `lc-shout g-${res.grade}`;
  sh.innerHTML = `${WORD[res.grade]} <small>${hit}/${n}${res.stray ? ` · ${res.stray} off` : ''}</small>`;
  void sh.offsetWidth;
  sh.classList.add('pop');
  const chip = document.createElement('span');
  chip.className = `lc-chip g-${res.grade}`;
  chip.innerHTML = `${formatChordHtml(chordOf(k))}<i>${hit}/${n}</i>`;
  const strip = $('strip');
  strip.appendChild(chip);
  while (strip.children.length > 8) strip.firstChild.remove();
  renderGrid(true);
}

// ---- The grid: two bars, plus the last beat before them ----
// Columns are sixteenths: 4 for the pickup beat, then 32.

const COLS = 4 + 2 * STEPS;

function stabState(slot, beat) {
  const j = game?.judges.get(slot);
  const res = game?.results.get(slot);
  const rel = beat - slot * 4;
  if (res) {
    const s = res.stabs.find((x) => Math.abs(x.beat - rel) < 1e-6);
    return s?.offset === null ? 'missed' : zone(s.offset, game.comp.window);
  }
  const s = j?.stabs.find((x) => Math.abs(x.beat - rel) < 1e-6);
  return s && s.landed !== null ? zone(s.landed, game.comp.window) : '';
}
const zone = (off, w) => (Math.abs(off) <= w.perfect ? 'perfect' : off < 0 ? 'early' : 'late');

function renderGrid(force, beat = game ? beatAt(ctx.currentTime - latency()) : -1) {
  const page = Math.max(0, Math.floor(beat / 8));
  const grid = $('grid');
  if (force || !game || page !== game.page) {
    if (game) game.page = page;
    const from = page * 8 - 1;            // first beat shown
    const col = (b) => Math.round((b - from) * 4) + 2;   // column 1 holds the row labels
    const cells = [];
    // Chord names over each bar, the one before dimmed over the pickup.
    cells.push(`<div class="g-name dim" style="grid-column:2/6">${formatChordHtml(chordOf(page * 2 - 1))}</div>`);
    for (let i = 0; i < 2; i++) {
      const bar = page * 2 + i;
      cells.push(`<div class="g-name s${bar % 2}" style="grid-column:${col(bar * 4)}/span ${STEPS}">${formatChordHtml(chordOf(bar))}</div>`);
    }
    // Counting row and beat lines.
    for (let c = 0; c < COLS; c++) {
      const b = from + c / 4;
      const inBeat = ((b % 1) + 1) % 1;
      const label = inBeat === 0 ? String(((Math.round(b) % 4) + 4) % 4 + 1) : inBeat === 0.5 ? '&' : '';
      const cls = [inBeat === 0 ? 'on' : inBeat === 0.5 ? 'and' : 'e', c < 4 ? 'pick' : '', b % 4 === 0 ? 'bar' : ''].join(' ');
      cells.push(`<div class="g-count ${cls}" style="grid-column:${c + 2}">${label}</div>`);
    }
    // Band row: the clave (or the rim).
    cells.push(`<div class="g-row-lbl" style="grid-row:3">${groove().claveName}</div>`);
    for (let bar = page * 2 - 1; bar < page * 2 + 2; bar++) {
      for (const s of groove().clave[((bar % 2) + 2) % 2]) {
        const b = bar * 4 + s / 4;
        if (b < from) continue;
        cells.push(`<i class="g-clave" style="grid-column:${col(b)};grid-row:3"></i>`);
      }
    }
    // Your row: the comp, coloured by the chord each stab belongs to.
    cells.push(`<div class="g-row-lbl" style="grid-row:4">You</div>`);
    const tl = game ? game.timeline : stabTimeline(comp(), (page + 1) * 2 + 1);
    for (const s of tl) {
      if (s.beat < from || s.beat >= from + COLS / 4) continue;
      const pushed = s.beat < s.slot * 4;
      const st = game ? stabState(s.slot, s.beat) : '';
      cells.push(`<i class="g-stab s${s.slot % 2}${pushed ? ' pushed' : ''} ${st}" style="grid-column:${col(s.beat)};grid-row:4"></i>`);
    }
    for (const b of game ? game.strays : []) {
      if (b < from || b >= from + COLS / 4) continue;
      cells.push(`<i class="g-stray" style="grid-column:${col(Math.round(b * 4) / 4)};grid-row:4">×</i>`);
    }
    cells.push('<i class="g-head" id="head"></i>');
    grid.style.setProperty('--cols', COLS);
    grid.innerHTML = cells.join('');
  }
  const head = $('head');
  if (!head || !game) return;
  const from = page * 8 - 1;
  const pct = ((beat - from) / (COLS / 4)) * 100;
  head.hidden = pct < 0 || pct > 100;
  head.style.left = `calc(var(--lbl) + (100% - var(--lbl)) * ${Math.max(0, Math.min(100, pct)) / 100})`;
}

// ---- Pickers: the groove, then the comp on its own little grid ----

function miniGrid(c) {
  const cells = [];
  for (let s = 0; s < 2 * STEPS; s++) {
    const bar = Math.floor(s / STEPS);
    const p = s % STEPS;
    const on = c.bars[bar].includes(p);
    const pushed = on && p >= STEPS - c.push && c.push > 0;
    cells.push(`<i class="${p % 4 === 0 ? 'beat' : ''}${p === 0 ? ' bar' : ''}${on ? ' on' : ''}${pushed ? ' pushed' : ''}"></i>`);
  }
  return `<span class="mini">${cells.join('')}</span>`;
}

function renderPickers() {
  $('styles').innerHTML = Object.entries(GROOVES).map(([id, g]) => `
    <button type="button" class="style-card${id === settings.style ? ' is-on' : ''}" data-style="${id}">
      <span class="style-icon" aria-hidden="true">${g.icon}</span>
      <span class="style-name">${g.name}</span>
      <span class="style-blurb">${g.blurb}</span>
    </button>`).join('');
  $('comps').innerHTML = COMPS[settings.style].map((c) => `
    <button type="button" class="lc-comp${c.id === settings.comp ? ' is-on' : ''}" data-comp="${c.id}">
      ${miniGrid(c)}
      <span class="lc-comp-name">${c.name}</span>
      <span class="lc-comp-blurb">${c.blurb}</span>
    </button>`).join('');
  const g = groove();
  const r = $('tempo');
  r.min = g.tempo.min;
  r.max = g.tempo.max;
  r.value = tempo = Math.max(g.tempo.min, Math.min(g.tempo.max, tempo));
  $('tempoVal').textContent = tempo;
  $('guide').checked = settings.guide;
  if (!game || game.over) renderGrid(true, -1);
}

$('styles').addEventListener('click', (e) => {
  const b = e.target.closest('[data-style]');
  if (!b || b.dataset.style === settings.style) return;
  stop();
  game = null;
  settings.style = b.dataset.style;
  settings.comp = COMPS[settings.style][1].id;
  tempo = GROOVES[settings.style].tempo.def;
  renderPickers();
});
$('comps').addEventListener('click', (e) => {
  const b = e.target.closest('[data-comp]');
  if (!b) return;
  const running = game && !game.over;
  settings.comp = b.dataset.comp;
  renderPickers();
  if (running) start();
  else { game = null; renderGrid(true, -1); }
});
$('tempo').addEventListener('input', (e) => { tempo = Number(e.target.value); $('tempoVal').textContent = tempo; });
$('tempo').addEventListener('change', () => { if (game && !game.over) start(); });
$('guide').addEventListener('change', (e) => { settings.guide = e.target.checked; });
$('playBtn').addEventListener('click', () => (game && !game.over ? stop() : start()));
$('midiBtn').addEventListener('click', () => connectMidi({
  onNoteOn, onNoteOff,
  onStatus: ({ state, names }) => { $('midiBtn').textContent = state === 'connected' ? names[0] || 'MIDI on' : 'No device found'; },
}));

// Space strikes the chord the next stab belongs to: rhythm practice
// without a piano.
let spaceNotes = [];
function chordForNow() {
  if (!game || !ctx) return chordOf(0);
  const beat = beatAt(ctx.currentTime - latency());
  return chordOf(Math.max(0, slotAt(beat)));
}
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || e.target.closest('input, button')) return;
  e.preventDefault();
  const t = performance.now();
  spaceNotes = hintVoicing(chordForNow());
  for (const m of spaceNotes) onNoteOn(m, 80, t);
});
window.addEventListener('keyup', (e) => {
  if (e.code !== 'Space') return;
  for (const m of spaceNotes) onNoteOff(m);
  spaceNotes = [];
});
if (params.has('keys')) attachComputerKeyboard({ onNoteOn, onNoteOff });

// ---- Demo: a ghost pianist who mostly lands the comp ----
// Deterministic slips so the screenshots show every kind of mark.

function demo(beat) {
  const tl = game.timeline;
  while (game.demoAt < tl.length) {
    const i = game.demoAt;
    const s = tl[i];
    const slip = [0, 0.04, -0.03, 0.02, 0.09, -0.05, 0.01, -0.02, 0.18][i % 9];
    if (beat < s.beat + slip) break;
    game.demoAt++;
    if (i % 11 === 7) continue;                         // a missed stab
    const notes = hintVoicing(chordOf(s.slot));
    const t = performance.now();
    for (const m of notes) onNoteOn(m, 80, t);
    setTimeout(() => notes.forEach(onNoteOff), game.beat * 250);
    if (i % 13 === 5) {                                  // a stray hit
      setTimeout(() => { if (game && !game.over) { notes.forEach((m) => onNoteOn(m, 60)); setTimeout(() => notes.forEach(onNoteOff), 60); } }, game.beat * 1000 * 0.38 + 0);
    }
  }
}

renderPickers();
if (params.has('autoplay') || params.has('demo')) start();
window.__lc = { get game() { return game; }, start, stop, chordTargets };
