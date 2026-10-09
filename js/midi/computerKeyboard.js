// The computer keyboard as a small piano, for development and for playing
// without a MIDI keyboard. Same handlers as js/midi/input.js.

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
