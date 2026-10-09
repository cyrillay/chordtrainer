// Read Trainer achievements: the list and its rules. Progress values are
// read from progress.js; the kit (js/ux/achievementKit.js) remembers what is
// unlocked and draws the case.

import { LEVELS } from './levels.js';
import { counter, levelStars, totalStars, resetProgress } from './progress.js';
import { KEYS } from '../../js/core/store.js';
import { createAchievements } from '../../js/ux/achievementKit.js';

export const KEY = KEYS.sightreading.ACHIEVEMENTS;

const done = (id) => (levelStars(id) >= 1 ? 1 : 0);
const threeStarLevels = () => LEVELS.filter((l) => levelStars(l.id) >= 3).length;

export const ACH = [
  // ---- Visible ----
  { id: 'first',    vis: 'visible', icon: '\u{1F440}', name: 'First Sight',        desc: 'Finish your first exercise',               target: 1,    value: () => counter('exercises') },
  { id: 'ex10',     vis: 'visible', icon: '\u{1F4D6}', name: 'Page Turner',        desc: 'Finish 10 exercises',                      target: 10,   value: () => counter('exercises') },
  { id: 'ex50',     vis: 'visible', icon: '\u{1F4DA}', name: 'Bookworm',           desc: 'Finish 50 exercises',                      target: 50,   value: () => counter('exercises') },
  { id: 'notes100', vis: 'visible', icon: '\u{1F3B5}', name: 'Note-worthy',        desc: 'Read 100 notes',                           target: 100,  value: () => counter('notes') },
  { id: 'notes1k',  vis: 'visible', icon: '\u{1F3B6}', name: 'Well Read',          desc: 'Read 1,000 notes',                         target: 1000, value: () => counter('notes') },
  { id: 'notes5k',  vis: 'visible', icon: '\u{1F4DC}', name: 'Library Card',       desc: 'Read 5,000 notes',                         target: 5000, value: () => counter('notes') },
  { id: 'clean',    vis: 'visible', icon: '\u{2728}',  name: 'Clean Sheet',        desc: 'Finish an exercise without a wrong note',  target: 1,    value: () => counter('cleanRuns') },
  { id: 'clean10',  vis: 'visible', icon: '\u{1F9FC}', name: 'Spotless',           desc: '10 exercises without a wrong note',        target: 10,   value: () => counter('cleanRuns') },
  { id: 'tempo1',   vis: 'visible', icon: '\u{23F1}\u{FE0F}', name: 'In Time',     desc: 'Finish an exercise in Tempo mode',         target: 1,    value: () => counter('tempoRuns') },
  { id: 'stars10',  vis: 'visible', icon: '\u{2B50}',  name: 'Rising Star',        desc: 'Collect 10 stars',                         target: 10,   value: totalStars },
  { id: 'stars30',  vis: 'visible', icon: '\u{1F31F}', name: 'Constellation',      desc: 'Collect 30 stars',                         target: 30,   value: totalStars },
  { id: 'both',     vis: 'visible', icon: '\u{1F64C}', name: 'Ambidextrous',       desc: 'Pass Hands Together',                      target: 1,    value: () => done('l6') },
  { id: 'rep1',     vis: 'visible', icon: '\u{1F3AA}', name: 'Salon Debut',        desc: 'Pass Repertoire I',                        target: 1,    value: () => done('rep1') },
  { id: 'keys',     vis: 'visible', icon: '\u{1F511}', name: 'Key Holder',         desc: 'Pass G & F Major',                         target: 1,    value: () => done('l7') },
  { id: 'six',      vis: 'visible', icon: '\u{1F483}', name: 'Six Appeal',         desc: 'Pass Compound Time',                       target: 1,    value: () => done('l10') },
  { id: 'rep3',     vis: 'visible', icon: '\u{1F3BB}', name: 'Recital Ready',      desc: 'Pass Repertoire III',                      target: 1,    value: () => done('rep3') },

  // ---- Secret ----
  { id: 'metronomic', vis: 'secret', icon: '\u{1F916}', name: 'Metronomic',        desc: 'Every note perfectly on time in Tempo mode', hint: 'Become one with the click.',          target: 1, value: () => counter('event.metronomic') },
  { id: 'allegro',    vis: 'secret', icon: '\u{1F3CE}\u{FE0F}', name: 'Allegro Assai', desc: 'Finish a Tempo run at 140 bpm or faster', hint: 'Some like it fast.',                   target: 1, value: () => counter('event.allegro') },
  { id: 'elise',      vis: 'secret', icon: '\u{1F48C}', name: 'Dear Elise',        desc: 'Three stars on Für Elise',                 hint: 'A letter to someone special.',          target: 1, value: () => counter('event.elise') },
  { id: 'again',      vis: 'secret', icon: '\u{1F501}', name: 'Da Capo',           desc: 'Retry the same exercise 5 times in a row', hint: 'Again. And again. And again…',          target: 1, value: () => counter('event.again') },
  { id: 'nocturne',   vis: 'secret', icon: '\u{1F319}', name: 'Nocturne',          desc: 'Practise between midnight and 5 a.m.',     hint: "Chopin's favourite hour.",              target: 1, value: () => counter('event.nocturne') },
  { id: 'line50',     vis: 'secret', icon: '\u{1F9F5}', name: 'Unbroken Line',     desc: '50 correct notes in a row',                hint: "Don't break the line.",                 target: 1, value: () => counter('event.line50') },

  // ---- Ultra ----
  { id: 'prima',   vis: 'ultra', icon: '\u{1F451}', name: 'Prima Vista',           desc: 'Three stars on every level',               hint: 'Every star in the sky.',                target: LEVELS.length, value: threeStarLevels },
];

export const SECTIONS = [
  { vis: 'visible', label: 'Common',     blurb: 'Earned through steady practice.' },
  { vis: 'secret',  label: 'Rare',       blurb: 'Trigger conditions are hidden. Some things you stumble on.' },
  { vis: 'ultra',   label: 'Ultra-rare', blurb: 'Reserved for those who go truly far.' },
];

let kit = null;

// Re-evaluates every achievement; call after anything that changes progress.
export function checkAchievements({ silent = false } = {}) {
  return kit ? kit.check({ silent }) : [];
}

export function initAchievements({ onReset }) {
  kit = createAchievements({
    list: ACH,
    key: KEY,
    sections: SECTIONS,
    ids: { modal: 'achModalOverlay', close: 'achModalClose' },
    resetLabel: 'Reset all progress',
    resetConfirm: 'Click again to erase stars, levels and achievements',
    // Wipes stars and unlocked levels too.
    onReset: () => { resetProgress(); onReset?.(); },
  });
  kit.init();
}
