// Storage layer for Score Trainer.
//   - Markings, recent list and config live in localStorage (small JSON).
//   - The actual file BYTES live in IndexedDB (a 10 MB PDF would never fit
//     in the 5 MB localStorage quota, and base64-encoding to squeeze it in
//     is silly when IDB exists). Files are keyed by the same SHA-256 prefix
//     as markings, so a single hash links the bytes, the markings and the
//     recent-list entry.

const KEY_MARKINGS = 'scoretrainer.markings';
const KEY_RECENT   = 'scoretrainer.recent';
const KEY_CONFIG   = 'scoretrainer.config';

const MAX_RECENT = 8;

const DB_NAME = 'scoretrainer';
const DB_VERSION = 1;
const STORE_FILES = 'files';

export async function hashFile(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes.slice(0, 12))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* quota — silently drop */ }
}

export function saveMarkings(hash, markings) {
  const all = readJson(KEY_MARKINGS, {});
  all[hash] = markings;
  writeJson(KEY_MARKINGS, all);
}
export function loadMarkings(hash) {
  return readJson(KEY_MARKINGS, {})[hash] || null;
}
export function deleteMarkings(hash) {
  const all = readJson(KEY_MARKINGS, {});
  delete all[hash];
  writeJson(KEY_MARKINGS, all);
}

export function saveConfig(cfg) { writeJson(KEY_CONFIG, cfg); }
export function loadConfig() {
  return readJson(KEY_CONFIG, { chunkSize: 4, displayTime: 300 });
}

// Recent list: [{ hash, name, kind: 'pdf' | 'midi', addedAt, size }]
export function pushRecent(entry) {
  const list = readJson(KEY_RECENT, []).filter(e => e.hash !== entry.hash);
  list.unshift({ ...entry, addedAt: Date.now() });
  // Stick to MAX_RECENT — and evict the dropped entries' blobs from IDB so
  // we don't accumulate orphan data nobody can reach from the UI anymore.
  const trimmed = list.slice(0, MAX_RECENT);
  const evicted = list.slice(MAX_RECENT);
  writeJson(KEY_RECENT, trimmed);
  for (const e of evicted) deleteFileBlob(e.hash).catch(() => { /* best-effort */ });
}
export function listRecent() { return readJson(KEY_RECENT, []); }
export function removeRecent(hash) {
  writeJson(KEY_RECENT, readJson(KEY_RECENT, []).filter(e => e.hash !== hash));
  deleteMarkings(hash);
  deleteFileBlob(hash).catch(() => { /* best-effort */ });
}

// ---------------------------------------------------------------------------
// IndexedDB blob store
// ---------------------------------------------------------------------------

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise.catch((err) => { dbPromise = null; throw err; });
}

function txPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveFileBlob(hash, blob) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_FILES, 'readwrite');
    tx.objectStore(STORE_FILES).put(blob, hash);
    await txPromise(tx);
  } catch (err) {
    // Quota or private-mode failure shouldn't block the upload flow — the
    // user can still use the file this session, just no quick-restore.
    console.warn('saveFileBlob failed:', err);
  }
}

export async function loadFileBlob(hash) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readonly');
      const req = tx.objectStore(STORE_FILES).get(hash);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteFileBlob(hash) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_FILES, 'readwrite');
    tx.objectStore(STORE_FILES).delete(hash);
    await txPromise(tx);
  } catch { /* ignore */ }
}
