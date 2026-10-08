// Pure helpers that turn the practice log (log.js) into chart series.
// No DOM, no storage: the Statistics page and the tests both use them.

import { APPS, dayKey } from './log.js';

const DAY = 86400000;

// Noon avoids DST edges when stepping whole days.
export function dayList(n, today = Date.now()) {
  const d = new Date(today);
  d.setHours(12, 0, 0, 0);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(d.getTime() - i * DAY));
  return out;
}

export function dayTotal(day = {}) {
  let ms = 0, n = 0, ok = 0, miss = 0;
  for (const a of Object.values(day)) { ms += a.ms || 0; n += a.n || 0; ok += a.ok || 0; miss += a.miss || 0; }
  return { ms, n, ok, miss };
}

// [{ date, ms, n, byApp: { app: ms } }] for the last `n` days, oldest first.
export function dailySeries(stats, n, today = Date.now()) {
  return dayList(n, today).map((date) => {
    const day = stats.days[date] || {};
    const byApp = {};
    for (const app of APPS) byApp[app] = day[app]?.ms || 0;
    return { date, ...dayTotal(day), byApp };
  });
}

export const practisedDates = (stats) =>
  Object.keys(stats.days).filter((d) => dayTotal(stats.days[d]).n > 0).sort();

// Current streak counts today, or ends yesterday when today has nothing yet.
export function streaks(stats, today = Date.now()) {
  const dates = practisedDates(stats);
  const set = new Set(dates);
  let best = 0, run = 0, prev = null;
  for (const d of dates) {
    run = prev && dayKey(new Date(`${prev}T12:00:00`).getTime() + DAY) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const [y, t] = dayList(2, today);
  let current = 0;
  let cursor = set.has(t) ? t : set.has(y) ? y : null;
  while (cursor && set.has(cursor)) {
    current++;
    cursor = dayKey(new Date(`${cursor}T12:00:00`).getTime() - DAY);
  }
  return { current, best, days: dates.length };
}

export function appTotals(stats) {
  const out = {};
  for (const app of APPS) out[app] = { ms: 0, n: 0, ok: 0, miss: 0, days: 0 };
  for (const day of Object.values(stats.days)) {
    for (const [app, a] of Object.entries(day)) {
      const o = out[app];
      if (!o) continue;
      o.ms += a.ms || 0; o.n += a.n || 0; o.ok += a.ok || 0; o.miss += a.miss || 0;
      if (a.n) o.days++;
    }
  }
  return out;
}

// Active ms per hour of the day, all apps together.
export function hourProfile(stats) {
  const out = new Array(24).fill(0);
  for (const h of Object.values(stats.hours)) h.forEach((v, i) => { out[i] += v || 0; });
  return out;
}

// Active ms per weekday, Monday first.
export function weekdayProfile(stats) {
  const out = new Array(7).fill(0);
  for (const [date, day] of Object.entries(stats.days)) {
    const wd = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    out[wd] += dayTotal(day).ms;
  }
  return out;
}

// Calendar grid: `weeks` columns of Monday→Sunday, ending with this week.
// Cells after today are null.
export function calendar(stats, weeks, today = Date.now()) {
  const d = new Date(today);
  d.setHours(12, 0, 0, 0);
  const wd = (d.getDay() + 6) % 7;
  const start = d.getTime() - (wd + (weeks - 1) * 7) * DAY;
  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const t = start + (w * 7 + i) * DAY;
      if (t > d.getTime()) { col.push(null); continue; }
      const date = dayKey(t);
      col.push({ date, ...dayTotal(stats.days[date]) });
    }
    cols.push(col);
  }
  return cols;
}

export const runsOf = (stats, app) => stats.runs.filter((r) => r.app === app);

// Rolling mean, used to smooth accuracy lines.
export function rolling(values, k = 5) {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - k + 1), i + 1);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
}

export function formatDuration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return ms > 0 ? '<1 min' : '0 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')}`;
}
