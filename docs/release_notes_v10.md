# V10 — Mobile MIDI fix

Single-fix release.

## Fixes
- **MIDI connection on mobile**: the Web MIDI access request and device enumeration path was failing on iOS / Android browsers — fixed in `js/midi.js` so plugged-in keyboards (or BLE-MIDI bridges) connect reliably from a phone or tablet.
