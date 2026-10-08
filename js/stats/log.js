// Practice log shared by every app, read by the Statistics page.
//
// The apps already keep lifetime totals (chords per quality, stars, weak
// notes…) but none of them says *when* you practised. This log adds that:
//
//   days  — 'YYYY-MM-DD' → app → { n, ok, miss, ms }   (local dates)
//   hours — app → [24] active ms per hour of the day
//   tally — app → 'root|quality' → [ok, miss]   (chords and arpeggios)
//   runs  — finished sessions (a level, an exercise, a jam set), newest last
//
// Active time only counts the gaps between two events of the same app that
// are close enough (30 s by default), so a tab left open adds nothing.
// Everything lives in localStorage, like the rest of the site.

export const STATS_KEY = 'etude.stats';
export const APPS = ['chords', 'sightreading', 'arpeggio', 'repertoire', 'jam'];
export const MAX_RUNS = 600;
const DEFAULT_GAP_MS = 30000;

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const emptyStats = (now = Date.now()) => ({ v: 1, since: now, days: {}, hours: {}, tally: {}, runs: [] });

export function readStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...emptyStats(), ...s, days: s.days || {}, hours: s.hours || {}, tally: s.tally || {}, runs: s.runs || [] };
    }
  } catch { /* private mode or bad JSON */ }
  return emptyStats();
}

function writeStats(s) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
}

// ---- Pure updates (tested) ----

// One practice event: a chord validated, an arpeggio played, a chunk shown…
// `ms` forces the active time (a whole exercise at once); otherwise it is
// the gap since `lastAt` when that gap is under `maxGap`.
export function applyEvent(s, app, { n = 1, ok = 0, miss = 0, ms, tally, lastAt = 0, maxGap = DEFAULT_GAP_MS } = {}, now = Date.now()) {
  let add = ms;
  if (add == null) {
    const gap = now - lastAt;
    add = lastAt && gap > 0 && gap <= maxGap ? gap : 0;
  }
  add = Math.max(0, Math.round(add));
  const day = s.days[dayKey(now)] ||= {};
  const a = day[app] ||= { n: 0, ok: 0, miss: 0, ms: 0 };
  a.n += n;
  a.ok += ok;
  a.miss += miss;
  a.ms += add;
  const h = s.hours[app] ||= new Array(24).fill(0);
  h[new Date(now).getHours()] += add;
  if (tally) {
    const t = (s.tally[app] ||= {})[tally] ||= [0, 0];
    t[0] += ok;
    t[1] += miss;
  }
  return s;
}

export function applyRun(s, app, data, now = Date.now()) {
  s.runs.push({ app, t: now, ...data });
  if (s.runs.length > MAX_RUNS) s.runs.splice(0, s.runs.length - MAX_RUNS);
  return s;
}

// ---- What the apps call ----

const lastAt = {};

export function track(app, opts = {}) {
  const now = Date.now();
  const s = readStats();
  applyEvent(s, app, { lastAt: lastAt[app] || 0, ...opts }, now);
  lastAt[app] = now;
  writeStats(s);
}

export function logRun(app, data) {
  const s = readStats();
  applyRun(s, app, data);
  writeStats(s);
}
