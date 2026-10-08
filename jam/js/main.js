// Ghost Jam: page controller. Setup view (groove, tune, key, tempo), play
// view (HUD, current chord, ghost band, keyboard) and the results screen.
//
// Clocks: the band schedules on the Web Audio clock. MIDI note-ons carry a
// performance.now() timestamp; we move them onto the audio clock, minus the
// output latency, so a chord is judged against what you actually heard.

import { formatChordHtml, spellChordTones, NOTE_NAMES, NOTE_DISPLAY } from '../../js/core/theory.js';
import { PROGRESSIONS, romanToChord, progressionMode } from '../../js/training/progressions.js';
import { renderMidiHint, gateCopy, DENIED_HELP_HTML } from '../../js/midi/midiHelp.js';
import { connectMidi } from '../../sightreading/js/midi.js';
import { attachComputerKeyboard } from '../../arpeggio/js/midi.js';
import { STYLES, STYLE_ORDER, TIERS, MAX_ENERGY, GUESTS, partsAt } from './styles.js';
import { FAMILIES, tuneFamily, fitsStyle, tunesFor } from './tunes.js';
import { SlotJudge, Scorer, chordTargets, toneRole, multiplier, timingZone, WINDOW } from './judge.js';
import { Band } from './band.js';
import { sprite, MAPS } from './sprites.js';
import { track, logRun } from '../../js/stats/log.js';
import { JamTracker } from './achievements.js';
import { initTrophyCase, grant, bump, setMax, setFinished } from './trophyCase.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---- Settings + high scores ----

const LS = { settings: 'ghostJam.settings', scores: 'ghostJam.scores', midi: 'ghostJam.midiAuto' };
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

const settings = Object.assign({
  style: 'swing', tune: 'Autumnal', key: 'random', tempo: null, bars: 1, length: 4, showTones: true,
}, read(LS.settings, {}));
let scores = read(LS.scores, {});
const scoreKey = () => `${settings.tune}|${settings.style}`;
const save = () => write(LS.settings, settings);

// ---- Tunes: the Chords trainer's progressions, sorted by the groove ----
// Tunes that suit the chosen style come first, in their families. The rest
// stay at the bottom under "Off-style" for anyone who wants Pachelbel in funk.

const randomTune = (style) => {
  const pool = tunesFor(style);
  return pool[Math.floor(Math.random() * pool.length)].name;
};
const tuneOption = (p) => `<option value="${p.name.replace(/"/g, '&quot;')}">${p.name}</option>`;

function tuneMenuHtml(style) {
  const fit = PROGRESSIONS.filter((p) => fitsStyle(p, style));
  const off = PROGRESSIONS.filter((p) => !fitsStyle(p, style));
  return FAMILIES.map((f) => {
    const tunes = fit.filter((p) => tuneFamily(p) === f);
    return tunes.length ? `<optgroup label="${f}">${tunes.map(tuneOption).join('')}</optgroup>` : '';
  }).join('') + (off.length ? `<optgroup label="Off-style">${off.map(tuneOption).join('')}</optgroup>` : '');
}
const tuneByName = (name) => PROGRESSIONS.find((p) => p.name === name) || PROGRESSIONS.find((p) => p.name === 'Autumnal') || PROGRESSIONS[0];

function resolveKey() {
  return settings.key === 'random' ? NOTE_NAMES[Math.floor(Math.random() * 12)] : settings.key;
}

function buildChords(prog, key) {
  const mode = progressionMode(prog);
  return prog.tokens.map((t) => romanToChord(t, key, mode)).filter(Boolean);
}

// ---- Setup view ----

const STYLE_ICONS = { swing: '🎷', bossa: '🌴', lofi: '📼', ballad: '🕯️', funk: '🕺', reggae: '🌿' };

function renderSetup() {
  $('styleGrid').innerHTML = STYLE_ORDER.map((id) => {
    const s = STYLES[id];
    return `<button type="button" class="style-card${id === settings.style ? ' is-on' : ''}" data-style="${id}">
      <span class="style-icon" aria-hidden="true">${STYLE_ICONS[id]}</span>
      <span class="style-name">${s.name}</span>
      <span class="style-blurb">${s.blurb}</span>
    </button>`;
  }).join('');

  const sel = $('tuneSelect');
  if (sel.dataset.style !== settings.style) {
    sel.innerHTML = tuneMenuHtml(settings.style);
    sel.dataset.style = settings.style;
  }
  sel.value = tuneByName(settings.tune).name;

  const keySel = $('keySelect');
  if (!keySel.options.length) {
    keySel.innerHTML = '<option value="random">Random</option>' + NOTE_NAMES.map((n) => `<option value="${n}">${NOTE_DISPLAY[n]}</option>`).join('');
  }
  keySel.value = settings.key;

  const st = STYLES[settings.style];
  const tempo = settings.tempo ?? st.tempo.def;
  const range = $('tempoRange');
  range.min = st.tempo.min;
  range.max = st.tempo.max;
  range.value = Math.max(st.tempo.min, Math.min(st.tempo.max, tempo));
  $('tempoVal').textContent = range.value;
  $('barsSelect').value = String(settings.bars);
  $('lengthSelect').value = String(settings.length);
  $('showTonesCb').checked = settings.showTones;
  renderTunePreview();
  renderHall();
}

function renderTunePreview() {
  const prog = tuneByName(settings.tune);
  const key = settings.key === 'random' ? 'C' : settings.key;
  const chords = buildChords(prog, key);
  const best = scores[scoreKey()];
  $('tunePreview').innerHTML = `<span class="tp-chords">${chords.map((c) => `<span>${formatChordHtml(c)}</span>`).join('')}</span>`
    + `<span class="tp-meta">${settings.key === 'random' ? 'Shown in C, played in a random key' : `In ${NOTE_DISPLAY[key]}`}${fitsStyle(prog, settings.style) ? '' : ` · Off-style for ${STYLES[settings.style].name}`}${best ? ` · Best ${best.score.toLocaleString()} (${best.rank})` : ''}</span>`;
}

function renderHall() {
  const rows = Object.entries(scores)
    .map(([k, v]) => ({ tune: k.split('|')[0], style: k.split('|')[1], ...v }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  $('hallList').innerHTML = rows.length
    ? rows.map((r, i) => `<li><span class="hall-pos">${i + 1}</span><span class="hall-tune">${r.tune}</span><span class="hall-style">${STYLES[r.style]?.name || r.style}</span><span class="hall-rank">${r.rank}</span><span class="hall-score">${r.score.toLocaleString()}</span></li>`).join('')
    : '<li class="hall-empty">No scores yet. The stage is yours.</li>';
}

$('styleGrid').addEventListener('click', (e) => {
  const card = e.target.closest('[data-style]');
  if (!card) return;
  settings.style = card.dataset.style;
  settings.tempo = null; // each groove has its own home tempo
  // A new groove keeps the tune only if it suits it.
  if (!fitsStyle(tuneByName(settings.tune), settings.style)) settings.tune = randomTune(settings.style);
  save();
  renderSetup();
});
$('tuneSelect').addEventListener('change', (e) => { settings.tune = e.target.value; save(); renderTunePreview(); });
$('randomTuneBtn').addEventListener('click', () => {
  settings.tune = randomTune(settings.style);
  save();
  renderSetup();
});
$('keySelect').addEventListener('change', (e) => { settings.key = e.target.value; save(); renderTunePreview(); });
$('tempoRange').addEventListener('input', (e) => { settings.tempo = Number(e.target.value); $('tempoVal').textContent = e.target.value; save(); });
$('barsSelect').addEventListener('change', (e) => { settings.bars = Number(e.target.value); save(); });
$('lengthSelect').addEventListener('change', (e) => { settings.length = Number(e.target.value); save(); });
$('showTonesCb').addEventListener('change', (e) => { settings.showTones = e.target.checked; save(); });

// Props: beer, ashtray, a coin, and the band waiting in the wings.
$('propsLeft').innerHTML = sprite('beer', { px: 5, className: 'prop-beer' }) + sprite('beer', { px: 4, className: 'prop-beer two' });
$('propsRight').innerHTML = `<span class="ash">${sprite('ashtray', { px: 5, className: 'prop-ash' })}<span class="wisp"></span><span class="wisp w2"></span></span>`;
$('coinSprite').innerHTML = sprite('coin', { px: 3 });

const BAND = [
  { id: 'drums', name: 'Drums', color: 'cyan' },
  { id: 'bass', name: 'Bass', color: 'pink' },
  { id: 'keys', name: 'Keys', color: 'orange' },
  { id: 'guest', name: 'Guest', color: 'lime' },
];
// Each ghost wears its instrument; the guest's depends on the groove.
const ghostSprite = (part, style) => {
  const gear = part === 'guest' ? GUESTS[style].patch : part;
  return sprite(MAPS[`ghost-${gear}`] ? `ghost-${gear}` : 'ghost', { px: 5 });
};
const ghostHtml = (m, style) => `<div class="ghost ghost-${m.color}" data-part="${m.id}">${ghostSprite(m.id, style)}<span class="ghost-name">${m.id === 'guest' ? GUESTS[style].name : m.name}</span></div>`;
// On the setup page the guest is a secret: a pale ghost with no instrument,
// since who sits in depends on the groove. Hover (or tap) for a teaser.
$('bandIntro').innerHTML = BAND.slice(0, 3).map((m) => ghostHtml(m, settings.style)).join('')
  + `<button type="button" class="ghost is-secret" data-part="guest" aria-expanded="false" aria-describedby="secretTip">
      <span class="secret-mark" aria-hidden="true">?</span>${sprite('ghost', { px: 5 })}<span class="ghost-name">???</span>
      <span class="secret-tip" id="secretTip" role="tooltip"><b>Secret guest</b>Every groove has its own. Get the band on fire and they walk on stage.</span>
    </button>`;
const secret = $('bandIntro').querySelector('.is-secret');
const openSecret = (open) => { secret.classList.toggle('open', open); secret.setAttribute('aria-expanded', String(open)); };
secret.addEventListener('click', (e) => { e.stopPropagation(); openSecret(!secret.classList.contains('open')); });
document.addEventListener('click', () => openSecret(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openSecret(false); });
const guestName = () => GUESTS[game?.style || settings.style].name;

// ---- Keyboard strip (C2 to C7) ----

const KB_LOW = 36, KB_HIGH = 96;
const BLACK = new Set([1, 3, 6, 8, 10]);
const kbKeys = new Map();
(function buildKeyboard() {
  const el = $('keyboard');
  const whites = [];
  for (let m = KB_LOW; m <= KB_HIGH; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const w = 100 / whites.length;
  let html = '';
  whites.forEach((m, i) => { html += `<div class="kw" data-m="${m}" style="left:${i * w}%;width:${w}%"></div>`; });
  whites.forEach((m, i) => {
    if (BLACK.has((m + 1) % 12) && m + 1 <= KB_HIGH) html += `<div class="kbk" data-m="${m + 1}" style="left:${(i + 1) * w - w * 0.32}%;width:${w * 0.64}%"></div>`;
  });
  el.innerHTML = html;
  for (const k of el.querySelectorAll('[data-m]')) kbKeys.set(Number(k.dataset.m), k);
})();

function keyState(midi, role) {
  const k = kbKeys.get(midi);
  if (!k) return;
  k.classList.remove('is-tone', 'is-colour', 'is-wrong', 'is-down');
  if (role) k.classList.add('is-down', `is-${role}`);
}

// ---- MIDI ----

let midiState = 'off';
const held = new Map(); // midi -> role
const velocities = new Map(); // midi -> velocity of the held key

function midiStatus({ state, names }) {
  midiState = state === 'none' ? 'nodevice' : state;
  const btn = $('midiBtn');
  btn.classList.toggle('is-connected', state === 'connected');
  btn.classList.toggle('is-error', ['none', 'denied', 'unsupported'].includes(state));
  $('midiLabel').textContent = state === 'connected' ? names.join(' · ') : 'Connect MIDI';
  const status = $('midiStatus');
  status.hidden = state === 'connected';
  if (state === 'none') renderMidiHint(status, 'No device found');
  else if (state === 'unsupported') renderMidiHint(status, 'MIDI not supported here');
  else if (state === 'denied') renderMidiHint(status, 'MIDI access denied', { html: DENIED_HELP_HTML });
  $('midiGate').hidden = state === 'connected';
  const copy = gateCopy(state);
  $('gateTitle').textContent = copy.title;
  $('gateSub').textContent = copy.sub;
  if (state === 'connected') write(LS.midi, true);
}

function connect() {
  band.audio(); // unlock audio on the same click
  connectMidi({ onNoteOn, onNoteOff, onStatus: midiStatus });
}
$('midiBtn').addEventListener('click', () => { if (midiState !== 'connected') connect(); });
$('gateConnectBtn').addEventListener('click', connect);

// ---- Game ----

const band = new Band();
let game = null;

function hiFor(key) { return scores[key]?.score || 0; }

// again: replay the last set as it was (same tune, same key).
function startGame({ again = false } = {}) {
  if (midiState !== 'connected') {
    const gate = $('midiGate');
    gate.classList.remove('shake');
    void gate.offsetWidth;
    gate.classList.add('shake');
    if (midiState === 'off') connect();
    return;
  }
  const last = again && game ? game : null;
  const prog = last ? last.prog : tuneByName(settings.tune);
  const key = last ? last.key : resolveKey();
  const chords = buildChords(prog, key);
  const style = STYLES[settings.style];
  const tempo = Number($('tempoRange').value);
  const barsPerChord = settings.bars;
  const choruses = settings.length > 0 ? settings.length : Infinity;

  game = {
    prog, key, chords, tempo, barsPerChord, choruses,
    style: settings.style,
    scoreKey: scoreKey(),
    scorer: new Scorer(),
    judges: new Map(),      // slot index -> SlotJudge
    finalized: 0,           // next slot to grade
    shownSlot: -2,
    lastBeat: -1,
    totalSlots: Number.isFinite(choruses) ? chords.length * choruses : Infinity,
    raf: 0,
    over: false,
    hits: new Map(),        // slot index -> { voicing, velocities } when it landed
    tracker: new JamTracker({ style: settings.style, chorusLen: chords.length }),
    encore: last ? last.encore + 1 : 0,
  };

  $('viewSetup').hidden = true;
  $('viewPlay').hidden = false;
  $('resultModal').hidden = true;
  $('tuneTitle').textContent = prog.name;
  $('tuneMeta').textContent = `${style.name} · ${NOTE_DISPLAY[key]} · ${tempo} bpm${style.anchor ? ' · Play on the and' : ''}`;
  $('ghostBand').innerHTML = BAND.map((m) => ghostHtml(m, settings.style)).join('');
  $('hudHi').textContent = hiFor(game.scoreKey).toLocaleString();
  renderHud();
  game.energy = -1;
  renderEnergy(1);
  $('gaugeTicks').innerHTML = '';
  $('gaugeReadout').textContent = '';
  $('gaugeReadout').className = 'gauge-readout';
  $('chordBig').innerHTML = '<span class="count">Ready</span>';
  $('chordTones').innerHTML = '';
  renderNext(-1);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  band.energy = 1;
  band.start({
    style: settings.style, tempo, chords, barsPerChord, choruses,
    onEnd: () => finish(),
  });
  game.raf = requestAnimationFrame(loop);
}

// Slot timing on the audio clock (seconds). Slot k starts after the count-in bar.
function slotStart(k) { return band.startAt + (1 + k * game.barsPerChord) * band.barDur; }
function slotEnd(k) { return slotStart(k) + game.barsPerChord * band.barDur; }
// Where the chord is meant to be played: the downbeat, or the off-beat
// after it in reggae (see `anchor` in styles.js).
const anchorSec = () => (STYLES[game.style].anchor || 0) * band.beat;
function target(k) { return slotStart(k) + anchorSec(); }

function judgeFor(k) {
  if (k < 0 || k >= game.totalSlots) return null;
  let j = game.judges.get(k);
  if (!j) {
    j = new SlotJudge({
      chord: game.chords[k % game.chords.length],
      start: target(k) * 1000,
      end: (slotEnd(k) + anchorSec()) * 1000,
      beatMs: band.beat * 1000,
    });
    game.judges.set(k, j);
  }
  return j;
}

// Which slot a moment (audio seconds) belongs to, anticipation included.
function slotAt(t) {
  const first = band.startAt + band.barDur;
  const span = game.barsPerChord * band.barDur;
  return Math.floor((t - anchorSec() + WINDOW.antic * band.beat - first) / span);
}

// Audio-clock time (seconds) of a MIDI event stamped with performance.now().
function toAudioTime(tPerf) {
  return band.ctx.currentTime + (tPerf - performance.now()) / 1000 - band.outputLatency;
}

function heldPcs() {
  return new Set([...held.keys()].map((m) => m % 12));
}

function onNoteOn(midi, velocity = 80, tPerf = performance.now()) {
  held.set(midi, null);
  velocities.set(midi, velocity);
  let role = 'tone';
  if (game && !game.over && band.ctx) {
    game.tracker.note();
    const t = toAudioTime(tPerf);
    const k = slotAt(t);
    const j = judgeFor(k);
    if (j && !j.done) {
      const before = j.hitAt;
      role = j.noteOn(midi % 12, t * 1000, heldPcs());
      if (before === null && j.hitAt !== null) onHit(k, j);
    }
    else if (k >= 0) role = toneRole(chordTargets(game.chords[k % game.chords.length]), midi % 12);
  }
  held.set(midi, role);
  keyState(midi, role);
}

function onNoteOff(midi) {
  held.delete(midi);
  velocities.delete(midi);
  keyState(midi, null);
}

// ---- Frame loop: beat lights, chord changes, grading ----

function loop() {
  if (!game) return;
  const ctx = band.ctx;
  const heard = ctx.currentTime - band.outputLatency;
  const pos = band.position(heard);

  if (pos && pos.bar >= 0) {
    const beatId = pos.bar * 4 + pos.beat;
    if (beatId !== game.lastBeat) {
      game.lastBeat = beatId;
      onBeat(pos);
    }
  }

  // Current slot (no anticipation for display).
  const k = Math.floor((heard - (band.startAt + band.barDur)) / (game.barsPerChord * band.barDur));
  if (k !== game.shownSlot && heard >= band.startAt) {
    game.shownSlot = k;
    if (k >= 0 && k < game.totalSlots) showSlot(k);
  }
  markNextSoon(k, heard);
  moveGaugeCursor(k, heard);
  if (k >= 0) {
    const frac = (heard - slotStart(k)) / (slotEnd(k) - slotStart(k));
    $('slotFill').style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  // Grade every slot whose window has closed.
  while (game.finalized < game.totalSlots) {
    const kk = game.finalized;
    const closeAt = slotEnd(kk) + anchorSec() - WINDOW.antic * band.beat;
    if (heard < closeAt) break;
    grade(kk);
    game.finalized++;
  }

  game.raf = requestAnimationFrame(loop);
}

function onBeat(pos) {
  const bulbs = $('beatBulbs').children;
  for (let i = 0; i < bulbs.length; i++) bulbs[i].classList.toggle('on', i === pos.beat);
  bulbs[pos.beat].classList.toggle('down', pos.beat === 0);
  if (pos.bar === 0) {
    $('chordBig').innerHTML = `<span class="count">${pos.beat + 1}</span>`;
    $('tuneChorus').textContent = 'Count-in';
  }
  document.body.classList.toggle('beat-odd', pos.beat % 2 === 1);
  for (const glow of document.querySelectorAll('.beat-glow')) {
    glow.classList.remove('pulse', 'down');
    void glow.offsetWidth;
    glow.classList.add('pulse');
    if (pos.beat === 0) glow.classList.add('down');
  }
}

function showSlot(k) {
  const chord = game.chords[k % game.chords.length];
  const big = $('chordBig');
  big.innerHTML = formatChordHtml(chord);
  big.classList.remove('pop');
  void big.offsetWidth;
  big.classList.add('pop');
  if (settings.showTones) {
    const t = chordTargets(chord);
    const spelled = spellChordTones(chord);
    $('chordTones').innerHTML = chord.orderedNotes.map((pc, i) =>
      `<span class="${t.required.has(pc) ? 'req' : ''}">${spelled[i].display}</span>`).join('');
  } else {
    $('chordTones').innerHTML = '';
  }
  const chorus = Math.floor(k / game.chords.length);
  $('tuneChorus').textContent = Number.isFinite(game.choruses) ? `Chorus ${chorus + 1}/${game.choruses}` : `Chorus ${chorus + 1}`;
  renderNext(k);
  // Re-colour keys already held against the new chord.
  const targets = chordTargets(chord);
  for (const m of held.keys()) keyState(m, toneRole(targets, m % 12));
}

function renderNext(k) {
  const items = [];
  for (let i = 1; i <= 3; i++) {
    const n = k + i;
    if (n < 0 || n >= game.totalSlots) break;
    items.push(formatChordHtml(game.chords[n % game.chords.length]));
  }
  const [first, ...rest] = items;
  $('nextChords').innerHTML = first
    ? `<div class="nx-card" id="nxCard"><span class="nx-lbl">Next</span><span class="nx-chord">${first}</span></div>`
      + (rest.length ? `<div class="nx-then">${rest.map((c, i) => `<span class="nx" style="--i:${i + 1}">${c}</span>`).join('<span class="nx-arrow">›</span>')}</div>` : '')
    : '';
}

// Light up the next chord during the last beat before it lands.
function markNextSoon(k, heard) {
  const card = $('nxCard');
  if (!card) return;
  const changeAt = k < 0 ? slotStart(0) : slotEnd(k);
  card.classList.toggle('soon', changeAt - heard <= band.beat);
}

const SHOUTS = {
  perfect: ['In the pocket!', 'Perfect!', 'Tasty!', 'Far out!', 'Righteous!'],
  good: ['Groovy!', 'Nice!', 'Solid!', 'Cool cat!'],
  late: ['Late but legal', 'Dragging…', 'Catch up!'],
  miss: ['Clam!', 'Trainwreck!', 'Who ordered that?', 'Ghosted!'],
};
const pickShout = (g) => SHOUTS[g][Math.floor(Math.random() * SHOUTS[g].length)];

function grade(k) {
  const j = judgeFor(k);
  const res = j.result();
  const prevEnergy = game.scorer.energy;
  const gained = game.scorer.add(res);
  band.energy = game.scorer.energy;
  if (band.energy !== prevEnergy) renderEnergy(band.energy);
  trackChord(k, j, res);
  shout(res, gained);
  renderHud();
  track('jam', { ok: res.grade === 'miss' ? 0 : 1, miss: res.grade === 'miss' ? 1 : 0, maxGap: 20000 });
}

// Feed a graded chord (and any change of energy) to the achievements.
function trackChord(k, j, res) {
  const hit = game.hits.get(k);
  const root = j.targets.root;
  const ids = game.tracker.chord({
    ...res,
    offsetMs: res.offsetBeats === null ? null : res.offsetBeats * band.beat * 1000,
    voicing: hit?.voicing || null,
    velocities: hit?.velocities || null,
    colourIntervals: [...j.colours].map((pc) => (pc - root + 12) % 12),
    quality: j.chord.quality,
  });
  ids.push(...game.tracker.energy(game.scorer.energy));
  setMax('energy', game.scorer.energy);
  if (ids.length) grant(ids);
}

function shout(res, gained) {
  const el = document.createElement('div');
  el.className = `shout g-${res.grade}`;
  el.innerHTML = `<span class="shout-word">${pickShout(res.grade)}</span>`
    + (gained ? `<span class="shout-pts">+${gained.toLocaleString()}</span>` : '')
    + (res.bonus ? `<span class="shout-spicy">Spicy ×${res.colours}</span>` : '');
  $('shoutLayer').appendChild(el);
  setTimeout(() => el.remove(), 1300);
  const stage = $('stage');
  stage.classList.remove('flash-perfect', 'flash-miss');
  void stage.offsetWidth;
  if (res.grade === 'perfect') stage.classList.add('flash-perfect');
  if (res.grade === 'miss') stage.classList.add('flash-miss');
}

function renderHud() {
  const s = game.scorer;
  $('hudScore').textContent = s.score.toLocaleString();
  $('hudCombo').textContent = s.combo;
  $('hudMult').textContent = `×${multiplier(s.combo)}`;
  $('hudComboCell').classList.toggle('is-hot', s.combo >= 4);
  $('hudComboCell').classList.toggle('is-blazing', s.combo >= 12);
  if (s.score > hiFor(game.scoreKey)) $('hudHi').textContent = s.score.toLocaleString();
}

// Energy 0..MAX_ENERGY: which ghosts are on stage, how full the meter is.
// A change of tier is announced on stage.
function renderEnergy(e) {
  const bars = $('energyMeter').querySelectorAll('i');
  bars.forEach((b, i) => b.classList.toggle('on', i <= e));
  const parts = partsAt(e);
  for (const g of $('ghostBand').children) {
    const was = !g.classList.contains('is-off');
    const on = parts.has(g.dataset.part);
    g.classList.toggle('is-off', !on);
    g.classList.toggle('is-wild', e >= MAX_ENERGY);
    if (on && !was && game?.energy >= 0) {
      g.classList.remove('joins');
      void g.offsetWidth;
      g.classList.add('joins');
    }
  }
  document.body.dataset.energy = String(e);
  if (game) {
    const prev = game.energy;
    game.energy = e;
    if (prev >= 0 && e !== prev) announceTier(prev, e);
  }
}

function announceTier(prev, e) {
  const up = e > prev;
  const tier = TIERS[up ? e : prev];
  const el = document.createElement('div');
  el.className = `tier-banner ${up ? 'is-up' : 'is-down'}`;
  const name = tier.part === 'guest' ? guestName() : tier.name;
  const verb = (one, many) => (tier.plural ? many : one);
  if (tier.heat) el.textContent = up ? 'The band heats up!' : 'The band cools down';
  else el.textContent = up ? `${name} ${verb('joins', 'join')} in!` : `${name} ${verb('sits', 'sit')} out`;
  document.querySelector('.bandstand').appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// ---- Timing gauge ----
// Spans GAUGE.from..GAUGE.to beats around each chord change. A cursor
// sweeps through it as the change comes and goes; each landed chord drops
// a tick where it hit.

const GAUGE = { from: -1, to: 1.5 };
const gaugePct = (beats) => ((Math.max(GAUGE.from, Math.min(GAUGE.to, beats)) - GAUGE.from) / (GAUGE.to - GAUGE.from)) * 100;

(function buildGaugeZones() {
  const zones = [
    ['early', -WINDOW.antic, -WINDOW.perfect],
    ['perfect', -WINDOW.perfect, WINDOW.perfect],
    ['good', WINDOW.perfect, WINDOW.good],
    ['late', WINDOW.good, GAUGE.to],
  ];
  $('gaugeZones').innerHTML = zones.map(([z, a, b]) =>
    `<i class="gz gz-${z}" style="left:${gaugePct(a)}%;width:${gaugePct(b) - gaugePct(a)}%"></i>`).join('')
    + `<i class="gz-center" style="left:${gaugePct(0)}%"></i>`;
})();

function moveGaugeCursor(k, heard) {
  const cur = $('gaugeCursor');
  // The change that matters: the one just passed, until it leaves the gauge.
  let c = k < 0 ? 0 : k;
  if (k >= 0 && (heard - target(k)) / band.beat > GAUGE.to) c = k + 1;
  if (c >= game.totalSlots) { cur.hidden = true; return; }
  const off = (heard - target(c)) / band.beat;
  const inside = off >= GAUGE.from && off <= GAUGE.to;
  cur.hidden = !inside;
  if (inside) cur.style.left = `${gaugePct(off)}%`;
}

const ZONE_WORD = { early: 'Early', perfect: 'On the beat', good: 'A bit late', late: 'Late' };

function onHit(k, j) {
  const voicing = [...held.keys()].sort((a, b) => a - b);
  game.hits.set(k, { voicing, velocities: voicing.map((m) => velocities.get(m) ?? 80) });
  const off = j.offsetBeats;
  const zone = timingZone(off);
  const ms = Math.round(off * band.beat * 1000);
  const tick = document.createElement('i');
  tick.className = `gt gt-${zone}`;
  tick.style.left = `${gaugePct(off)}%`;
  const ticks = $('gaugeTicks');
  ticks.appendChild(tick);
  while (ticks.children.length > 8) ticks.firstChild.remove();
  const read = $('gaugeReadout');
  read.className = `gauge-readout gr-${zone}`;
  read.textContent = `${ZONE_WORD[zone]} · ${ms > 0 ? '+' : ''}${ms} ms`;
  const big = $('chordBig');
  big.classList.remove('hit', 'hit-perfect');
  void big.offsetWidth;
  big.classList.add(zone === 'perfect' ? 'hit-perfect' : 'hit');
  // Nailed it: the band answers.
  if (zone === 'perfect' && j.wrong === 0) band.accent(j.hitAt / 1000, target(k));
}

// ---- End of a set ----

function finish() {
  if (!game || game.over) return;
  game.over = true;
  cancelAnimationFrame(game.raf);
  band.stop();
  const s = game.scorer;
  const key = game.scoreKey;
  const prev = scores[key];
  const isHi = s.total > 0 && s.score > (prev?.score || 0);
  if (isHi) {
    scores[key] = { score: s.score, rank: s.rank, date: Date.now() };
    write(LS.scores, scores);
  }
  if (s.total) {
    logRun('jam', {
      tune: game.prog.name, style: game.style, key: game.key, score: s.score, rank: s.rank,
      acc: +s.accuracy.toFixed(3), combo: s.bestCombo, ...s.counts,
    });
  }
  $('resultEyebrow').textContent = `${game.prog.name} · ${STYLES[game.style].name} · ${NOTE_DISPLAY[game.key]}`;
  $('resultRank').textContent = s.total ? s.rank : '·';
  $('resultRank').dataset.rank = s.rank;
  $('resultScore').textContent = s.score.toLocaleString();
  $('resultHi').hidden = !isHi;
  const c = s.counts;
  $('resultGrid').innerHTML = `
    <div class="g-perfect"><b>${c.perfect}</b><span>Perfect</span></div>
    <div class="g-good"><b>${c.good}</b><span>Good</span></div>
    <div class="g-late"><b>${c.late}</b><span>Late</span></div>
    <div class="g-miss"><b>${c.miss}</b><span>Miss</span></div>
    <div><b>${s.bestCombo}</b><span>Best combo</span></div>
    <div><b>${Math.round(s.accuracy * 100)}%</b><span>Accuracy</span></div>`;
  $('resultModal').hidden = false;
  trackFinish();
}

function trackFinish() {
  const s = game.scorer;
  const complete = Number.isFinite(game.totalSlots) ? game.finalized >= game.totalSlots : game.finalized >= game.chords.length;
  const ids = game.tracker.finish({ complete, rank: s.rank, hour: new Date().getHours(), encore: game.encore });
  if (complete && s.total > 0) {
    bump('sets');
    if (s.rank === 'S') ids.push('busted');
    setFinished(game.style, s.rank);
  }
  if (ids.length) grant(ids);
}

function stopGame() {
  if (!game) return;
  if (!game.over) finish();
}

function backToSetup() {
  if (game && !game.over) { game.over = true; cancelAnimationFrame(game.raf); band.stop(); }
  game = null;
  $('resultModal').hidden = true;
  $('viewPlay').hidden = true;
  $('viewSetup').hidden = false;
  renderSetup();
}

$('playBtn').addEventListener('click', () => startGame());
$('stopBtn').addEventListener('click', stopGame);
$('resultAgainBtn').addEventListener('click', () => { $('resultModal').hidden = true; startGame({ again: true }); });
$('resultBackBtn').addEventListener('click', backToSetup);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && game && !params.has('keys')) backToSetup();
});

// ---- Boot ----

initTrophyCase();
renderSetup();
if (params.has('keys')) {
  attachComputerKeyboard({ onNoteOn, onNoteOff });
  midiStatus({ state: 'connected', names: ['Computer keyboard (dev)'] });
} else if (read(LS.midi, false)) {
  connectMidi({ onNoteOn, onNoteOff, onStatus: midiStatus });
}

// ?debug exposes hooks for automated tests.
if (params.has('debug')) {
  window.__jam = { band, get game() { return game; }, onNoteOn, onNoteOff, startGame, finish, midiStatus };
}
