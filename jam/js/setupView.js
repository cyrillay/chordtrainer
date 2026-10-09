// Ghost Jam: the setup screen. The groove, the tune, the key on a circle
// of fifths, the tempo, favourites, the hall of fame, and the band waiting
// in the wings with its secret guest.

import { formatChordHtml } from '../../js/core/theory.js';
import { progressionMode } from '../../js/training/progressions.js';
import { STYLES, STYLE_ORDER, GUESTS } from './styles.js';
import { fitsStyle } from './tunes.js';
import { sprite } from './sprites.js';
import { isFavourite, toggleFavourite, removeFavourite } from './favourites.js';
import { KeyWheel } from '../../js/music-ui/keyWheel.js';
import { attachTempoPicker } from '../../js/music-ui/tempo.js';
import {
  $, app, settings, scores, guestsMet, store, LS, write, save, scoreKey,
  randomTune, tuneMenuHtml, tuneByName, buildChords, keyName,
} from './state.js';
import { BAND, ghostHtml } from './ghosts.js';

export const tempoPicker = attachTempoPicker($('tempoRange'));

export const STYLE_ICONS = { swing: '🎷', bossa: '🌴', lofi: '📼', ballad: '🕯️', funk: '🕺', reggae: '🌿' };

export function renderSetup() {
  renderSecret();
  $('styleGrid').innerHTML = STYLE_ORDER.map((id) => {
    const s = STYLES[id];
    return `<button type="button" class="style-card${id === settings.style ? ' is-on' : ''}" data-style="${id}">
      <span class="style-icon" aria-hidden="true">${STYLE_ICONS[id]}</span>
      <span class="style-name">${s.name}</span>
      <span class="style-blurb">${s.blurb}</span>
    </button>`;
  }).join('');

  const sel = $('tuneSelect');
  if (sel.dataset.style !== settings.style) {
    sel.innerHTML = tuneMenuHtml(settings.style);
    sel.dataset.style = settings.style;
  }
  sel.value = tuneByName(settings.tune).name;

  const st = STYLES[settings.style];
  const tempo = settings.tempo ?? st.tempo.def;
  const range = $('tempoRange');
  range.min = st.tempo.min;
  range.max = st.tempo.max;
  range.value = Math.max(st.tempo.min, Math.min(st.tempo.max, tempo));
  tempoPicker.refresh();
  $('barsSelect').value = String(settings.bars);
  $('lengthSelect').value = String(settings.length);
  $('showTonesCb').checked = settings.showTones;
  renderCombo();
  renderHall();
}

// Everything that follows the groove, tune and key: the key menu, the
// preview and the favourites.
function renderCombo() {
  renderKeyMenu();
  renderTunePreview();
  renderFavs();
}

function renderKeyMenu() {
  $('keyBtn').textContent = settings.key === 'random' ? 'Random' : keyName(settings.key, tuneByName(settings.tune));
}

// The key picker: a circle of fifths you click, or a note you play.
export const keyWheel = new KeyWheel({
  modal: $('keyModal'),
  onPick: (key) => { settings.key = key; save(); renderCombo(); },
});
export const openKeyWheel = () => keyWheel.open(settings.key, progressionMode(tuneByName(settings.tune)));

function renderTunePreview() {
  const prog = tuneByName(settings.tune);
  const key = settings.key === 'random' ? 'C' : settings.key;
  const chords = buildChords(prog, key);
  const best = scores[scoreKey()];
  $('tunePreview').innerHTML = `<span class="tp-chords">${chords.map((c) => `<span>${formatChordHtml(c)}</span>`).join('')}</span>`
    + `<span class="tp-meta">${settings.key === 'random' ? `Shown in ${keyName('C', prog)}, played in a random key` : `In ${keyName(key, prog)}`}${fitsStyle(prog, settings.style) ? '' : ` · Off-style for ${STYLES[settings.style].name}`}${best ? ` · Best ${best.score.toLocaleString()} (${best.rank})` : ''}</span>`;
}

// ---- Favourites: a groove, a tune and a key, one tap away ----

export const combo = () => ({ style: settings.style, tune: settings.tune, key: settings.key });

function renderFavs() {
  $('favs').hidden = !store.favs.length;
  const now = combo();
  $('favList').innerHTML = store.favs.map((f, i) => {
    const prog = tuneByName(f.tune);
    const on = isFavourite([f], now);
    const key = f.key === 'random' ? 'Random key' : keyName(f.key, prog);
    return `<span class="fav${on ? ' is-on' : ''}">
      <button type="button" class="fav-go" data-fav="${i}"><span class="fav-tune">${f.tune}</span><span class="fav-meta">${STYLE_ICONS[f.style]} ${STYLES[f.style].name} · ${key}</span></button>
      <button type="button" class="fav-x" data-unfav="${i}" aria-label="Remove ${f.tune.replace(/"/g, '&quot;')} from favourites">&times;</button>
    </span>`;
  }).join('');
  const starred = isFavourite(store.favs, now);
  const btn = $('favBtn');
  btn.setAttribute('aria-pressed', String(starred));
  btn.title = starred ? 'Remove from your favourites' : 'Add this groove, tune and key to your favourites';
  app.syncSetupRows();
}

$('favBtn').addEventListener('click', () => {
  store.favs = toggleFavourite(store.favs, combo());
  write(LS.favs, store.favs);
  renderFavs();
});
$('favList').addEventListener('click', (e) => {
  const x = e.target.closest('[data-unfav]');
  if (x) {
    store.favs = removeFavourite(store.favs, Number(x.dataset.unfav));
    write(LS.favs, store.favs);
    renderFavs();
    return;
  }
  const go = e.target.closest('[data-fav]');
  if (!go) return;
  const f = store.favs[Number(go.dataset.fav)];
  const prevStyle = settings.style;
  if (f.style !== prevStyle) settings.tempo = null;
  Object.assign(settings, f);
  save();
  renderSetup();
  if (f.style !== prevStyle) grooveTip(f.style);
});

// ---- Groove tips: a small note when a groove wants a sound from your keyboard ----

const GROOVE_TIPS = {
  funk: { icon: '🎹', title: 'Funk tip', text: 'Switch your keyboard to its Clav sound. Funk on a Clav is pure gold.' },
};
let tipTimer = 0;
function grooveTip(style) {
  const tip = GROOVE_TIPS[style];
  const el = $('grooveTip');
  clearTimeout(tipTimer);
  if (!tip) { hideTip(); return; }
  el.innerHTML = `<span class="groove-tip-icon" aria-hidden="true">${tip.icon}</span><span><b>${tip.title}</b>${tip.text}</span>`;
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('visible');
  tipTimer = setTimeout(hideTip, 5000);
}
function hideTip() {
  const el = $('grooveTip');
  clearTimeout(tipTimer);
  el.classList.remove('visible');
  tipTimer = setTimeout(() => { el.hidden = true; }, 400);
}
$('grooveTip').addEventListener('click', hideTip);

function renderHall() {
  const rows = Object.entries(scores)
    .map(([k, v]) => ({ tune: k.split('|')[0], style: k.split('|')[1], ...v }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  $('hallList').innerHTML = rows.length
    ? rows.map((r, i) => `<li><span class="hall-pos">${i + 1}</span><span class="hall-tune">${r.tune}</span><span class="hall-style">${STYLES[r.style]?.name || r.style}</span><span class="hall-rank">${r.rank}</span><span class="hall-score">${r.score.toLocaleString()}</span></li>`).join('')
    : '<li class="hall-empty">No scores yet. The stage is yours.</li>';
}

export function setStyle(id) {
  if (id !== settings.style) grooveTip(id);
  settings.style = id;
  settings.tempo = null; // each groove has its own home tempo
  // A new groove keeps the tune only if it suits it.
  if (!fitsStyle(tuneByName(settings.tune), settings.style)) settings.tune = randomTune(settings.style);
  save();
  renderSetup();
}
$('styleGrid').addEventListener('click', (e) => {
  const card = e.target.closest('[data-style]');
  if (card) setStyle(card.dataset.style);
});
$('tuneSelect').addEventListener('change', (e) => { settings.tune = e.target.value; save(); renderCombo(); });
$('randomTuneBtn').addEventListener('click', () => {
  settings.tune = randomTune(settings.style);
  save();
  renderSetup();
});
$('keyBtn').addEventListener('click', openKeyWheel);
$('tempoRange').addEventListener('input', (e) => { settings.tempo = Number(e.target.value); save(); });
$('barsSelect').addEventListener('change', (e) => { settings.bars = Number(e.target.value); save(); });
$('lengthSelect').addEventListener('change', (e) => { settings.length = Number(e.target.value); save(); });
$('showTonesCb').addEventListener('change', (e) => { settings.showTones = e.target.checked; save(); });

// Props: beer, ashtray, a coin, and the band waiting in the wings.
$('propsLeft').innerHTML = sprite('beer', { px: 5, className: 'prop-beer' }) + sprite('beer', { px: 4, className: 'prop-beer two' });
$('propsRight').innerHTML = `<span class="ash">${sprite('ashtray', { px: 5, className: 'prop-ash' })}<span class="wisp"></span><span class="wisp w2"></span></span>`;
$('coinSprite').innerHTML = sprite('coin', { px: 3 });

// On the setup page the guest is a secret: a pale, padlocked ghost, since
// who sits in depends on the groove. Hover (or tap) opens the collection:
// one guest per groove, revealed once you have played them onto the stage.
$('bandIntro').innerHTML = BAND.slice(0, 3).map((m) => ghostHtml(m, settings.style)).join('')
  + `<button type="button" class="ghost is-secret" data-part="guest" aria-label="Secret guest" aria-expanded="false" aria-describedby="secretTip">
      <span class="secret-body">${sprite('ghost-locked', { px: 5 })}</span>
      <i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i>
      <span class="secret-tip" id="secretTip" role="tooltip"></span>
    </button>`;
function renderSecret() {
  const met = STYLE_ORDER.filter((id) => guestsMet.has(id)).length;
  $('secretTip').innerHTML = `<b>Secret guest</b>
    <span class="secret-lede">Every groove hides its own. Get the band on fire and they walk on stage.</span>
    <span class="secret-grid">${STYLE_ORDER.map((id) => guestsMet.has(id)
      ? `<span class="sg is-met">${sprite(`ghost-${GUESTS[id].patch}`, { px: 2 })}<em>${GUESTS[id].name}</em><small>${STYLES[id].name}</small></span>`
      : `<span class="sg">${sprite('ghost-locked', { px: 2 })}<em>???</em><small>${STYLES[id].name}</small></span>`).join('')}</span>
    <span class="secret-count">${met} / ${STYLE_ORDER.length} met</span>`;
}
const secret = $('bandIntro').querySelector('.is-secret');
const openSecret = (open) => { secret.classList.toggle('open', open); secret.setAttribute('aria-expanded', String(open)); };
secret.addEventListener('click', (e) => { e.stopPropagation(); openSecret(!secret.classList.contains('open')); });
document.addEventListener('click', () => openSecret(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openSecret(false); });
