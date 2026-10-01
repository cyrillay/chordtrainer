// "How do I connect my keyboard?" text shared by every trainer's MIDI
// tooltip. Browsers only list MIDI devices the OS has already opened, so the
// fix for "No device" depends on the platform — Android in particular never
// exposes Bluetooth MIDI to Chrome unless another app opens the link first.

import { bindInfoTips } from '../ux/infoTip.js';

export const MIDI_BLE_CONNECT_URL = 'https://play.google.com/store/apps/details?id=com.mobileer.example.midibtlepairing';
export const WEB_MIDI_BROWSER_URL = 'https://apps.apple.com/fr/app/web-midi-browser/id953846217';
export const MIDI_GUIDE_URL = '/articles/midi-keyboard-connection/';

export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const GUIDE_LINK = `<a href="${MIDI_GUIDE_URL}" target="_blank" rel="noopener">Full connection guide →</a>`;
const OTHER_DEVICE = 'Make sure the keyboard isn\'t already connected to another device or app, such as a Mac it paired with before or its own piano app.';

export function noDeviceHelpHtml() {
  // iOS browsers have no Web MIDI at all; Web MIDI Browser is a WebKit
  // wrapper that adds it.
  if (isIOS()) {
    return `iPhone/iPad browsers don't support MIDI. Open this site in the `
      + `<a href="${WEB_MIDI_BROWSER_URL}" target="_blank" rel="noopener">Web MIDI Browser</a> app.<br><br>`
      + GUIDE_LINK;
  }
  if (isAndroid()) {
    return `<strong>Bluetooth</strong><br>Connect your keyboard in the free app `
      + `<a href="${MIDI_BLE_CONNECT_URL}" target="_blank" rel="noopener">MIDI BLE Connect</a> `
      + `(not in Android's Bluetooth settings), then come back here.<br><br>`
      + `<strong>USB</strong><br>An OTG cable works too.<br><br>`
      + `${OTHER_DEVICE}<br><br>${GUIDE_LINK}`;
  }
  return `<strong>Bluetooth</strong><br>On Mac: Audio MIDI Setup, Window, Show MIDI Studio, `
    + `then the Bluetooth icon and Connect. Windows browsers don't see Bluetooth MIDI yet.<br><br>`
    + `<strong>USB</strong><br>Plug it in, it just works.<br><br>`
    + `${OTHER_DEVICE}<br><br>${GUIDE_LINK}`;
}

export const DENIED_HELP_HTML = 'Allow MIDI for this site (icon left of the address bar), then reload.<br><br>' + GUIDE_LINK;

// "No device found ?" status line: a short label plus a "?" that reveals the
// platform help when clicked (or right away with { open: true }). Same markup
// as the chord trainer's header status.
export function renderMidiHint(el, label, { open = false, html = noDeviceHelpHtml() } = {}) {
  el.innerHTML = `<span>${label}</span>`
    + '<span class="info-tip midi-help" tabindex="0" role="button" aria-label="How to connect a MIDI keyboard">'
    + '<span class="info-tip-icon" aria-hidden="true">?</span>'
    + `<span class="info-tip-bubble" role="tooltip">${html}</span></span>`;
  el.hidden = false;
  bindInfoTips();
  if (open) el.querySelector('.midi-help').classList.add('open');
}

// Title + line for the "connect your keyboard" card, per MIDI state.
// Accepts both pages' names for "no device" ('nodevice' / 'none').
export function gateCopy(state) {
  switch (state) {
    case 'nodevice':
    case 'none':
      return { title: 'MIDI is on, but no keyboard was found.', sub: 'It will appear here as soon as it connects.' };
    case 'unsupported':
      return { title: 'This browser has no Web MIDI.', sub: 'Use Chrome, Edge or Firefox on a computer or Android.' };
    case 'denied':
      return { title: 'MIDI permission was refused.', sub: 'Allow MIDI for this site, then reload.' };
    default:
      return { title: 'This trainer listens to a MIDI keyboard.', sub: 'Connect your keyboard by Bluetooth or USB, then press Connect.' };
  }
}
