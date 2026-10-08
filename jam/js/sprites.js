// Ghost Jam pixel art, drawn as crisp SVG rectangles from character maps.
// '.' is transparent, '#' takes the sprite's colour (currentColor), other
// characters come from the palette.

const PALETTE = {
  W: '#fff7ff',   // eyes, foam, cigarette paper
  P: '#140a24',   // pupils
  A: '#ffb000',   // beer
  Y: '#ffe48a',   // bubbles
  O: '#ff6a00',   // ember
  R: '#ffd23f',   // ember core
  F: '#d98a3c',   // cigarette filter
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
  // The cigarette rests in the notch: lit end over the bowl, filter outside.
  ashtray: [
    '..........WWWFFF.',
    '....ROWWWW.......',
    '...GGGGGGGGGGG...',
    '..GKKGKKKKKKKKG..',
    '.GGGGGGGGGGGGGGG.',
    '..GGGGGGGGGGGGG..',
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
  keys: [[2, 14, [
    'KKKKKKKKKKKKKKKKKK',
    'WPWPWWPWPWPWWPWPWW',
    'WWWWWWWWWWWWWWWWWW',
    'KKKKKKKKKKKKKKKKKK',
  ]]],
  // Guests, one per groove.
  swing: [[13, 11, [
    'PAA.....',
    '...A....',
    '...AY...',
    '...AA..A',
    '...AY.AA',
    '....AAAA',
    '.....AA.',
  ]]],
  bossa: [[8, 12, ['SSSGSGSGSSSSSS']]],
  lofi: [[1, 9, [
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
  ballad: [[13, 4, [
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
  funk: [[9, 11, [
    '....A.A.A...AA',
    'PAAAAAAAAAAAAA',
    '....AAAAA...AA',
  ]]],
  reggae: [[4, 12, [
    'S.............',
    'S.............',
    'SCCCCCCCCCCCCC',
    'CWPWPWWPWPWPWC',
    'CWWWWWWWWWWWWC',
    'CCCCCCCCCCCCCC',
  ]]],
};

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
