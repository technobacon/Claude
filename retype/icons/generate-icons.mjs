// icons/generate-icons.mjs — regenerates the toolbar PNGs with a pure-Node
// PNG encoder (no image libraries). Artwork: emerald rounded square with
// three white "text lines", the last one short with a caret block after it.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// --- PNG encoder ------------------------------------------------------------
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
  const tb = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}

function encodePng(w, h, rgba) {
  const sig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// --- artwork ----------------------------------------------------------------

function blendWhite(buf, size, px, py, coverage) {
  if (px < 0 || px >= size || py < 0 || py >= size || coverage <= 0) return;
  const i = (py * size + px) * 4;
  const a = Math.min(1, coverage);
  buf[i]     = Math.round(buf[i]     + (255 - buf[i])     * a);
  buf[i + 1] = Math.round(buf[i + 1] + (255 - buf[i + 1]) * a);
  buf[i + 2] = Math.round(buf[i + 2] + (255 - buf[i + 2]) * a);
}

// Signed distance field for a rounded rectangle: negative inside, 0 on edge.
function sdfRoundedRect(px, py, rx, ry, rw, rh, r) {
  const hx = rw / 2, hy = rh / 2;
  const dx = Math.abs(px - (rx + hx)) - (hx - r);
  const dy = Math.abs(py - (ry + hy)) - (hy - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

function drawBar(buf, size, cx, cy, cw, ch, cr, alpha) {
  const x0 = Math.max(0, Math.floor(cx - 1));
  const x1 = Math.min(size - 1, Math.ceil(cx + cw + 1));
  const y0 = Math.max(0, Math.floor(cy - 1));
  const y1 = Math.min(size - 1, Math.ceil(cy + ch + 1));
  const baseA = alpha / 255;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dist = sdfRoundedRect(px, py, cx, cy, cw, ch, cr);
      const coverage = Math.max(0, Math.min(1, 0.5 - dist)) * baseA;
      if (coverage > 0) blendWhite(buf, size, px, py, coverage);
    }
  }
}

function draw(size) {
  const buf = Buffer.alloc(size * size * 4); // all transparent

  // Background: rounded square, top-to-bottom emerald gradient.
  const bgR = Math.round(size * 0.20);
  for (let py = 0; py < size; py++) {
    const t = py / (size - 1);
    const r = Math.round(16 - 12 * t);   // 16 → 4
    const g = Math.round(185 - 65 * t);  // 185 → 120
    const b = Math.round(129 - 42 * t);  // 129 → 87
    for (let px = 0; px < size; px++) {
      const dist = sdfRoundedRect(px, py, 0, 0, size, size, bgR);
      if (dist < 0.5) {
        const aa = Math.max(0, Math.min(1, 0.5 - dist));
        const i = (py * size + px) * 4;
        buf[i]     = r;
        buf[i + 1] = g;
        buf[i + 2] = b;
        buf[i + 3] = Math.round(255 * aa);
      }
    }
  }

  // Three text lines; the last is short and followed by a caret block.
  const lineH = Math.max(1, Math.round(size * 0.11));
  const lineR = lineH / 2;
  const left = Math.round(size * 0.18);
  const gap = Math.round(size * 0.22);
  const top = Math.round(size * 0.21);

  drawBar(buf, size, left, top,           Math.round(size * 0.50), lineH, lineR, 245);
  drawBar(buf, size, left, top + gap,     Math.round(size * 0.64), lineH, lineR, 175);
  drawBar(buf, size, left, top + 2 * gap, Math.round(size * 0.32), lineH, lineR, 245);

  // Caret: a taller block just after the short third line.
  const caretW = Math.max(1, Math.round(size * 0.12));
  const caretH = Math.max(2, Math.round(size * 0.19));
  drawBar(
    buf, size,
    left + Math.round(size * 0.38),
    top + 2 * gap + Math.round(lineH / 2) - Math.round(caretH / 2),
    caretW, caretH, Math.max(1, Math.round(size * 0.03)),
    255,
  );

  return buf;
}

for (const size of [16, 48, 128]) {
  const png = encodePng(size, size, draw(size));
  const out = join(HERE, `icon${size}.png`);
  writeFileSync(out, png);
  console.log(`wrote ${out}  (${png.length} bytes)`);
}
