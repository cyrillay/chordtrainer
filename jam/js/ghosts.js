// The ghost band: who plays what, drawn as sprites.

import { GUESTS } from './styles.js';
import { sprite, MAPS } from './sprites.js';

export const BAND = [
  { id: 'drums', name: 'Drums', color: 'cyan' },
  { id: 'bass', name: 'Bass', color: 'pink' },
  { id: 'keys', name: 'Keys', color: 'orange' },
  { id: 'guest', name: 'Guest', color: 'lime' },
];
// Each ghost wears its instrument; the guest's depends on the groove.
const ghostSprite = (part, style) => {
  const gear = part === 'guest' ? GUESTS[style].patch : part;
  return sprite(MAPS[`ghost-${gear}`] ? `ghost-${gear}` : 'ghost', { px: 5 });
};
// No caption: the instrument says who is who, the name stays for screen readers and on hover.
// On stage a ghost is drawn twice, dark and lit: the band's heat uncovers
// the lit one from left to right (see renderBand).
export const ghostHtml = (m, style, stage = false) => {
  const name = m.id === 'guest' ? GUESTS[style].name : m.name;
  const body = stage
    ? `<span class="ghost-dark">${ghostSprite(m.id, style)}</span><span class="ghost-lit">${ghostSprite(m.id, style)}</span>`
    : ghostSprite(m.id, style);
  return `<div class="ghost ghost-${m.color}" data-part="${m.id}" role="img" aria-label="${name}" title="${name}">${body}</div>`;
};
