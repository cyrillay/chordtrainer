// Minimal Standard MIDI File reader for tests: notes per track, in quarters.
export function readMidi(bytes) {
  let p = 0;
  const u32 = () => (bytes[p++] << 24 | bytes[p++] << 16 | bytes[p++] << 8 | bytes[p++]) >>> 0;
  const u16 = () => (bytes[p++] << 8) | bytes[p++];
  const str = n => String.fromCharCode(...bytes.slice(p, (p += n)));
  const vlq = () => { let v = 0, b; do { b = bytes[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  if (str(4) !== 'MThd') throw new Error('not a MIDI file');
  const hlen = u32();
  const format = u16(), ntracks = u16(), ppq = u16();
  p += hlen - 6;
  const tracks = [];
  for (let t = 0; t < ntracks; t++) {
    if (str(4) !== 'MTrk') throw new Error('bad track');
    const end = u32() + p;
    let tick = 0, status = 0;
    const on = new Map(), notes = [], metas = [];
    while (p < end) {
      tick += vlq();
      let b = bytes[p];
      if (b & 0x80) { status = b; p++; }
      if (status === 0xff) {
        const type = bytes[p++]; const len = vlq();
        metas.push({ tick, type, data: [...bytes.slice(p, p + len)] });
        p += len;
      } else if (status === 0xf0 || status === 0xf7) {
        p += vlq();
      } else {
        const kind = status & 0xf0, ch = status & 0x0f;
        const d1 = bytes[p++];
        const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[p++];
        const key = ch * 128 + d1;
        if (kind === 0x90 && d2 > 0) on.set(key, tick);
        else if ((kind === 0x80 || (kind === 0x90 && d2 === 0)) && on.has(key)) {
          notes.push({ pitch: d1, channel: ch, start: on.get(key) / ppq, dur: (tick - on.get(key)) / ppq });
          on.delete(key);
        }
      }
    }
    p = end;
    tracks.push({ notes: notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch), metas });
  }
  return { format, ppq, tracks };
}
