// tools/bradbury_generate_silhouette_atlas.mjs
// Generates the storefront SILHOUETTE interior atlas: a dark, discreet fake
// interior for street-level glass (replacing the photographic shop parallax,
// which reads far too loud on the Bradbury Block reference). Each cell is a
// near-black room with soft-edged silhouette masses — shelf runs against the
// back wall, a low counter, faint hanging-lamp glows — feathered so nothing
// reads as a picture, only as depth behind dark glass.
//
// Constraints from tests/node/unit/shop_interior_atlases.test.js (the seam
// probe reads the PNG): cell BOUNDARIES must be crisp single-column steps
// (each cell gets its own base tone), while everything INSIDE a cell stays
// soft (>= 12px feather) so a finer-than-declared grid never scores as valid.
//
// Output: assets/public/textures/window_interiors/
//         parallax_interior_atlas_storefront_silhouette_2x2.png (1024x1024, 2x2)
// Run: node tools/bradbury_generate_silhouette_atlas.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'public', 'textures', 'window_interiors',
    'parallax_interior_atlas_storefront_silhouette_2x2.png');

const SIZE = 1024;
const CELLS = 2;
const CELL = SIZE / CELLS;

// ---------------------------------------------------------------------------
// PNG encoder (RGB, 8-bit, filter 0) — same as bradbury_generate_stone_pbr.
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return out;
}

function encodePngRgb(width, height, rgb) {
    const raw = Buffer.alloc(height * (1 + width * 3));
    for (let y = 0; y < height; y++) {
        raw[y * (1 + width * 3)] = 0;
        rgb.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0))
    ]);
}

// Deterministic PRNG.
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const sstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// Soft box coverage: 1 inside, feathered over `f` px around the rect.
function softBox(x, y, x0, y0, x1, y1, f) {
    const cx = sstep((x - x0 + f) / (2 * f)) * (1 - sstep((x - x1 + f) / (2 * f)));
    const cy = sstep((y - y0 + f) / (2 * f)) * (1 - sstep((y - y1 + f) / (2 * f)));
    return cx * cy;
}

// Per-cell scene: base tone (the SEAM carrier — cells differ so boundaries
// are crisp), shelf masses, counter, lamps. All coordinates cell-local 0..1.
function makeCellScene(index) {
    const rand = mulberry32(0x51713 + index * 977);
    const scenes = [];
    // shelf run against the back wall
    const shelfCount = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < shelfCount; i++) {
        const w = 0.09 + rand() * 0.07;
        const x0 = 0.06 + (i + 0.15 * rand()) * (0.88 / shelfCount);
        const top = 0.3 + rand() * 0.14;
        scenes.push({ kind: 'mass', x0, y0: top, x1: Math.min(0.94, x0 + w), y1: 0.8 + rand() * 0.06, dark: 12 + rand() * 8 });
    }
    // low counter mass in some cells
    if (rand() > 0.35) {
        const x0 = 0.2 + rand() * 0.25;
        scenes.push({ kind: 'mass', x0, y0: 0.6 + rand() * 0.08, x1: x0 + 0.3 + rand() * 0.2, y1: 0.85, dark: 9 + rand() * 6 });
    }
    // faint hanging lamp glows
    const lampCount = 2 + Math.floor(rand() * 2);
    const lamps = [];
    for (let i = 0; i < lampCount; i++) {
        lamps.push({ x: 0.18 + (i + 0.5 * rand()) * (0.7 / lampCount), y: 0.14 + rand() * 0.05, r: 0.035 + rand() * 0.02, glow: 16 + rand() * 8 });
    }
    // per-cell base tone offset: the seam step between neighbouring cells
    const toneByIndex = [0, 7, 10, 4];
    return { scenes, lamps, tone: toneByIndex[index % 4] };
}

const rgb = Buffer.alloc(SIZE * SIZE * 3);
const cellScenes = [0, 1, 2, 3].map((i) => makeCellScene(i));
const noise = mulberry32(0xa7c11);

for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
        const cellCol = Math.floor(px / CELL);
        const cellRow = Math.floor(py / CELL);
        const cell = cellScenes[cellRow * CELLS + cellCol];
        const x = (px % CELL) / CELL;
        const y = (py % CELL) / CELL;
        const f = 16 / CELL; // feather in cell-local units (16px)

        // base: dark vertical gradient, floor slightly lighter
        let lum = 24 + cell.tone + (1 - y) * -6 + sstep((y - 0.74) / 0.1) * 7;
        // silhouette masses subtract, softly
        for (const s of cell.scenes) {
            lum -= s.dark * softBox(x, y, s.x0, s.y0, s.x1, s.y1, f);
        }
        // lamp glows add, gaussian
        for (const l of cell.lamps) {
            const dx = x - l.x;
            const dy = (y - l.y) * 1.4;
            const d2 = (dx * dx + dy * dy) / (l.r * l.r);
            lum += l.glow * Math.exp(-d2);
        }
        // grain to avoid banding (too small to register as structure)
        lum += (noise() - 0.5) * 2.0;

        const v = Math.max(6, Math.min(70, lum));
        const idx = (py * SIZE + px) * 3;
        // cool dark blue-gray, slightly warm around the lamps
        rgb[idx] = Math.round(v * 0.94);
        rgb[idx + 1] = Math.round(v * 0.99);
        rgb[idx + 2] = Math.round(v * 1.08);
    }
}

writeFileSync(OUT, encodePngRgb(SIZE, SIZE, rgb));
console.log('wrote', OUT);
