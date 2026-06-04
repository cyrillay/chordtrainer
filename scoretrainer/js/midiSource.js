// MIDI → in-memory model that can be sliced by measure ranges, and from
// there serialized to MusicXML for OSMD to render. We accept that the
// resulting score will be "functional, not engraved": all notes are
// quantized to a 16th-note grid, ties across measure boundaries are
// dropped (the trailing portion becomes a rest), and notes are split into
// a treble and a bass staff at middle C. If the user wants a polished
// score they should use the PDF flow instead.

const MIDI_VER = '2.0.28';
const MIDI_URL = `https://cdn.jsdelivr.net/npm/@tonejs/midi@${MIDI_VER}/+esm`;

let MidiLib = null;
async function ensureMidiLib() {
  if (MidiLib) return MidiLib;
  const mod = await import(/* webpackIgnore: true */ MIDI_URL);
  MidiLib = mod.Midi || mod.default;
  return MidiLib;
}

// MusicXML grid: 16 units per quarter ⇒ smallest unit is a 64th note.
const DIVISIONS = 16;

// All standard MusicXML duration "type" + dots combos, in descending duration
// units. Used to snap arbitrary quantized durations to a legal value.
const TYPES = [
  { units: 64, type: 'whole',   dots: 0 },
  { units: 48, type: 'half',    dots: 1 },
  { units: 32, type: 'half',    dots: 0 },
  { units: 24, type: 'quarter', dots: 1 },
  { units: 16, type: 'quarter', dots: 0 },
  { units: 12, type: 'eighth',  dots: 1 },
  { units: 8,  type: 'eighth',  dots: 0 },
  { units: 6,  type: '16th',    dots: 1 },
  { units: 4,  type: '16th',    dots: 0 },
  { units: 3,  type: '32nd',    dots: 1 },
  { units: 2,  type: '32nd',    dots: 0 },
  { units: 1,  type: '64th',    dots: 0 },
];

// Snap to the largest legal duration that is ≤ `units`. Beats getting fancy
// with ties (which OSMD renders but our quantized MIDI input rarely benefits
// from — the source is already coarse). Caller is responsible for capping.
function snapDownLegal(units) {
  return TYPES.find(t => t.units <= units) || TYPES[TYPES.length - 1];
}

// Greedy split for rests, where ties are unnecessary so a simple sequence
// of legal-duration rests is always correct.
function splitForRest(units) {
  const out = [];
  let remaining = units;
  while (remaining > 0) {
    const t = TYPES.find(t => t.units <= remaining) || TYPES[TYPES.length - 1];
    out.push(t);
    remaining -= t.units;
  }
  return out;
}

// Sharp spelling, simple and predictable. Enharmonic correctness via the
// MIDI key signature meta event is left for a future iteration.
const PC_NAMES = [
  { step: 'C', alter: 0 }, { step: 'C', alter: 1 },
  { step: 'D', alter: 0 }, { step: 'D', alter: 1 },
  { step: 'E', alter: 0 }, { step: 'F', alter: 0 },
  { step: 'F', alter: 1 }, { step: 'G', alter: 0 },
  { step: 'G', alter: 1 }, { step: 'A', alter: 0 },
  { step: 'A', alter: 1 }, { step: 'B', alter: 0 },
];

function midiToPitch(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return { ...PC_NAMES[pc], octave };
}

export async function loadMidiFromFile(file) {
  const Midi = await ensureMidiLib();
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  const ppq = midi.header.ppq || 480;
  const tsList = midi.header.timeSignatures.length
    ? midi.header.timeSignatures
    : [{ ticks: 0, timeSignature: [4, 4] }];
  // For now we honor only the first time signature; mid-piece changes are
  // unusual in practice material and would complicate the chunker.
  const [num, den] = tsList[0].timeSignature;
  const ticksPerMeasure = ppq * 4 * num / den;

  // Flatten + sort + quantize
  const allNotes = [];
  for (const track of midi.tracks) {
    for (const n of track.notes) {
      allNotes.push({
        midi: n.midi,
        ticks: n.ticks,
        durationTicks: Math.max(1, n.durationTicks),
        velocity: n.velocity,
      });
    }
  }
  allNotes.sort((a, b) => a.ticks - b.ticks || a.midi - b.midi);

  const totalTicks = allNotes.length
    ? Math.max(...allNotes.map(n => n.ticks + n.durationTicks))
    : 0;
  const numMeasures = Math.max(1, Math.ceil(totalTicks / ticksPerMeasure));

  // Pre-compute per-measure note buckets for fast chunk extraction. Each
  // bucket stores the notes whose onset lies in [measureStart, measureEnd).
  const buckets = Array.from({ length: numMeasures }, () => []);
  const tickToUnits = DIVISIONS / ppq;
  for (const n of allNotes) {
    const measureIdx = Math.floor(n.ticks / ticksPerMeasure);
    if (measureIdx >= numMeasures) continue;
    const onsetInMeasureTicks = n.ticks - measureIdx * ticksPerMeasure;
    const onsetUnits = Math.max(0, Math.round(onsetInMeasureTicks * tickToUnits));
    const durUnits   = Math.max(1, Math.round(n.durationTicks * tickToUnits));
    buckets[measureIdx].push({
      midi: n.midi,
      onsetUnits,
      durUnits,
    });
  }
  // Sort each bucket by onset, then pitch (lower first so chords stack
  // naturally in <note><chord/> sequence).
  for (const b of buckets) b.sort((a, b) => a.onsetUnits - b.onsetUnits || a.midi - b.midi);

  const unitsPerMeasure = Math.round(ticksPerMeasure * tickToUnits);

  return {
    kind: 'midi',
    name: file.name,
    numMeasures,
    timeSignature: [num, den],
    unitsPerMeasure,
    // Render a contiguous run of measures (1-based inclusive endpoints
    // mapped here to 0-based start, exclusive end) to a MusicXML document
    // string. OSMD only needs the XML literal.
    toMusicXml(measureStart /* 0-based */, measureCount) {
      const slice = buckets.slice(measureStart, measureStart + measureCount);
      return buildMusicXml({
        measures: slice,
        timeSignature: [num, den],
        unitsPerMeasure,
        startNum: measureStart + 1,
      });
    },
    // For UI: a flat list of "measures" the chunker can slice. The content
    // is the same data we already bucketed.
    measures: buckets.map((notes, i) => ({ num: i + 1, notes })),
  };
}

// ---------------------------------------------------------------------------
// MusicXML serializer
// ---------------------------------------------------------------------------

function escapeXml(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

// Render one measure's worth of notes onto one staff, picking only notes
// whose pitch satisfies `pitchFilter`. Each onset becomes a single chord
// whose duration is snapped DOWN to a legal MusicXML duration (whole, half,
// dotted-half, quarter, ...) so we never need ties. Any overshoot gets
// dropped (the note simply sounds shorter than the MIDI suggested).
function renderStaff(notes, unitsPerMeasure, voice, staffNum, pitchFilter) {
  const filtered = notes.filter(n => pitchFilter(n.midi));
  const byOnset = new Map();
  for (const n of filtered) {
    if (!byOnset.has(n.onsetUnits)) byOnset.set(n.onsetUnits, []);
    byOnset.get(n.onsetUnits).push(n);
  }
  const onsets = [...byOnset.keys()]
    .sort((a, b) => a - b)
    .filter(o => o < unitsPerMeasure);

  let out = '';
  let cursor = 0;

  function emitRest(units) {
    if (units <= 0) return;
    for (const t of splitForRest(units)) {
      const isWholeMeasure = (t.units === unitsPerMeasure) && (cursor === 0) && (units === unitsPerMeasure);
      out += `<note>`;
      out += isWholeMeasure ? `<rest measure="yes"/>` : `<rest/>`;
      out += `<duration>${t.units}</duration>`;
      out += `<voice>${voice}</voice>`;
      if (!isWholeMeasure) {
        out += `<type>${t.type}</type>`;
        for (let d = 0; d < t.dots; d++) out += `<dot/>`;
      }
      out += `<staff>${staffNum}</staff>`;
      out += `</note>`;
    }
  }

  for (let i = 0; i < onsets.length; i++) {
    const onset = onsets[i];
    if (onset > cursor) emitRest(onset - cursor);

    // Cap duration so we don't run past the next onset or the bar line.
    const nextBoundary = (i + 1 < onsets.length) ? onsets[i + 1] : unitsPerMeasure;
    const desiredDur = byOnset.get(onset)[0].durUnits;
    const maxDur = Math.max(1, nextBoundary - onset);
    const dur = Math.min(desiredDur, maxDur);
    const t = snapDownLegal(dur);

    const chord = byOnset.get(onset);
    chord.forEach((n, idx) => {
      const p = midiToPitch(n.midi);
      out += `<note>`;
      if (idx > 0) out += `<chord/>`;
      out += `<pitch><step>${p.step}</step>`;
      if (p.alter) out += `<alter>${p.alter}</alter>`;
      out += `<octave>${p.octave}</octave></pitch>`;
      out += `<duration>${t.units}</duration>`;
      out += `<voice>${voice}</voice>`;
      out += `<type>${t.type}</type>`;
      for (let d = 0; d < t.dots; d++) out += `<dot/>`;
      out += `<staff>${staffNum}</staff>`;
      out += `</note>`;
    });
    cursor = onset + t.units;
  }
  if (cursor < unitsPerMeasure) emitRest(unitsPerMeasure - cursor);
  return out;
}

function buildMusicXml({ measures, timeSignature, unitsPerMeasure, startNum }) {
  const [num, den] = timeSignature;

  let body = '';
  measures.forEach((notes, i) => {
    const measureNum = startNum + i;
    body += `<measure number="${measureNum}">`;
    if (i === 0) {
      // Attributes only on first measure of the slice — OSMD inherits.
      body += `<attributes>`;
      body += `<divisions>${DIVISIONS}</divisions>`;
      body += `<key><fifths>0</fifths></key>`;
      body += `<time><beats>${num}</beats><beat-type>${den}</beat-type></time>`;
      body += `<staves>2</staves>`;
      body += `<clef number="1"><sign>G</sign><line>2</line></clef>`;
      body += `<clef number="2"><sign>F</sign><line>4</line></clef>`;
      body += `</attributes>`;
    }
    // Treble (staff 1): notes with midi >= 60 (middle C and above)
    body += renderStaff(notes, unitsPerMeasure, /*voice*/ 1, /*staff*/ 1, m => m >= 60);
    // Backup to rewind the cursor to the start of the measure so the bass
    // staff lays out on top of (= vertically aligned with) the treble.
    body += `<backup><duration>${unitsPerMeasure}</duration></backup>`;
    // Bass (staff 2): notes with midi < 60
    body += renderStaff(notes, unitsPerMeasure, /*voice*/ 2, /*staff*/ 2, m => m < 60);
    body += `</measure>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Score</part-name></score-part>
  </part-list>
  <part id="P1">${body}</part>
</score-partwise>`;
}
