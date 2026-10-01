// localStorage-backed settings, level progress and weak-spot stats.

const KEYS = {
  settings: 'arpeggioTrainer.settings',
  progress: 'arpeggioTrainer.progress',
  weak: 'arpeggioTrainer.weak',
};

export const DEFAULT_SETTINGS = {
  qualities: ['maj', 'min'],
  roots: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  showNames: true,
  guideKeys: true,
  sound: true,
  freeDirections: ['up', 'down'],
  freeStarts: ['root', 'third', 'fifth', 'seventh'],
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / private mode */ }
}

export function loadSettings() {
  const s = { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
  if (!s.qualities.length) s.qualities = DEFAULT_SETTINGS.qualities.slice();
  if (!s.roots.length) s.roots = DEFAULT_SETTINGS.roots.slice();
  return s;
}
export const saveSettings = (s) => write(KEYS.settings, s);

// progress: { levels: { [id]: { stars, best, accuracy } }, unlockAll }
export function loadProgress() {
  const p = read(KEYS.progress, {});
  p.levels ||= {};
  return p;
}
export const saveProgress = (p) => write(KEYS.progress, p);

export const loadWeak = () => read(KEYS.weak, {});
export const saveWeak = (w) => write(KEYS.weak, w);
export const clearWeak = () => write(KEYS.weak, {});
