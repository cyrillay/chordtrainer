// Ghost Jam: page controller. Wires the screens together: setup
// (setupView.js, with the audio sync test in syncView.js), the set on stage
// (playView.js) and its end (resultsView.js), around what they share
// (state.js). This file keeps the MIDI input, the piano remote that drives
// the menus, the keyboard shortcuts and the boot.

import { STYLE_ORDER } from './styles.js';
import { paintMidiStatus } from '../../js/midi/midiHelp.js';
import { createMidiInput } from '../../js/midi/input.js';
import { attachComputerKeyboard } from '../../js/midi/computerKeyboard.js';
import { initTrophyCase } from './trophyCase.js';
import { isFavourite } from './favourites.js';
import { PianoRemote, MenuNav, gestureOf, step, renderRemoteLegend } from '../../js/music-ui/pianoRemote.js';
import { $, params, app, band, held, velocities, settings, store } from './state.js';
import { renderSetup, setStyle, keyWheel, openKeyWheel, combo, tempoPicker } from './setupView.js';
import { renderSync, syncTap, syncing, currentSync, closeSync } from './syncView.js';
import { startGame, stopGame, restartGame, playNote, keyState, toAudioTime } from './playView.js';
import { finish, backToSetup } from './resultsView.js';

// ---- MIDI ----

function midiStatus({ state, names }) {
  app.midiState = state;
  paintMidiStatus({ state, names });
  $('remote').hidden = state !== 'connected';
  $('resultRemote').hidden = state !== 'connected';
  paintNav();
}

const midi = createMidiInput({ onNoteOn, onNoteOff, onStatus: midiStatus });

function connect() {
  band.audio(); // unlock audio on the same click
  midi.connect();
  renderSync();
}
app.connect = connect;
$('midiBtn').addEventListener('click', () => { if (app.midiState !== 'connected') connect(); });
$('gateConnectBtn').addEventListener('click', connect);

function onNoteOn(midi, velocity = 80, tPerf = performance.now()) {
  keyWheel.playNote(midi);
  if (syncing()) syncTap(toAudioTime(tPerf));
  // While the Tap button is lit, every key is a beat.
  if (!app.game && tempoPicker.noteOn(tPerf)) return;
  remote.noteOn(midi, remoteScreen() !== null);
  held.set(midi, null);
  velocities.set(midi, velocity);
  const shownAs = playNote(midi, tPerf);
  held.set(midi, shownAs);
  keyState(midi, shownAs);
}

function onNoteOff(midi) {
  remote.noteOff(midi);
  held.delete(midi);
  velocities.delete(midi);
  keyState(midi);
}

// ---- Piano remote + keyboard shortcuts ----
// On the setup and results screens the piano drives a menu cursor, like a
// TV remote, in intervals from C in any octave (see js/music-ui/pianoRemote.js). The legend under
// the Play button shows how.

const remote = new PianoRemote({
  onCommand: (m) => runRemote(m),
  repeats: (m) => gestureOf(m) === 'up' || gestureOf(m) === 'down',
});

function remoteScreen() {
  if (!$('achModal').hidden || !$('syncModal').hidden || keyWheel.isOpen) return null;
  if (!app.game && !$('viewSetup').hidden) return 'setup';
  if (app.game?.over && !$('resultModal').hidden) return 'results';
  return null;
}

const knobOf = (id) => () => $(id).closest('.knob');
// Each menu row and the element that lights up for it, top to bottom.
const SETUP_ROWS = {
  favs: { kind: 'value', el: () => $('favs') },
  groove: { kind: 'value', el: () => $('styleGrid') },
  tune: { kind: 'value', el: () => $('tuneSelect') },
  shuffle: { kind: 'action', el: () => $('randomTuneBtn') },
  star: { kind: 'action', el: () => $('favBtn') },
  key: { kind: 'action', el: knobOf('keyBtn') },
  tempo: { kind: 'value', el: knobOf('tempoRange') },
  bars: { kind: 'value', el: knobOf('barsSelect') },
  length: { kind: 'value', el: knobOf('lengthSelect') },
  tones: { kind: 'action', el: () => $('showTonesCb').closest('.arcade-toggle') },
  play: { kind: 'action', el: () => $('playBtn') },
};
const RESULT_ROWS = {
  back: { kind: 'action', el: () => $('resultBackBtn') },
  again: { kind: 'action', el: () => $('resultAgainBtn') },
};
const rowsOf = (rows, skip = []) => Object.entries(rows).filter(([id]) => !skip.includes(id)).map(([id, r]) => ({ id, kind: r.kind }));
const setupNav = new MenuNav(rowsOf(SETUP_ROWS, ['favs']), 'groove');
const resultNav = new MenuNav(rowsOf(RESULT_ROWS), 'again', { wrap: true });

// Light up the row under the cursor (only with a keyboard connected).
function paintNav() {
  for (const el of document.querySelectorAll('.nav-focus, .nav-edit')) el.classList.remove('nav-focus', 'nav-edit');
  const screen = app.midiState === 'connected' ? remoteScreen() : null;
  if (!screen) return;
  const nav = screen === 'setup' ? setupNav : resultNav;
  const el = (screen === 'setup' ? SETUP_ROWS : RESULT_ROWS)[nav.current.id].el();
  el.classList.add(nav.editing ? 'nav-edit' : 'nav-focus');
}
app.paintNav = paintNav;
app.showResultsNav = () => { resultNav.setItems(resultNav.items, 'again'); paintNav(); };
function syncSetupRows() {
  setupNav.setItems(rowsOf(SETUP_ROWS, store.favs.length ? [] : ['favs']));
  paintNav();
}
app.syncSetupRows = syncSetupRows;

// Move a <select> by one option and tell its listener.
function stepSelect(sel, dir) {
  sel.value = step([...sel.options].map((o) => o.value), sel.value, dir);
  sel.dispatchEvent(new Event('change'));
}

function nudgeTempo(d) {
  const range = $('tempoRange');
  range.value = Number(range.value) + d;
  range.dispatchEvent(new Event('input'));
}

const CHANGE = {
  favs: (dir) => {
    const { favs } = store;
    const i = favs.findIndex((f) => isFavourite([f], combo()));
    $('favList').querySelector(`[data-fav="${i < 0 ? 0 : (i + dir + favs.length) % favs.length}"]`).click();
  },
  groove: (dir) => setStyle(step(STYLE_ORDER, settings.style, dir)),
  tune: (dir) => stepSelect($('tuneSelect'), dir),
  tempo: (dir) => nudgeTempo(dir),
  bars: (dir) => stepSelect($('barsSelect'), dir),
  length: (dir) => stepSelect($('lengthSelect'), dir),
};
const ACTIVATE = {
  shuffle: () => $('randomTuneBtn').click(),
  key: openKeyWheel,
  star: () => $('favBtn').click(),
  tones: () => $('showTonesCb').click(),
  play: () => $('playBtn').click(),
  back: () => $('resultBackBtn').click(),
  again: () => $('resultAgainBtn').click(),
};

function runRemote(midi) {
  const g = gestureOf(midi);
  const screen = remoteScreen();
  if (!g || !screen) return;
  const nav = screen === 'setup' ? setupNav : resultNav;
  const fx = nav.handle(g);
  if (fx?.type === 'change') CHANGE[fx.id](fx.dir);
  if (fx?.type === 'activate') ACTIVATE[fx.id]();
  paintNav();
  if (remoteScreen() === screen && fx?.type === 'focus') {
    (screen === 'setup' ? SETUP_ROWS : RESULT_ROWS)[fx.id].el().scrollIntoView({ block: 'nearest' });
  }
}

// The legend: one octave around a C, F to A, the keys that do something labelled.
renderRemoteLegend($('remoteKeys'));

document.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, select, textarea, button, a')) return;
  if (app.game && !app.game.over) {
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); restartGame(); }
    else if (e.key === ' ') { e.preventDefault(); stopGame(); }
  } else if (e.key === 'Enter') {
    const screen = remoteScreen();
    if (screen === 'setup') { e.preventDefault(); startGame(); }
    else if (screen === 'results') { e.preventDefault(); $('resultAgainBtn').click(); }
  }
});

$('playBtn').addEventListener('click', () => startGame());
$('stopBtn').addEventListener('click', stopGame);
$('restartBtn').addEventListener('click', restartGame);
$('resultAgainBtn').addEventListener('click', () => { $('resultModal').hidden = true; startGame({ again: true }); });
$('resultBackBtn').addEventListener('click', backToSetup);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && keyWheel.isOpen) return keyWheel.close();
  if (e.key === 'Escape' && !$('syncModal').hidden) return closeSync();
  if (e.key === 'Escape' && app.game && !params.has('keys')) backToSetup();
});

// ---- Boot ----

initTrophyCase();
renderSetup();
if (params.has('keys')) {
  attachComputerKeyboard({ onNoteOn, onNoteOff });
  midiStatus({ state: 'connected', names: ['Computer keyboard (dev)'] });
} else if (midi.previouslyGranted()) {
  midi.connect();
}

// ?debug exposes hooks for automated tests.
if (params.has('debug')) {
  window.__jam = { band, get game() { return app.game; }, get sync() { return currentSync(); }, onNoteOn, onNoteOff, startGame, restartGame, finish, midiStatus };
}
