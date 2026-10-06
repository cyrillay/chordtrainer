// Lists a MIDIAccess's inputs in a way every implementation supports.
// The Web MIDI Browser app on iPhone/iPad injects an old polyfill whose
// inputs.values() returns a bare { next } object with no Symbol.iterator,
// so `for...of access.inputs.values()` throws there. forEach works on the
// native MIDIInputMap and on that polyfill alike.
export function midiInputs(access) {
  const list = [];
  const inputs = access && access.inputs;
  if (inputs && typeof inputs.forEach === 'function') inputs.forEach((input) => list.push(input));
  return list;
}
