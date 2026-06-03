// sprites.js — canvas-based pixel art sprites.
//
// Each sprite is defined as an array of equal-length strings (one per row).
// Each character maps to a colour via the palette; '.' is transparent.
// renderSprite(ctx, name, x, y, scale) draws to a 2D canvas context.
// createSpriteCanvas(name, scale) returns a ready-to-append <canvas>.

const P = {
  '.': null,
  // Grayscale world
  '0': '#080810', '1': '#14141e', '2': '#1e1e2c', '3': '#2c2c3e',
  '4': '#3a3a50', '5': '#4e4e68', '6': '#666680', '7': '#8888a0',
  '8': '#aaaabc', '9': '#d0d0e0',
  // Bard — vibrant against the grey world
  'b': '#5a9fe8', 'B': '#3a6db8', 'D': '#1e3f7a',   // blue hat
  'g': '#ffd700', 'G': '#b89000',                     // gold
  'v': '#9b3ef5', 'V': '#6b1bc5', 'W': '#4a0da0',    // violet cloak
  'r': '#e04444', 'R': '#a02020',                     // red tunic
  'c': '#00ffcc', 'C': '#00c09a',                     // cyan glow eyes
  's': '#d4a080', 'S': '#a07050',                     // warm skin
  // Note colours
  'N': '#ff6b6b',  // Strike note (red)
  'T': '#4ecdc4',  // Ward note (teal)
  'Y': '#ffe66d',  // Verse note (yellow)
  // Enemy accents
  'w': '#c8c8d8', 'x': '#e8e8f8',  // wisp highlight
  'e': '#7070d0', 'E': '#5050a8',  // echo phantom
  'd': '#d05050', 'F': '#602020',  // discord sprite
  'm': '#505070',                   // minstrel mid
  'H': '#101018',                   // hush black
  'Z': '#302840',                   // hush dark purple edge
};

const SPRITES = {
  // ─── Bard (14×20) ─────────────────────────────────────────────────────────
  bard: [
    '......DDD.....',
    '.....DBBBD....',
    '....DBBgBBD...',
    '.....DBDBD....',
    '.....8ss58....',
    '....8sSCCS8...',
    '....85sCCs5...',
    '....855558....',
    '...VVVrRrVVV..',
    '..VVVrRGRrVVV.',
    '.VVVVrrrrrVVVV',
    'VVVVVrrrrrVVVVV',
    '.VVVVvvvvvVVVV.',
    '..VVVvvvvvVVV..',
    '..VVV.....VVV..',
    '..433.....334..',
    '.4433.....3344.',
    '44333.....33344',
    '.433.......334.',
    '..3.........3..',
  ],

  // ─── Hush Wisp (12×12) ─── ghostly translucent orb ───────────────────────
  hushWisp: [
    '....7777....',
    '...7wwww7...',
    '..7wwxx.w7..',
    '.7wwx....w7.',
    '.7wx.....w7.',
    '77wx......77',
    '77w......w77',
    '.7w......77.',
    '.7ww....w7..',
    '..7wwwww7...',
    '....7777....',
    '....5554....',
  ],

  // ─── Pale Minstrel (12×18) ─── hollow ghost with broken lute ─────────────
  paleMinstrel: [
    '....9999....',
    '...9m8m89...',
    '...9m.m.9...',
    '...9mmm89...',
    '....8889....',
    '..99mmm99...',
    '..9mmmmm9...',
    '.99mmmmm99..',
    '.9mm...mm9..',
    '..9m...m9...',
    '..99.m.99...',
    '...9mmm9....',
    '....9m9.....',
    '..44.m.44...',
    '.444.m.444..',
    '4444.m.4444.',
    '...3.m.3....',
    '....333.....',
  ],

  // ─── Echo Phantom (12×14) ─── shifting mirror shadow ─────────────────────
  echoPhantom: [
    '....EEEE....',
    '..EEeeeEEE..',
    '.EEee...eeE.',
    'EEe.E.E..eE.',
    'Ee.E...E.eEE',
    'Ee..eee..eEE',
    'Ee..eee..eE.',
    'EEe.....eEE.',
    '.EEeee.eEE..',
    '..EEeeeEE...',
    '...EEEEEE...',
    '....EEEE....',
    '....3443....',
    '...33.333...',
  ],

  // ─── Discord Sprite (12×14) ─── spiky chaos creature ─────────────────────
  discordSprite: [
    '.d..d..d.d..',
    'd.dd.dd..dd.',
    '.dFFFFFFFd..',
    'd.FFFFFFF.d.',
    '.dFF.d.FFd..',
    'd.FF...FFdd.',
    '.dFF.d.FFd..',
    'd.FFFFFFFd..',
    '.dFFFFFFd...',
    'dd.FFFdd.d..',
    'd..d.dd..dd.',
    'dd..d...dd..',
    '.d.3.3.3.d..',
    '..333.333...',
  ],

  // ─── Broken Conductor (14×22) ─── tall imposing grey figure ──────────────
  brokenConductor: [
    '......888.....',
    '.....88888....',
    '.....8m8m8....',
    '....88888m8...',
    '....8m888m8...',
    '...8888mmm8...',
    '..888mmmmm88..',
    '.88mmmmmmmm8..',
    '88mmm...mmm88.',
    '.8mm.....mm8..',
    '..8m.....m8...',
    '..8mm...mm8...',
    '..888mmm888...',
    '..7mmmmmmm7...',
    '..7mm...mm7...',
    '..7m.....m7...',
    '..7m.....m7...',
    '..7m..6..m7...',  // broken baton
    '..44.666.44...',
    '.444..6..444..',
    '4444.....4444.',
    '...3.....3....',
  ],

  // ─── The Hush (18×24) ─── vast void entity ───────────────────────────────
  theHush: [
    '.....ZZZZZZZZ.....',
    '...ZZH000000ZZ....',
    '..ZHH00000000HZ...',
    '.ZHH0000000000HZ..',
    'ZZH00..00000..0HZ.',
    'ZH000..H00H0..0HZZ',
    'ZH0000H0000H0000HZ',
    'ZH000000000000000H',
    'ZH000000000000000H',
    'ZZH0000000000000HZ',
    '.ZH00.0000000.00HZ',
    '.ZHH0.0.00.0.00HZ.',
    '..ZH0..000000..HZ.',
    '..ZZH00000000HZZ..',
    '...ZHH000000HHZ...',
    '....ZHHH00HHHZ....',
    '.....ZZZHHZZZ.....',
    '......ZZ33ZZ......',
    '......Z3333Z......',
    '.....Z333333Z.....',
    '....ZZ......ZZ....',
    '...Z..........Z...',
    '..............Z...',
    '..................',
  ],

  // ─── Note symbols (8×8) ──────────────────────────────────────────────────
  noteStrike: [
    '.NNN....',
    'NNNNN...',
    'N.NNN...',
    '.NNNN...',
    '...NN...',
    '...NN...',
    '..NNNNN.',
    '..NNNNN.',
  ],
  noteWard: [
    '.TTT....',
    'TTTTT...',
    'T.TTT...',
    '.TTTT...',
    '...TT...',
    '..TTT...',
    '.TTTTT..',
    '.TTTTT..',
  ],
  noteVerse: [
    '.YYY.YYY',
    'YYYYYYY.',
    'Y.YYYY..',
    '.YYYYYYY',
    '...YY.YY',
    '...YYYY.',
    '..YYYYYY',
    '..YYYYYY',
  ],

  // ─── Chain link (8×8) ─────────────────────────────────────────────────────
  chainEmpty: [
    '..3333..',
    '.3....3.',
    '3......3',
    '3......3',
    '3......3',
    '3......3',
    '.3....3.',
    '..3333..',
  ],
  harmonyGlow: [
    '..7777..',
    '.7cccc7.',
    '7c....c7',
    '7c....c7',
    '7c....c7',
    '7c....c7',
    '.7cccc7.',
    '..7777..',
  ],
  crescendoGlow: [
    '..gggg..',
    '.gYYYYg.',
    'gY....Yg',
    'gY....Yg',
    'gY....Yg',
    'gY....Yg',
    '.gYYYYg.',
    '..gggg..',
  ],
};

// ─── renderer ───────────────────────────────────────────────────────────────

export function renderSprite(ctx, name, x, y, scale = 1) {
  const rows = SPRITES[name];
  if (!rows) return;
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      const colour = P[rows[row][col]];
      if (!colour) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

export function spriteSize(name, scale = 1) {
  const rows = SPRITES[name];
  if (!rows) return { w: 0, h: 0 };
  return { w: rows[0].length * scale, h: rows.length * scale };
}

export function createSpriteCanvas(name, scale = 1) {
  const rows = SPRITES[name];
  if (!rows) return document.createElement('canvas');
  const w = rows[0].length * scale;
  const h = rows.length * scale;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.style.cssText = `width:${w}px;height:${h}px;image-rendering:pixelated;display:block;`;
  const ctx = canvas.getContext('2d');
  renderSprite(ctx, name, 0, 0, scale);
  return canvas;
}

/** Animated glow: pulsing alpha on a second canvas layer. Returns { canvas, stop() }. */
export function createGlowCanvas(name, scale = 1) {
  const canvas = createSpriteCanvas(name, scale);
  let raf = null;
  let start = null;
  function tick(ts) {
    if (!start) start = ts;
    const alpha = 0.5 + 0.5 * Math.sin((ts - start) / 400);
    canvas.style.opacity = String(alpha);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  return { canvas, stop: () => { if (raf) cancelAnimationFrame(raf); canvas.style.opacity = '1'; } };
}
