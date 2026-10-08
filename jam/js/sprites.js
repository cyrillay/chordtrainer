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
