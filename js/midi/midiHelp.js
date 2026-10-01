// "How do I connect my keyboard?" text shared by every trainer's MIDI
// tooltip. Browsers only list MIDI devices the OS has already opened, so the
// fix for "No device" depends on the platform — Android in particular never
// exposes Bluetooth MIDI to Chrome unless another app opens the link first.

export const MIDI_BLE_CONNECT_URL = 'https://play.google.com/store/apps/details?id=com.mobileer.example.midibtlepairing';
export const WEB_MIDI_BROWSER_URL = 'https://apps.apple.com/fr/app/web-midi-browser/id953846217';
export const MIDI_GUIDE_URL = '/articles/midi-keyboard-connection/';

export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const GUIDE_LINK = `<a href="${MIDI_GUIDE_URL}" target="_blank" rel="noopener">Full connection guide →</a>`;
const OTHER_DEVICE = 'Make sure the keyboard isn\'t already connected to another device or app (a Mac it paired with before, its own piano app…).';

export function noDeviceHelpHtml() {
  // iOS browsers have no Web MIDI at all; Web MIDI Browser is a WebKit
  // wrapper that adds it.
  if (isIOS()) {
    return `iPhone/iPad browsers don't support MIDI. Open this site in the `
      + `<a href="${WEB_MIDI_BROWSER_URL}" target="_blank" rel="noopener">Web MIDI Browser</a> app.<br><br>`
      + GUIDE_LINK;
  }
  if (isAndroid()) {
    return `<strong>Bluetooth:</strong> connect your keyboard in the free app `
      + `<a href="${MIDI_BLE_CONNECT_URL}" target="_blank" rel="noopener">MIDI BLE Connect</a> `
      + `(not in Android's Bluetooth settings), then come back here.<br>`
      + `<strong>USB:</strong> an OTG cable works too.<br><br>`
      + `${OTHER_DEVICE}<br><br>${GUIDE_LINK}`;
  }
  return `<strong>USB:</strong> plug it in, it just works.<br>`
    + `<strong>Bluetooth (Mac):</strong> Audio MIDI Setup → Window → Show MIDI Studio → Bluetooth → Connect.<br><br>`
    + `${OTHER_DEVICE}<br><br>${GUIDE_LINK}`;
}

export const DENIED_HELP_HTML = 'Allow MIDI for this site (icon left of the address bar), then reload.<br><br>' + GUIDE_LINK;

// Tapping anywhere closes an auto-opened hint; registered once.
let dismissBound = false;
function bindDismiss() {
  if (dismissBound) return;
  dismissBound = true;
  document.addEventListener('pointerdown', (e) => {
    const tip = document.querySelector('.midi-help.open');
    if (tip && !tip.contains(e.target)) tip.classList.remove('open');
  });
}

// "No device found ?" status line: a short label plus a "?" that reveals the
// platform help on hover/focus, or right away with { open: true }. Same
// markup as the chord trainer's header status.
export function renderMidiHint(el, label, { open = false, html = noDeviceHelpHtml() } = {}) {
  el.innerHTML = `<span>${label}</span>`
    + '<span class="info-tip midi-help" tabindex="0" aria-label="How to connect a MIDI keyboard">'
    + '<span class="info-tip-icon" aria-hidden="true">?</span>'
    + `<span class="info-tip-bubble" role="tooltip">${html}</span></span>`;
  el.hidden = false;
  bindDismiss();
  if (open) el.querySelector('.midi-help').classList.add('open');
}
