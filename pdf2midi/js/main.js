// PDF → MIDI converter UI: load pdf.js, extract vector primitives, recognise,
// then offer the MIDI download, an audio preview and an overlay of every
// recognised note on the rendered score for checking.

import { extractDocument } from './extract.js';
import { recognize } from './omr.js';
import { writeMidi } from './midiWriter.js';
import { createPlayer } from './player.js';

// Same pdf.js build as the Score Trainer, so the browser cache is shared.
const PDFJS_VER = '4.8.69';
const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.min.mjs`;
const WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.worker.min.mjs`;
const MAX_PREVIEW_PAGES = 40;

const $ = id => document.getElementById(id);

let pdfjsLib = null;
async function ensurePdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import(/* webpackIgnore: true */ PDFJS_URL);
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
  return pdfjsLib;
}

const state = { score: null, pdf: null, fileName: '', tempo: 120, markers: [] };
const player = createPlayer();

// ---------------------------------------------------------------- views

function show(view) {
  for (const id of ['viewUpload', 'viewResult']) {
    const el = $(id);
    el.hidden = id !== view;
    if (id === view) {
      el.classList.remove('is-entering');
      void el.offsetWidth;
      el.classList.add('is-entering');
    }
  }
}

function setStatus(msg, isError = false) {
  const el = $('status');
  el.hidden = !msg;
  el.textContent = msg || '';
  el.classList.toggle('is-error', isError);
}

// ---------------------------------------------------------------- naming

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const MAJOR_KEYS = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];

function noteName(pitch, fifths) {
  const names = fifths < 0 ? FLAT_NAMES : SHARP_NAMES;
  return names[((pitch % 12) + 12) % 12] + (Math.floor(pitch / 12) - 1);
}

function keyLabel(fifths) {
  const major = MAJOR_KEYS[fifths + 7] || '?';
  const acc = fifths === 0 ? 'no sharps or flats' : `${Math.abs(fifths)} ${fifths > 0 ? 'sharp' : 'flat'}${Math.abs(fifths) > 1 ? 's' : ''}`;
  return `${major} major / relative minor (${acc})`;
}

const fmtBeat = b => (Math.round(b * 100) / 100).toString();

// ---------------------------------------------------------------- pipeline

async function handleFile(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    setStatus('Please choose a PDF file.', true);
    return;
  }
  player.stop();
  state.fileName = file.name;
  try {
    setStatus('Loading PDF engine…');
    const lib = await ensurePdfJs();
    setStatus('Reading the PDF…');
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await lib.getDocument({ data }).promise;
    state.pdf = pdf;
    const doc = await extractDocument(pdf, lib.OPS, (p, n) => setStatus(`Reading page ${p} of ${n}…`));
    setStatus('Recognising the notation…');
    await new Promise(r => setTimeout(r, 0));
    const score = recognize(doc);
    if (!score.stats.notes) throw new Error('Staves were found but no notes could be read from them.');
    state.score = score;
    state.tempo = Math.round(score.tempo);
    setStatus('');
    renderResult();
    show('viewResult');
    await renderPages();
  } catch (err) {
    console.error(err);
    setStatus(err && err.message ? err.message : 'Something went wrong while reading this PDF.', true);
    show('viewUpload');
  }
}

// ---------------------------------------------------------------- result

function renderResult() {
  const s = state.score;
  const base = state.fileName.replace(/\.pdf$/i, '');
  $('resTitle').textContent = s.title || base;
  const ts = s.timeSigs.map(t => `${t.num}/${t.den}`).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  const parts = [
    `${s.stats.notes} notes`,
    `${s.stats.measures} measures`,
    `${s.stats.staves} ${s.stats.staves > 1 ? 'staves' : 'staff'}`,
    ts,
    keyLabel(s.keySigs[0].fifths)
  ];
  if (s.stats.tuplets) parts.push(`${s.stats.tuplets} tuplet${s.stats.tuplets > 1 ? 's' : ''}`);
  if (s.stats.ties) parts.push(`${s.stats.ties} ties`);
  $('resSummary').textContent = parts.join(' · ');

  const tempo = $('tempoInput');
  tempo.value = String(state.tempo);
  $('tempoVal').textContent = String(state.tempo);
  $('tempoHint').textContent = s.tempoFound
    ? 'Read from the metronome mark on the score. Quarter notes per minute.'
    : 'No metronome mark found — set it here. Quarter notes per minute.';

  const ul = $('warnings');
  ul.innerHTML = '';
  for (const w of s.warnings) {
    const li = document.createElement('li');
    li.textContent = w;
    ul.appendChild(li);
  }
  ul.hidden = s.warnings.length === 0;
  $('playBtn').textContent = '▶ Listen';
}

function measureAt(beat) {
  const ms = state.score.measures;
  let lo = 0, hi = ms.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ms[mid].start <= beat + 1e-6) lo = mid; else hi = mid - 1;
  }
  return lo;
}

async function renderPages() {
  const wrap = $('pages');
  wrap.innerHTML = '';
  state.markers = [];
  const s = state.score;
  const pdf = state.pdf;
  const fifths = s.keySigs[0].fifths;
  const byPage = new Map();
  s.tracks.forEach((tr, ti) => tr.notes.forEach(n => {
    if (!n.src) return;
    if (!byPage.has(n.src.page)) byPage.set(n.src.page, []);
    byPage.get(n.src.page).push({ n, ti });
  }));

  const pages = Math.min(pdf.numPages, MAX_PREVIEW_PAGES);
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, (900 / vp1.width) * (window.devicePixelRatio || 1));
    const vp = page.getViewport({ scale });
    const div = document.createElement('div');
    div.className = 'page';
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.setAttribute('aria-label', `Page ${p}`);
    const overlay = document.createElement('div');
    overlay.className = 'page-overlay';
    div.append(canvas, overlay);
    wrap.appendChild(div);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

    for (const { n, ti } of byPage.get(p - 1) || []) {
      const mk = document.createElement('span');
      mk.className = `mk s${Math.min(ti, 2)}`;
      const w = n.src.w || 6;
      mk.style.left = `${(n.src.x / vp1.width) * 100}%`;
      mk.style.top = `${(n.src.y / vp1.height) * 100}%`;
      mk.style.width = `${((w + 2) / vp1.width) * 100}%`;
      mk.style.height = `${((w * 0.85) / vp1.height) * 100}%`;
      const mi = measureAt(n.start);
      const beat = n.start - s.measures[mi].start + 1;
      mk.title = `${noteName(n.pitch, fifths)} · m. ${mi + 1}, beat ${fmtBeat(beat)} · ${fmtBeat(n.dur)} beat${n.dur === 1 ? '' : 's'} · staff ${ti + 1}`;
      overlay.appendChild(mk);
      state.markers.push({ el: mk, start: n.start, end: n.start + n.dur });
    }
  }
  if (pdf.numPages > pages) {
    const more = document.createElement('p');
    more.className = 'status-line';
    more.textContent = `Preview limited to the first ${pages} pages — the MIDI file contains all ${pdf.numPages}.`;
    wrap.appendChild(more);
  }
}

// ---------------------------------------------------------------- actions

function download() {
  const s = state.score;
  const bytes = writeMidi(s, { tempo: state.tempo });
  const blob = new Blob([bytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (state.fileName.replace(/\.pdf$/i, '') || 'score') + '.mid';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let lit = [];
function highlight(beat) {
  for (const el of lit) el.classList.remove('is-playing');
  lit = [];
  if (beat < 0) return;
  for (const m of state.markers) {
    if (m.start <= beat && beat < m.end) { m.el.classList.add('is-playing'); lit.push(m.el); }
  }
}

function togglePlay() {
  const btn = $('playBtn');
  if (player.playing) {
    player.stop();
    btn.textContent = '▶ Listen';
    return;
  }
  player.play(state.score, state.tempo, {
    frame: highlight,
    end: () => { btn.textContent = '▶ Listen'; }
  });
  btn.textContent = '■ Stop';
}

// ---------------------------------------------------------------- wiring

const dz = $('dropZone');
const input = $('fileInput');
$('browseBtn').addEventListener('click', e => { e.stopPropagation(); input.click(); });
dz.addEventListener('click', () => input.click());
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
input.addEventListener('change', () => { handleFile(input.files[0]); input.value = ''; });
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag-over'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag-over'); }));
dz.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));

$('tempoInput').addEventListener('input', e => {
  state.tempo = +e.target.value;
  $('tempoVal').textContent = e.target.value;
  if (player.playing) { player.stop(); $('playBtn').textContent = '▶ Listen'; }
});
$('downloadBtn').addEventListener('click', download);
$('playBtn').addEventListener('click', togglePlay);
$('againBtn').addEventListener('click', () => {
  player.stop();
  highlight(-1);
  setStatus('');
  show('viewUpload');
});
