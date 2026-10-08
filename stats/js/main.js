// Statistics page: reads what every trainer keeps in localStorage plus the
// shared practice log (js/stats/log.js) and draws it. Nothing is written
// here except the reset of the practice log.

import { readStats, APPS, STATS_KEY } from '../../js/stats/log.js';
import {
  dailySeries, streaks, appTotals, hourProfile, weekdayProfile, calendar, runsOf, rolling, formatDuration, dayList,
} from '../../js/stats/compute.js';
import { CHORD_FORMULAS, NOTE_NAMES, NOTE_DISPLAY } from '../../js/core/theory.js';
import { LEVELS as READ_LEVELS } from '../../sightreading/js/levels.js';
import { LEVELS as ARP_LEVELS } from '../../arpeggio/js/levels.js';
import { parseWeakKey } from '../../arpeggio/js/engine.js';
import { STYLES } from '../../jam/js/styles.js';
import {
  bars, stacked, calendarHeat, line, keyboardHeat, hbars, coverage, starRow, fifthsHeat, midiName,
} from './charts.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

const NAMES = { chords: 'Chords', sightreading: 'Sight-reading', arpeggio: 'Arpeggios', repertoire: 'Repertoire', jam: 'Ghost Jam' };
const QUALITIES = Object.keys(CHORD_FORMULAS);
const OUTER_Q = new Set(['maj', 'maj7', 'dom7', 'aug']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pct = (x) => `${Math.round(x * 100)}%`;
const num = (x) => Math.round(x).toLocaleString('en-US');
const mins = (m) => `${Math.round(m)}m`;
const hrs = (h) => `${+h.toFixed(1)}h`;
const toMin = (ms) => ms / 60000;
const toH = (ms) => ms / 3600000;
const shortDate = (d) => { const [, m, day] = d.split('-'); return `${Number(day)} ${MONTHS[m - 1]}`; };
const longDate = (d) => { const dt = new Date(`${d}T12:00:00`); return `${WEEKDAYS[(dt.getDay() + 6) % 7]} ${shortDate(d)}`; };
const runDate = (t) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

// Root strings come as 'C#', 'Db' or 'D♭' depending on the app.
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function pcOf(root) {
  const m = /^([A-G])([#b♯♭]*)$/.exec(String(root).trim());
  if (!m) return -1;
  let pc = LETTER[m[1]];
  for (const c of m[2]) pc += c === '#' || c === '♯' ? 1 : -1;
  return (pc + 12) % 12;
}
const qName = (q) => CHORD_FORMULAS[q]?.name || q;
const chordLabel = (pc, q) => `${NOTE_DISPLAY[NOTE_NAMES[pc]]}${CHORD_FORMULAS[q]?.suffix ?? ''}`;

// ---- Everything the trainers store ----

function loadAll() {
  return {
    log: readStats(),
    chords: {
      ach: read('chordTrainer.achievements', {}),
      best: read('chordTrainer.rewards', {}).best || 0,
      goal: read('chordTrainer.dailyGoal', {}),
    },
    read: { progress: read('readTrainer.progress', {}), ach: read('readTrainer.achievements', {}) },
    arp: {
      progress: read('arpeggioTrainer.progress', {}),
      weak: read('arpeggioTrainer.weak', {}),
      ach: read('arpeggioTrainer.achievements', {}),
    },
    rep: { recent: read('scoretrainer.recent', []), markings: read('scoretrainer.markings', {}) },
    jam: { scores: read('ghostJam.scores', {}) },
  };
}

let D = loadAll();

// ---- Layout helpers ----

const tile = (label, value, sub = '') => `<div class="tile"><div class="tile-label">${esc(label)}</div><div class="tile-value">${value}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ''}</div>`;
const tiles = (...t) => `<div class="tiles">${t.join('')}</div>`;
const card = (title, body, { sub = '', wide = false, id = '' } = {}) =>
  `<section class="card${wide ? ' wide' : ''}"${id ? ` id="${id}"` : ''}><h2 class="card-title">${esc(title)}</h2>${sub ? `<p class="card-sub">${sub}</p>` : ''}<div class="card-body">${body}</div></section>`;
const empty = (msg) => `<p class="empty">${esc(msg)}</p>`;
const legend = (items) => `<div class="legend">${items.map(([cls, label]) => `<span><i class="sw ${cls}"></i>${esc(label)}</span>`).join('')}</div>`;
const heatLegend = (lo, hi) => `<div class="legend heat-legend"><span>${esc(lo)}</span>${[0, 1, 2, 3, 4].map((l) => `<i class="sw heat-sw h${l}"></i>`).join('')}<span>${esc(hi)}</span></div>`;

// Charts are filled in after the cards exist, at their measured width.
let pending = [];
const slot = (fn) => { const id = `c${pending.length}`; pending.push([id, fn]); return `<div class="chart-slot" id="${id}"></div>`; };
function drawSlots() {
  for (const [id, fn] of pending) {
    const el = $(id);
    if (el) el.innerHTML = fn(Math.max(240, el.clientWidth));
  }
}

function last30(app) {
  return dailySeries(D.log, 30).map((d) => ({ ...d, ms: app ? d.byApp[app] : d.ms }));
}

// ---- Overview ----

function achievementsCount() {
  const c = Object.keys(D.chords.ach.unlocked || {}).length;
  const r = Object.values(D.read.ach || {}).filter(Boolean).length;
  const a = Object.keys(D.arp.ach.unlocked || {}).length;
  const jam = read('ghostJam.achievements', null);
  const j = jam && typeof jam === 'object' ? Object.keys(jam.unlocked || jam).length : 0;
  return c + r + a + j;
}

function renderOverview() {
  const st = streaks(D.log);
  const totals = appTotals(D.log);
  const totalMs = APPS.reduce((s, a) => s + totals[a].ms, 0);
  const hasLog = st.days > 0;
  const chordsDone = Object.entries(D.chords.ach.counters || {}).filter(([k]) => k.startsWith('quality.')).reduce((s, [, v]) => s + v, 0);
  const readC = D.read.progress.counters || {};
  const arpC = D.arp.ach.counters || {};
  const jamRuns = runsOf(D.log, 'jam');

  let html = tiles(
    tile('Time played', formatDuration(totalMs), hasLog ? `over ${st.days} day${st.days > 1 ? 's' : ''}` : 'starts now'),
    tile('Streak', `${st.current}<small> day${st.current === 1 ? '' : 's'}</small>`, `best ${st.best}`),
    tile('Chords played', num(chordsDone), `${num(readC.notes || 0)} notes read`),
    tile('Achievements', num(achievementsCount()), 'unlocked across the trainers'),
  );

  const weeksFor = (w) => Math.max(8, Math.min(53, Math.floor((w - 22) / 14)));
  html += card('Practice calendar', slot((w) => calendarHeat({
    width: w, cols: calendar(D.log, weeksFor(w)), monthLabel: (d) => MONTHS[d.slice(5, 7) - 1],
    fmtTip: (c) => `${longDate(c.date)} · ${c.ms ? formatDuration(c.ms) : c.n ? 'a few seconds' : 'no practice'}`,
  })) + heatLegend('Less', 'More'), { wide: true, sub: 'Each square is a day. The darker, the longer you played.' });

  html += card('Last 30 days', slot((w) => {
    const days = dailySeries(D.log, 30);
    return stacked({
      width: w, keys: APPS, names: NAMES, fmt: mins, every: w < 500 ? 7 : 5,
      rows: days.map((d) => ({ label: shortDate(d.date), parts: Object.fromEntries(APPS.map((a) => [a, toMin(d.byApp[a])])), date: d.date })),
      tipLabel: (r) => longDate(r.date),
    });
  }) + legend(APPS.map((a) => [`f-bg-${a}`, NAMES[a]])), { wide: true, sub: 'Minutes played per day, by trainer.' });

  const hours = hourProfile(D.log);
  const peak = hours.indexOf(Math.max(...hours));
  html += `<div class="grid2">`
    + card('Time of day', hasLog ? slot((w) => bars({
      width: w, values: hours.map(toH), labels: hours.map((_, i) => `${i}h`), every: w < 420 ? 6 : 3, fmt: hrs, highlight: peak,
      tips: hours.map((v, i) => `${i}:00 to ${i + 1}:00 · ${formatDuration(v)}`),
    })) : empty('Play a little and your favourite hours show up here.'), { sub: hours[peak] ? `You play most around ${peak}:00.` : '' })
    + card('Day of the week', hasLog ? slot((w) => {
      const wd = weekdayProfile(D.log);
      return bars({ width: w, values: wd.map(toH), labels: WEEKDAYS, fmt: hrs, highlight: wd.indexOf(Math.max(...wd)), tips: wd.map((v, i) => `${WEEKDAYS[i]} · ${formatDuration(v)}`) });
    }) : empty('Nothing yet.'))
    + `</div>`;

  html += `<div class="grid2">`
    + card('Time per trainer', hbars(APPS.map((a) => ({
      label: NAMES[a], swatch: a, value: totals[a].ms, cls: `f-bg-${a}`, text: formatDuration(totals[a].ms),
      tip: `${NAMES[a]} · ${formatDuration(totals[a].ms)} · ${totals[a].days} day${totals[a].days === 1 ? '' : 's'}`,
    }))))
    + card('Lifetime', `<dl class="facts">
        <dt>Chords validated</dt><dd>${num(chordsDone)}</dd>
        <dt>Longest chord streak</dt><dd>${num(D.chords.best)}</dd>
        <dt>Notes read</dt><dd>${num(readC.notes || 0)}</dd>
        <dt>Arpeggios played</dt><dd>${num(arpC['arps.total'] || totals.arpeggio.n)}</dd>
        <dt>Pieces in Repertoire</dt><dd>${num(D.rep.recent.length)}</dd>
        <dt>Jam sets</dt><dd>${num(jamRuns.length)}</dd>
      </dl>`)
    + `</div>`;
  return html;
}

// ---- Chords ----

let cofFilter = 'all';

function chordTally() {
  // pc → quality → count. The log's tally when there is one, else the
  // achievements' "played at least once" sets.
  const t = D.log.tally.chords || {};
  const out = {};
  for (const [k, [ok]] of Object.entries(t)) {
    const [root, q] = k.split('|');
    const pc = pcOf(root);
    if (pc < 0) continue;
    (out[pc] ||= {})[q] = (out[pc][q] || 0) + ok;
  }
  return out;
}

function cofData(tally, filter, verb = 'played') {
  const outer = {}, inner = {};
  for (let pc = 0; pc < 12; pc++) {
    const byQ = tally[pc] || {};
    for (const [ring, set] of [[outer, (q) => OUTER_Q.has(q)], [inner, (q) => !OUTER_Q.has(q)]]) {
      const qs = Object.keys(byQ).filter((q) => set(q) && (filter === 'all' || q === filter));
      const value = qs.reduce((s, q) => s + byQ[q], 0);
      if (!value) continue;
      const detail = qs.sort((a, b) => byQ[b] - byQ[a]).map((q) => `${chordLabel(pc, q)} ×${byQ[q]}`).join(', ');
      ring[pc] = { value, tip: `${value} ${verb} · ${detail}` };
    }
  }
  return { outer, inner };
}

function renderChords() {
  const ach = D.chords.ach;
  const counters = ach.counters || {};
  const byQ = QUALITIES.map((q) => [q, counters[`quality.${q}`] || 0]);
  const total = byQ.reduce((s, [, v]) => s + v, 0);
  const rootSets = ach.rootSets || {};
  const distinct = QUALITIES.reduce((s, q) => s + (rootSets[q] || []).length, 0);
  const goal = D.chords.goal || {};
  const goldDays = Object.values(goal.history || {}).filter((t) => t >= 3).length;

  let html = tiles(
    tile('Chords validated', num(total)),
    tile('Best streak', num(D.chords.best), 'chords in a row'),
    tile('Different chords', `${distinct}<small> / ${QUALITIES.length * 12}</small>`, 'roots × qualities'),
    tile('Daily goal', `${goal.streak || 0}<small> day${goal.streak === 1 ? '' : 's'}</small>`, `${goldDays} gold day${goldDays === 1 ? '' : 's'}`),
  );

  if (!total) return html + card('Nothing yet', empty('Validate a few chords in the Chords trainer and they show up here.'), { wide: true });

  const tally = chordTally();
  const hasTally = Object.keys(tally).length > 0;
  const chips = ['all', ...QUALITIES].map((q) => `<button type="button" class="chip${q === cofFilter ? ' is-on' : ''}" data-cof="${q}">${q === 'all' ? 'All' : esc(CHORD_FORMULAS[q].suffix || 'maj')}</button>`).join('');
  const top = [];
  for (const [pc, byQ2] of Object.entries(tally)) {
    for (const [q, v] of Object.entries(byQ2)) if (cofFilter === 'all' || q === cofFilter) top.push({ label: chordLabel(Number(pc), q), v });
  }
  top.sort((a, b) => b.v - a.v);
  const rare = top.slice(-5).reverse();
  html += card('Circle of fifths', hasTally
    ? `<div class="chips">${chips}</div><div class="cof-layout"><div class="cof-wrap">${slot((w) => {
      const { outer, inner } = cofData(tally, cofFilter);
      const n = [...Object.values(outer), ...Object.values(inner)].reduce((s, c) => s + c.value, 0);
      return fifthsHeat({ size: Math.min(w, 420), outer, inner, center: num(n), centerSub: cofFilter === 'all' ? 'chords' : qName(cofFilter) });
    })}${heatLegend('Rarely', 'Often')}</div>
    <div class="cof-side">${top.length ? `<h3 class="mini-title">Most played</h3>${hbars(top.slice(0, 8).map((t) => ({ label: t.label, value: t.v, text: num(t.v), cls: 'f-bg-gold' })))}
      ${top.length > 8 ? `<h3 class="mini-title">Least played</h3>${hbars(rare.map((t) => ({ label: t.label, value: t.v, text: num(t.v), cls: 'f-bg-gold' })), { max: top[0].v })}` : ''}` : empty('Nothing with this quality yet.')}</div></div>`
    : empty('The circle fills in as you play from now on.'),
  { wide: true, sub: 'Outer ring: major, 7th and augmented chords. Inner ring: minor, diminished and half-diminished, on their own root.' });

  html += `<div class="grid2">`
    + card('By quality', hbars(byQ.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([q, v]) => ({ label: qName(q), value: v, text: num(v), cls: 'f-bg-chords' }))))
    + card('Chords per day', slot((w) => {
      const days = dailySeries(D.log, 30).map((d) => ({ date: d.date, v: D.log.days[d.date]?.chords?.ok || 0 }));
      return bars({ width: w, values: days.map((d) => d.v), labels: days.map((d) => shortDate(d.date)), every: 7, cls: 'f-chords', tips: days.map((d) => `${longDate(d.date)} · ${d.v} chord${d.v === 1 ? '' : 's'}`) });
    }), { sub: 'Last 30 days.' })
    + `</div>`;

  html += card('Coverage', coverage({
    rows: QUALITIES, cols: NOTE_NAMES.map((n) => NOTE_DISPLAY[n]),
    rowLabel: (q) => CHORD_FORMULAS[q].suffix || 'maj',
    has: (q, c) => (rootSets[q] || []).some((r) => NOTE_DISPLAY[NOTE_NAMES[pcOf(r)]] === c),
    tip: (q, c) => `${c}${CHORD_FORMULAS[q].suffix} · ${(rootSets[q] || []).some((r) => NOTE_DISPLAY[NOTE_NAMES[pcOf(r)]] === c) ? 'played' : 'not yet'}`,
  }), { wide: true, sub: 'Every chord you have validated at least once.' });

  const presets = Object.entries(counters).filter(([k]) => k.startsWith('preset.')).map(([k, v]) => [k.slice(7), v]);
  const PRESET_NAMES = { firstTimer: 'First Timer', beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert' };
  const goalDays = dayList(70);
  const TIER = ['none', 'Bronze', 'Silver', 'Gold'];
  html += `<div class="grid2">`
    + card('By level', presets.length ? hbars(presets.sort((a, b) => b[1] - a[1]).map(([p, v]) => ({ label: PRESET_NAMES[p] || p, value: v, text: num(v), cls: 'f-bg-chords' }))) : empty('Pick a preset to see it here.'),
      { sub: counters['time.expert'] ? `${formatDuration(counters['time.expert'] * 1000)} of active play in Expert.` : '' })
    + card('Daily goals', `<div class="goal-grid">${goalDays.map((d) => {
      const t = goal.history?.[d] || 0;
      return `<span class="goal-dot t${t}" data-tip="${esc(`${longDate(d)} · ${t ? TIER[t] : 'no goal reached'}`)}"></span>`;
    }).join('')}</div>${legend([['t1', 'Bronze'], ['t2', 'Silver'], ['t3', 'Gold']])}`, { sub: 'The last 10 weeks, one dot per day.' })
    + `</div>`;
  return html;
}

// ---- Sight-reading ----

function renderSightreading() {
  const p = D.read.progress;
  const c = p.counters || {};
  const levels = p.levels || {};
  const stars = READ_LEVELS.reduce((s, l) => s + (levels[l.id]?.stars || 0), 0);
  const runs = runsOf(D.log, 'sightreading');
  const notes = p.notes || {};

  let html = tiles(
    tile('Exercises', num(c.exercises || 0), `${num(c.tempoRuns || 0)} in Tempo mode`),
    tile('Notes read', num(c.notes || 0)),
    tile('Clean runs', num(c.cleanRuns || 0), 'no wrong note'),
    tile('Stars', `${stars}<small> / ${READ_LEVELS.length * 3}</small>`),
  );
  if (!c.exercises) return html + card('Nothing yet', empty('Finish an exercise in Sight-reading and your stats show up here.'), { wide: true });

  html += card('Where the misses are', slot((w) => keyboardHeat({ width: w, notes })) + `<div class="legend heat-legend"><span>Never missed</span>${[0, 1, 2, 3, 4].map((l) => `<i class="sw key-sw k${l}"></i>`).join('')}<span>Often missed</span><span class="legend-gap"><i class="sw key-sw k-none"></i>Not read yet</span></div>`,
    { wide: true, sub: 'Every key you have read, coloured by how often you missed it.' });

  const weakest = Object.entries(notes).filter(([, s]) => s.seen + s.errors >= 4 && s.errors > 0)
    .map(([m, s]) => ({ m: Number(m), rate: s.errors / (s.seen + s.errors), s }))
    .sort((a, b) => b.rate - a.rate).slice(0, 8);
  html += `<div class="grid2">`
    + card('Accuracy over time', runs.length ? slot((w) => {
      const pts = runs.map((r) => ({ y: r.acc, label: runDate(r.t), tip: `${runDate(r.t)} · ${READ_LEVELS.find((l) => l.id === r.level)?.name || r.level} · ${r.mode} · ${pct(r.acc)}` }));
      return line({ width: w, points: pts, smooth: rolling(pts.map((p) => p.y), 5), yMin: Math.min(0.5, Math.floor(Math.min(...pts.map((p) => p.y)) * 10) / 10) });
    }) : empty('Your next exercises draw this line.'), { sub: 'Each dot is an exercise. The line is the average of the last five.' })
    + card('Trickiest notes', weakest.length ? hbars(weakest.map((x) => ({ label: midiName(x.m), value: x.rate, text: pct(x.rate), cls: 'f-bg-miss', tip: `${midiName(x.m)} · missed ${x.s.errors} of ${x.s.seen + x.s.errors}` })), { max: Math.max(0.2, weakest[0].rate) }) : empty('No note stands out. Nice.'))
    + `</div>`;

  html += card('Levels', `<div class="levels">${READ_LEVELS.map((l, i) => {
    const lv = levels[l.id] || {};
    return `<div class="level-row${lv.plays ? '' : ' is-dim'}">
      <span class="level-n">${i + 1}</span><span class="level-name">${esc(l.name)}</span>${starRow(lv.stars || 0)}
      <span class="level-meta">${lv.plays ? `${lv.plays} play${lv.plays > 1 ? 's' : ''} · wait ${pct(lv.bestWait || 0)} · tempo ${pct(lv.bestTempo || 0)}` : 'not played'}</span>
    </div>`;
  }).join('')}</div>`, { wide: true });
  return html;
}

// ---- Arpeggios ----

const START = ['root', '3rd', '5th', '7th'];
function weakLabel(key) {
  const w = parseWeakKey(key);
  const pc = pcOf(w.root);
  const dir = w.direction === 'up' ? '↑' : w.direction === 'down' ? '↓' : '↕';
  return `${pc >= 0 ? chordLabel(pc, w.quality) : w.root} ${dir} from the ${START[w.start] || 'root'}`;
}

function renderArpeggios() {
  const prog = D.arp.progress.levels || {};
  const counters = D.arp.ach.counters || {};
  const totals = appTotals(D.log).arpeggio;
  const cleared = ARP_LEVELS.filter((l) => (prog[l.id]?.stars || 0) > 0).length;
  const stars = ARP_LEVELS.reduce((s, l) => s + (prog[l.id]?.stars || 0), 0);
  const runs = runsOf(D.log, 'arpeggio');
  const played = counters['arps.total'] || totals.n;

  let html = tiles(
    tile('Arpeggios played', num(played), totals.n ? `${pct(totals.ok / totals.n)} clean` : ''),
    tile('Best combo', num(counters['combo.best'] || 0), 'clean in a row'),
    tile('Levels cleared', `${cleared}<small> / ${ARP_LEVELS.length}</small>`),
    tile('Stars', `${stars}<small> / ${ARP_LEVELS.length * 3}</small>`),
  );
  if (!played && !cleared) return html + card('Nothing yet', empty('Play a level in Arpeggios and your stats show up here.'), { wide: true });

  html += card('Clean and rough, day by day', slot((w) => {
    const days = dailySeries(D.log, 30);
    return stacked({
      width: w, keys: ['ok', 'miss'], names: { ok: 'clean', miss: 'with slips' }, every: w < 500 ? 7 : 5,
      rows: days.map((d) => ({ label: shortDate(d.date), date: d.date, parts: { ok: D.log.days[d.date]?.arpeggio?.ok || 0, miss: D.log.days[d.date]?.arpeggio?.miss || 0 } })),
      tipLabel: (r) => longDate(r.date),
    });
  }) + legend([['f-bg-ok', 'Clean'], ['f-bg-miss', 'With slips']]), { wide: true, sub: 'Arpeggios per day, last 30 days.' });

  const tally = {};
  for (const [k, [ok, miss]] of Object.entries(D.log.tally.arpeggio || {})) {
    const [root, q] = k.split('|');
    const pc = pcOf(root);
    if (pc >= 0) (tally[pc] ||= {})[q] = (tally[pc][q] || 0) + ok + miss;
  }
  const weak = Object.entries(D.arp.weak).filter(([, s]) => s.tries > 0 && s.tries - s.clean > 0)
    .map(([k, s]) => ({ k, s, rate: (s.tries - s.clean) / s.tries })).sort((a, b) => b.rate - a.rate || b.s.tries - a.s.tries).slice(0, 8);

  html += `<div class="grid2">`
    + card('Circle of fifths', Object.keys(tally).length ? `<div class="cof-wrap">${slot((w) => {
      const { outer, inner } = cofData(tally, 'all');
      const n = [...Object.values(outer), ...Object.values(inner)].reduce((s, c) => s + c.value, 0);
      return fifthsHeat({ size: Math.min(w, 360), outer, inner, center: num(n), centerSub: 'arpeggios' });
    })}</div>${heatLegend('Rarely', 'Often')}` : empty('The circle fills in as you play from now on.'), { sub: 'Which keys your arpeggios live in.' })
    + card('Weak spots', weak.length ? hbars(weak.map((x) => ({ label: weakLabel(x.k), value: x.rate, text: pct(x.rate), cls: 'f-bg-miss', tip: `${weakLabel(x.k)} · ${x.s.tries - x.s.clean} rough of ${x.s.tries}` })), { max: 1 }) : empty('No weak spot right now.'),
      { sub: 'Share of tries with a slip. The Weak spots mode drills these.' })
    + `</div>`;

  html += card('Accuracy per session', runs.length ? slot((w) => {
      const pts = runs.map((r) => ({ y: r.acc, label: runDate(r.t), tip: `${runDate(r.t)} · ${r.kind === 'level' ? `Level ${r.level}` : r.kind === 'weak' ? 'Weak spots' : 'Free practice'} · ${pct(r.acc)}${r.stars != null ? ` · ${r.stars}★` : ''}` }));
      return line({ width: w, points: pts, smooth: rolling(pts.map((p) => p.y), 5), yMin: Math.min(0.5, Math.floor(Math.min(...pts.map((p) => p.y)) * 10) / 10) });
    }) : empty('Finish a session to start this line.'), { wide: true, sub: 'Each dot is a session. The line is the average of the last five.' });
  html += card('The path', `<div class="levels">${ARP_LEVELS.map((l) => {
      const lv = prog[l.id] || {};
      return `<div class="level-row${lv.stars ? '' : ' is-dim'}"><span class="level-n">${l.id}</span><span class="level-name">${esc(l.name)}</span>${starRow(lv.stars || 0)}<span class="level-meta">${lv.best ? `${num(lv.best)} pts · ${pct(lv.accuracy || 0)}` : ''}</span></div>`;
    }).join('')}</div>`, { wide: true });
  return html;
}

// ---- Repertoire ----

function renderRepertoire() {
  const runs = runsOf(D.log, 'repertoire');
  const totals = appTotals(D.log).repertoire;
  const recent = D.rep.recent;
  let html = tiles(
    tile('Pieces', num(recent.length), 'in your recent list'),
    tile('Time drilled', formatDuration(totals.ms)),
    tile('Passages shown', num(totals.n)),
    tile('Drills', num(runs.length), runs.length ? `${num(runs.reduce((s, r) => s + (r.rounds || 1), 0))} rounds` : ''),
  );
  if (!recent.length && !totals.n) return html + card('Nothing yet', empty('Load a piece in Repertoire and drill it. Your stats show up here.'), { wide: true });

  html += card('Time per day', slot((w) => {
    const days = last30('repertoire');
    return bars({ width: w, values: days.map((d) => toMin(d.ms)), labels: days.map((d) => shortDate(d.date)), every: 7, fmt: mins, cls: 'f-repertoire', tips: days.map((d) => `${longDate(d.date)} · ${formatDuration(d.ms)}`) });
  }), { wide: true, sub: 'Last 30 days.' });

  const byHash = {};
  for (const r of runs) {
    const k = r.hash || r.piece;
    const e = byHash[k] ||= { drills: 0, ms: 0, chunks: 0 };
    e.drills++; e.ms += r.ms || 0; e.chunks += r.chunks || 0;
  }
  html += card('Your pieces', recent.length ? `<div class="pieces">${recent.map((p) => {
    const m = D.rep.markings[p.hash];
    const systems = m?.pages ? m.pages.reduce((s, pg) => s + (pg.systems?.length || 0), 0) : 0;
    const e = byHash[p.hash] || byHash[p.name] || { drills: 0, ms: 0 };
    return `<div class="piece"><span class="piece-kind">${p.kind === 'midi' ? 'MIDI' : 'PDF'}</span><span class="piece-name">${esc(p.name || 'Untitled')}</span>
      <span class="piece-meta">${systems ? `${systems} systems marked · ` : ''}${e.drills ? `${e.drills} drill${e.drills > 1 ? 's' : ''} · ${formatDuration(e.ms)}` : 'not drilled since stats began'}</span></div>`;
  }).join('')}</div>` : empty('Your recent list is empty.'), { wide: true });
  return html;
}

// ---- Ghost Jam ----

const RANKS = ['S', 'A', 'B', 'C', 'D'];
function renderJam() {
  const runs = runsOf(D.log, 'jam');
  const scores = D.jam.scores || {};
  const hi = Object.entries(scores).map(([k, v]) => { const [tune, style] = k.split('|'); return { tune, style, ...v }; }).sort((a, b) => b.score - a.score);
  const best = Math.max(0, ...hi.map((h) => h.score), ...runs.map((r) => r.score || 0));
  const avg = runs.length ? runs.reduce((s, r) => s + (r.acc || 0), 0) / runs.length : 0;

  let html = tiles(
    tile('Sets played', num(runs.length)),
    tile('Best score', num(best)),
    tile('Average accuracy', runs.length ? pct(avg) : '·'),
    tile('Best combo', num(Math.max(0, ...runs.map((r) => r.combo || 0)))),
  );
  if (!runs.length && !hi.length) return html + card('Nothing yet', empty('Play a set in Ghost Jam and your scores show up here.'), { wide: true });

  if (runs.length) {
    html += card('Score per set', slot((w) => {
      const top = Math.max(...runs.map((r) => r.score));
      const pts = runs.map((r) => ({ y: r.score, label: runDate(r.t), tip: `${runDate(r.t)} · ${r.tune} · ${STYLES[r.style]?.name || r.style} · ${num(r.score)} · rank ${r.rank}` }));
      return line({ width: w, points: pts, smooth: rolling(pts.map((p) => p.y), 5), yMax: Math.ceil((top || 1) / 5000) * 5000, fmt: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : num(v)), cls: 'jam' });
    }), { wide: true, sub: 'Each dot is a set. The line is the average of the last five.' });

    const sum = (k) => runs.reduce((s, r) => s + (r[k] || 0), 0);
    const grades = [['perfect', 'Perfect'], ['good', 'Good'], ['late', 'Late'], ['miss', 'Miss']];
    const all = grades.reduce((s, [k]) => s + sum(k), 0) || 1;
    const styleCount = {};
    for (const r of runs) styleCount[r.style] = (styleCount[r.style] || 0) + 1;
    const rankCount = Object.fromEntries(RANKS.map((r) => [r, runs.filter((x) => x.rank === r).length]));
    html += `<div class="grid2">`
      + card('Chord grades', hbars(grades.map(([k, label]) => ({ label, value: sum(k) / all, text: `${pct(sum(k) / all)} · ${num(sum(k))}`, cls: `f-bg-grade-${k}` })), { max: 1 }), { sub: 'Every chord you have played on the band, all sets together.' })
      + card('Ranks', hbars(RANKS.map((r) => ({ label: r, value: rankCount[r], text: num(rankCount[r]), cls: 'f-bg-jam' }))))
      + `</div>`;
    html += card('Grooves', hbars(Object.entries(styleCount).sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ label: STYLES[s]?.name || s, value: n, text: `${n} set${n > 1 ? 's' : ''}`, cls: 'f-bg-jam' }))), { wide: true });
  }

  if (hi.length) {
    html += card('High scores', `<table class="table"><thead><tr><th>Tune</th><th>Groove</th><th class="num">Score</th><th>Rank</th><th>Date</th></tr></thead><tbody>${hi.map((h) => `
      <tr><td>${esc(h.tune)}</td><td>${esc(STYLES[h.style]?.name || h.style)}</td><td class="num">${num(h.score)}</td><td><span class="rank">${esc(h.rank || '·')}</span></td><td>${h.date ? runDate(h.date) : ''}</td></tr>`).join('')}</tbody></table>`, { wide: true });
  }
  return html;
}

// ---- Tabs, tooltip, reset ----

const RENDER = { all: renderOverview, chords: renderChords, sightreading: renderSightreading, arpeggio: renderArpeggios, repertoire: renderRepertoire, jam: renderJam };
let tab = RENDER[location.hash.slice(1)] ? location.hash.slice(1) : 'all';

function render() {
  pending = [];
  for (const b of document.querySelectorAll('.tab')) {
    const on = b.dataset.tab === tab;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', String(on));
  }
  $('panel').innerHTML = RENDER[tab]();
  drawSlots();
}

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  tab = b.dataset.tab;
  history.replaceState(null, '', tab === 'all' ? location.pathname : `#${tab}`);
  render();
});

$('panel').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-cof]');
  if (chip) { cofFilter = chip.dataset.cof; render(); }
});

// One tooltip for every mark: follows the pointer, or sticks on tap.
const tipEl = $('tip');
function showTip(target, x, y) {
  tipEl.textContent = target.dataset.tip;
  tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
  const top = y - r.height - 14 < 8 ? y + 18 : y - r.height - 14;
  tipEl.style.transform = `translate(${left}px, ${top}px)`;
}
document.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  const t = e.target.closest?.('[data-tip]');
  if (t) showTip(t, e.clientX, e.clientY); else tipEl.hidden = true;
});
document.addEventListener('click', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (t) showTip(t, e.clientX, e.clientY); else tipEl.hidden = true;
});
window.addEventListener('scroll', () => { tipEl.hidden = true; }, { passive: true });

$('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset your statistics? The practice calendar, times and charts start again from zero. Stars, achievements and high scores in the trainers are kept.')) return;
  try { localStorage.removeItem(STATS_KEY); } catch { /* ignore */ }
  D = loadAll();
  render();
});

let resizeT = 0, lastW = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastW) return;
  lastW = window.innerWidth;
  clearTimeout(resizeT);
  resizeT = setTimeout(render, 150);
});

// Another tab may have just recorded practice.
window.addEventListener('storage', () => { D = loadAll(); render(); });

render();
