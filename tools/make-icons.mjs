/* Generates the PWA icons. No image libraries are available (and this repo
   has no dependencies), so this rasterises the mark directly and writes the
   PNGs by hand: a felt-green ground, a cream card, a red diamond.

   Run with: node tools/make-icons.mjs                                     */
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');

const FELT = [0x1d, 0x6b, 0x46];
const CARD = [0xf4, 0xef, 0xe2];
const PIP  = [0xd7, 0x60, 0x5f];

const SS = 4; // supersampling factor, for antialiased edges

/* --- shape tests, in unit-ish coordinates centred on the canvas --------- */
const inRoundRect = (x, y, cx, cy, w, h, r) => {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  if (dx <= 0 || dy <= 0) return Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2;
  return dx * dx + dy * dy <= r * r;
};
const inDiamond = (x, y, cx, cy, a, b) =>
  Math.abs(x - cx) / a + Math.abs(y - cy) / b <= 1;

/* --- draw one icon into a flat RGB buffer ------------------------------ */
function render(size, maskable) {
  const c = size / 2;
  // a maskable icon must survive a circular crop, so the art sits smaller
  const scale = maskable ? 0.62 : 0.82;
  const cardW = size * 0.45 * scale / 0.82;
  const cardH = size * 0.62 * scale / 0.82;
  const cardR = size * 0.05;
  const pipA = cardW * 0.27;
  const pipB = cardH * 0.28;

  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          // full-bleed ground: the launcher applies its own corner rounding,
          // and a square keeps this an alpha-free 3-channel PNG
          let col = FELT;
          if (inDiamond(fx, fy, c, c, pipA, pipB)) col = PIP;
          else if (inRoundRect(fx, fy, c, c, cardW, cardH, cardR)) col = CARD;
          acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2];
        }
      }
      const n = SS * SS, i = (y * size + x) * 3;
      px[i] = Math.round(acc[0] / n);
      px[i + 1] = Math.round(acc[1] / n);
      px[i + 2] = Math.round(acc[2] / n);
    }
  }
  return px;
}

/* --- minimal PNG writer (8-bit truecolour, filter 0) ------------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = buf => {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false]
]) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, png(size, render(size, maskable)));
  console.log(name, fs.statSync(file).size + ' bytes');
}
