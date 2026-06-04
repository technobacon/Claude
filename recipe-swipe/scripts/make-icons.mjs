/**
 * Generate Forkful PWA / home-screen icons with zero dependencies.
 * Pure-Node PNG encoder (zlib for IDAT, hand-rolled CRC32) — mirrors the repo's
 * "no image libraries" icon convention. Draws a simple amber fork mark.
 *
 *   node scripts/make-icons.mjs
 */
import zlib from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../public", import.meta.url));
mkdirSync(OUT, { recursive: true });

// --- CRC32 ---------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Drawing -------------------------------------------------------------
const BG = [255, 183, 3, 255]; // amber #ffb703
const FG = [17, 21, 28, 255]; // dark #11151c

function drawFork(size) {
  const rgba = Buffer.alloc(size * size * 4);
  // background
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = BG[0];
    rgba[i * 4 + 1] = BG[1];
    rgba[i * 4 + 2] = BG[2];
    rgba[i * 4 + 3] = BG[3];
  }
  const rect = (fx, fy, fw, fh) => {
    const x0 = Math.round(fx * size),
      y0 = Math.round(fy * size);
    const x1 = Math.round((fx + fw) * size),
      y1 = Math.round((fy + fh) * size);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const o = (y * size + x) * 4;
        rgba[o] = FG[0];
        rgba[o + 1] = FG[1];
        rgba[o + 2] = FG[2];
        rgba[o + 3] = FG[3];
      }
  };
  // 3 tines
  rect(0.385, 0.17, 0.05, 0.26);
  rect(0.475, 0.17, 0.05, 0.26);
  rect(0.565, 0.17, 0.05, 0.26);
  // crossbar joining tines
  rect(0.385, 0.4, 0.23, 0.06);
  // handle
  rect(0.47, 0.44, 0.06, 0.4);
  return rgba;
}

for (const size of [180, 192, 512]) {
  const png = encodePNG(size, drawFork(size));
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  writeFileSync(`${OUT}/${name}`, png);
  console.log(`wrote public/${name} (${png.length} bytes)`);
}
