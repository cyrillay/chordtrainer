// Engraves an exercise with VexFlow (loaded globally as `Vex` from the CDN)
// and returns what the play view needs to drive it: the SVG element of
// every note (to colour hits and misses) and the x position of every onset
// (to move the cursor).

import { timeSignature } from './notation.js';

const STAVE_GAP = 100;       // top of treble stave → top of bass stave
const SYSTEM_GAP = 36;       // vertical air between systems
const PAD_X = 12;
const MIN_FIRST_EXTRA = 0;

const refKey = (staff, voice, measure, index) => `${staff}:${voice}:${measure}:${index}`;
export { refKey };

function restKey(clef, voice, voices) {
  if (voices > 1) {
    if (clef === 'treble') return voice === 0 ? 'f/5' : 'd/4';
    return voice === 0 ? 'b/3' : 'e/2';
  }
  return clef === 'treble' ? 'b/4' : 'd/3';
}

function measuresPerLine(width, ex) {
  const count = ex.measures.length;
  // Busy bars (sixteenths) need room: cap bars per line by note density.
  const busiest = Math.max(...ex.measures.map(maxEvents));
  const byDensity = Math.max(1, Math.floor(width / (40 + 24 * busiest)));
  const per = Math.min(width < 520 ? 2 : width < 860 ? 3 : 4, byDensity);
  const lines = Math.ceil(count / per);
  return Math.ceil(count / lines);
}

function maxEvents(measure) {
  let n = 0;
  for (const voices of Object.values(measure)) {
    for (const v of voices) n = Math.max(n, v.length);
  }
  return n;
}

// Visual weight of a bar, so busy bars get more room.
function barWeight(measure) {
  return 1.6 + Math.sqrt(maxEvents(measure));
}

export function renderExercise(container, ex) {
  const VF = window.Vex.Flow;
  container.innerHTML = '';
  const width = Math.max(300, container.clientWidth);
  const { num, den, measureBeats } = timeSignature(ex.time);
  const grand = ex.staves.length === 2;
  const perLine = measuresPerLine(width, ex);
  const lineCount = Math.ceil(ex.measures.length / perLine);
  const systemHeight = (grand ? STAVE_GAP : 0) + 110;
  const height = lineCount * (systemHeight + SYSTEM_GAP) + 10;

  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  const svg = container.querySelector('svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.removeAttribute('width');
  svg.style.width = '100%';
  svg.style.height = 'auto';

  const notes = new Map();      // refKey → StaveNote
  const systems = [];
  const measureBox = [];        // per measure: { x0, x1, system }
  const tiePending = new Map(); // `${staff}:${voice}` → { note, indices }
  const ties = [];

  for (let line = 0; line < lineCount; line++) {
    const first = line * perLine;
    const idxs = [];
    for (let i = first; i < Math.min(first + perLine, ex.measures.length); i++) idxs.push(i);
    const top = 10 + line * (systemHeight + SYSTEM_GAP);
    const yFor = (clef) => top + (grand && clef === 'bass' ? STAVE_GAP : 0);

    // Width of clef + key (+ time) at the start of the line.
    const probe = new VF.Stave(0, 0, 200).addClef(ex.staves[0]).addKeySignature(ex.key);
    if (line === 0) probe.addTimeSignature(ex.time);
    const startExtra = Math.max(MIN_FIRST_EXTRA, probe.getNoteStartX());

    // Full lines span the width; a short last line keeps the same bar size.
    const weights = idxs.map((i) => barWeight(ex.measures[i]));
    const slots = line === lineCount - 1 && idxs.length < perLine && lineCount > 1 ? perLine : idxs.length;
    const avgW = weights.reduce((a, b) => a + b, 0) / weights.length;
    const totalW = weights.reduce((a, b) => a + b, 0) + avgW * (slots - idxs.length);
    const usable = width - 2 * PAD_X - startExtra;

    let x = PAD_X;
    const system = { top, bottom: top + systemHeight, measures: idxs, x0: PAD_X };

    idxs.forEach((mi, j) => {
      const w = usable * (weights[j] / totalW) + (j === 0 ? startExtra : 0);
      const measure = ex.measures[mi];
      const staves = {};
      for (const clef of ex.staves) {
        const st = new VF.Stave(x, yFor(clef), w);
        if (j === 0) {
          st.addClef(clef).addKeySignature(ex.key);
          if (mi === 0) st.addTimeSignature(ex.time);
        }
        if (mi === ex.measures.length - 1) st.setEndBarType(VF.Barline.type.END);
        staves[clef] = st;
      }
      const startX = Math.max(...Object.values(staves).map((s) => s.getNoteStartX()));
      for (const s of Object.values(staves)) { s.setNoteStartX(startX); s.setContext(ctx).draw(); }

      if (grand) {
        const [t, b] = [staves.treble, staves.bass];
        if (j === 0) {
          new VF.StaveConnector(t, b).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
          new VF.StaveConnector(t, b).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
        }
        const endType = mi === ex.measures.length - 1
          ? VF.StaveConnector.type.BOLD_DOUBLE_RIGHT : VF.StaveConnector.type.SINGLE_RIGHT;
        new VF.StaveConnector(t, b).setType(endType).setContext(ctx).draw();
      }

      // Notes, voices, accidentals, beams.
      const allVoices = [];
      const perStave = [];
      const beams = [];
      for (const clef of ex.staves) {
        const voicesSrc = measure[clef] || [];
        const multi = voicesSrc.length > 1;
        const vfVoices = voicesSrc.map((events, v) => {
          const tickables = events.map((ev, ei) => {
            const fullRest = ev.rest && Math.abs(ev.beats - measureBeats) < 1e-6 && !multi;
            const opts = {
              clef,
              keys: ev.rest ? [restKey(clef, v, voicesSrc.length)] : ev.keys,
              duration: fullRest ? 'wr' : `${ev.dur}${'d'.repeat(ev.dots)}${ev.rest ? 'r' : ''}`,
            };
            if (fullRest) opts.align_center = true;
            if (multi) opts.stem_direction = v === 0 ? 1 : -1;
            else opts.auto_stem = true;
            const note = new VF.StaveNote(opts);
            if (ev.dots && !fullRest) {
              for (let d = 0; d < ev.dots; d++) VF.Dot.buildAndAttach([note], { all: true });
            }
            notes.set(refKey(clef, v, mi, ei), note);

            // Ties into this note from the previous one in the same voice.
            const tk = `${clef}:${v}`;
            const pending = tiePending.get(tk);
            if (pending && !ev.rest) {
              const idx = [], lastIdx = [];
              ev.keys.forEach((k, ki) => {
                const pi = pending.keys.indexOf(k);
                if (pi >= 0) { idx.push(pi); lastIdx.push(ki); }
              });
              if (idx.length) ties.push({ first: pending.note, last: note, first_indices: idx, last_indices: lastIdx });
            }
            tiePending.set(tk, ev.tie && !ev.rest ? { note, keys: ev.keys } : null);
            return note;
          });
          const voice = new VF.Voice({ num_beats: num, beat_value: den }).setMode(VF.Voice.Mode.SOFT);
          voice.addTickables(tickables);
          const groups = VF.Beam.getDefaultBeamGroups(ex.time);
          const beamOpts = { groups, beam_rests: false };
          if (multi) beamOpts.stem_direction = v === 0 ? 1 : -1;
          beams.push(...VF.Beam.generateBeams(tickables, beamOpts));
          return voice;
        });
        if (vfVoices.length) VF.Accidental.applyAccidentals(vfVoices, ex.key);
        perStave.push({ stave: staves[clef], voices: vfVoices });
        allVoices.push(...vfVoices);
      }
      const formatter = new VF.Formatter();
      for (const { voices } of perStave) if (voices.length) formatter.joinVoices(voices);
      const st0 = staves[ex.staves[0]];
      const justify = Math.max(20, st0.getNoteEndX() - st0.getNoteStartX() - 14);
      formatter.format(allVoices, justify);
      for (const { stave, voices } of perStave) for (const v of voices) v.draw(ctx, stave);
      for (const b of beams) b.setContext(ctx).draw();

      measureBox[mi] = { x0: st0.getNoteStartX(), x1: x + w, system: line };
      x += w;
    });
    system.x1 = x;
    systems.push(system);
  }

  for (const t of ties) {
    new VF.StaveTie({
      first_note: t.first, last_note: t.last,
      first_indices: t.first_indices, last_indices: t.last_indices,
    }).setContext(ctx).draw();
  }

  return {
    svg,
    width,
    height,
    systems,
    measureBox,
    noteEl(key) {
      const n = notes.get(key);
      return n ? n.getSVGElement() : null;
    },
    // Centre of the notehead(s), in SVG units.
    noteX(key) {
      const n = notes.get(key);
      if (!n) return null;
      try { return (n.getNoteHeadBeginX() + n.getNoteHeadEndX()) / 2; } catch { return n.getAbsoluteX(); }
    },
  };
}
