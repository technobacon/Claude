// src/ui/sprites.js
//
// Pixel-art sprite data + an offscreen-canvas cache. Each sprite is a grid of
// characters mapped to a palette ('.' = transparent). On first use we bake the
// grid into a 1px-per-cell offscreen <canvas>; the arena then drawImages it at
// any scale with imageSmoothing off, so we get crisp scaling, squash & stretch,
// rotation and tinting for free (animation is procedural, not frame-by-frame).
//
// Design language: the WORLD is desaturated greys/blue-greys. The BARD and the
// musical NOTES are the only vivid colour — the player's eye is always drawn to
// what matters (the "juice echoes the mechanic" principle).

const P = {
  '.': null,
  // ── greyscale world ──
  '0': '#06060c', '1': '#101019', '2': '#1b1b2a', '3': '#28283c',
  '4': '#393952', '5': '#4d4d6a', '6': '#646483', '7': '#84849e',
  '8': '#a6a6bd', '9': '#cfcfde', 'W': '#ececf6',
  // ── bard: vivid ──
  'h': '#6aa9ff', 'H': '#3f73d6', 'j': '#274a9e',           // hat blues
  'k': '#ffd23f', 'K': '#c89414',                            // gold trim
  'c': '#a85bff', 'C': '#7a2fe0', 'X': '#521aa8',            // violet cloak
  'r': '#ff5e7a', 'R': '#c0304e',                            // rose tunic
  'g': '#3afae0', 'G': '#16c9b4',                            // glowing cyan (eyes)
  's': '#ffce9e', 'S': '#c98f63',                            // skin
  'l': '#b9763a', 'L': '#7c4a20',                            // lute wood
  'y': '#fff4c2',                                            // lute string highlight
  // ── note colours ──
  'N': '#ff5e5e', 'n': '#ffa1a1',   // strike (red)
  'T': '#3afae0', 't': '#9bfff2',   // ward (teal)
  'Y': '#ffe24a', 'y2': '#fff6b0',  // verse (yellow)  (y2 unused key safeguard)
  // ── enemy accents (all muted, ghostly) ──
  'p': '#b9b9cc', 'q': '#d8d8e8',   // pale wisp
  'e': '#6f6f9e', 'E': '#4a4a72',   // echo phantom
  'd': '#9a5560', 'D': '#5e2f37',   // discord (desaturated red)
  'm': '#5c5c74', 'M': '#3c3c50',   // minstrel grey
  'u': '#7a7a92', 'U': '#54546c',   // conductor
  'z': '#231b33', 'Z': '#15101f',   // hush void
  'v': '#3a2f55', 'V': '#2a2140',   // hush rim purple
};

const SPRITES = {
  // ── BARD (16×26) — hooded, lute across body, glowing eyes ─────────────────
  bard: [
    '......jjjj......',
    '.....jHHHHj.....',
    '....jHHhhHHj....',
    '...jHHhhhhHHj...',
    '...jHhhkkhhHj...',
    '....jHhkkhHj....',
    '.....8ssss8.....',
    '....8sSggSs8....',
    '....8sSggSs8....',
    '....88sssS88....',
    '...XcccccccX....',
    '..Xccc rr cccX..',
    '..XccrRRRRrccX..',
    '.XcccrRRRRrcccX.',
    '.XcclLLrRrccccX.',
    '.XcclyyLLLcccccX',
    'XccclyylLLLccccX',
    'XcccLyyl LLccccX',
    '.XccLLll  ccccX.',
    '.XXcc kk  ccXX..',
    '..Xc  kk  cX....',
    '..4c  44  c4....',
    '..44  44  44....',
    '.444  44  444...',
    '.43.   .   .34..',
    '.3.         .3..',
  ],

  // ── HUSH WISP (14×14) — translucent floating orb wraith ───────────────────
  hushWisp: [
    '.....pppp.....',
    '...ppqqqqpp...',
    '..pqq qq qqp..',
    '.pqq  WW  qqp.',
    '.pq   WW   qp.',
    'pq    qq    qp',
    'pq          qp',
    'pq    qq    qp',
    '.pq  qqqq  qp.',
    '.pqq qqqq qqp.',
    '..pqq    qqp..',
    '...pq qq qp...',
    '....p q q p...',
    '.....6 5 6....',
  ],

  // ── PALE MINSTREL (14×22) — hollow ghost, ribcage, broken lute ───────────
  paleMinstrel: [
    '....9999 9....',
    '...9MmmM89....',
    '...9m gg m9...',
    '...9m gg m9...',
    '....9mmmm9....',
    '.....9889.....',
    '...99mmmm99...',
    '..9MmmmmmmM9..',
    '.9Mm m m m mM9',
    '.9m mmmmmm m9.',
    '.9m m m m m9..',
    '..9 mmmmmm 9..',
    '..9m m m m9...',
    '...99mmmm9....',
    '....9 mm 9....',
    '...4M mm M4...',
    '..44m mm m44..',
    '.44 m mm m 44.',
    '44  m mm m  44',
    '..  M mm M ...',
    '...4 4mm4 4...',
    '....44  44....',
  ],

  // ── ECHO PHANTOM (14×16) — duplicating shadow with mirror seams ──────────
  echoPhantom: [
    '....EEEEEE....',
    '..EEeeeeeeEE..',
    '.Eeee g g eeE.',
    'Eeee  ggg  eeE',
    'Eee  gg gg  eE',
    'Eee g  e  g eE',
    'Ee e  eee  e e',
    'Ee ee eee ee e',
    'Eee  eeeee  eE',
    'Eeee eeeee eeE',
    '.Eee eeeee eE.',
    '..EEe eee eEE.',
    '...EE eee EE..',
    '....EEE EEE...',
    '...4E E E E4..',
    '..44 4 4 4 44.',
  ],

  // ── DISCORD SPRITE (14×16) — jagged chaotic spiky imp ────────────────────
  discordSprite: [
    '..d..d..d..d..',
    '.d.dd.dd.dd.d.',
    'd.dDDDDDDDDd.d',
    '.dDD g  g DDd.',
    'd.D  gggg  D.d',
    '.dD g e e g Dd',
    'd.D  geeg   .d',
    '.dD g eeee gDd',
    'd.DD gggggDDd.',
    '.dDDDDDDDDDDd.',
    'd..dDDDDDDd..d',
    '.dd.dDDDDd.dd.',
    'd..d.dDDd.d..d',
    '.dd..d.d..dd..',
    '..d.4.d.d.4d..',
    '....44.d.44...',
  ],

  // ── BROKEN CONDUCTOR (16×26) — tall grey maestro, snapped baton ───────────
  brokenConductor: [
    '......8888......',
    '.....8MUUM8.....',
    '....8UMggMU8....',
    '....8UMggMU8....',
    '....8UMmmMU8....',
    '.....8UmmU8.....',
    '......8UU8......',
    '....88UmmU88....',
    '...8UUmmmmUU8...',
    '..8UUmmmmmmUU8..',
    '.8Uum m m m muU8',
    '8Uum mmmmmm muU8',
    '8Uu m m m m u uU',
    '8U  mmmmmmmm  U8',
    '.8U mm m m mmU8.',
    '..8Um m m m mU..',
    '..8U mmmmmm U8..',
    '...8U m  m U8...',
    '...8Uu7  u U8...',  // broken baton (7)
    '...8U 7    U8...',
    '...4U  7   U4...',
    '..44u  7   u44..',
    '.44 U      U 44.',
    '44  Uu    uU  44',
    '..  4U    U4 ...',
    '...44 4  4 44...',
  ],

  // ── THE HUSH (20×26) — vast silence entity, void core, hollow eyes ───────
  theHush: [
    '......vvvvvvvv......',
    '....vvVzzzzzzVvv....',
    '...vVzzzzzzzzzzVv...',
    '..vVzzzzzzzzzzzzVv..',
    '.vVzzzz zz zz zzzVv.',
    '.vzzz z      z zzzv.',
    'vVzz z   gg   z zzVv',
    'vzz z   gggg   z zzv',
    'vzz    g    g    zzv',
    'vzz   g  zz  g   zzv',
    'vzz    g zz g    zzv',
    'vVz     gggg     zVv',
    '.vz      gg      zv.',
    '.vVz   zzzzzz   zVv.',
    '..vz  z      z  zv..',
    '..vVz z zzzz z zVv..',
    '...vVz zz  zz zVv...',
    '....vVzz    zzVv....',
    '.....vVzzzzzzVv.....',
    '......vVzzzzVv......',
    '.......vVzzVv.......',
    '......4 vVVv 4......',
    '.....44 v  v 44.....',
    '....44  4  4  44....',
    '...44   4  4   44...',
    '..4.    4  4    .4..',
  ],
};

// Note glyphs (8×9) — small, vivid, used in chain slots & card corners.
const NOTE_SPRITES = {
  noteStrike: ['.NNNNN..','.NnnnN..','.NNNNN..','.N......','.N......','.N......','NNN.....','NNNNn...','.NNN....'],
  noteWard:   ['.TTT.TTT','TtttTttt','TTTTTTTT','.T...T..','.T...T..','.T...T..','TTT.TTT.','NNN.NNN.','.TT..TT.'].map(r=>r.replace(/N/g,'T')),
  noteVerse:  ['.YYYYY..','.YyyyY..','.YYYYY..','.Y...Y..','.Y...Y..','YYY.YYY.','YYY.YYY.','.Y...Y..','........'],
};
Object.assign(SPRITES, NOTE_SPRITES);

// ── offscreen-canvas cache ───────────────────────────────────────────────────
const cache = new Map();

function bake(name) {
  const rows = SPRITES[name];
  if (!rows) return null;
  const w = rows[0].length;
  const h = rows.length;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const col = P[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { canvas: cv, w, h };
}

/** Return { canvas, w, h } for a sprite (w,h in pixel-cells). Cached. */
export function getFrame(name) {
  if (!cache.has(name)) cache.set(name, bake(name));
  return cache.get(name);
}

/** Convenience for menus/cards: a DOM <canvas> drawn at integer scale. */
export function createSpriteCanvas(name, scale = 1) {
  const f = getFrame(name);
  if (!f) return document.createElement('canvas');
  const cv = document.createElement('canvas');
  cv.width = f.w * scale; cv.height = f.h * scale;
  cv.style.cssText = `width:${f.w*scale}px;height:${f.h*scale}px;image-rendering:pixelated;display:block;`;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(f.canvas, 0, 0, f.w * scale, f.h * scale);
  return cv;
}

export const ENEMY_SPRITE = {
  hushWisp: 'hushWisp', paleMinstrel: 'paleMinstrel', echoPhantom: 'echoPhantom',
  discordSprite: 'discordSprite', brokenConductor: 'brokenConductor', theHush: 'theHush',
};
