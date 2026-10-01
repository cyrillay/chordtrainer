// Web MIDI input for the arpeggio trainer. Velocity, timestamps and the
// sustain pedal matter here (several achievements read them), so this is a
// separate, event-based wrapper rather than the chord trainer's held-notes
// module.

const LS_GRANTED = 'arpeggioTrainer.midiGranted';

export function createMidi({ onNoteOn, onNoteOff, onPedal, onStatus }) {
  let access = null;

  function handle(e) {
    const [status, d1, d2] = e.data;
    const cmd = status & 0xf0;
    const t = performance.now();
    if (cmd === 0x90 && d2 > 0) onNoteOn(d1, d2, t);
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) onNoteOff(d1, t);
    else if (cmd === 0xb0 && d1 === 64) onPedal(d2 >= 64, t);
  }

  function refresh() {
    const names = [];
    for (const input of access.inputs.values()) {
      input.onmidimessage = handle;
      names.push(input.name);
    }
    onStatus(names.length ? { state: 'connected', names } : { state: 'nodevice', names });
  }

  async function connect() {
    if (!navigator.requestMIDIAccess) {
      onStatus({ state: 'unsupported', names: [] });
      return false;
    }
    try {
      access = await navigator.requestMIDIAccess();
      try { localStorage.setItem(LS_GRANTED, '1'); } catch { /* ignore */ }
      access.onstatechange = refresh;
      refresh();
      // Some platforms enumerate inputs a beat after access resolves.
      setTimeout(refresh, 500);
      return true;
    } catch {
      onStatus({ state: 'denied', names: [] });
      return false;
    }
  }

  const previouslyGranted = () => {
    try { return localStorage.getItem(LS_GRANTED) === '1'; } catch { return false; }
  };

  return { connect, previouslyGranted };
}

// Dev/testing aid, only active with ?keys in the URL: the computer keyboard
// as a one-and-a-half-octave piano (A W S E D F T G Y H U J K O L P ;),
// Z/X shift octaves, Shift = louder, Alt = softer.
export function attachComputerKeyboard({ onNoteOn, onNoteOff }) {
  const MAP = 'awsedftgyhujkolp;';
  let base = 60;
  const down = new Map();
  window.addEventListener('keydown', e => {
    if (e.repeat || e.target.closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { base = Math.max(24, base - 12); return; }
    if (k === 'x') { base = Math.min(96, base + 12); return; }
    const i = MAP.indexOf(k);
    if (i < 0 || down.has(k)) return;
    const midi = base + i;
    down.set(k, midi);
    onNoteOn(midi, e.shiftKey ? 120 : e.altKey ? 25 : 80, performance.now());
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    const midi = down.get(k);
    if (midi === undefined) return;
    down.delete(k);
    onNoteOff(midi, performance.now());
  });
}
