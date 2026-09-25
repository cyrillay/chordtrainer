// Recognised score → Standard MIDI File (type 1).
//
// Track 0 carries the conductor data (tempo, time and key signatures), then
// one track per staff. Each staff gets its own channel: sharing one would let
// a note-off in one hand cut the same pitch held by the other.

export const PPQ = 480;

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7) > 0) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

const text = s => [...new TextEncoder().encode(s)];

function chunk(type, data) {
  const len = data.length;
  return [...text(type), (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...data];
}

// events: [{ tick, order, bytes }] → track bytes with delta times.
function encodeTrack(events) {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out = [];
  let last = 0;
  for (const e of events) {
    out.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  out.push(...vlq(0), 0xff, 0x2f, 0x00);
  return chunk('MTrk', out);
}

const meta = (type, data) => [0xff, type, ...vlq(data.length), ...data];

export function channelFor(trackIdx) {
  const ch = trackIdx % 15;
  return ch >= 9 ? ch + 1 : ch; // skip channel 10 (drums)
}

export function writeMidi(score, { tempo = score.tempo } = {}) {
  const ticks = q => Math.max(0, Math.round(q * PPQ));
  const conductor = [];
  conductor.push({ tick: 0, order: 0, bytes: meta(0x03, text(score.title || 'Converted score')) });
  const usec = Math.round(60_000_000 / tempo);
  conductor.push({ tick: 0, order: 1, bytes: meta(0x51, [(usec >> 16) & 0xff, (usec >> 8) & 0xff, usec & 0xff]) });
  for (const ts of score.timeSigs) {
    const den = Math.round(Math.log2(ts.den));
    conductor.push({ tick: ticks(ts.time), order: 2, bytes: meta(0x58, [ts.num, den, 24, 8]) });
  }
  for (const ks of score.keySigs) {
    conductor.push({ tick: ticks(ks.time), order: 3, bytes: meta(0x59, [ks.fifths & 0xff, 0]) });
  }

  const tracks = [encodeTrack(conductor)];
  score.tracks.forEach((tr, i) => {
    const ch = channelFor(i);
    const ev = [
      { tick: 0, order: 0, bytes: meta(0x03, text(tr.name)) },
      { tick: 0, order: 1, bytes: [0xc0 | ch, 0] } // Acoustic Grand Piano
    ];
    for (const n of tr.notes) {
      const on = ticks(n.start);
      const off = Math.max(on + 1, ticks(n.start + n.dur));
      const pitch = Math.min(127, Math.max(0, n.pitch));
      // At equal ticks: note-offs (order 2) before note-ons (order 3), so a
      // repeated pitch is released before it is struck again.
      ev.push({ tick: on, order: 3, bytes: [0x90 | ch, pitch, n.velocity || 80] });
      ev.push({ tick: off, order: 2, bytes: [0x80 | ch, pitch, 0] });
    }
    tracks.push(encodeTrack(ev));
  });

  const header = chunk('MThd', [0, 1, 0, tracks.length, (PPQ >> 8) & 0xff, PPQ & 0xff]);
  return new Uint8Array([...header, ...tracks.flat()]);
}
