// Shared timeline: app actions (app seconds) + slow-motion remap to video time.
export const FPS = 30;
export const APP_START = 3.0;              // video time when app time 0 is shown
export const PLAYS = [0.8, 2.2, 3.2, 3.85, 4.45, 5.0, 5.5, 5.95, 6.4, 6.85, 8.7, 10.8];
export const GUITAR_AT = 8.2, SCROLL_AT = 9.6, SCROLL_DUR = 0.8, APP_END = 12.0;
export const SUCCESS_LAG = 0.07;          // last note (notes staggered 30ms) → streak++
const SLOW = 0.3;
export const WINDOWS = [0, 1, 9].map(i => [PLAYS[i] + SUCCESS_LAG - 0.1, PLAYS[i] + SUCCESS_LAG + 0.6]);
// app time -> video time
export function a2v(a) {
  let v = a;
  for (const [s, e] of WINDOWS) v += Math.max(0, Math.min(a, e) - s) * (1 / SLOW - 1);
  return APP_START + v;
}
export function v2a(t) {             // inverse (monotonic), bisection
  if (t <= APP_START) return 0;
  let lo = 0, hi = APP_END;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (a2v(m) < t) lo = m; else hi = m; }
  return Math.min(APP_END, (lo + hi) / 2);
}
export const APP_VIDEO_END = a2v(APP_END);
export const T_FEAT = APP_VIDEO_END - 0.2, T_CTA = T_FEAT + 2.3, DURATION = T_CTA + 2.9;
export function appTimesMs(){
  const s = new Set();
  for (let f = 0; f < Math.round(DURATION * FPS); f++) s.add(Math.round(v2a(f / FPS) * 1000));
  return [...s].sort((x, y) => x - y);
}
