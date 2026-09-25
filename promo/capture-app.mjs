// Deterministic capture of the real app: faked clock + WAAPI-seeked CSS animations.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import { routeFonts } from './fontroute.mjs';
const FPS = 30, DURATION = 14.0, SEED = +(process.env.SEED || 7);
const PREVIEW = process.env.PREVIEW; // comma list of seconds -> only save those frames
const b = await chromium.launch();
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
p.on('console', m=>{ if(m.type()==='error') console.log('ERR',m.text())});
p.on('pageerror', e=>console.log('PAGEERR', e.message));
await p.clock.install({ time: new Date('2026-09-25T10:00:00') });
await p.goto('http://localhost:8000/');
await p.addStyleTag({url:'https://fonts.googleapis.com/css2?family=Noto+Music'});
await p.addStyleTag({content:`
  .ach-toast{display:none!important}
  .accidental{font-family:'Noto Music','Helvetica Neue',sans-serif!important}
  html{scroll-behavior:auto!important}
`});
await p.evaluate(() => { document.documentElement.dataset.platform = 'android'; });
await p.evaluate(async () => { await document.fonts.load('40px "Noto Music"', '♭♯'); await document.fonts.ready; });
await p.clock.runFor(1500);
await p.evaluate(() => { const c = document.getElementById('circleCb'); if (!c.checked) c.click(); document.getElementById('midiBtn').click(); });
await p.clock.runFor(800);

const chordLog = [];
async function current() {
  return p.evaluate(async () => {
    const { state } = await import('/js/core/state.js');
    const o = state.currentChord.orderedNotes; let last = 60 + o[0]; const v=[last];
    for (let i=1;i<o.length;i++){ let m = last - last%12 + o[i]; while(m<=last) m+=12; v.push(m); last=m; }
    return { v, symbol: state.currentChord.symbol };
  });
}
// action schedule (app seconds)
const plays = [0.9, 2.9, 4.9, 6.7, 8.9, 11.0];
const actions = [];
for (const t of plays) {
  actions.push({ t, fn: async (now) => {
    const c = await current(); chordLog.push({ t: now, ...c });
    for (let i = 0; i < c.v.length; i++) actions.push({ t: now + i * 0.03, fn: () => p.evaluate(n => window.__midi([0x90, n, 100]), c.v[i]) });
    actions.push({ t: now + 0.65, fn: () => p.evaluate(v => v.forEach(n => window.__midi([0x80, n, 0])), c.v) });
  }});
}
actions.push({ t: 8.0, fn: () => p.evaluate(() => document.querySelector('[data-instrument="guitar"]').click()) });
// scroll to reveal guitar + circle
const scrollAt = (t) => { const a = 9.7, d = 0.9, Y0 = 230, Y = 560; const x = Math.min(1, Math.max(0, (t - a) / d)); return Y0 + (Y - Y0) * (x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x+2,3)/2); };

let virt = 0; const total = Math.round(DURATION * FPS);
const want = PREVIEW ? new Set(PREVIEW.split(',').map(s => Math.round(+s * FPS))) : null;
for (let f = 0; f < total; f++) {
  const tSec = f / FPS;
  const targetMs = Math.round(tSec * 1000);
  if (targetMs > virt) { await p.clock.runFor(targetMs - virt); virt = targetMs; }
  // run due actions (may enqueue more)
  for (;;) {
    const due = actions.filter(a => !a.done && a.t <= tSec + 1e-6).sort((x, y) => x.t - y.t);
    if (!due.length) break;
    for (const a of due) { a.done = true; await a.fn(a.t); }
  }
  await p.evaluate((y) => {
    window.scrollTo(0, y);
    const now = performance.now();
    for (const a of document.getAnimations()) {
      if (a.__born === undefined) { a.__born = now; a.__t0 = a.currentTime || 0; }
      a.pause(); a.currentTime = a.__t0 + (now - a.__born);
    }
  }, scrollAt(tSec));
  if (!want || want.has(f)) await p.screenshot({ path: `appframes/${String(f).padStart(4,'0')}.png` });
  if (f % 60 === 0) process.stdout.write(`${f} `);
}
fs.writeFileSync('chords.json', JSON.stringify(chordLog, null, 1));
console.log('\n', chordLog.map(c => c.symbol + '@' + c.t).join(' '));
await b.close();
