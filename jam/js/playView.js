// Ghost Jam: the play screen. The set on stage: the clock, the chord
// slots and their grading, the HUD, the ghost band, the timing gauge and
// the keyboard strip.
//
// Clocks: the band schedules on the Web Audio clock. MIDI note-ons carry a
// performance.now() timestamp; we move them onto the audio clock, minus the
// output latency, so a chord is judged against what you actually heard.

import { formatChordHtml, spellChordTones } from '../../js/core/theory.js';
import { STYLES, TIERS, MAX_ENERGY, GUESTS, partsAt } from './styles.js';
import { voicingTags, voicingBonus, voicingWords, bassRole } from './voicing.js';
import { SlotJudge, Scorer, chordTargets, hintVoicing, toneDegree, DEGREES, multiplier, timingZone, WINDOW, ghostFill } from './judge.js';
import { track } from '../../js/stats/log.js';
import { JamTracker } from './achievements.js';
import { grant, setMax } from './trophyCase.js';
import {
  $, app, band, held, velocities, settings, guestsMet, LS, write, scoreKey, hiFor,
  tuneByName, resolveKey, buildChords, keyName,
} from './state.js';
import { BAND, ghostHtml } from './ghosts.js';
import { applySync, stopSync } from './syncView.js';
import { finish } from './resultsView.js';

const guestName = () => GUESTS[app.game?.style || settings.style].name;

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

// Keys are coloured by what the note does in the chord (see DEGREES):
// full colour while held, a faint glow on the keys to play.
const DEG_CLASSES = DEGREES.map((d) => `deg-${d}`);
const HINT_CLASSES = DEGREES.map((d) => `hint-${d}`);

// chord: the chord the note is judged against, or null outside a set.
export function keyState(midi, chord) {
  const k = kbKeys.get(midi);
  if (!k) return;
  k.classList.remove('is-down', 'is-free', ...DEG_CLASSES);
  if (chord === undefined) return;
  k.classList.add('is-down', chord ? `deg-${toneDegree(chord, midi % 12)}` : 'is-free');
}

export function showHint(chord) {
  for (const k of kbKeys.values()) k.classList.remove('is-hint', ...HINT_CLASSES);
  if (!chord) return;
  for (const m of hintVoicing(chord)) kbKeys.get(m)?.classList.add('is-hint', `hint-${toneDegree(chord, m % 12)}`);
}

// again: replay the last set as it was (same tune, same key).
// restart: the same, but the set was cut short, so it is no encore.
export function startGame({ again = false, restart = false } = {}) {
  if (app.midiState !== 'connected') {
    const gate = $('midiGate');
    gate.classList.remove('shake');
    void gate.offsetWidth;
    gate.classList.add('shake');
    if (app.midiState === 'off') app.connect();
    return;
  }
  const last = again && app.game ? app.game : null;
  const prog = last ? last.prog : tuneByName(settings.tune);
  const key = last ? last.key : resolveKey();
  const chords = buildChords(prog, key);
  const style = STYLES[settings.style];
  const tempo = Number($('tempoRange').value);
  const barsPerChord = settings.bars;
  const choruses = settings.length > 0 ? settings.length : Infinity;

  app.game = {
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
    encore: last ? last.encore + (restart ? 0 : 1) : 0,
  };

  $('viewSetup').hidden = true;
  $('viewPlay').hidden = false;
  $('resultModal').hidden = true;
  $('tuneTitle').textContent = prog.name;
  $('tuneMeta').textContent = `${style.name} · ${keyName(key, prog)} · ${tempo} bpm${style.anchor ? ' · Play on the and' : ''}`;
  $('ghostBand').innerHTML = BAND.map((m) => ghostHtml(m, settings.style, true)).join('');
  $('hudHi').textContent = hiFor(app.game.scoreKey).toLocaleString();
  renderHud();
  app.game.energy = -1;
  renderBand(app.game.scorer);
  $('gaugeTicks').innerHTML = '';
  $('gaugeReadout').textContent = '';
  $('gaugeReadout').className = 'gauge-readout';
  $('chordBig').innerHTML = '<span class="count">Ready</span>';
  $('chordTones').innerHTML = '';
  showHint(null);
  renderNext(-1);
  framePlay();

  stopSync();
  applySync();
  band.energy = 1;
  band.start({
    style: settings.style, tempo, chords, barsPerChord, choruses,
    onEnd: () => finish(),
  });
  app.game.raf = requestAnimationFrame(loop);
}

// Frame the set: the stage in view with the piano at the bottom of the
// screen, the header and the menu scrolled away. On a short screen the
// stage keeps the top.
function framePlay() {
  const top = $('stage').getBoundingClientRect().top + window.scrollY;
  const bottom = document.querySelector('.kb-frame').getBoundingClientRect().bottom + window.scrollY;
  const margin = 12;
  const y = Math.min(top - margin, bottom + margin - window.innerHeight);
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}

// Slot timing on the audio clock (seconds). Slot k starts after the count-in bar.
function slotStart(k) { return band.startAt + (1 + k * app.game.barsPerChord) * band.barDur; }
function slotEnd(k) { return slotStart(k) + app.game.barsPerChord * band.barDur; }
// Where the chord is meant to be played: the downbeat, or the off-beat
// after it in reggae (see `anchor` in styles.js).
const anchorSec = () => (STYLES[app.game.style].anchor || 0) * band.beat;
function target(k) { return slotStart(k) + anchorSec(); }

function judgeFor(k) {
  if (k < 0 || k >= app.game.totalSlots) return null;
  let j = app.game.judges.get(k);
  if (!j) {
    j = new SlotJudge({
      chord: app.game.chords[k % app.game.chords.length],
      start: target(k) * 1000,
      end: (slotEnd(k) + anchorSec()) * 1000,
      beatMs: band.beat * 1000,
      prevChord: k > 0 ? app.game.chords[(k - 1) % app.game.chords.length] : null,
    });
    app.game.judges.set(k, j);
  }
  return j;
}

// Which slot a moment (audio seconds) belongs to, anticipation included.
function slotAt(t) {
  const first = band.startAt + band.barDur;
  const span = app.game.barsPerChord * band.barDur;
  return Math.floor((t - anchorSec() + WINDOW.antic * band.beat - first) / span);
}

// Audio-clock time (seconds) of a MIDI event stamped with performance.now().
export function toAudioTime(tPerf) {
  return band.ctx.currentTime + (tPerf - performance.now()) / 1000 - band.outputLatency;
}

function heldPcs() {
  return new Set([...held.keys()].map((m) => m % 12));
}

// A key played during a set: judged against the slot it falls in.
// Returns the chord it was judged against, or null.
export function playNote(midi, tPerf) {
  let shownAs = null;
  if (app.game && !app.game.over && band.ctx) {
    app.game.tracker.note();
    const t = toAudioTime(tPerf);
    const k = slotAt(t);
    const j = judgeFor(k);
    if (j && !j.done) {
      const before = j.hitAt;
      j.noteOn(midi % 12, t * 1000, heldPcs());
      if (before === null && j.hitAt !== null) onHit(k, j);
      else if (before !== null) growVoicing(k);
    }
    if (k >= 0) shownAs = app.game.chords[k % app.game.chords.length];
  }
  return shownAs;
}

// ---- Frame loop: beat lights, chord changes, grading ----

function loop() {
  if (!app.game) return;
  const ctx = band.ctx;
  const heard = ctx.currentTime - band.outputLatency;
  const pos = band.position(heard);

  if (pos && pos.bar >= 0) {
    const beatId = pos.bar * 4 + pos.beat;
    if (beatId !== app.game.lastBeat) {
      app.game.lastBeat = beatId;
      onBeat(pos);
    }
  }

  // Current slot (no anticipation for display).
  const k = Math.floor((heard - (band.startAt + band.barDur)) / (app.game.barsPerChord * band.barDur));
  if (k !== app.game.shownSlot && heard >= band.startAt) {
    app.game.shownSlot = k;
    if (k >= 0 && k < app.game.totalSlots) showSlot(k);
  }
  markNextSoon(k, heard);
  moveGaugeCursor(k, heard);
  if (k >= 0) {
    const frac = (heard - slotStart(k)) / (slotEnd(k) - slotStart(k));
    $('slotFill').style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  // Grade every slot whose window has closed.
  while (app.game.finalized < app.game.totalSlots) {
    const kk = app.game.finalized;
    const closeAt = slotEnd(kk) + anchorSec() - WINDOW.antic * band.beat;
    if (heard < closeAt) break;
    grade(kk);
    app.game.finalized++;
  }

  app.game.raf = requestAnimationFrame(loop);
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
  const chord = app.game.chords[k % app.game.chords.length];
  const big = $('chordBig');
  big.innerHTML = formatChordHtml(chord);
  big.classList.remove('pop');
  void big.offsetWidth;
  big.classList.add('pop');
  if (settings.showTones) {
    const t = chordTargets(chord);
    const spelled = spellChordTones(chord);
    $('chordTones').innerHTML = chord.orderedNotes.map((pc, i) =>
      `<span class="deg-${toneDegree(chord, pc)}${t.required.has(pc) ? ' req' : ''}">${spelled[i].display}</span>`).join('');
  } else {
    $('chordTones').innerHTML = '';
  }
  showHint(settings.showTones ? chord : null);
  const chorus = Math.floor(k / app.game.chords.length);
  $('tuneChorus').textContent = Number.isFinite(app.game.choruses) ? `Chorus ${chorus + 1}/${app.game.choruses}` : `Chorus ${chorus + 1}`;
  renderNext(k);
  // Re-colour keys already held against the new chord.
  for (const m of held.keys()) { held.set(m, chord); keyState(m, chord); }
}

function renderNext(k) {
  const items = [];
  for (let i = 1; i <= 3; i++) {
    const n = k + i;
    if (n < 0 || n >= app.game.totalSlots) break;
    items.push(formatChordHtml(app.game.chords[n % app.game.chords.length]));
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
  scoreVoicing(k, j, res);
  const gained = app.game.scorer.add(res);
  band.energy = app.game.scorer.energy;
  renderBand(app.game.scorer);
  trackChord(k, j, res);
  shout(res, gained);
  renderHud();
  track('jam', { ok: res.grade === 'miss' ? 0 : 1, miss: res.grade === 'miss' ? 1 : 0, maxGap: 20000 });
}

// Bonus for how the chord was voiced (see voicing.js), on top of the colours.
function scoreVoicing(k, j, res) {
  const voicing = app.game.hits.get(k)?.voicing || null;
  res.bass = bassRole(j.chord, voicing);
  res.tags = res.grade === 'miss' ? [] : voicingTags(j.chord, voicing, app.game.hits.get(k - 1)?.voicing);
  res.voicingBonus = voicingBonus(res.tags);
  res.bonus += res.voicingBonus;
}

// Feed a graded chord (and any change of energy) to the achievements.
function trackChord(k, j, res) {
  const hit = app.game.hits.get(k);
  const root = j.targets.root;
  const ids = app.game.tracker.chord({
    ...res,
    offsetMs: res.offsetBeats === null ? null : res.offsetBeats * band.beat * 1000,
    voicing: hit?.voicing || null,
    velocities: hit?.velocities || null,
    colourIntervals: [...j.colours].map((pc) => (pc - root + 12) % 12),
    quality: j.chord.quality,
    chordId: `${j.targets.root}${j.chord.quality}`,
  });
  ids.push(...app.game.tracker.energy(app.game.scorer.energy));
  setMax('energy', app.game.scorer.energy);
  if (ids.length) grant(ids);
}

function shout(res, gained) {
  const el = document.createElement('div');
  el.className = `shout g-${res.grade}`;
  el.innerHTML = `<span class="shout-word">${pickShout(res.grade)}</span>`
    + (gained ? `<span class="shout-pts">+${gained.toLocaleString()}</span>` : '')
    + (res.colours && res.grade !== 'miss' ? `<span class="shout-spicy">Spicy ×${res.colours}</span>` : '')
    + (res.tags.length ? `<span class="shout-voicing">${voicingWords(res.tags, res.bass).join(' · ')}</span>` : '');
  $('shoutLayer').appendChild(el);
  setTimeout(() => el.remove(), 1300);
  const stage = $('stage');
  stage.classList.remove('flash-perfect', 'flash-miss');
  void stage.offsetWidth;
  if (res.grade === 'perfect') stage.classList.add('flash-perfect');
  if (res.grade === 'miss') stage.classList.add('flash-miss');
}

function renderHud() {
  const s = app.game.scorer;
  $('hudScore').textContent = s.score.toLocaleString();
  $('hudCombo').textContent = s.combo;
  $('hudMult').textContent = `×${multiplier(s.combo)}`;
  $('hudComboCell').classList.toggle('is-hot', s.combo >= 4);
  $('hudComboCell').classList.toggle('is-blazing', s.combo >= 12);
  if (s.score > hiFor(app.game.scoreKey)) $('hudHi').textContent = s.score.toLocaleString();
}

// The band's heat lights the ghosts up left to right, and its energy
// (0..MAX_ENERGY) says who is on stage. A change of tier is announced.
function renderBand({ heat, energy: e }) {
  const fill = ghostFill(heat);
  const parts = partsAt(e);
  for (const g of $('ghostBand').children) {
    const was = !g.classList.contains('is-off');
    const on = parts.has(g.dataset.part);
    g.style.setProperty('--fill', fill[g.dataset.part].toFixed(3));
    g.classList.toggle('is-off', !on);
    g.classList.toggle('is-wild', e >= MAX_ENERGY);
    if (on && !was && app.game?.energy >= 0) {
      if (g.dataset.part === 'guest' && !guestsMet.has(app.game.style)) {
        guestsMet.add(app.game.style);
        write(LS.guests, [...guestsMet]);
      }
      g.classList.remove('joins');
      void g.offsetWidth;
      g.classList.add('joins');
    }
  }
  document.body.dataset.energy = String(e);
  if (app.game) {
    const prev = app.game.energy;
    app.game.energy = e;
    if (prev >= 0 && e !== prev) announceTier(prev, e);
  }
}

function announceTier(prev, e) {
  const up = e > prev;
  const tier = TIERS[up ? e : prev];
  // Nobody announces a player leaving: their ghost going dark says it already.
  if (!up && !tier.heat) return;
  const el = document.createElement('div');
  el.className = `tier-banner ${up ? 'is-up' : 'is-down'}`;
  const name = tier.part === 'guest' ? guestName() : tier.name;
  const verb = (one, many) => (tier.plural ? many : one);
  if (tier.heat) el.textContent = up ? 'The band heats up!' : 'The band cools down';
  else el.textContent = `${name} ${verb('joins', 'join')} in!`;
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
  if (c >= app.game.totalSlots) { cur.hidden = true; return; }
  const off = (heard - target(c)) / band.beat;
  const inside = off >= GAUGE.from && off <= GAUGE.to;
  cur.hidden = !inside;
  if (inside) cur.style.left = `${gaugePct(off)}%`;
}

const ZONE_WORD = { early: 'Early', perfect: 'On the beat', good: 'A bit late', late: 'Late' };

function heldVoicing() {
  const voicing = [...held.keys()].sort((a, b) => a - b);
  return { voicing, velocities: voicing.map((m) => velocities.get(m) ?? 80) };
}

// A key added to a chord that already landed, still holding it (a rolled
// chord, a colour on top): it belongs to the voicing.
function growVoicing(k) {
  const hit = app.game.hits.get(k);
  if (hit && hit.voicing.every((m) => held.has(m))) app.game.hits.set(k, heldVoicing());
}

function onHit(k, j) {
  app.game.hits.set(k, heldVoicing());
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

export function stopGame() {
  if (!app.game) return;
  if (!app.game.over) finish();
}

// Start the set over from the count-in, same tune and key. The cut set is
// dropped: no results screen, no high score.
export function restartGame() {
  if (!app.game) return;
  if (!app.game.over) { app.game.over = true; cancelAnimationFrame(app.game.raf); band.stop(); }
  $('shoutLayer').innerHTML = '';
  for (const b of document.querySelectorAll('.tier-banner')) b.remove();
  startGame({ again: true, restart: true });
}
