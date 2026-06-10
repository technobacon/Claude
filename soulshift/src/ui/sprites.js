// Hand-drawn 12x12 pixel sprites, encoded as strings. Each character indexes
// into the sprite's palette; '.' is transparent. Rendered once to offscreen
// canvases and cached. No image assets — the art ships as code.

export const SPRITES = {
  rat: {
    palette: { a: '#8a7766', b: '#5e4f42', e: '#e0524d' },
    rows: [
      '............',
      '............',
      '..bb........',
      '.baab.......',
      'baaaab..bb..',
      'baaaaabbaab.',
      '.baaaaaaaab.',
      '.beaaaaaab..',
      '..baaaaab...',
      '..b.bb.b....',
      '..b....b....',
      '............',
    ],
  },
  bat: {
    palette: { a: '#6b5b8a', b: '#473b5e', e: '#ffd34d' },
    rows: [
      '............',
      '............',
      'b....bb....b',
      'bb..baab..bb',
      'babbaaaabbab',
      'baaaaaaaaaab',
      '.baaaeeaaab.',
      '..baaaaaab..',
      '...baaaab...',
      '....b..b....',
      '............',
      '............',
    ],
  },
  slime: {
    palette: { a: '#5fae5a', b: '#3c7a3a', c: '#a3dba0', e: '#26452a' },
    rows: [
      '............',
      '............',
      '............',
      '....bbbb....',
      '..bbaaaabb..',
      '.baacaaaaab.',
      '.baacaaaaab.',
      'baaccaaaeaab',
      'baaaaaaaaaab',
      'baaaaaaeaaab',
      '.bbbbbbbbbb.',
      '............',
    ],
  },
  skeleton: {
    palette: { a: '#e8e3d4', b: '#a8a290', e: '#1c1c28' },
    rows: [
      '............',
      '....aaaa....',
      '...aaaaaa...',
      '...aeaaea...',
      '...aaaaaa...',
      '....abba....',
      '..a.aaaa.a..',
      '..aaabbaaa..',
      '....abba....',
      '....abba....',
      '...ab..ba...',
      '...a....a...',
    ],
  },
  goblin: {
    palette: { a: '#7da453', b: '#55763a', e: '#e0524d', c: '#8a6f4e' },
    rows: [
      '............',
      '.b........b.',
      '.ab......ba.',
      '.aabbbbbbaa.',
      '..baaaaaab..',
      '..baeaaeab..',
      '..baaaaaab..',
      '...baabaa...',
      '..ccabbacc..',
      '....abba....',
      '...ab..ba...',
      '...b....b...',
    ],
  },
  spider: {
    palette: { a: '#cabdb4', b: '#8e8279', e: '#d8434d' },
    rows: [
      '............',
      '............',
      'b..b....b..b',
      '.b.b.bb.b.b.',
      '..bbbaabbb..',
      '.b.baaaab.b.',
      'b..baeeab..b',
      '.bbbaaaabbb.',
      'b..baaaab..b',
      '.b..bbbb..b.',
      'b..........b',
      '............',
    ],
  },
  zombie: {
    palette: { a: '#86a06b', b: '#5b7048', e: '#e8e3d4', c: '#46543a' },
    rows: [
      '............',
      '....bbbb....',
      '...baaaab...',
      '...beaaeb...',
      '...baaaab...',
      '....bccb....',
      '..b.bccb.b..',
      '..bbbccbbb..',
      '....bccb....',
      '....bccb....',
      '...bc..cb...',
      '...b....b...',
    ],
  },
  archer: {
    palette: { a: '#e8e3d4', b: '#a8a290', e: '#1c1c28', c: '#8a6f4e' },
    rows: [
      '............',
      '....aaaa..c.',
      '...aaaaaa.c.',
      '...aeaaeacc.',
      '...aaaaaa.c.',
      '....abba..c.',
      '..a.aaaa..c.',
      '..aaabba.cc.',
      '....abba....',
      '....abba....',
      '...ab..ba...',
      '...a....a...',
    ],
  },
  cultist: {
    palette: { a: '#9c4a4a', b: '#6e3434', e: '#ffb347', c: '#2a2030' },
    rows: [
      '............',
      '....bbbb....',
      '...baaaab...',
      '..baaaaaab..',
      '..bacccab...',
      '..baceecab..',
      '..bacccab...',
      '..baaaaaab..',
      '..baaaaaab..',
      '..baaaaaab..',
      '..baaaaaab..',
      '...b....b...',
    ],
  },
  wraith: {
    palette: { a: '#9db8d8', b: '#5f7796', e: '#eef5ff', c: '#33415c' },
    rows: [
      '............',
      '....bbbb....',
      '...baaaab...',
      '..baeaaeab..',
      '..baaaaaab..',
      '..baaaaaab..',
      '...baaaab...',
      '..baaaaaab..',
      '.baabaabaab.',
      '.ba.ba.ba.b.',
      '.b..b..b..b.',
      '............',
    ],
  },
  knight: {
    palette: { a: '#b8bfca', b: '#7c8694', e: '#ffd34d', c: '#4d5562' },
    rows: [
      '.....cc.....',
      '....baab....',
      '...baaaab...',
      '...beaaeb...',
      '...baaaab...',
      '..cbbaabbc..',
      '.cabbaabbac.',
      '.ca.baab.ac.',
      '.cc.baab.cc.',
      '....baab....',
      '...bc..cb...',
      '...cc...cc..',
    ],
  },
  frostmage: {
    palette: { a: '#7fc4d8', b: '#4d8aa3', e: '#eef5ff', c: '#2c4a5e' },
    rows: [
      '.....b......',
      '....bab.....',
      '...baaab....',
      '..baaaaab...',
      '..bacccab...',
      '..baceecab..',
      '..bacccab...',
      '..baaaaaab..',
      '.babaaaabab.',
      '.b.baaaab.b.',
      '...baaaab...',
      '...b....b...',
    ],
  },
  ogre: {
    palette: { a: '#b0855f', b: '#7d5c40', e: '#e0524d', c: '#5e4530' },
    rows: [
      '...bbbbbb...',
      '..baaaaaab..',
      '.baaaaaaaab.',
      '.baeaaaaeab.',
      '.baaaaaaaab.',
      '.baabbbbaab.',
      'bbaaaaaaaabb',
      'babaaaaaabab',
      'bb.baaaab.bb',
      '...baabaa...',
      '..bca..acb..',
      '..cc....cc..',
    ],
  },
  elemental: {
    palette: { a: '#ff9c3f', b: '#d8612e', e: '#fff1a8', c: '#a33a20' },
    rows: [
      '.....a......',
      '....aea.....',
      '..a.aea.a...',
      '.aeaaeaaea..',
      '.aeaaeaaea..',
      '.baeaeaeab..',
      '.baaeeeaab..',
      'cbaaeeeaabc.',
      'cbbaaeaabbc.',
      '.ccbaaabcc..',
      '..ccbbbcc...',
      '............',
    ],
  },
  warden: {
    palette: { a: '#3d4456', b: '#272c3a', e: '#7ce0c3', c: '#5d6880', d: '#1a1e28' },
    rows: [
      '.bccccccccb.',
      'bcaaaaaaaacb',
      'caabbbbbbaac',
      'cabaeaaeabac',
      'cabaaaaaabac',
      'caabeeeebaac',
      'caaabbbbaaac',
      'bcaaaaaaaacb',
      'dbcaaaaaacbd',
      'd.bcaaaacb.d',
      'd..bccccb..d',
      'ddd......ddd',
    ],
  },
  soul: {
    palette: { a: '#bfe9ff', b: '#7ab8d8', e: '#ffffff' },
    rows: [
      '............',
      '............',
      '.....bb.....',
      '....baab....',
      '...baeeab...',
      '...baeeab...',
      '...baaaab...',
      '....baab....',
      '...b.ba.b...',
      '....b..b....',
      '............',
      '............',
    ],
  },
  corpse: {
    palette: { a: '#9b8f80', b: '#6e655a', e: '#4a443c' },
    rows: [
      '............',
      '............',
      '............',
      '............',
      '............',
      '..b......b..',
      '.baab..baab.',
      'baaaabbaaaab',
      'beaabaabaaeb',
      '.bbbbbbbbbb.',
      '............',
      '............',
    ],
  },
  essence: {
    palette: { a: '#8de0c8', e: '#d8fff2' },
    rows: [
      '............',
      '............',
      '............',
      '.....a......',
      '....aea.....',
      '...aeeea....',
      '....aea.....',
      '.....a......',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  vial: {
    palette: { a: '#e0524d', b: '#8e2f2c', c: '#cabdb4' },
    rows: [
      '............',
      '............',
      '.....cc.....',
      '.....cc.....',
      '....baab....',
      '...baaaab...',
      '...baaaab...',
      '...baaaab...',
      '....bbbb....',
      '............',
      '............',
      '............',
    ],
  },
  hourglass: {
    palette: { a: '#ffd34d', b: '#a8842a', c: '#8a6f4e' },
    rows: [
      '............',
      '............',
      '...cccccc...',
      '...baaaab...',
      '....baab....',
      '.....bb.....',
      '....b..b....',
      '...b.aa.b...',
      '...baaaab...',
      '...cccccc...',
      '............',
      '............',
    ],
  },
  stairs: {
    palette: { a: '#c9b896', b: '#8a7c5e', d: '#11131c' },
    rows: [
      'dddddddddddd',
      'dddddddddddd',
      'ddaaaaaaaadd',
      'ddabbbbbbadd',
      'dddaaaaaaddd',
      'dddabbbbaddd',
      'ddddaaaadddd',
      'ddddabbadddd',
      'dddddaaddddd',
      'dddddabddddd',
      'dddddddddddd',
      'dddddddddddd',
    ],
  },
  shrineMend: {
    palette: { a: '#d8d3c4', b: '#8f8a7c', e: '#e0524d' },
    rows: [
      '............',
      '....aaaa....',
      '...abbbba...',
      '...ab..ba...',
      '....aeea....',
      '...aeeeea...',
      '...aeeeea...',
      '....aeea....',
      '....abba....',
      '...aabbaa...',
      '..aaaaaaaa..',
      '............',
    ],
  },
  shrinePreserve: {
    palette: { a: '#d8d3c4', b: '#8f8a7c', e: '#7fc4d8' },
    rows: [
      '............',
      '....aaaa....',
      '...abbbba...',
      '...ab..ba...',
      '....aeea....',
      '...ae..ea...',
      '...ae.eea...',
      '....aeea....',
      '....abba....',
      '...aabbaa...',
      '..aaaaaaaa..',
      '............',
    ],
  },
  shrineEmpower: {
    palette: { a: '#d8d3c4', b: '#8f8a7c', e: '#c792ea' },
    rows: [
      '............',
      '....aaaa....',
      '...abbbba...',
      '...ab..ba...',
      '....aeea....',
      '...aee.ea...',
      '...ae.eea...',
      '....aeea....',
      '....abba....',
      '...aabbaa...',
      '..aaaaaaaa..',
      '............',
    ],
  },
};

// Floor/wall tiles are flat colors with subtle procedural noise, themed by
// depth band: catacombs (1-3), drowned halls (4-5), the forge deep (6-8).
export const THEMES = [
  { maxDepth: 3, floor: '#23222e', floorAlt: '#262533', wall: '#3c3a4e', wallTop: '#4a4860', name: 'Catacombs' },
  { maxDepth: 5, floor: '#1e2a2c', floorAlt: '#213032', wall: '#32484c', wallTop: '#3e585e', name: 'Drowned Halls' },
  { maxDepth: 99, floor: '#2b2122', floorAlt: '#2f2425', wall: '#4c3434', wallTop: '#5e4040', name: 'The Forge Deep' },
];

export function themeForDepth(depth) {
  return THEMES.find((t) => depth <= t.maxDepth);
}

const cache = new Map();

// Returns an offscreen canvas with the sprite drawn at `scale` px per pixel.
export function spriteCanvas(name, scale = 3) {
  const keyName = name + '@' + scale;
  if (cache.has(keyName)) return cache.get(keyName);
  const def = SPRITES[name];
  if (!def) return null;
  const size = def.rows.length;
  const canvas = document.createElement('canvas');
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < def.rows[y].length; x++) {
      const ch = def.rows[y][x];
      if (ch === '.') continue;
      const color = def.palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  cache.set(keyName, canvas);
  return canvas;
}
