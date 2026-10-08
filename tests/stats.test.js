import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStats, applyEvent, applyRun, dayKey, MAX_RUNS } from '../js/stats/log.js';
import { streaks, dailySeries, calendar, appTotals, hourProfile, weekdayProfile, rolling, formatDuration } from '../js/stats/compute.js';

const at = (date, h = 12, m = 0, s = 0) => new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`).getTime();

test('active time counts close gaps only', () => {
  const s = emptyStats();
  const t0 = at('2026-10-01', 20);
  applyEvent(s, 'chords', { ok: 1 }, t0);
  applyEvent(s, 'chords', { ok: 1, lastAt: t0 }, t0 + 10000);
  applyEvent(s, 'chords', { ok: 1, lastAt: t0 + 10000 }, t0 + 10000 + 60000); // too long: idle
  const d = s.days['2026-10-01'].chords;
  assert.deepEqual(d, { n: 3, ok: 3, miss: 0, ms: 10000 });
  assert.equal(s.hours.chords[20], 10000);
});

test('explicit ms, custom max gap and tallies', () => {
  const s = emptyStats();
  const t = at('2026-10-02', 9);
  applyEvent(s, 'sightreading', { ok: 20, miss: 2, ms: 90000 }, t);
  applyEvent(s, 'repertoire', { lastAt: t - 100000, maxGap: 120000 }, t);
  applyEvent(s, 'arpeggio', { ok: 1, tally: 'C|maj' }, t);
  applyEvent(s, 'arpeggio', { miss: 1, tally: 'C|maj' }, t);
  assert.equal(s.days['2026-10-02'].sightreading.ms, 90000);
  assert.equal(s.days['2026-10-02'].repertoire.ms, 100000);
  assert.deepEqual(s.tally.arpeggio['C|maj'], [1, 1]);
});

test('runs are capped', () => {
  const s = emptyStats();
  for (let i = 0; i < MAX_RUNS + 5; i++) applyRun(s, 'jam', { score: i }, i);
  assert.equal(s.runs.length, MAX_RUNS);
  assert.equal(s.runs[0].score, 5);
});

test('streaks: current ends today or yesterday, best is the longest run', () => {
  const s = emptyStats();
  for (const d of ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10', '2026-10-06', '2026-10-07']) {
    applyEvent(s, 'chords', { ok: 1 }, at(d));
  }
  assert.deepEqual(streaks(s, at('2026-10-08')), { current: 2, best: 3, days: 6 });
  assert.equal(streaks(s, at('2026-10-09')).current, 0);
});

test('streaks cross month ends and DST changes', () => {
  const s = emptyStats();
  for (const d of ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-31', '2026-11-01']) applyEvent(s, 'chords', {}, at(d));
  assert.equal(streaks(s, at('2026-11-01')).best, 3);
  assert.equal(streaks(s, at('2026-11-01')).current, 2);
});

test('daily series and calendar line up with dates', () => {
  const s = emptyStats();
  applyEvent(s, 'jam', { ms: 60000 }, at('2026-10-08'));
  applyEvent(s, 'chords', { ms: 30000 }, at('2026-10-08'));
  const days = dailySeries(s, 3, at('2026-10-08', 18));
  assert.deepEqual(days.map((d) => d.date), ['2026-10-06', '2026-10-07', '2026-10-08']);
  assert.equal(days[2].ms, 90000);
  assert.equal(days[2].byApp.jam, 60000);

  const cal = calendar(s, 2, at('2026-10-08', 18)); // a Thursday
  assert.equal(cal.length, 2);
  assert.equal(cal[0][0].date, '2026-09-28'); // Monday
  assert.equal(cal[1][3].date, '2026-10-08');
  assert.equal(cal[1][3].ms, 90000);
  assert.equal(cal[1][4], null); // the future
});

test('totals and profiles', () => {
  const s = emptyStats();
  applyEvent(s, 'chords', { ok: 1, ms: 1000 }, at('2026-10-05', 7)); // Monday
  applyEvent(s, 'jam', { miss: 1, ms: 2000 }, at('2026-10-11', 22)); // Sunday
  const t = appTotals(s);
  assert.equal(t.chords.ms, 1000);
  assert.equal(t.jam.miss, 1);
  assert.equal(t.jam.days, 1);
  const h = hourProfile(s);
  assert.equal(h[7], 1000);
  assert.equal(h[22], 2000);
  assert.deepEqual(weekdayProfile(s), [1000, 0, 0, 0, 0, 0, 2000]);
});

test('helpers', () => {
  assert.equal(dayKey(at('2026-01-05', 23, 59)), '2026-01-05');
  assert.deepEqual(rolling([1, 2, 3, 4], 2), [1, 1.5, 2.5, 3.5]);
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(20000), '<1 min');
  assert.equal(formatDuration(95 * 60000), '1 h 35');
});
