// Ghost Jam pixel art, drawn as crisp SVG rectangles from character maps.
// '.' is transparent, '#' takes the sprite's colour (currentColor), other
// characters come from the palette.

const PALETTE = {
  W: '#fff7ff',   // eyes, foam, cigarette paper
  P: '#140a24',   // pupils
  A: '#ffb000',   // beer
  Y: '#ffe48a',   // bubbles
  O: '#ff6a00',   // ember
  T: '#f3d9a4',   // drumsticks, bow
  D: '#9a5a2a',   // wood
  S: '#cfd8f0',   // silver
  C: '#ff3b5c',   // red lacquer
  G: '#6d6080',   // ash, metal
  K: '#2a1d3d',   // dark outline
};

export const MAPS = {
  ghost: [
    '....######....',
    '..##########..',
    '.############.',
    '.##WW####WW##.',
    '##WWWW##WWWW##',
    '##WWPP##WWPP##',
    '##WWPP##WWPP##',
    '###WW####WW###',
    '##############',
    '##############',
    '##############',
    '##############',
    '##.###..###.##',
    '#...##..##...#',
  ],
  beer: [
    '..WWWWWW....',
    '.WWWWWWWWW..',
    '.KWWWWWWWK..',
    '.KAAAAAAAKKK',
    '.KAYAAAAAK.K',
    '.KAAAAYAAK.K',
    '.KAAAAAAAK.K',
    '.KAYAAAAAKKK',
    '.KAAAAAYAK..',
    '.KAAAAAAAK..',
    '.KKKKKKKKK..',
  ],
  ashtray: [
    '........OWWWWWW..',
    '...GGGGGGGGGG....',
    '..GKKKKKKKKKKG...',
    '.GGGGGGGGGGGGGG..',
    '..GGGGGGGGGGGG...',
  ],
  coin: [
    '..####..',
    '.#YYYY#.',
    '#YY##YY#',
    '#YY#YYY#',
    '#YY#YYY#',
    '#YY##YY#',
    '.#YYYY#.',
    '..####..',
  ],
};

// Each ghost carries a hint of its instrument, drawn over the ghost on a
// 22 x 18 canvas (the ghost sits at 4, 4). Pieces are [x, y, rows].
const GEAR = {
  drums: [[12, 11, [
    'T......T',
    '.T....T.',
    '..T..T..',
    'WWWWWWWW',
    'CGCCGCCG',
    'CCCCCCCC',
    'WWWWWWWW',
  ]]],
  bass: [[2, 1, [
    '.................SS',
    '................DS.',
    '...............D...',
    '..............D....',
    '.............D.....',
    '............D......',
    '...........D.......',
    '..........D........',
    '.........D.........',
    '........D..........',
    '.......D...........',
    '..DDD.D............',
    '.DDDDD.............',
    'DDKKDD.............',
    '.DDDDD.............',
    '..DDD..............',
  ]]],
  // The pianist looks down at the keys.
  keys: [[6, 9, [
    'WWWW..WWWW',
    'WPPW..WPPW',
    '.PP....PP.',
  ]], [2, 14, [
    'KKKKKKKKKKKKKKKKKK',
    'WPWPWWPWPWPWWPWPWW',
    'WWWWWWWWWWWWWWWWWW',
    'KKKKKKKKKKKKKKKKKK',
  ]]],
  // Guests, by sound patch (GUESTS in styles.js).
  sax: [[13, 11, [
    'PAA.....',
    '...A....',
    '...AY...',
    '...AA..A',
    '...AY.AA',
    '....AAAA',
    '.....AA.',
  ]]],
  flute: [[8, 12, ['SSSGSGSGSSSSSS']]],
  vibes: [[1, 9, [
    '.O..................',
    'O.O.............O...',
    '.T.............O.O..',
    '..T.............T...',
    '...T...........T....',
    'SGSGSGSGSGSGSGSGSGS.',
    'SGSGSGSGSGSGSGSGSGS.',
    'KKKKKKKKKKKKKKKKKKK.',
    'K.................K.',
  ]]],
  strings: [[13, 4, [
    '....K...',
    '....D..T',
    '....D.T.',
    '....DT..',
    '...DTD..',
    '..DTDDD.',
    '..TKDKD.',
    '.T.DDD..',
    'T.DDDDD.',
    '..DDDDD.',
    '...DDD..',
  ]]],
  horns: [[9, 11, [
    '....A.A.A...AA',
    'PAAAAAAAAAAAAA',
    '....AAAAA...AA',
  ]]],
  melodica: [[4, 12, [
    'S.............',
    'S.............',
    'SCCCCCCCCCCCCC',
    'CWPWPWWPWPWPWC',
    'CWWWWWWWWWWWWC',
    'CCCCCCCCCCCCCC',
  ]]],
};

GEAR.trumpet = GEAR.horns;
// The secret guest, padlocked until the band is on fire.
GEAR.locked = [[9, 11, [
  '.GGG.',
  'G...G',
  'AAAAA',
  'AAKAA',
  'AAKAA',
  'AAAAA',
]]];

for (const [id, pieces] of Object.entries(GEAR)) {
  const grid = Array.from({ length: 18 }, () => Array(22).fill('.'));
  MAPS.ghost.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') grid[y + 4][x + 4] = ch; }));
  for (const [px, py, rows] of pieces) {
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') grid[y + py][x + px] = ch; }));
  }
  MAPS[`ghost-${id}`] = grid.map((r) => r.join(''));
}

export function sprite(name, { px = 4, className = '', title = '' } = {}) {
  const rows = MAPS[name];
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const fill = ch === '#' ? 'currentColor' : PALETTE[ch];
      rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${fill}"/>`;
    }
  });
  const label = title ? `<title>${title}</title>` : '';
  return `<svg class="sprite ${className}" viewBox="0 0 ${w} ${h}" width="${w * px}" height="${h * px}" shape-rendering="crispEdges" ${title ? 'role="img"' : 'aria-hidden="true"'}>${label}${rects}</svg>`;
}
