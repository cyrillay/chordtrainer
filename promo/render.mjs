import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { routeFonts } from './fontroute.mjs';
import fs from 'fs';
import { DURATION } from "./plan.mjs";
const FPS = 30, DUR = DURATION;
const only = process.env.PREVIEW ? process.env.PREVIEW.split(',').map(Number) : null;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1080,height:1920}, deviceScaleFactor:1 });
await routeFonts(ctx);
const p = await ctx.newPage();
p.on('pageerror', e=>console.log('PAGEERR', e.message));

await p.goto("http://localhost:8001/compose.html"); await p.waitForFunction(() => window.ready);
await p.evaluate(async () => { await document.fonts.ready; await document.fonts.load('40px "Noto Music"', '♭♯𝄆𝅘𝅥'); });
fs.mkdirSync(only ? 'preview' : 'frames', { recursive: true });
const list = only ? only.map(s => Math.round(s * FPS)) : [...Array(Math.round(FPS * DUR)).keys()];
for (const f of list) {
  await p.evaluate(t => window.render(t), f / FPS);
  await p.screenshot({ path: `${only ? 'preview' : 'frames'}/${String(f).padStart(4,'0')}.${only ? 'png' : 'jpg'}`, ...(only ? {} : { type: 'jpeg', quality: 95 }) });
  if (f % 60 === 0) process.stdout.write(f + ' ');
}
console.log('done');
await b.close();
