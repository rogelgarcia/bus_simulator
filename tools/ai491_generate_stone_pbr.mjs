// tools/ai491_generate_stone_pbr.mjs
// Generates the AI 491 stone PBR sets procedurally (deterministic, tileable):
//   - rusticated_ashlar: rusticated stone blocks for ground-floor `base` slots
//   - limestone_smooth:  smooth cast stone / limestone for `trim` slots
//   - brownstone:        brown sandstone walls
// Each set emits basecolor.png, normal_gl.png and arm.png (AO/rough/metal)
// at 1024x1024 plus a pbr.material.config.js registration module.
//
// Run: node tools/ai491_generate_stone_pbr.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PBR_DIR = path.join(ROOT, 'assets', 'public', 'pbr');
const SIZE = 1024;

// ---------------------------------------------------------------------------
// PNG encoder (RGB, 8-bit, filter 0)
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
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

function encodePngRgb(width, height, rgb) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type: truecolor
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const stride = width * 3;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        rgb.copy ? rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
            : raw.set(rgb.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0))
    ]);
}

// ---------------------------------------------------------------------------
// Deterministic tileable noise
// ---------------------------------------------------------------------------
function hash2(ix, iy, seed) {
    let h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function smootherstep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

// Tileable value noise: u,v in [0,1), lattice wraps at `period`.
function valueNoise(u, v, period, seed) {
    const x = u * period;
    const y = v * period;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smootherstep(x - x0);
    const fy = smootherstep(y - y0);
    const p = period;
    const i0 = ((x0 % p) + p) % p;
    const i1 = (i0 + 1) % p;
    const j0 = ((y0 % p) + p) % p;
    const j1 = (j0 + 1) % p;
    const a = hash2(i0, j0, seed);
    const b = hash2(i1, j0, seed);
    const c = hash2(i0, j1, seed);
    const d = hash2(i1, j1, seed);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

function fbm(u, v, { octaves = 4, basePeriod = 8, gain = 0.5, seed = 1 } = {}) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let period = basePeriod;
    for (let i = 0; i < octaves; i++) {
        sum += (valueNoise(u, v, period, seed + i * 101) * 2 - 1) * amp;
        norm += amp;
        amp *= gain;
        period *= 2;
    }
    return sum / norm; // [-1, 1]
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const clamp255 = (x) => Math.max(0, Math.min(255, Math.round(x)));

// ---------------------------------------------------------------------------
// Map baking helpers
// ---------------------------------------------------------------------------
function bakeMaps({ slug, heightAt, albedoAt, roughnessAt, aoAt, normalStrength }) {
    const n = SIZE;
    const height = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
        const v = y / n;
        for (let x = 0; x < n; x++) {
            height[y * n + x] = heightAt(x / n, v);
        }
    }

    const base = Buffer.alloc(n * n * 3);
    const normal = Buffer.alloc(n * n * 3);
    const arm = Buffer.alloc(n * n * 3);

    for (let y = 0; y < n; y++) {
        const v = y / n;
        const yA = ((y - 1) + n) % n;
        const yB = (y + 1) % n;
        for (let x = 0; x < n; x++) {
            const u = x / n;
            const idx = y * n + x;
            const xA = ((x - 1) + n) % n;
            const xB = (x + 1) % n;

            const h = height[idx];
            const dhdx = (height[y * n + xB] - height[y * n + xA]) * 0.5;
            const dhdy = (height[yB * n + x] - height[yA * n + x]) * 0.5;

            // Albedo
            const [r, g, b] = albedoAt(u, v, h);
            base[idx * 3] = clamp255(r);
            base[idx * 3 + 1] = clamp255(g);
            base[idx * 3 + 2] = clamp255(b);

            // Normal (GL convention: +Y up in texture space)
            const nx = -dhdx * normalStrength;
            const ny = dhdy * normalStrength;
            const nz = 1.0;
            const invLen = 1 / Math.hypot(nx, ny, nz);
            normal[idx * 3] = clamp255((nx * invLen * 0.5 + 0.5) * 255);
            normal[idx * 3 + 1] = clamp255((ny * invLen * 0.5 + 0.5) * 255);
            normal[idx * 3 + 2] = clamp255((nz * invLen * 0.5 + 0.5) * 255);

            // ARM: R=AO, G=roughness, B=metalness
            arm[idx * 3] = clamp255(clamp01(aoAt(u, v, h)) * 255);
            arm[idx * 3 + 1] = clamp255(clamp01(roughnessAt(u, v, h)) * 255);
            arm[idx * 3 + 2] = 0;
        }
    }

    const dir = path.join(PBR_DIR, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'basecolor.png'), encodePngRgb(n, n, base));
    writeFileSync(path.join(dir, 'normal_gl.png'), encodePngRgb(n, n, normal));
    writeFileSync(path.join(dir, 'arm.png'), encodePngRgb(n, n, arm));
    console.log(`baked ${slug}`);
}

function writeMaterialConfig({ slug, label, classId, tileMeters }) {
    const dir = path.join(PBR_DIR, slug);
    mkdirSync(dir, { recursive: true });
    const source = `export default Object.freeze({
    materialId: 'pbr.${slug}',
    label: '${label}',
    classId: '${classId}',
    root: 'wall',
    buildingEligible: true,
    groundEligible: false,
    tileMeters: ${tileMeters},
    mapFiles: Object.freeze({
        baseColor: 'basecolor.png',
        normal: 'normal_gl.png',
        orm: 'arm.png'
    }),
    allMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/${slug}/basecolor.png',
        normal: 'assets/public/pbr/${slug}/normal_gl.png',
        orm: 'assets/public/pbr/${slug}/arm.png',
        variants: Object.freeze({})
    }),
    normalization: Object.freeze({
        notes: 'Procedurally generated (tools/ai491_generate_stone_pbr.mjs); neutral calibration pending an AI 312 pass.',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
`;
    writeFileSync(path.join(dir, 'pbr.material.config.js'), source);
}

// ---------------------------------------------------------------------------
// 1. Rusticated ashlar — big pillowed blocks, deep chamfered joints.
// Tile covers 4m: 8 rows of 0.5m, 3 blocks of ~1.33m per row, running bond.
// ---------------------------------------------------------------------------
function bakeRusticatedAshlar() {
    const ROWS = 8;
    const COLS = 3;
    const JOINT = 0.010;   // half joint width, in tile units (~4cm at 4m)
    const CHAMFER = 0.026; // chamfer band beyond the joint

    const blockInfo = (u, v) => {
        const row = Math.floor(v * ROWS);
        const rowF = v * ROWS - row;
        const offset = (row % 2) * 0.5;
        const c = u * COLS + offset;
        const col = Math.floor(c);
        const colF = c - col;
        const colId = ((col % COLS) + COLS) % COLS;
        // Distances to the block border in tile units.
        const du = Math.min(colF, 1 - colF) / COLS;
        const dv = Math.min(rowF, 1 - rowF) / ROWS;
        return { row, colId, du, dv, edge: Math.min(du, dv) };
    };

    const plateau = (edge) => {
        const t = clamp01((edge - JOINT) / CHAMFER);
        return smootherstep(t);
    };

    const heightAt = (u, v) => {
        const { row, colId, edge } = blockInfo(u, v);
        const lift = 0.9 + hash2(colId * 7 + 3, row * 13 + 1, 77) * 0.1;
        const face = fbm(u, v, { octaves: 5, basePeriod: 24, seed: 5 }) * 0.10
            + fbm(u, v, { octaves: 3, basePeriod: 96, seed: 9 }) * 0.05;
        return plateau(edge) * (lift + face * plateau(edge));
    };

    const albedoAt = (u, v, h) => {
        const { row, colId, edge } = blockInfo(u, v);
        const jitter = hash2(colId * 5 + 1, row * 3 + 2, 31);
        const warm = hash2(colId * 11 + 4, row * 17 + 6, 57);
        const baseR = 181 + jitter * 20 - 8 + warm * 4;
        const baseG = 172 + jitter * 18 - 8 + warm * 2;
        const baseB = 155 + jitter * 16 - 8 - warm * 5;
        const mottle = fbm(u, v, { octaves: 5, basePeriod: 20, seed: 15 }) * 12
            + fbm(u, v, { octaves: 2, basePeriod: 160, seed: 21 }) * 9;
        // Mortar color stays inside the true joint; the chamfer is beveled
        // block face and keeps the stone color.
        const mortarMix = (1 - smootherstep(clamp01((edge - JOINT * 0.55) / (JOINT * 1.3)))) * 0.85;
        const r = (baseR + mottle) * (1 - mortarMix) + 136 * mortarMix;
        const g = (baseG + mottle) * (1 - mortarMix) + 130 * mortarMix;
        const b = (baseB + mottle) * (1 - mortarMix) + 120 * mortarMix;
        const shade = 0.9 + h * 0.1;
        return [r * shade, g * shade, b * shade];
    };

    const roughnessAt = (u, v, h) => 0.78 + fbm(u, v, { octaves: 3, basePeriod: 48, seed: 33 }) * 0.08 + (1 - h) * 0.08;
    const aoAt = (u, v) => {
        const { edge } = blockInfo(u, v);
        const t = clamp01((edge - JOINT * 0.4) / (JOINT + CHAMFER * 1.4));
        return 0.5 + 0.5 * smootherstep(t);
    };

    bakeMaps({ slug: 'rusticated_ashlar', heightAt, albedoAt, roughnessAt, aoAt, normalStrength: 22 });
    writeMaterialConfig({ slug: 'rusticated_ashlar', label: 'Rusticated Ashlar', classId: 'stone', tileMeters: 4.0 });
}

// ---------------------------------------------------------------------------
// 2. Smooth limestone / cast stone — clean trim material.
// ---------------------------------------------------------------------------
function bakeLimestoneSmooth() {
    const heightAt = (u, v) => fbm(u, v, { octaves: 3, basePeriod: 6, seed: 41 }) * 0.35
        + fbm(u, v, { octaves: 5, basePeriod: 48, seed: 43 }) * 0.12;

    const albedoAt = (u, v) => {
        const mottle = fbm(u, v, { octaves: 4, basePeriod: 7, seed: 47 }) * 7
            + fbm(u, v, { octaves: 5, basePeriod: 90, seed: 51 }) * 3;
        const speck = Math.max(0, valueNoise(u, v, 512, 55) - 0.94) * 40;
        const r = 208 + mottle - speck;
        const g = 202 + mottle * 0.95 - speck;
        const b = 189 + mottle * 0.85 - speck;
        return [r, g, b];
    };

    const roughnessAt = (u, v) => 0.62 + fbm(u, v, { octaves: 3, basePeriod: 24, seed: 61 }) * 0.07;
    const aoAt = () => 0.985;

    bakeMaps({ slug: 'limestone_smooth', heightAt, albedoAt, roughnessAt, aoAt, normalStrength: 1.6 });
    writeMaterialConfig({ slug: 'limestone_smooth', label: 'Limestone Smooth', classId: 'stone', tileMeters: 4.0 });
}

// ---------------------------------------------------------------------------
// 3. Brownstone — brown sandstone with soft horizontal strata.
// ---------------------------------------------------------------------------
function bakeBrownstone() {
    const strata = (u, v) => {
        const warp = fbm(u, v, { octaves: 3, basePeriod: 5, seed: 71 }) * 0.06;
        const band = Math.sin((v + warp) * Math.PI * 2 * 9) * 0.5
            + Math.sin((v + warp * 1.7) * Math.PI * 2 * 23 + 1.3) * 0.24;
        return band; // [-0.74, 0.74]
    };

    const heightAt = (u, v) => strata(u, v) * 0.10
        + fbm(u, v, { octaves: 5, basePeriod: 32, seed: 73 }) * 0.10
        + fbm(u, v, { octaves: 6, basePeriod: 128, seed: 79 }) * 0.05;

    const albedoAt = (u, v) => {
        const band = strata(u, v);
        const patches = fbm(u, v, { octaves: 4, basePeriod: 6, seed: 83 }) * 9;
        const grain = fbm(u, v, { octaves: 5, basePeriod: 120, seed: 89 }) * 6;
        const tone = band * 7 + patches + grain;
        const warmth = fbm(u, v, { octaves: 3, basePeriod: 10, seed: 97 }) * 0.05;
        const r = 128 + tone * 1.12;
        const g = 92 + tone * 0.94 + warmth * 8;
        const b = 74 + tone * 0.78 - warmth * 6;
        return [r, g, b];
    };

    const roughnessAt = (u, v) => 0.8 + fbm(u, v, { octaves: 3, basePeriod: 40, seed: 101 }) * 0.08;
    const aoAt = (u, v, h) => 0.93 + h * 0.05;

    bakeMaps({ slug: 'brownstone', heightAt, albedoAt, roughnessAt, aoAt, normalStrength: 4.5 });
    writeMaterialConfig({ slug: 'brownstone', label: 'Brownstone', classId: 'stone', tileMeters: 4.0 });
}

bakeRusticatedAshlar();
bakeLimestoneSmooth();
bakeBrownstone();
console.log('done');
