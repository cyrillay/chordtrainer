// Deterministic capture of the real app at the exact app times the edit needs.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { routeFonts } from './fontroute.mjs';
import { PLAYS, GUITAR_AT, SCROLL_AT, SCROLL_DUR, appTimesMs } from './plan.mjs';
const SEED = 7;
const b = await chromium.launch({ args: ['--disable-threaded-animation', '--disable-threaded-scrolling'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, ignoreHTTPSErrors:true });
await routeFonts(ctx);
await ctx.addInitScript((seed) => {
  localStorage.setItem('chordTrainer.onboarded','1');
  localStorage.setItem('chordTrainer.instrument','piano');
  let s = seed >>> 0;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const input = { name:'Digital Piano', onmidimessage:null };
  window.__midi = (d) => input.onmidimessage && input.onmidimessage({data:d});
  navigator.requestMIDIAccess = async () => ({ inputs: new Map([['1',input]]), onstatechange:null });
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => new Promise(()=>{});
}, SEED);
const p = await ctx.newPage();
p.on('pageerror', e=>console.log('PAGEERR', e.message));
await p.clock.install({ time: new Date('2026-09-25T10:00:00') });
await p.goto('http://localhost:8000/');
await p.addStyleTag({url:'https://fonts.googleapis.com/css2?family=Noto+Music'});
await p.addStyleTag({content:`.ach-toast{display:none!important}
  .accidental{font-family:'Noto Music','Helvetica Neue',sans-serif!important}
  html{scroll-behavior:auto!important}`});
await p.evaluate(() => { document.documentElement.dataset.platform = 'android'; });
await p.evaluate(async () => { await document.fonts.load('40px "Noto Music"', '♭♯'); await document.fonts.ready; });
await p.clock.runFor(1500);
await p.evaluate(() => { const c = document.getElementById('circleCb'); if (!c.checked) c.click(); document.getElementById('midiBtn').click(); });
await p.clock.runFor(800);

const chordLog = [];
const current = () => p.evaluate(async () => {
  const { state } = await import('/js/core/state.js');
  const o = state.currentChord.orderedNotes; let last = 60 + o[0]; const v=[last];
  for (let i=1;i<o.length;i++){ let m = last - last%12 + o[i]; while(m<=last) m+=12; v.push(m); last=m; }
  return { v, symbol: state.currentChord.symbol };
});
const actions = [];
for (const t of PLAYS) actions.push({ t, fn: async (now) => {
  const c = await current(); chordLog.push({ t: now, ...c });
  c.v.forEach((n, i) => actions.push({ t: now + i * 0.03, fn: () => p.evaluate(n => window.__midi([0x90, n, 100]), n) }));
  actions.push({ t: now + 0.42, fn: () => p.evaluate(v => v.forEach(n => window.__midi([0x80, n, 0])), c.v) });
}});
actions.push({ t: GUITAR_AT, fn: () => p.evaluate(() => document.querySelector('[data-instrument="guitar"]').click()) });
const scrollAt = (t) => { const x = Math.min(1, Math.max(0, (t - SCROLL_AT) / SCROLL_DUR)); return 230 + 330 * (x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x+2,3)/2); };

const OUT = process.env.ONLY ? 'apptest' : 'appframes'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const times = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : appTimesMs();
let virt = 0, k = 0;
for (const ms of times) {
  // step in <=34ms increments so timers/rAF fire at a natural cadence
  while (virt < ms) {
    const step = Math.min(34, ms - virt); await p.clock.runFor(step); virt += step;
    for (;;) {
      const due = actions.filter(a => !a.done && a.t * 1000 <= virt + 1e-6).sort((x, y) => x.t - y.t);
      if (!due.length) break;
      for (const a of due) { a.done = true; await a.fn(a.t); }
    }
  }
  await p.evaluate((y) => {
    window.scrollTo(0, y);
    const now = performance.now();
    for (const a of document.getAnimations()) {
      if (a.__born === undefined || a.playState === 'running') { a.__born = now; a.__t0 = a.currentTime || 0; }
      const ct = a.__t0 + (now - a.__born); const end = a.effect.getComputedTiming().endTime;
      if (end !== Infinity && ct >= end) a.cancel(); else { a.pause(); a.currentTime = ct; }
    }
  }, scrollAt(ms / 1000));
  await p.screenshot({ path: `${OUT}/a${ms}.png` });
  if (++k % 60 === 0) process.stdout.write(`${k}/${times.length} `);
}
fs.writeFileSync('chords.json', JSON.stringify(chordLog, null, 1));
console.log('\n', chordLog.map(c => c.symbol + '@' + c.t).join(' '));
await b.close();
