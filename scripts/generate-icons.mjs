// Draws the ShutterDesk icon (a camera aperture on a dark rounded tile) as PNG + ICO files,
// without any npm dependencies. Output: assets/icon.ico, assets/icon.png, assets/tray.png.
// Run with: node scripts/generate-icons.mjs   (the generated files are committed, so this is
// only needed after changing the design).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const out = path.join(import.meta.dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

const BLADES = 6;
const TILE = [18, 23, 33];
const BLADE_A = [37, 99, 235];
const BLADE_B = [59, 130, 246];
const RING = [226, 232, 240];
const HOLE = [7, 10, 15];

/** Colour of one sample point in a unit square (u, v in 0..1). Returns [r, g, b, a] or null. */
function sample(u, v, withTile) {
  const x = u - 0.5;
  const y = v - 0.5;
  // Rounded-square tile.
  const half = 0.48;
  const radius = 0.11;
  const qx = Math.max(Math.abs(x) - (half - radius), 0);
  const qy = Math.max(Math.abs(y) - (half - radius), 0);
  const inTile = Math.hypot(qx, qy) <= radius;

  const d = Math.hypot(x, y);
  const lensR = withTile ? 0.38 : 0.47;
  const ringW = withTile ? 0.035 : 0.06;
  if (d <= lensR) {
    if (d > lensR - ringW) return [...RING, 255];
    // Hexagonal opening in the middle.
    const theta = Math.atan2(y, x);
    const sector = (2 * Math.PI) / BLADES;
    const local = ((theta % sector) + sector) % sector - sector / 2;
    const hexR = 0.12 * (lensR / 0.38);
    if (d * Math.cos(local) <= hexR) return [...HOLE, 255];
    // Blades: alternate shades along a slight spiral so they read as overlapping leaves.
    const twisted = theta + (d / lensR) * 1.1;
    const index = Math.floor((((twisted % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / sector);
    return [...(index % 2 === 0 ? BLADE_A : BLADE_B), 255];
  }
  if (withTile && inTile) return [...TILE, 255];
  return null;
}

function png(size, withTile = true) {
  const SS = 4; // 4x4 supersampling for smooth edges
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let py = 0; py < size; py += 1) {
    raw[py * stride] = 0;
    for (let px = 0; px < size; px += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, withTile);
          if (c) { r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3]; }
        }
      }
      const i = py * stride + 1 + px * 4;
      if (a > 0) { raw[i] = Math.round(r / a); raw[i + 1] = Math.round(g / a); raw[i + 2] = Math.round(b / a); }
      raw[i + 3] = Math.round(a / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map((s) => png(s));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s === 256 ? 0 : s;
  e[1] = s === 256 ? 0 : s;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([header, ...entries, ...images]));
fs.writeFileSync(path.join(out, 'icon.png'), images.at(-1));
// The tray uses the aperture without the tile so it stays legible at 16-32 px.
fs.writeFileSync(path.join(out, 'tray.png'), png(32, false));
console.log(`Icons written to ${out}`);
