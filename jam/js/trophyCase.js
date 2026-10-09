// Ghost Jam trophy case: the kit (js/ux/achievementKit.js) with Ghost Jam's
// list, its arcade tile classes, and one rule of its own (the six grooves
// finished with rank S).

import { KEYS } from '../../js/core/store.js';
import { createAchievements } from '../../js/ux/achievementKit.js';
import { ACH } from './achievements.js';

export const KEY = KEYS.jam.ACHIEVEMENTS;

export const SECTIONS = [
  { vis: 'visible', label: 'On the bill', blurb: 'Every band has to start somewhere.' },
  { vis: 'secret',  label: 'Secret',      blurb: 'Feel, touch, voicings, and a few stories from the basement.' },
  { vis: 'ultra',   label: 'Ultra-rare',  blurb: 'Legends of the house.' },
];

export const JAM_CLASSES = { unlocked: 'is-unlocked', locked: 'is-locked', secret: 'is-secret', ultra: 'is-ultra' };

// counters: metric -> number. grooves / sGrooves: groove ids finished, and
// finished with rank S.
const fresh = () => ({ unlocked: {}, counters: {}, grooves: [], sGrooves: [] });

const kit = createAchievements({
  list: ACH,
  key: KEY,
  sections: SECTIONS,
  fresh,
  classes: JAM_CLASSES,
  resetLabel: 'Reset Ghost Jam achievements',
});

export const grant = (ids) => kit.grant(ids);
export const setMax = (metric, value) => kit.setMax(metric, value);
export const bump = (metric) => kit.bump(metric);

// A set played to the end in this groove, with this rank.
export function setFinished(style, rank) {
  const store = kit.store;
  store.grooves ||= [];
  store.sGrooves ||= [];
  if (!store.grooves.includes(style)) store.grooves.push(style);
  if (rank === 'S' && !store.sGrooves.includes(style)) store.sGrooves.push(style);
  store.counters.grooves = store.grooves.length;
  if (store.sGrooves.length >= 6) kit.grant('worldTour');
  else kit.commit();
}

export const initTrophyCase = () => kit.init();
