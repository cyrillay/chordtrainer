// Vector-PDF optical music recognition: primitives (see extract.js) → notes.
//
// Pipeline, per page:
//  1. staves   — groups of 5 equally spaced long horizontal lines;
//  2. systems  — staves joined by a vertical line (system barline);
//  3. glyphs   — SMuFL symbols assigned to their nearest staff;
//  4. chords   — noteheads grouped by the stem they touch; beams, flags and
//                augmentation dots give the written duration;
//  5. pitch    — staff position + clef + key signature + measure accidentals;
//  6. rhythm   — per measure, events are clustered into x-columns (engravers
//                align simultaneous events vertically) and each column's
//                onset is the earliest end of anything still sounding;
//  7. ties     — curves joining two same-position noteheads merge the notes.
//
// Times are in quarter notes.

import {
  NOTEHEADS, RESTS, ACCIDENTALS, CLEFS, AUGMENTATION_DOT, flagLevel,
  timeSigDigit, TIMESIG_COMMON, TIMESIG_CUT, tupletDigit, arpeggioDirection,
  MET_NOTES, MET_DOTS, isMusicGlyph
} from './smufl.js';

const LETTER_PCS = [0, 2, 4, 5, 7, 9, 11];
const EPS = 1e-6;
const ROLL_SECONDS = 1 / 15;

const median = arr => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// ---------------------------------------------------------------------------
// 1. Staves

function findStaves(page) {
  const horiz = page.lines.filter(l => Math.abs(l.y1 - l.y2) < 0.25 && Math.abs(l.x2 - l.x1) > 2);
  // Merge collinear segments (MuseScore draws staff lines one measure at a time).
  const rows = [];
  for (const l of horiz.map(l => ({ y: (l.y1 + l.y2) / 2, x0: Math.min(l.x1, l.x2), x1: Math.max(l.x1, l.x2) }))
    .sort((a, b) => a.y - b.y || a.x0 - b.x0)) {
    const row = rows.find(r => Math.abs(r.y - l.y) < 0.3 && l.x0 <= r.x1 + 2 && l.x1 >= r.x0 - 2);
    if (row) { row.x0 = Math.min(row.x0, l.x0); row.x1 = Math.max(row.x1, l.x1); }
    else rows.push({ ...l });
  }
  const long = rows.filter(r => r.x1 - r.x0 > 50).sort((a, b) => a.y - b.y);

  const staves = [];
  const used = new Set();
  for (let i = 0; i < long.length; i++) {
    if (used.has(i)) continue;
    const base = long[i];
    // Following lines that overlap horizontally, in y order.
    const cand = [];
    for (let j = i + 1; j < long.length && cand.length < 4; j++) {
      if (used.has(j)) continue;
      const r = long[j];
      const overlap = Math.min(r.x1, base.x1) - Math.max(r.x0, base.x0);
      if (overlap > 0.5 * (base.x1 - base.x0)) cand.push(j);
    }
    if (cand.length < 4) continue;
    const ys = [base.y, ...cand.map(j => long[j].y)];
    const gaps = ys.slice(1).map((y, k) => y - ys[k]);
    const sp = gaps.reduce((a, b) => a + b, 0) / 4;
    if (sp < 1.5 || sp > 25) continue;
    if (gaps.some(g => Math.abs(g - sp) > 0.15 * sp)) continue;
    [i, ...cand].forEach(k => used.add(k));
    staves.push({
      lines: ys, top: ys[0], bottom: ys[4], sp,
      x0: Math.min(base.x0, ...cand.map(j => long[j].x0)),
      x1: Math.max(base.x1, ...cand.map(j => long[j].x1))
    });
  }
  return staves.sort((a, b) => a.top - b.top);
}

// ---------------------------------------------------------------------------
// 2. Systems

function groupSystems(staves, verticals) {
  const parent = staves.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const v of verticals) {
    const hit = [];
    staves.forEach((s, i) => {
      if (v.x < s.x0 - s.sp || v.x > s.x1 + s.sp) return;
      const overlap = Math.min(v.y1, s.bottom) - Math.max(v.y0, s.top);
      if (overlap > 0.5 * s.sp) hit.push(i);
    });
    for (let k = 1; k < hit.length; k++) parent[find(hit[k])] = find(hit[0]);
  }
  const groups = new Map();
  staves.forEach((s, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(s);
  });
  return [...groups.values()]
    .map(st => ({ staves: st.sort((a, b) => a.top - b.top) }))
    .sort((a, b) => a.staves[0].top - b.staves[0].top);
}

// Barlines through a grand staff are often drawn as touching segments.
function mergeVerticals(verticals) {
  const sorted = verticals.map(v => ({ ...v })).sort((a, b) => a.x - b.x || a.y0 - b.y0);
  const out = [];
  for (const v of sorted) {
    const prev = out.find(o => Math.abs(o.x - v.x) < 0.3 && v.y0 <= o.y1 + 0.5 && v.y1 >= o.y0 - 0.5);
    if (prev) { prev.y0 = Math.min(prev.y0, v.y0); prev.y1 = Math.max(prev.y1, v.y1); }
    else out.push(v);
  }
  return out;
}

function nearestStaff(staves, x, y) {
  let best = null, bestD = Infinity;
  for (const s of staves) {
    if (x < s.x0 - 4 * s.sp || x > s.x1 + 2 * s.sp) continue;
    const d = y < s.top ? s.top - y : y > s.bottom ? y - s.bottom : 0;
    if (d < bestD) { bestD = d; best = s; }
  }
  if (best && bestD > 8 * best.sp) return null;
  return best;
}

// Staff step of y: 0 = bottom line, 1 = first space, 2 = second line, …
const stepOf = (staff, y) => Math.round((staff.bottom - y) / (staff.sp / 2));

// ---------------------------------------------------------------------------
// Geometry helpers for beams and curves

function beamLine(shape) {
  // A beam is a (possibly sloped) parallelogram: return its mid-line.
  const pts = shape.pts;
  const minX = shape.bbox[0], maxX = shape.bbox[2];
  const tol = (maxX - minX) * 0.1 + 0.01;
  const left = pts.filter(p => p[0] <= minX + tol).map(p => p[1]);
  const right = pts.filter(p => p[0] >= maxX - tol).map(p => p[1]);
  if (!left.length || !right.length) return null;
  const yl = (Math.min(...left) + Math.max(...left)) / 2;
  const yr = (Math.min(...right) + Math.max(...right)) / 2;
  const thick = Math.max(...left) - Math.min(...left);
  return { x0: minX, x1: maxX, yAt: x => yl + (yr - yl) * (x - minX) / Math.max(maxX - minX, EPS), thick };
}

// ---------------------------------------------------------------------------
// Main entry

export function recognize(doc, options = {}) {
  const warnings = [];
  const warn = msg => { if (!warnings.includes(msg)) warnings.push(msg); };

  const systems = [];
  let musicGlyphCount = 0;
  const fontsSeen = new Set();
  let title = '';
  let titleSize = 0;
  let tempo = null;

  doc.pages.forEach((page, pageIdx) => {
    page.glyphs.forEach(g => {
      fontsSeen.add(g.font);
      if (isMusicGlyph(g.c)) musicGlyphCount++;
      else if (pageIdx === 0 && g.size > titleSize + 0.5 && g.c > 32) { titleSize = g.size; }
    });
    if (pageIdx === 0 && titleSize) {
      const tg = page.glyphs.filter(g => !isMusicGlyph(g.c) && Math.abs(g.size - titleSize) < 0.5)
        .sort((a, b) => Math.abs(a.y - b.y) > 1 ? a.y - b.y : a.x - b.x);
      title = tg.map((g, i) => {
        const prev = tg[i - 1];
        const gap = prev && g.x - (prev.x + prev.w) > g.size * 0.15 ? ' ' : '';
        return gap + String.fromCodePoint(g.c);
      }).join('').replace(/\s+/g, ' ').trim();
    }

    const staves = findStaves(page);
    if (!staves.length) return;
    const verticals = page.lines
      .filter(l => Math.abs(l.x1 - l.x2) < 0.25 && Math.abs(l.y2 - l.y1) > 1)
      .map(l => ({ x: (l.x1 + l.x2) / 2, y0: Math.min(l.y1, l.y2), y1: Math.max(l.y1, l.y2), lw: l.lw }));
    // Thick barlines are sometimes filled rectangles.
    for (const s of page.shapes) {
      if (s.curve || s.kind === 'stroke') continue;
      const [x0, y0, x1, y1] = s.bbox;
      if (x1 - x0 < 3 && y1 - y0 > 8 && s.pts.length <= 6) {
        verticals.push({ x: (x0 + x1) / 2, y0, y1, lw: x1 - x0, filled: true });
      }
    }
    // Braces/brackets also tie staves together (their glyph height spans them).
    const joins = mergeVerticals(verticals);
    for (const g of page.glyphs) {
      if (g.c === 0xE000 || g.c === 0xE002) joins.push({ x: g.x + g.w, y0: g.y - g.size, y1: g.y });
    }
    const sys = groupSystems(staves, joins);
    sys.forEach(sy => { sy.page = pageIdx; sy.verticals = verticals; sy.pageData = page; sy.pageStaves = staves; });
    systems.push(...sys);

    if (tempo === null) tempo = findTempo(page, staves);
  });

  if (!systems.length) {
    const reason = musicGlyphCount === 0
      ? 'No staff lines or music-font symbols were found. This converter reads PDFs exported by notation software (MuseScore, Dorico, Sibelius, Finale…); scanned or photographed scores are images and cannot be read.'
      : 'Music symbols were found but no staff lines could be detected.';
    const err = new Error(reason);
    err.code = 'NO_STAVES';
    throw err;
  }
  if (musicGlyphCount === 0) {
    const err = new Error(`Staff lines were found, but the music symbols do not use a SMuFL font (fonts: ${[...fontsSeen].join(', ') || 'none'}). Re-export the PDF from a recent version of your notation software.`);
    err.code = 'NO_SMUFL';
    throw err;
  }

  const numTracks = Math.max(...systems.map(s => s.staves.length));
  if (systems.some(s => s.staves.length !== numTracks)) {
    warn('Some systems have a different number of staves (hidden empty staves?) — staves were matched top to bottom.');
  }

  // Carried across systems, per staff index.
  const carry = {
    clef: [], keySig: [], pendingTies: [],
    timeSig: { num: 4, den: 4, found: false }
  };
  const tracks = Array.from({ length: numTracks }, (_, i) => ({ name: `Staff ${i + 1}`, notes: [] }));
  const measures = []; // { start, length, timeSig }
  const timeSigs = [];
  const keySigs = [];
  let now = 0;
  let stats = { chords: 0, rests: 0, ties: 0, arpeggios: 0, tuplets: 0, graceNotes: 0 };

  systems.forEach((sy, sysIdx) => {
    const res = processSystem(sy, sysIdx, carry, warn, stats, options);
    // Lay the system's measures out on the global timeline.
    res.measures.forEach((m, mi) => {
      const isFirst = measures.length === 0;
      let length = m.nominal;
      if (m.content > m.nominal + EPS) {
        // Trust the time signature: a misread duration then stays local to
        // this measure instead of shifting the rest of the piece.
        warn(`Measure ${measures.length + 1}: recognised content (${fmt(m.content)} beats) exceeds the time signature (${fmt(m.nominal)}).`);
      } else if (isFirst && m.content < m.nominal - EPS && m.content > 0) {
        length = m.content; // pickup (anacrusis)
      }
      if (m.timeSig && (!timeSigs.length || timeSigs[timeSigs.length - 1].num !== m.timeSig.num || timeSigs[timeSigs.length - 1].den !== m.timeSig.den)) {
        timeSigs.push({ time: now, num: m.timeSig.num, den: m.timeSig.den });
      }
      if (m.keyFifths !== undefined && (!keySigs.length || keySigs[keySigs.length - 1].fifths !== m.keyFifths)) {
        keySigs.push({ time: now, fifths: m.keyFifths });
      }
      for (const n of m.notes) {
        n.start += now;
        tracks[n.staffIdx].notes.push(n);
      }
      measures.push({ start: now, length, system: sysIdx, index: mi });
      now += length;
    });
  });

  // Arpeggios roll at a fixed speed in seconds (~66 ms per note, as
  // MuseScore plays them), whatever the tempo.
  const rollStep = ROLL_SECONDS * (tempo || 120) / 60;

  // Ties: merge chains into single notes.
  for (const tr of tracks) {
    const merged = [];
    for (const n of tr.notes.sort((a, b) => a.start - b.start)) {
      if (n.tiedFrom) continue;
      let end = n.start + n.dur;
      let cur = n;
      let guard = 0;
      while (cur.tieTo && guard++ < 64) {
        const nx = cur.tieTo;
        if (Math.abs(nx.start - end) > 0.05) break; // not contiguous → ignore tie
        end = nx.start + nx.dur;
        cur = nx;
      }
      merged.push({ pitch: n.pitch, start: n.start, dur: end - n.start, velocity: 80, roll: n.roll || 0, rollN: n.rollN || 0, src: n.src });
    }
    // Arpeggio rolls: stagger onsets, keep the release (like playback engines).
    tr.notes = merged.map(n => {
      // The whole roll takes at most a quarter of the chord's length.
      const step = n.roll ? Math.min(rollStep, 0.25 * n.dur / Math.max(n.rollN - 1, 1)) : 0;
      const shift = n.roll * step;
      return { pitch: n.pitch, start: n.start + shift, dur: n.dur - shift, velocity: n.velocity, src: n.src };
    }).sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    // Two voices of one staff on the same note (unison) → one MIDI note.
    tr.notes = tr.notes.filter((n, i, arr) => {
      const prev = arr[i - 1];
      if (prev && prev.pitch === n.pitch && Math.abs(prev.start - n.start) < EPS) {
        prev.dur = Math.max(prev.dur, n.dur);
        return false;
      }
      return true;
    });
  }

  if (!carry.timeSig.found) warn('No time signature found — assumed 4/4.');

  return {
    title,
    tempo: tempo || 120,
    tempoFound: tempo !== null,
    timeSigs: timeSigs.length ? timeSigs : [{ time: 0, num: 4, den: 4 }],
    keySigs: keySigs.length ? keySigs : [{ time: 0, fifths: 0 }],
    tracks,
    measures,
    duration: now,
    stats: { ...stats, systems: systems.length, staves: numTracks, measures: measures.length, notes: tracks.reduce((a, t) => a + t.notes.length, 0) },
    warnings
  };
}

const fmt = v => (Math.round(v * 1000) / 1000).toString();

// ---------------------------------------------------------------------------
// Tempo: a metronome-note glyph followed by "= 96".

function findTempo(page, staves) {
  for (const g of page.glyphs) {
    const beat = MET_NOTES[g.c];
    if (!beat) continue;
    const sp = g.size / 4;
    let dotted = false;
    const text = page.glyphs
      .filter(t => t !== g && t.x > g.x && t.x < g.x + 14 * sp && Math.abs(t.y - g.y) < 1.5 * sp)
      .sort((a, b) => a.x - b.x);
    let s = '';
    for (const t of text) {
      // Only a dot right after the note glyph, before "=", makes it dotted.
      if (MET_DOTS.includes(t.c)) { if (!s.includes('=') && t.x - (g.x + g.w) < 1.5 * sp) dotted = true; continue; }
      if (isMusicGlyph(t.c)) continue;
      s += String.fromCodePoint(t.c);
      if (/=\s*\d{2,3}/.test(s) && !/\d/.test(String.fromCodePoint(t.c))) break;
    }
    const m = s.match(/=\s*(\d{2,3})/);
    if (m) return +m[1] * beat * (dotted ? 1.5 : 1);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-system recognition

function processSystem(sy, sysIdx, carry, warn, stats, options) {
  const page = sy.pageData;
  const staves = sy.staves;
  const sp = median(staves.map(s => s.sp));
  const sysTop = staves[0].top, sysBottom = staves[staves.length - 1].bottom;
  const sysX0 = Math.min(...staves.map(s => s.x0));
  const sysX1 = Math.max(...staves.map(s => s.x1));

  // --- 3. Assign glyphs, lines and shapes to staves -----------------------
  const perStaff = staves.map(() => ({
    heads: [], graces: [], rests: [], accs: [], dots: [], flags: [], clefs: [], timeDigits: [], tuplets: []
  }));
  const arps = [];
  const inSystem = (x, y) => x >= sysX0 - 6 * sp && x <= sysX1 + 2 * sp && y >= sysTop - 10 * sp && y <= sysBottom + 10 * sp;

  // Normal glyph size for this system (grace/cue notes are smaller).
  const headSizes = page.glyphs.filter(g => NOTEHEADS[g.c] !== undefined && inSystem(g.x, g.y)).map(g => g.size);
  const normalSize = median(headSizes) || 4 * sp;

  for (const g of page.glyphs) {
    if (!inSystem(g.x, g.y)) continue;
    if (!isMusicGlyph(g.c)) {
      // Some programs (MuseScore 3…) set tuplet numbers in an italic text
      // font; they are confirmed later by a bracket or beam next to them.
      if (g.c >= 0x31 && g.c <= 0x39 && /italic|oblique/i.test(g.font)) {
        const st = nearestStaff(sy.pageStaves, g.x, g.y);
        if (st && staves.includes(st)) {
          perStaff[staves.indexOf(st)].tuplets.push({ x: g.x, y: g.y, w: g.w, n: g.c - 0x30, text: true });
        }
      }
      continue;
    }
    const arpDir = arpeggioDirection(g.c);
    if (arpDir) { arps.push({ ...g, dir: arpDir }); continue; }
    // Nearest staff on the whole page, so a glyph between two systems is
    // only claimed by one of them.
    const st = nearestStaff(sy.pageStaves, g.x, g.y);
    if (!st || !staves.includes(st)) continue;
    const bucket = perStaff[staves.indexOf(st)];
    if (NOTEHEADS[g.c] !== undefined) {
      if (g.size < normalSize * 0.85) { bucket.graces.push({ x: g.x, y: g.y, w: g.w }); continue; }
      bucket.heads.push({ x: g.x, y: g.y, w: g.w, base: NOTEHEADS[g.c], cp: g.c });
    } else if (RESTS[g.c] !== undefined) {
      if (g.size < normalSize * 0.85) continue;
      bucket.rests.push({ x: g.x, y: g.y, w: g.w, base: RESTS[g.c], cp: g.c });
    } else if (ACCIDENTALS[g.c] !== undefined) {
      bucket.accs.push({ x: g.x, y: g.y, w: g.w, alter: ACCIDENTALS[g.c], small: g.size < normalSize * 0.85 });
    } else if (g.c === AUGMENTATION_DOT) {
      bucket.dots.push({ x: g.x, y: g.y, w: g.w });
    } else if (flagLevel(g.c)) {
      bucket.flags.push({ x: g.x, y: g.y, level: flagLevel(g.c) });
    } else if (CLEFS[g.c]) {
      bucket.clefs.push({ x: g.x, y: g.y, ...CLEFS[g.c] });
    } else if (timeSigDigit(g.c) !== null || g.c === TIMESIG_COMMON || g.c === TIMESIG_CUT) {
      bucket.timeDigits.push({ x: g.x, y: g.y, w: g.w, c: g.c });
    } else if (tupletDigit(g.c) !== null) {
      bucket.tuplets.push({ x: g.x, y: g.y, w: g.w, n: tupletDigit(g.c) });
    }
  }

  // Vertical lines in this system: stems vs barlines.
  const verts = sy.verticals.filter(v => v.x >= sysX0 - sp && v.x <= sysX1 + sp && v.y1 >= sysTop - 8 * sp && v.y0 <= sysBottom + 8 * sp);

  // Heads on ledger lines between two staves are ambiguous by distance
  // alone: follow the chord they belong to (shared stem, or same column).
  if (staves.length > 1) {
    const headsSi = perStaff.flatMap((b, si) => b.heads.map(h => ({ h, si })));
    const onStem = (v, h) => (Math.abs(v.x - h.x) < 0.3 * sp || Math.abs(v.x - (h.x + h.w)) < 0.3 * sp) &&
      h.y >= v.y0 - 0.6 * sp && h.y <= v.y1 + 0.6 * sp;
    const inside = (h, si) => h.y >= staves[si].top - 0.1 * sp && h.y <= staves[si].bottom + 0.1 * sp;
    for (const item of headsSi) {
      const { h, si } = item;
      if (inside(h, si)) continue;
      const between = staves.some((s, k) => k + 1 < staves.length && h.y > s.bottom && h.y < staves[k + 1].top);
      if (!between) continue;
      const stem = verts.find(v => v.y1 - v.y0 > 1.2 * sp && onStem(v, h));
      const mates = headsSi.filter(o => o !== item && (stem
        ? onStem(stem, o.h)
        : Math.abs(o.h.x - h.x) < 0.3 * sp && Math.abs(o.h.y - h.y) < 6 * sp));
      const anchored = mates.filter(o => inside(o.h, o.si));
      let target;
      if (anchored.length) {
        target = anchored[0].si;
        if (!anchored.every(o => o.si === target)) continue;
      } else if (stem) {
        // Whole chord in the gap: the stem's free end points into its staff.
        const ys = [h.y, ...mates.map(o => o.h.y)];
        const free = Math.abs(stem.y0 - Math.min(...ys)) > Math.abs(stem.y1 - Math.max(...ys)) ? stem.y0 : stem.y1;
        const dist = s => (free < s.top ? s.top - free : free > s.bottom ? free - s.bottom : 0);
        target = staves.reduce((best, s, k) => (dist(s) < dist(staves[best]) ? k : best), 0);
      } else {
        // Stemless note in the gap: ledger lines run from its own staff to it.
        const k = staves.findIndex((s, k) => k + 1 < staves.length && h.y > s.bottom && h.y < staves[k + 1].top);
        const up = staves[k], down = staves[k + 1];
        const ledgers = page.lines.filter(l => Math.abs(l.y1 - l.y2) < 0.2 &&
          Math.abs(l.x2 - l.x1) < 3 * sp && Math.min(l.x1, l.x2) < h.x + h.w && Math.max(l.x1, l.x2) > h.x);
        // The ladder's first rung sits one space off its staff.
        const fromUp = ledgers.some(l => Math.abs(l.y1 - (up.bottom + up.sp)) < 0.2 * sp);
        const fromDown = ledgers.some(l => Math.abs(l.y1 - (down.top - down.sp)) < 0.2 * sp);
        if (fromUp && !fromDown) target = k;
        else if (fromDown && !fromUp) target = k + 1;
        else continue;
      }
      if (target !== si) {
        perStaff[si].heads.splice(perStaff[si].heads.indexOf(h), 1);
        perStaff[target].heads.push(h);
        item.si = target;
      }
    }
  }

  const allHeads = perStaff.flatMap((b, si) => b.heads.map(h => ({ ...h, si })));
  const touchesHead = v => allHeads.some(h =>
    (Math.abs(v.x - h.x) < 0.3 * sp || Math.abs(v.x - (h.x + h.w)) < 0.3 * sp) &&
    h.y >= v.y0 - 0.6 * sp && h.y <= v.y1 + 0.6 * sp);
  const barXs = [];
  const stems = [];
  for (const v of verts) {
    const spansStaff = staves.some(s => v.y0 <= s.top + 0.3 * s.sp && v.y1 >= s.bottom - 0.3 * s.sp && v.x >= s.x0 - 0.5 * sp);
    if (spansStaff && !touchesHead(v)) barXs.push(v.x);
    else if (!v.filled && v.y1 - v.y0 > 1.2 * sp) stems.push(v);
  }
  // Collapse double/final barlines; drop the system's opening line.
  barXs.sort((a, b) => a - b);
  const bars = [];
  for (const x of barXs) {
    if (bars.length && x - bars[bars.length - 1] < 1.5 * sp) bars[bars.length - 1] = x;
    else bars.push(x);
  }
  const boundaries = bars.filter(x => x > sysX0 + 1.5 * sp);
  if (!boundaries.length || sysX1 - boundaries[boundaries.length - 1] > 1.5 * sp) boundaries.push(sysX1);
  const measureStarts = [sysX0, ...boundaries.slice(0, -1)];
  const measureOf = x => {
    for (let i = 0; i < boundaries.length; i++) if (x < boundaries[i]) return i;
    return boundaries.length - 1;
  };

  // Beams and curves.
  const beams = [];
  const curves = [];
  for (const s of page.shapes) {
    const [x0, y0, x1, y1] = s.bbox;
    if (x1 < sysX0 - sp || x0 > sysX1 + sp || y1 < sysTop - 10 * sp || y0 > sysBottom + 10 * sp) continue;
    if (s.curve) {
      if (x1 - x0 > 0.8 * sp) curves.push(s);
    } else if (s.kind !== 'stroke' && x1 - x0 > 0.8 * sp && s.pts.length <= 6) {
      const b = beamLine(s);
      if (b && b.thick > 0.25 * sp && b.thick < 0.8 * sp) beams.push(b);
    }
  }

  // --- 4. Chords ----------------------------------------------------------
  const events = []; // chords and rests across all staves
  staves.forEach((staff, si) => {
    const b = perStaff[si];
    const heads = b.heads;
    const headStem = new Map();
    for (const st of stems) {
      if (st.x < staff.x0 - sp || st.x > staff.x1 + sp) continue;
      for (const h of heads) {
        const left = Math.abs(st.x - h.x), right = Math.abs(st.x - (h.x + h.w));
        const d = Math.min(left, right);
        if (d > 0.35 * sp) continue;
        if (h.y < st.y0 - 0.6 * sp || h.y > st.y1 + 0.6 * sp) continue;
        if (h.base >= 4) continue; // whole notes have no stem
        const prev = headStem.get(h);
        if (!prev || d < prev.d) headStem.set(h, { st, d });
      }
    }
    const byStem = new Map();
    const loose = [];
    for (const h of heads) {
      const hs = headStem.get(h);
      if (hs) {
        if (!byStem.has(hs.st)) byStem.set(hs.st, []);
        byStem.get(hs.st).push(h);
      } else loose.push(h);
    }
    const chords = [];
    for (const [st, hs] of byStem) {
      const ys = hs.map(h => h.y);
      const lowest = Math.max(...ys), highest = Math.min(...ys);
      const up = Math.abs(st.y1 - lowest) < Math.abs(st.y0 - highest);
      const w = median(hs.map(h => h.w));
      // Beams crossing the stem near its free end + flags on it.
      let beamCount = 0;
      for (const bm of beams) {
        if (st.x < bm.x0 - 0.2 * sp || st.x > bm.x1 + 0.2 * sp) continue;
        const y = bm.yAt(Math.min(Math.max(st.x, bm.x0), bm.x1));
        if (y >= st.y0 - 0.4 * sp && y <= st.y1 + 0.4 * sp) beamCount++;
      }
      let flag = 0;
      for (const f of b.flags) {
        if (Math.abs(f.x - st.x) < 0.4 * sp && f.y >= st.y0 - sp && f.y <= st.y1 + sp) flag = Math.max(flag, f.level);
      }
      const base = Math.max(...hs.map(h => h.base));
      const levels = base <= 1 ? beamCount + flag : 0;
      chords.push({
        kind: 'chord', si, heads: hs, stem: st, up,
        x: up ? st.x - w : st.x, w,
        written: base / Math.pow(2, levels)
      });
    }
    // Stemless heads: whole notes (and breves) — cluster by x.
    loose.sort((a, b) => a.x - b.x);
    for (const h of loose) {
      const c = chords.find(c => !c.stem && c.written === h.base &&
        (Math.abs(c.x - h.x) < 0.3 * sp || (Math.abs(c.x - h.x) < 1.2 * h.w && c.heads.some(o => Math.abs(o.y - h.y) < 0.6 * sp))));
      if (c) { c.heads.push(h); c.x = Math.min(c.x, h.x); }
      else {
        if (h.base < 4) warn('Some noteheads had no detectable stem; they were read as quarter/half notes.');
        chords.push({ kind: 'chord', si, heads: [h], stem: null, x: h.x, w: h.w, written: h.base });
      }
    }
    for (const r of b.rests) {
      events.push({ kind: 'rest', si, x: r.x, w: r.w, written: r.base, y: r.y, heads: [] });
    }
    events.push(...chords);
  });

  // Augmentation dots: attach to the nearest event on their left.
  const dotted = new Map();
  staves.forEach((staff, si) => {
    for (const d of perStaff[si].dots) {
      let best = null, bestDx = Infinity;
      for (const e of events) {
        if (e.si !== si && e.kind === 'rest') continue;
        const right = e.kind === 'rest' ? e.x + e.w : Math.max(...e.heads.map(h => h.x + h.w));
        const dx = d.x - right;
        if (dx < -0.1 * sp || dx > 2.6 * sp) continue;
        const near = e.kind === 'rest'
          ? Math.abs(d.y - e.y) < 2.5 * sp
          : e.heads.some(h => Math.abs(h.y - d.y) <= 0.75 * sp);
        if (!near) continue;
        if (dx < bestDx) { bestDx = dx; best = e; }
      }
      if (!best) continue;
      if (!dotted.has(best)) dotted.set(best, []);
      const xs = dotted.get(best);
      if (!xs.some(x => Math.abs(x - d.x) < 0.3 * sp)) xs.push(d.x);
    }
  });
  for (const e of events) {
    const dots = (dotted.get(e) || []).length;
    e.dur = e.written * (2 - Math.pow(0.5, dots));
    e.measure = measureOf(e.x + (e.w || 0) / 2);
  }

  // Tuplets. The notes involved are those under the bracket or on the beam
  // carrying the number; failing both, the nearest notes that add up to n
  // equal units.
  const shortLines = page.lines.filter(l => Math.abs(l.y1 - l.y2) < 0.5 * sp && Math.abs(l.x2 - l.x1) > 0.5 * sp && Math.abs(l.x2 - l.x1) < 40 * sp);
  staves.forEach((staff, si) => {
    for (const t of perStaff[si].tuplets) {
      const n = t.n;
      if (n < 2) continue;
      const m = n === 2 ? 3 : Math.pow(2, Math.floor(Math.log2(n)));
      const cx = t.x + t.w / 2;
      // Bracket: horizontal segments level with the number, on both sides.
      const lvl = shortLines.filter(l => Math.abs((l.y1 + l.y2) / 2 - (t.y - t.w * 0.7)) < 1.2 * sp || Math.abs((l.y1 + l.y2) / 2 - t.y) < 1.2 * sp);
      const leftSeg = lvl.filter(l => Math.max(l.x1, l.x2) <= t.x + 0.3 * sp && Math.max(l.x1, l.x2) > t.x - 1.5 * sp);
      const rightSeg = lvl.filter(l => Math.min(l.x1, l.x2) >= t.x + t.w - 0.3 * sp && Math.min(l.x1, l.x2) < t.x + t.w + 1.5 * sp);
      let span = null, beam = null;
      if (leftSeg.length && rightSeg.length) {
        span = [Math.min(...leftSeg.map(l => Math.min(l.x1, l.x2))), Math.max(...rightSeg.map(l => Math.max(l.x1, l.x2)))];
      } else {
        const yAt = b => b.yAt(Math.min(Math.max(cx, b.x0), b.x1));
        beam = beams.filter(b => cx >= b.x0 - 0.5 * sp && cx <= b.x1 + 0.5 * sp && Math.abs(yAt(b) - t.y) < 8 * sp)
          .sort((a, b) => Math.abs(yAt(a) - t.y) - Math.abs(yAt(b) - t.y))[0] || null;
      }
      if (!span && !beam && t.text) continue; // a lone italic digit: fingering, not a tuplet
      let group = [];
      if (beam) {
        // The chords hanging from that beam, whichever staff the number is nearer.
        group = events.filter(e => e.kind === 'chord' && e.stem && !e.tuplet &&
          e.stem.x >= beam.x0 - 0.3 * sp && e.stem.x <= beam.x1 + 0.3 * sp &&
          [e.stem.y0, e.stem.y1].some(y => Math.abs(y - beam.yAt(e.stem.x)) < 0.8 * sp));
      } else if (span) {
        group = events.filter(e => e.si === si && !e.tuplet && !e.fullMeasure &&
          e.x + (e.w || 0) > span[0] - 0.5 * sp && e.x < span[1] + 0.5 * sp &&
          (e.kind === 'rest' || !e.stem || (e.stem.x >= span[0] - 0.5 * sp && e.stem.x <= span[1] + 0.5 * sp)));
      } else {
        const cands = events.filter(e => e.si === si && !e.tuplet && e.measure === measureOf(cx))
          .sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx));
        for (const e of cands) {
          group.push(e);
          const unit = Math.min(...group.map(g => g.dur));
          const total = group.reduce((a, g) => a + g.dur, 0);
          if (group.length >= 2 && Math.abs(total - n * unit) < EPS) break;
          if (group.length >= 2 * n) { group = []; break; }
        }
      }
      if (!group.length) { warn('A tuplet could not be matched to its notes.'); continue; }
      group.forEach(e => { e.dur *= m / n; e.tuplet = true; });
      stats.tuplets++;
    }
  });

  // Full-measure rests: a lone whole rest in its staff for that measure.
  for (const e of events) {
    if (e.kind !== 'rest' || e.written !== 4) continue;
    const others = events.filter(o => o !== e && o.si === e.si && o.measure === e.measure);
    if (!others.length) e.fullMeasure = true;
  }

  // --- Clefs, key signatures, time signatures ------------------------------
  const firstEventX = si => {
    const xs = events.filter(e => e.si === si).map(e => e.x);
    return xs.length ? Math.min(...xs) : sysX1;
  };
  staves.forEach((staff, si) => {
    const clefs = perStaff[si].clefs.sort((a, b) => a.x - b.x);
    staff.clefs = [];
    for (const c of clefs) {
      // Reference line → bottom-line diatonic index.
      staff.clefs.push({ x: c.x, bottom: c.ref - stepOf(staff, c.y), name: c.name });
    }
    if (!staff.clefs.length || staff.clefs[0].x > firstEventX(si)) {
      const prev = carry.clef[si];
      if (prev === undefined) warn(`No clef found on staff ${si + 1}; treble clef assumed.`);
      staff.clefs.unshift({ x: -Infinity, bottom: prev !== undefined ? prev : 30, name: 'carried' });
    }
    carry.clef[si] = staff.clefs[staff.clefs.length - 1].bottom;
  });
  const clefAt = (staff, x) => {
    let c = staff.clefs[0];
    for (const k of staff.clefs) if (k.x <= x) c = k;
    return c.bottom;
  };
  const diatonicOf = (staff, y, x) => clefAt(staff, x) + stepOf(staff, y);

  // Accidentals: attach to the head on their right (columns can stack in
  // chords), the rest are key signatures.
  const headAcc = new Map();
  staves.forEach((staff, si) => {
    const accs = perStaff[si].accs.filter(a => !a.small);
    // Any staff: heads on ledger lines may have been moved to the other staff
    // (by their stem) while their accidentals were not.
    const chordHeads = events.filter(e => e.kind === 'chord' && Math.abs(e.si - si) <= 1).flatMap(e => e.heads.map(h => ({ h, e })));
    const attached = new Set();
    const chordAccX = new Map(); // chord → leftmost attached accidental x
    let changed = true;
    let pass = 0;
    while (changed && pass++ < 6) {
      changed = false;
      for (const a of accs) {
        if (attached.has(a)) continue;
        let best = null, bestGap = Infinity;
        for (const { h, e } of chordHeads) {
          if (Math.abs(h.y - a.y) > 0.3 * sp) continue;
          const gap = h.x - (a.x + a.w);
          const edge = Math.min(Math.min(...e.heads.map(o => o.x)), chordAccX.get(e) ?? Infinity);
          const gapEdge = edge - (a.x + a.w);
          const ok = (gap > -0.3 * sp && gap < 1.2 * sp) || (gapEdge > -0.3 * sp && gapEdge < 1.0 * sp && gap < 5 * sp);
          if (ok && gap < bestGap && !headAcc.has(h)) { bestGap = gap; best = { h, e }; }
        }
        if (best) {
          attached.add(a);
          headAcc.set(best.h, a.alter);
          chordAccX.set(best.e, Math.min(chordAccX.get(best.e) ?? Infinity, a.x));
          changed = true;
        }
      }
    }
    // Key signatures only live at the start of a measure, before its first
    // note; any other leftover accidental belongs to the next head at its height.
    const firstInMeasure = x => {
      const m = measureOf(x);
      const xs = events.filter(e => e.si === si && e.measure === m).map(e => e.x);
      return xs.length ? Math.min(...xs) : Infinity;
    };
    for (const a of accs) {
      if (attached.has(a) || a.x < firstInMeasure(a.x)) continue;
      const cands = chordHeads.filter(({ h }) => Math.abs(h.y - a.y) < 0.3 * sp && h.x > a.x && h.x - a.x < 6 * sp && !headAcc.has(h));
      if (!cands.length) continue;
      const best = cands.reduce((b, c) => (c.h.x < b.h.x ? c : b));
      attached.add(a);
      headAcc.set(best.h, a.alter);
    }
    const free = accs.filter(a => !attached.has(a) && a.x < firstInMeasure(a.x)).sort((a, b) => a.x - b.x);
    const groups = [];
    for (const a of free) {
      const g = groups[groups.length - 1];
      if (g && a.x - g[g.length - 1].x < 2 * sp) g.push(a);
      else groups.push([a]);
    }
    staff.keyChanges = groups.map(g => {
      const x = g[0].x;
      const map = {};
      let fifths = 0;
      for (const a of g) {
        const letter = ((diatonicOf(staff, a.y, x) % 7) + 7) % 7;
        if (a.alter === 0) continue;
        map[letter] = a.alter;
        fifths += a.alter > 0 ? 1 : -1;
      }
      return { x, map, fifths };
    });
    // A system without a key signature at its start keeps the previous one
    // only if one exists; engravers restate it on every system otherwise.
    const startKey = staff.keyChanges.length && staff.keyChanges[0].x < firstEventX(si)
      ? null : (carry.keySig[si] || { map: {}, fifths: 0 });
    if (startKey) staff.keyChanges.unshift({ x: -Infinity, ...startKey });
    const last = staff.keyChanges[staff.keyChanges.length - 1];
    carry.keySig[si] = { map: last.map, fifths: last.fifths };
  });
  const keyAt = (staff, x) => {
    let k = staff.keyChanges[0];
    for (const c of staff.keyChanges) if (c.x <= x) k = c;
    return k;
  };

  // Time signatures (read from the top staff; digits stacked around the middle line).
  const tsChanges = [];
  {
    const staff = staves[0];
    const digits = perStaff[0].timeDigits.sort((a, b) => a.x - b.x);
    const groups = [];
    for (const d of digits) {
      const g = groups[groups.length - 1];
      if (g && d.x - g[0].x < 3 * sp) g.push(d); else groups.push([d]);
    }
    const mid = (staff.top + staff.bottom) / 2;
    for (const g of groups) {
      if (g.some(d => d.c === TIMESIG_COMMON)) { tsChanges.push({ x: g[0].x, num: 4, den: 4 }); continue; }
      if (g.some(d => d.c === TIMESIG_CUT)) { tsChanges.push({ x: g[0].x, num: 2, den: 2 }); continue; }
      const num = +g.filter(d => d.y < mid).sort((a, b) => a.x - b.x).map(d => timeSigDigit(d.c)).join('');
      const den = +g.filter(d => d.y > mid).sort((a, b) => a.x - b.x).map(d => timeSigDigit(d.c)).join('');
      if (num > 0 && den > 0) tsChanges.push({ x: g[0].x, num, den });
    }
  }

  // --- Arpeggios -----------------------------------------------------------
  arps.sort((a, b) => a.x - b.x || a.y - b.y);
  const arpGroups = [];
  for (const a of arps) {
    const g = arpGroups.find(g => Math.abs(g.x - a.x) < 0.5 * sp && a.y - g.y1 < 2 * sp);
    if (g) { g.y0 = Math.min(g.y0, a.y); g.y1 = Math.max(g.y1, a.y); if (a.dir === 'down') g.dir = 'down'; }
    else arpGroups.push({ x: a.x, y0: a.y, y1: a.y, dir: a.dir, size: a.size });
  }
  for (const g of arpGroups) {
    // Rotated wiggles run from the glyph origin across one advance.
    const near = events.filter(e => e.kind === 'chord' && e.x > g.x && e.x - g.x < 4 * sp &&
      e.heads.some(h => h.y >= g.y0 - 1.5 * sp && h.y <= g.y1 + 2.5 * sp));
    if (!near.length) continue;
    // Only the chord(s) immediately to the right, not the notes after them.
    const firstX = Math.min(...near.map(e => e.x));
    const chords = near.filter(e => e.x - firstX < 0.75 * sp);
    stats.arpeggios++;
    const heads = chords.flatMap(e => e.heads.filter(h => h.y >= g.y0 - 1.5 * sp && h.y <= g.y1 + 2.5 * sp).map(h => ({ h, e })));
    // Order by pitch (lowest = largest y within a staff; staves are ordered).
    heads.sort((a, b) => (b.e.si - a.e.si) || (b.h.y - a.h.y));
    if (g.dir === 'down') heads.reverse();
    heads.forEach(({ h }, i) => { h.roll = i; h.rollN = heads.length; });
  }

  // Development hook: inspect a system's events before timing.
  if (options.debug) options.debug(sysIdx, events, beams, perStaff);
  // --- 5 + 6. Per-measure rhythm and pitch --------------------------------
  const measures = [];
  for (let mi = 0; mi < boundaries.length; mi++) {
    const mx0 = measureStarts[mi], mx1 = boundaries[mi];
    const evs = events.filter(e => e.measure === mi);
    // The strip after a system's final barline only holds courtesy clefs,
    // keys or time signatures — not a measure.
    if (!evs.length && mi === boundaries.length - 1 && mi > 0 && bars.some(b => Math.abs(b - measureStarts[mi]) < 0.1)) continue;
    // Time signature in force.
    for (const t of tsChanges) {
      if (t.x < mx1 && (t.x >= mx0 - sp || (mi === 0 && t.x < mx1))) {
        carry.timeSig = { num: t.num, den: t.den, found: true };
      }
    }
    const nominal = carry.timeSig.num * 4 / carry.timeSig.den;

    const timed = evs.filter(e => !e.fullMeasure);
    // Column clustering on the event's left x.
    timed.sort((a, b) => a.x - b.x);
    const columns = [];
    for (const e of timed) {
      const col = columns[columns.length - 1];
      if (col && e.x - col.x < 0.75 * sp) col.events.push(e);
      else columns.push({ x: e.x, events: [e] });
    }
    // Two voices clashing on a second/unison are drawn a head-width apart but
    // sound together: merge those neighbouring columns.
    const clash = (a, b) => a.kind === 'chord' && b.kind === 'chord' && a.si === b.si &&
      a.stem && b.stem && a.up !== b.up && Math.abs(a.x - b.x) <= 1.3 * Math.max(a.w, b.w) &&
      a.heads.some(h => b.heads.some(k => Math.abs(h.y - k.y) <= 0.6 * sp));
    for (let ci = columns.length - 1; ci > 0; ci--) {
      if (columns[ci].events.some(b => columns[ci - 1].events.some(a => clash(a, b)))) {
        columns[ci - 1].events.push(...columns[ci].events);
        columns.splice(ci, 1);
      }
    }
    let t = 0;
    const placed = [];
    columns.forEach((col, ci) => {
      if (ci > 0) {
        const ends = placed.map(e => e.start + e.dur).filter(v => v > t + EPS);
        t = ends.length ? Math.min(...ends) : Math.max(t, ...placed.map(e => e.start + e.dur));
      }
      for (const e of col.events) { e.start = t; placed.push(e); }
    });
    const content = placed.reduce((a, e) => Math.max(a, e.start + e.dur), 0);

    // Pitches with accidentals carried through the measure.
    const notes = [];
    const measureAcc = staves.map(() => new Map());
    const chordsInOrder = evs.filter(e => e.kind === 'chord').sort((a, b) => a.x - b.x);
    for (const e of chordsInOrder) {
      const staff = staves[e.si];
      for (const h of e.heads) {
        const dia = diatonicOf(staff, h.y, h.x);
        const letter = ((dia % 7) + 7) % 7;
        const octave = Math.floor(dia / 7);
        let alter;
        if (headAcc.has(h)) {
          alter = headAcc.get(h);
          measureAcc[e.si].set(dia, alter);
        } else if (measureAcc[e.si].has(dia)) {
          alter = measureAcc[e.si].get(dia);
        } else {
          alter = keyAt(staff, h.x).map[letter] || 0;
        }
        const pitch = 12 * (octave + 1) + LETTER_PCS[letter] + alter;
        const note = { staffIdx: e.si, pitch, start: e.start, dur: e.dur, dia, head: h, roll: h.roll || 0, rollN: h.rollN || 0, src: { page: sy.page, x: h.x, y: h.y, w: h.w } };
        h.note = note;
        notes.push(note);
      }
      stats.chords++;
    }
    stats.rests += evs.filter(e => e.kind === 'rest').length;

    // Grace notes: played just before their principal note, taking the time
    // from the previous note (as MuseScore plays acciaccaturas).
    staves.forEach((staff, si) => {
      const graces = perStaff[si].graces.filter(g => measureOf(g.x) === mi).sort((a, b) => a.x - b.x);
      const principals = chordsInOrder.filter(e => e.si === si);
      const groups = new Map();
      for (const g of graces) {
        const p = principals.find(e => e.x > g.x);
        if (!p) continue;
        if (!groups.has(p)) groups.set(p, []);
        groups.get(p).push(g);
      }
      for (const [p, gs] of groups) {
        const cols = [];
        for (const g of gs) {
          const c = cols[cols.length - 1];
          if (c && Math.abs(g.x - c[0].x) < 0.5 * sp) c.push(g); else cols.push([g]);
        }
        const before = notes.filter(n => n.staffIdx === si && n.start < p.start - EPS && Math.abs(n.start + n.dur - p.start) < EPS);
        const prevDur = before.length ? Math.min(...before.map(n => n.dur)) : 1;
        const each = Math.min(0.5, prevDur / (2 * cols.length));
        cols.forEach((col, k) => {
          const start = p.start - each * (cols.length - k);
          for (const g of col) {
            const dia = diatonicOf(staff, g.y, g.x);
            const letter = ((dia % 7) + 7) % 7;
            const small = perStaff[si].accs.find(a => a.small && Math.abs(a.y - g.y) < 0.3 * sp && g.x - (a.x + a.w) > -0.3 * sp && g.x - (a.x + a.w) < sp);
            const alter = small ? small.alter
              : measureAcc[si].has(dia) ? measureAcc[si].get(dia)
              : keyAt(staff, g.x).map[letter] || 0;
            const pitch = 12 * (Math.floor(dia / 7) + 1) + LETTER_PCS[letter] + alter;
            // Cut a previous note of the same pitch so the two don't overlap.
            for (const n of notes) {
              if (n.staffIdx === si && n.pitch === pitch && n.start < start && n.start + n.dur > start) n.dur = start - n.start;
            }
            notes.push({ staffIdx: si, pitch, start, dur: each, dia, grace: true, src: { page: sy.page, x: g.x, y: g.y, w: g.w } });
            stats.graceNotes++;
          }
        });
      }
    });

    const key = keyAt(staves[0], mx0 + 0.1);
    measures.push({
      notes, content, nominal,
      timeSig: { num: carry.timeSig.num, den: carry.timeSig.den },
      keyFifths: key ? key.fifths : 0
    });
  }

  // --- 7. Ties --------------------------------------------------------------
  const headList = events.filter(e => e.kind === 'chord').flatMap(e => e.heads.map(h => ({ h, e })));
  const incoming = [];
  for (const c of curves) {
    const pts = c.pts;
    const L = pts.reduce((a, p) => (p[0] < a[0] ? p : a));
    const R = pts.reduce((a, p) => (p[0] > a[0] ? p : a));
    if (R[0] - L[0] > 40 * sp) continue;
    // A tie bulging downwards hangs below its notes (and vice versa): its
    // endpoints sit on the far side of the heads they join.
    const endY = (L[1] + R[1]) / 2;
    const midY = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const bulgeDown = midY > endY;
    const sideOk = h => (bulgeDown ? h.y < endY + 0.1 * sp : h.y > endY - 0.1 * sp);
    const lefts = [], rights = [];
    for (const { h } of headList) {
      if (!h.note || !sideOk(h)) continue;
      const dyL = Math.abs(h.y - L[1]), dyR = Math.abs(h.y - R[1]);
      const dxL = L[0] - (h.x + h.w);
      if (dyL < 1.3 * sp && dxL > -1.2 * sp && dxL < 2 * sp && L[0] > h.x) lefts.push({ h, d: Math.abs(dxL) + dyL });
      const dxR = h.x - R[0];
      if (dyR < 1.3 * sp && dxR > -1.2 * sp && dxR < 2 * sp && R[0] < h.x + h.w) rights.push({ h, d: Math.abs(dxR) + dyR });
    }
    // Best pair on the same staff position (ties in chords sit between heads,
    // so the nearest head at each end alone can belong to a neighbour).
    let pair = null;
    for (const a of lefts) {
      for (const b of rights) {
        if (a.h === b.h || a.h.note.dia !== b.h.note.dia || a.h.note.staffIdx !== b.h.note.staffIdx) continue;
        if (b.h.x <= a.h.x) continue;
        if (a.h.note.tieTo || b.h.note.tiedFrom) continue;
        if (!pair || a.d + b.d < pair.d) pair = { h1: a.h, h2: b.h, d: a.d + b.d };
      }
    }
    const nearest = list => list.reduce((best, c) => (!best || c.d < best.d ? c : best), null);
    const h1 = pair ? pair.h1 : (nearest(lefts) || {}).h || null;
    const h2 = pair ? pair.h2 : (nearest(rights) || {}).h || null;
    if (pair) {
      h1.note.tieTo = h2.note; h2.note.tiedFrom = h1.note; stats.ties++;
    } else if (h1 && !h2 && h1.note && R[0] > sysX1 - 2.5 * sp) {
      carry.pendingTies.push({ note: h1.note, sys: sysIdx });
    } else if (!h1 && h2 && h2.note && L[0] < h2.x - 0.5 * sp && L[0] < sysX0 + 12 * sp + (firstEventX(h2.note.staffIdx) - sysX0)) {
      incoming.push(h2.note);
    }
  }
  for (const n of incoming) {
    const idx = carry.pendingTies.findIndex(p => p.sys === sysIdx - 1 && p.note.staffIdx === n.staffIdx && p.note.pitch === n.pitch);
    if (idx >= 0) {
      const p = carry.pendingTies.splice(idx, 1)[0];
      p.note.tieTo = n; n.tiedFrom = p.note; stats.ties++;
    }
  }
  carry.pendingTies = carry.pendingTies.filter(p => p.sys === sysIdx);

  return { measures };
}
