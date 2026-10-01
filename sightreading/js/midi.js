// Web MIDI input for the Read Trainer. Reports note-ons with the event's
// timestamp (same clock as performance.now()) so tempo grading isn't
// skewed by main-thread jank.

const MIDI_BLE_CONNECT_URL = 'https://play.google.com/store/apps/details?id=com.mobileer.example.midibtlepairing';
const WEB_MIDI_BROWSER_URL = 'https://apps.apple.com/fr/app/web-midi-browser/id953846217';

const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Same guidance as the chord trainer: the fix for "no device" depends on the
// platform, Android in particular never exposes Bluetooth MIDI to Chrome
// unless another app opens the link first.
export function noDeviceHelpHtml() {
  if (isIOS()) {
    return `iPhone and iPad browsers don't support MIDI. Use the <a href="${WEB_MIDI_BROWSER_URL}" target="_blank" rel="noopener">Web MIDI Browser</a> app `
      + 'and open this page in it.';
  }
  if (isAndroid()) {
    return `<strong>Bluetooth:</strong> Chrome can't scan for Bluetooth MIDI on Android. Install the free app `
      + `<a href="${MIDI_BLE_CONNECT_URL}" target="_blank" rel="noopener">MIDI BLE Connect</a>, `
      + 'connect your keyboard there, then come back here. Close your keyboard\'s own app first: only one app can hold the Bluetooth link.';
  }
  return '<strong>USB:</strong> plug the keyboard in, then reload if it does not appear. '
    + '<strong>Bluetooth:</strong> connect it in your system\'s MIDI settings first '
    + '(Mac: Audio MIDI Setup → Window → Show MIDI Studio → Bluetooth). '
    + 'Still nothing? Check the site\'s MIDI permission (icon left of the URL).';
}

// handlers: { onNoteOn(midi, velocity, timeStamp), onNoteOff(midi), onStatus(status) }
// status: { state: 'unsupported' | 'denied' | 'none' | 'connected', names: [] }
export async function connectMidi(handlers) {
  if (!navigator.requestMIDIAccess) {
    handlers.onStatus({ state: 'unsupported', names: [] });
    return null;
  }
  let access;
  try {
    access = await navigator.requestMIDIAccess();
  } catch {
    handlers.onStatus({ state: 'denied', names: [] });
    return null;
  }

  const onMessage = (event) => {
    const [status, note, velocity] = event.data;
    const cmd = status & 0xf0;
    const t = event.timeStamp || performance.now();
    if (cmd === 0x90 && velocity > 0) handlers.onNoteOn(note, velocity, t);
    else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) handlers.onNoteOff?.(note, t);
  };

  const refresh = () => {
    const names = [];
    for (const input of access.inputs.values()) {
      input.onmidimessage = onMessage;
      names.push(input.name);
    }
    handlers.onStatus({ state: names.length ? 'connected' : 'none', names });
  };
  access.onstatechange = refresh;
  refresh();
  // Mobile browsers sometimes enumerate inputs a beat after resolving.
  setTimeout(refresh, 500);
  return access;
}
