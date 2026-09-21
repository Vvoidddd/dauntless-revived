// Draws the launcher's own icon (the emblem from src/renderer/dom.ts on a dusk tile) and writes
// assets/icon.png (256 px) and assets/icon.ico (16-256 px). Pure JavaScript: a small anti-aliased
// rasteriser, PNG via zlib, ICO with PNG entries. Run: npm run icon
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- geometry (100 x 100 space)

function quad(p0, c, p1, steps = 24) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    pts.push([a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]]);
  }
  return pts;
}

// The emblem sits inside the tile, scaled around its centre.
const S = 0.8;
const O = 10;
const em = (pts) => pts.map(([x, y]) => [O + x * S, O + y * S]);

const crystal = em([[50, 6], [63, 28], [50, 47], [37, 28]]);
const facet = em([[50, 6], [50, 47], [37, 28]]);
const island = em([...quad([14, 55], [50, 47], [86, 55]), [77, 64], [69, 63], [62, 78], [55, 76], [50, 95], [45, 77], [38, 79], [31, 64], [23, 65]]);
const islandTop = em([...quad([14, 55], [50, 47], [86, 55]), ...quad([86, 55], [50, 60], [14, 55]).slice(1)]);
const motes = [
  { c: em([[26, 36]])[0], r: 3 * S, color: [62, 230, 211], a: 0.85 },
  { c: em([[76, 30]])[0], r: 2.2 * S, color: [62, 230, 211], a: 0.7 },
];

function inPolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Each layer: coverage test + colour at a point. Painted back to front.
const layers = [
  {
    hit: (x, y) => inRoundRect(x, y, 3, 3, 97, 97, 21),
    color: (x, y) => {
      let c = mix([30, 44, 92], [9, 14, 34], clamp01((y - 3) / 94));
      const glow = clamp01(1 - Math.hypot(x - 72, y - 92) / 55);
      c = mix(c, [255, 122, 47], glow * glow * 0.55);
      const teal = clamp01(1 - Math.hypot(x - 20, y - 12) / 45);
      return [mix(c, [62, 230, 211], teal * teal * 0.25), 1];
    },
  },
  { hit: (x, y) => inPolygon(crystal, x, y), color: (x, y) => [mix([159, 247, 236], [31, 184, 168], clamp01((x - 35 + (y - 8)) / 40)), 1] },
  { hit: (x, y) => inPolygon(facet, x, y), color: () => [[255, 255, 255], 0.28] },
  { hit: (x, y) => inPolygon(island, x, y), color: (x, y) => [mix([255, 163, 92], [201, 72, 26], clamp01((y - 48) / 42)), 1] },
  { hit: (x, y) => inPolygon(islandTop, x, y), color: () => [[255, 210, 168], 0.55] },
  ...motes.map((m) => ({ hit: (x, y) => (x - m.c[0]) ** 2 + (y - m.c[1]) ** 2 <= m.r * m.r, color: () => [m.color, m.a] })),
];

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const n = size <= 32 ? 6 : 4; // supersamples per axis
  for (let py = 0; py < size; py++) {
    for (let pxx = 0; pxx < size; pxx++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const x = ((pxx + (sx + 0.5) / n) / size) * 100;
          const y = ((py + (sy + 0.5) / n) / size) * 100;
          // Straight "over" compositing of the layers at this sample.
          let cr = 0,
            cg = 0,
            cb = 0,
            ca = 0;
          for (const l of layers) {
            if (!l.hit(x, y)) continue;
            const [c, alpha] = l.color(x, y);
            const outA = alpha + ca * (1 - alpha);
            if (outA <= 0) continue;
            cr = (c[0] * alpha + cr * ca * (1 - alpha)) / outA;
            cg = (c[1] * alpha + cg * ca * (1 - alpha)) / outA;
            cb = (c[2] * alpha + cb * ca * (1 - alpha)) / outA;
            ca = outA;
          }
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const i = (py * size + pxx) * 4;
      const cov = a / (n * n);
      px[i] = a > 0 ? Math.round(r / a) : 0;
      px[i + 1] = a > 0 ? Math.round(g / a) : 0;
      px[i + 2] = a > 0 ? Math.round(b / a) : 0;
      px[i + 3] = Math.round(cov * 255);
    }
  }
  return px;
}

// ---------------------------------------------------------------- PNG and ICO

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map((size) => ({ size, data: png(size, render(size)) }));
writeFileSync(path.join(root, "assets", "icon.png"), images[images.length - 1].data);
writeFileSync(path.join(root, "assets", "icon.ico"), ico(images));
console.log(`wrote assets/icon.png and assets/icon.ico (${sizes.join(", ")} px)`);
