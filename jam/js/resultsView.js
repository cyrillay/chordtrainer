// Ghost Jam: the end of a set. Scores, the results screen and the
// achievements a finished set earns, and the way back to the setup screen.

import { STYLES } from './styles.js';
import { logRun } from '../../js/stats/log.js';
import { grant, bump, setFinished } from './trophyCase.js';
import { $, app, band, scores, LS, write, keyName } from './state.js';
import { showHint } from './playView.js';
import { renderSetup } from './setupView.js';

export function finish() {
  if (!app.game || app.game.over) return;
  app.game.over = true;
  cancelAnimationFrame(app.game.raf);
  band.stop();
  showHint(null);
  const s = app.game.scorer;
  const key = app.game.scoreKey;
  const prev = scores[key];
  const isHi = s.total > 0 && s.score > (prev?.score || 0);
  if (isHi) {
    scores[key] = { score: s.score, rank: s.rank, date: Date.now() };
    write(LS.scores, scores);
  }
  if (s.total) {
    logRun('jam', {
      tune: app.game.prog.name, style: app.game.style, key: app.game.key, score: s.score, rank: s.rank,
      acc: +s.accuracy.toFixed(3), combo: s.bestCombo, ...s.counts,
    });
  }
  $('resultEyebrow').textContent = `${app.game.prog.name} · ${STYLES[app.game.style].name} · ${keyName(app.game.key, app.game.prog)}`;
  $('resultRank').textContent = s.total ? s.rank : '·';
  $('resultRank').dataset.rank = s.rank;
  $('resultScore').textContent = s.score.toLocaleString();
  $('resultHi').hidden = !isHi;
  const c = s.counts;
  $('resultGrid').innerHTML = `
    <div class="g-perfect"><b>${c.perfect}</b><span>Perfect</span></div>
    <div class="g-good"><b>${c.good}</b><span>Good</span></div>
    <div class="g-late"><b>${c.late}</b><span>Late</span></div>
    <div class="g-miss"><b>${c.miss}</b><span>Miss</span></div>
    <div><b>${s.bestCombo}</b><span>Best combo</span></div>
    <div><b>${Math.round(s.accuracy * 100)}%</b><span>Accuracy</span></div>`;
  $('resultModal').hidden = false;
  app.showResultsNav();
  trackFinish();
}

function trackFinish() {
  const s = app.game.scorer;
  const complete = Number.isFinite(app.game.totalSlots) ? app.game.finalized >= app.game.totalSlots : app.game.finalized >= app.game.chords.length;
  const ids = app.game.tracker.finish({ complete, rank: s.rank, hour: new Date().getHours(), encore: app.game.encore });
  if (complete && s.total > 0) {
    bump('sets');
    if (s.rank === 'S') ids.push('busted');
    setFinished(app.game.style, s.rank);
  }
  if (ids.length) grant(ids);
}

export function backToSetup() {
  if (app.game && !app.game.over) { app.game.over = true; cancelAnimationFrame(app.game.raf); band.stop(); }
  app.game = null;
  showHint(null);
  $('resultModal').hidden = true;
  $('viewPlay').hidden = true;
  $('viewSetup').hidden = false;
  renderSetup();
}
