// Score Trainer — orchestrator. Owns the four views (upload, mark, config,
// play) and the wiring between them.

import { loadPdfFromFile, measuresFromMarkings } from './pdfSource.js';
import { loadMidiFromFile } from './midiSource.js';
import { createMarking } from './pdfMarking.js';
import { buildChunks } from './chunker.js';
import { createSession } from './session.js';
import { renderChunk, planLayout } from './renderer.js';
import {
  hashFile, loadConfig, saveConfig,
  pushRecent, listRecent, removeRecent,
  saveFileBlob, loadFileBlob,
} from './storage.js';

const $ = (id) => document.getElementById(id);
const views = {
  upload: $('viewUpload'),
  mark:   $('viewMark'),
  config: $('viewConfig'),
  play:   $('viewPlay'),
};

function showView(name) {
  for (const [k, el] of Object.entries(views)) {
    el.hidden = (k !== name);
    el.classList.remove('is-entering');
  }
  // Re-trigger the entrance animation by waiting one frame.
  const target = views[name];
  requestAnimationFrame(() => target.classList.add('is-entering'));
}

// ---- toast ---------------------------------------------------------------
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ---- shared state --------------------------------------------------------
let source = null;     // current loaded source (pdf or midi)
let fileHash = null;
let measures = [];     // flat ordered list for the current source
let marking = null;    // pdfMarking instance (only when source.kind === 'pdf')
let session = null;
const cfg = loadConfig();

// ============================================================================
//  Upload view
// ============================================================================

const dropZone = $('dropZone');
const fileInput = $('fileInput');

dropZone.addEventListener('click', (e) => {
  if (e.target.id === 'browseBtn') return; // browse button has its own handler
  fileInput.click();
});
$('browseBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files?.[0]) handleFile(e.target.files[0]);
});
['dragenter', 'dragover'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  });
});
dropZone.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f) handleFile(f);
});

async function handleFile(file, opts = {}) {
  try {
    const name = (file.name || '').toLowerCase();
    fileHash = await hashFile(file);
    const isPdf  = name.endsWith('.pdf')  || file.type === 'application/pdf';
    const isMidi = name.endsWith('.mid')  || name.endsWith('.midi');
    if (!isPdf && !isMidi) {
      toast('Unsupported file format. Please upload a PDF or MIDI file.');
      return;
    }

    // Persist bytes so the user can reopen this exact file from the recent
    // list later without re-uploading. Skip if we just loaded it FROM IDB
    // — `opts.persisted` is the flag the recent-click path sets.
    if (!opts.persisted) {
      await saveFileBlob(fileHash, file);
    }
    pushRecent({
      hash: fileHash,
      name: file.name,
      kind: isPdf ? 'pdf' : 'midi',
      size: file.size || 0,
    });

    if (isPdf) {
      source = await loadPdfFromFile(file);
      await enterMarkView();
    } else {
      source = await loadMidiFromFile(file);
      measures = source.measures;
      enterConfigView();
    }
  } catch (err) {
    console.error(err);
    toast(`Couldn't load file: ${err.message || err}`);
  }
}

async function openRecent(entry) {
  try {
    const blob = await loadFileBlob(entry.hash);
    if (!blob) {
      toast('File no longer available locally. Please re-upload.');
      removeRecent(entry.hash);
      renderRecent();
      return;
    }
    // Re-wrap as a File so downstream code (which calls .name and
    // .arrayBuffer()) doesn't need to know the difference.
    const file = blob instanceof File
      ? blob
      : new File([blob], entry.name, { type: blob.type || (entry.kind === 'pdf' ? 'application/pdf' : 'audio/midi') });
    await handleFile(file, { persisted: true });
  } catch (err) {
    console.error(err);
    toast(`Couldn't open recent file: ${err.message || err}`);
  }
}

function renderRecent() {
  const recent = listRecent();
  const recentEl = $('recent');
  const listEl = $('recentList');
  if (!recent.length) {
    recentEl.style.display = 'none';
    return;
  }
  recentEl.style.display = 'block';
  listEl.innerHTML = '';
  for (const item of recent) {
    const row = document.createElement('div');
    row.className = 'recent-item';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.innerHTML = `
      <span class="recent-item-kind"></span>
      <span class="recent-item-name"></span>
      <span class="recent-item-meta"></span>
      <span class="recent-item-del" title="Remove from list" aria-label="Remove">×</span>
    `;
    row.querySelector('.recent-item-kind').textContent = item.kind.toUpperCase();
    row.querySelector('.recent-item-name').textContent = item.name;
    row.querySelector('.recent-item-meta').textContent = formatRecentMeta(item);
    row.querySelector('.recent-item-del').addEventListener('click', (e) => {
      e.stopPropagation();
      removeRecent(item.hash);
      renderRecent();
    });
    row.addEventListener('click', () => openRecent(item));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecent(item); }
    });
    listEl.appendChild(row);
  }
}

function formatRecentMeta(item) {
  const bits = [];
  if (item.size) bits.push(formatBytes(item.size));
  if (item.addedAt) bits.push(formatRelative(item.addedAt));
  return bits.join(' · ');
}
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function formatRelative(ts) {
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)}h ago`;
  if (d < 7 * 86400_000) return `${Math.floor(d / 86400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

// ============================================================================
//  Mark view (PDF only)
// ============================================================================

const markCanvas = $('markCanvas');
const markOverlay = $('markOverlay');

async function enterMarkView() {
  showView('mark');
  $('markFilename').textContent = source.name;
  $('pageTotal').textContent = source.numPages;
  $('pageNum').textContent = 1;

  marking?.destroy?.();
  marking = createMarking({
    pdfSource: source,
    canvas: markCanvas,
    overlay: markOverlay,
    hash: fileHash,
    onChange: (snap) => {
      const totalMeasures = snap.measures.length;
      const totalSystems = snap.markings.pages.reduce((acc, p) => acc + (p.systems?.length || 0), 0);
      $('systemCount').textContent = totalSystems;
      $('measureCount').textContent = totalMeasures;
      $('confirmMarkBtn').disabled = totalMeasures < 1;
      $('pageNum').textContent = marking.pageIdx + 1;
    },
  });
  await marking.loadPage(0);
}

// Mode toggle
document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
    marking?.setMode(btn.dataset.mode);
    // Update the hint copy so the user knows what action this mode performs.
    const hint = $('markHint');
    if (btn.dataset.mode === 'system') {
      hint.innerHTML = 'Drag to box each <strong>system</strong> (one music line). Use the × to remove a system. The box edges already count as the first and last barlines.';
    } else {
      hint.innerHTML = 'Click each <strong>internal</strong> barline inside a system — no need to click the first and last (they\'re the system edges). Click an existing line to remove it.';
    }
  });
});

$('pageBack').addEventListener('click', async () => {
  if (!marking) return;
  if (marking.pageIdx > 0) await marking.loadPage(marking.pageIdx - 1);
});
$('pageFwd').addEventListener('click', async () => {
  if (!marking) return;
  if (marking.pageIdx < marking.numPages - 1) await marking.loadPage(marking.pageIdx + 1);
});

$('clearPageBtn').addEventListener('click', () => {
  if (confirm('Clear all markings on this page?')) marking?.clearPage();
});
$('cancelMarkBtn').addEventListener('click', () => {
  showView('upload');
  source = null;
  marking?.destroy?.();
  marking = null;
});
$('confirmMarkBtn').addEventListener('click', () => {
  const snap = marking.getSnapshot();
  measures = snap.measures;
  if (!measures.length) {
    toast('Mark at least one system before continuing.');
    return;
  }
  enterConfigView();
});

// ============================================================================
//  Config view
// ============================================================================

function enterConfigView() {
  showView('config');
  $('configFilename').textContent = source.name;
  const kind = source.kind === 'pdf' ? 'PDF' : 'MIDI';
  $('configSummary').textContent =
    `${kind} · ${measures.length} measure${measures.length === 1 ? '' : 's'} detected`;

  // Restore prior config
  const chunkSize = Math.min(Math.max(1, cfg.chunkSize || 4), 16);
  const displayTime = cfg.displayTime || 300;
  $('chunkSize').value = chunkSize;
  $('chunkSizeVal').textContent = chunkSize;
  $('chunkSizePlural').textContent = chunkSize === 1 ? '' : 's';
  $('displayTime').value = displayTime;
  $('displayTimeVal').textContent = formatDuration(displayTime);
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}m ${s}s`;
}

$('chunkSize').addEventListener('input', (e) => {
  const v = +e.target.value;
  $('chunkSizeVal').textContent = v;
  $('chunkSizePlural').textContent = v === 1 ? '' : 's';
});
$('displayTime').addEventListener('input', (e) => {
  $('displayTimeVal').textContent = formatDuration(+e.target.value);
});

$('backToUploadBtn').addEventListener('click', () => {
  showView('upload');
  source = null;
  marking?.destroy?.();
  marking = null;
});

$('startBtn').addEventListener('click', () => {
  const chunkSize = +$('chunkSize').value;
  const displayTime = +$('displayTime').value;

  cfg.chunkSize = chunkSize;
  cfg.displayTime = displayTime;
  saveConfig(cfg);

  const chunks = buildChunks(measures, chunkSize);
  if (!chunks.length) {
    toast('No chunks to play. Check that the file has measures.');
    return;
  }
  enterPlayView(chunks, displayTime * 1000);
});

// ============================================================================
//  Play view
// ============================================================================

function enterPlayView(chunks, displayMs) {
  showView('play');
  $('chunkTotal').textContent = chunks.length;
  $('roundNum').textContent = 1;

  // Compute display geometry ONCE so the visual scale stays identical
  // across every chunk — no surprise zoom changes when a chunk lands on a
  // narrower region or straddles two systems.
  const container = $('chunkRender');
  const layout = planLayout(source, chunks, container.clientWidth || 900);

  session?.destroy?.();
  session = createSession({
    chunks,
    displayMs,
    onChunkChange: async ({ chunk, positionInRound, roundSize, round, canGoBack }) => {
      $('chunkPos').textContent = positionInRound;
      $('chunkTotal').textContent = roundSize;
      $('roundNum').textContent = round;
      $('chunkRange').textContent = chunk.length === 1
        ? `m. ${chunk[0].num}`
        : `m. ${chunk[0].num} – ${chunk[chunk.length - 1].num}`;
      $('prevBtn').disabled = !canGoBack;
      try {
        await renderChunk(source, chunk, container, layout);
      } catch (err) {
        console.error(err);
        container.innerHTML = `<div style="color:var(--crimson);font-family:var(--font-mono);font-size:0.9rem;">Render error: ${escapeHtml(err.message || String(err))}</div>`;
      }
    },
    onTick: ({ remainingMs, totalMs, paused }) => {
      const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
      $('playProgressFill').style.width = `${pct}%`;
      $('playProgressTime').textContent = formatMs(remainingMs);
      if (paused !== undefined) {
        $('pauseIcon').hidden = paused;
        $('playIcon').hidden = !paused;
      }
    },
    onRoundComplete: () => {
      // No-op for now — the round counter updates on the next chunk-change.
    },
  });
  session.start();
}

function formatMs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function escapeHtml(s) {
  return s.replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
}

$('prevBtn').addEventListener('click', () => session?.prev());
$('nextBtn').addEventListener('click', () => session?.next());
$('pauseBtn').addEventListener('click', () => session?.toggle());
$('exitSessionBtn').addEventListener('click', async () => {
  session?.destroy();
  session = null;
  // For PDFs, "Back to setup" means back to the marking step — that's the
  // actual setup work the user did, and it's where they're most likely to
  // want to tweak (add a missed barline, adjust a system box). For MIDI
  // there's no marking step, so we land at config instead.
  if (source?.kind === 'pdf' && marking) {
    showView('mark');
    // Re-render the current page so the canvas + overlay are fresh after
    // having been hidden during playback (PDF.js sometimes loses the
    // bitmap on detached canvases).
    await marking.loadPage(marking.pageIdx);
  } else {
    enterConfigView();
  }
});

// Keyboard shortcuts on play view
document.addEventListener('keydown', (e) => {
  if (views.play.hidden) return;
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Space') { e.preventDefault(); session?.toggle(); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); session?.next(); }
  else if (e.code === 'ArrowLeft')  { e.preventDefault(); session?.prev(); }
});

// ============================================================================
//  Boot
// ============================================================================

renderRecent();
showView('upload');
