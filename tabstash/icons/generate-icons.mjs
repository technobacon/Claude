// icons/generate-icons.mjs
//
// Generates the toolbar PNG icons with zero dependencies. Chrome's toolbar
// requires PNG (SVG is not accepted), and this environment has no image
// tooling, so we encode PNGs by hand using Node's built-in zlib.
//
// Run: npm run icons   (or: node icons/generate-icons.mjs)

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// --- minimal PNG encoder ----------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = compression, filter, interlace = 0

  // prefix each scanline with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the artwork ------------------------------------------------------------
// A rounded indigo tile with three stacked "tab" bars — the stash motif.
function draw(size) {
  const buf = Buffer.alloc(size * size * 4); // transparent
  const radius = Math.round(size * 0.22);
  const brand = [79, 70, 229]; // #4f46e5

  const inCorner = (x, y) => {
    // round the four corners
    const corners = [
      [radius, radius],
      [size - radius - 1, radius],
      [radius, size - radius - 1],
      [size - radius - 1, size - radius - 1],
    ];
    const nearLeft = x < radius;
    const nearRight = x > size - radius - 1;
    const nearTop = y < radius;
    const nearBottom = y > size - radius - 1;
    if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
      const cx = nearLeft ? radius : size - radius - 1;
      const cy = nearTop ? radius : size - radius - 1;
      return Math.hypot(x - cx, y - cy) <= radius;
    }
    return true;
  };

  const set = (x, y, r, g, b, a) => {
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };

  // background tile
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (inCorner(x, y)) set(x, y, brand[0], brand[1], brand[2], 255);
    }
  }

  // three stacked white bars
  const barH = Math.max(2, Math.round(size * 0.13));
  const barX = Math.round(size * 0.24);
  const barW = Math.round(size * 0.52);
  const gap = Math.round(size * 0.1);
  const startY = Math.round(size * 0.26);
  const alphas = [255, 215, 175];
  for (let b = 0; b < 3; b += 1) {
    const y0 = startY + b * (barH + gap);
    for (let y = y0; y < y0 + barH && y < size; y += 1) {
      for (let x = barX; x < barX + barW && x < size; x += 1) {
        if (inCorner(x, y)) set(x, y, 255, 255, 255, alphas[b]);
      }
    }
  }

  return buf;
}

for (const size of [16, 48, 128]) {
  const png = encodePng(size, size, draw(size));
  const out = join(HERE, `icon${size}.png`);
  writeFileSync(out, png);
  console.log(`wrote ${out} (${png.length} bytes)`);
}
