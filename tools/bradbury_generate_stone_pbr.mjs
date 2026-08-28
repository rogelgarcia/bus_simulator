// tools/bradbury_generate_stone_pbr.mjs
// Generates the Bradbury Block stone PBR sets procedurally (deterministic,
// tileable), matching the downloads/buildings_references/2.png / 3.png model:
//   - red_sandstone_block: mottled red-brown sandstone ashlar for the ground
//     floor piers and the entry portal (the Bradbury's brownstone base).
//   - terracotta_smooth: smooth warm terracotta for the moulded trim (bands,
//     capitals, archivolts, cornice ornaments).
// Each set emits basecolor.png, normal_gl.png and arm.png (AO/rough/metal) at
// 1024x1024 plus a pbr.material.config.js registration module. Same encoder
// and noise kit as tools/ai491_generate_stone_pbr.mjs.
//
// Run: node tools/bradbury_generate_stone_pbr.mjs
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
    ihdr[8] = 8;
    ihdr[9] = 2;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const stride = width * 3;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        raw.set(rgb.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
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
    return sum / norm;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const clamp255 = (x) => Math.max(0, Math.min(255, Math.round(x)));

// ---------------------------------------------------------------------------
// Map baking (same layout as the AI 491 tool)
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

            const [r, g, b] = albedoAt(u, v, h);
            base[idx * 3] = clamp255(r);
            base[idx * 3 + 1] = clamp255(g);
            base[idx * 3 + 2] = clamp255(b);

            const nx = -dhdx * normalStrength;
            const ny = dhdy * normalStrength;
            const nz = 1.0;
            const invLen = 1 / Math.hypot(nx, ny, nz);
            normal[idx * 3] = clamp255((nx * invLen * 0.5 + 0.5) * 255);
            normal[idx * 3 + 1] = clamp255((ny * invLen * 0.5 + 0.5) * 255);
            normal[idx * 3 + 2] = clamp255((nz * invLen * 0.5 + 0.5) * 255);

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
        notes: 'Procedurally generated (tools/bradbury_generate_stone_pbr.mjs); neutral calibration pending an AI 312 pass.',
        albedoNotes: '',
        roughnessIntent: ''
    })
});
`;
    writeFileSync(path.join(dir, 'pbr.material.config.js'), source);

    // Minimal correction config so the async calibration probe does not 500
    // (the AI 491 sets lack one and their loads log console errors, which
    // breaks e2e specs that assert a clean console).
    const correction = `export default Object.freeze({
    schema: 'bus_sim.pbr_material_correction',
    version: 1,
    materialId: 'pbr.${slug}',
    label: '${label}',
    classId: '${classId}',
    sourceConfigFile: 'assets/public/pbr/${slug}/pbr.material.config.js',
    textureFolder: 'assets/public/pbr/${slug}',
    resolvedMapFiles: Object.freeze({
        baseColor: 'assets/public/pbr/${slug}/basecolor.png',
        normal: 'assets/public/pbr/${slug}/normal_gl.png',
        orm: 'assets/public/pbr/${slug}/arm.png'
    }),
    presets: Object.freeze({})
});
`;
    writeFileSync(path.join(dir, 'pbr.material.correction.config.js'), correction);
}

// ---------------------------------------------------------------------------
// 1. Red sandstone block — the Bradbury base. Mottled red-brown ashlar in a
// running bond of wide flat-faced blocks with tight joints (the reference
// piers read as smooth mottled stone with visible course lines, not rock-faced
// rustication). Tile covers 3m: 5 courses of 0.6m, 2 blocks per course.
// ---------------------------------------------------------------------------
function bakeRedSandstoneBlock() {
    const ROWS = 6;
    const COLS = 2;
    const JOINT = 0.006;
    const DRAFT = 0.016; // shallow drafted margin around each block

    const blockInfo = (u, v) => {
        const row = Math.floor(v * ROWS);
        const rowF = v * ROWS - row;
        const offset = (row % 2) * 0.5;
        const c = u * COLS + offset;
        const col = Math.floor(c);
        const colF = c - col;
        const colId = ((col % COLS) + COLS) % COLS;
        const du = Math.min(colF, 1 - colF) / COLS;
        const dv = Math.min(rowF, 1 - rowF) / ROWS;
        return { row, colId, edge: Math.min(du, dv) };
    };

    const plateau = (edge) => smootherstep(clamp01((edge - JOINT) / DRAFT));

    const heightAt = (u, v) => {
        const { row, colId, edge } = blockInfo(u, v);
        const lift = 0.94 + hash2(colId * 9 + 2, row * 11 + 5, 143) * 0.06;
        const face = fbm(u, v, { octaves: 4, basePeriod: 28, seed: 147 }) * 0.05;
        return plateau(edge) * (lift + face);
    };

    const albedoAt = (u, v, h) => {
        const { row, colId, edge } = blockInfo(u, v);
        const jitter = hash2(colId * 3 + 1, row * 7 + 4, 151);
        // Mottle: the reference stone is patchy — big soft blotches swinging
        // between rose and deep brown, plus a fine speckle.
        const blotch = fbm(u, v, { octaves: 4, basePeriod: 9, seed: 155 }) * 24
            + fbm(u, v, { octaves: 3, basePeriod: 30, seed: 159 }) * 13;
        const speck = (valueNoise(u, v, 340, 163) - 0.5) * 16;
        const baseR = 66 + jitter * 10 + blotch + speck;
        const baseG = 46 + jitter * 7 + blotch * 0.82 + speck * 0.9;
        const baseB = 39 + jitter * 5 + blotch * 0.7 + speck * 0.8;
        const mortarMix = (1 - smootherstep(clamp01((edge - JOINT * 0.5) / (JOINT * 1.4)))) * 0.7;
        const r = baseR * (1 - mortarMix) + 44 * mortarMix;
        const g = baseG * (1 - mortarMix) + 34 * mortarMix;
        const b = baseB * (1 - mortarMix) + 29 * mortarMix;
        const shade = 0.93 + h * 0.07;
        return [r * shade, g * shade, b * shade];
    };

    const roughnessAt = (u, v, h) => 0.74 + fbm(u, v, { octaves: 3, basePeriod: 36, seed: 167 }) * 0.07 + (1 - h) * 0.05;
    const aoAt = (u, v) => {
        const { edge } = blockInfo(u, v);
        return 0.62 + 0.38 * smootherstep(clamp01((edge - JOINT * 0.4) / (JOINT + DRAFT)));
    };

    bakeMaps({ slug: 'red_sandstone_block', heightAt, albedoAt, roughnessAt, aoAt, normalStrength: 14 });
    writeMaterialConfig({ slug: 'red_sandstone_block', label: 'Red Sandstone Block', classId: 'stone', tileMeters: 3.0 });
}

// ---------------------------------------------------------------------------
// 1b. Red sandstone noise — the SAME mottled red-brown palette as
// red_sandstone_block but with NO block pattern: plain noise for mouldings,
// bands and decorators where course joints would read wrong.
// ---------------------------------------------------------------------------
function bakeRedSandstoneNoise() {
    const heightAt = (u, v) => 0.94 + fbm(u, v, { octaves: 4, basePeriod: 24, seed: 247 }) * 0.05;

    const albedoAt = (u, v, h) => {
        const blotch = fbm(u, v, { octaves: 4, basePeriod: 9, seed: 155 }) * 24
            + fbm(u, v, { octaves: 3, basePeriod: 30, seed: 159 }) * 13;
        const speck = (valueNoise(u, v, 340, 163) - 0.5) * 16;
        const baseR = 71 + blotch + speck;
        const baseG = 49 + blotch * 0.82 + speck * 0.9;
        const baseB = 41 + blotch * 0.7 + speck * 0.8;
        const shade = 0.93 + h * 0.07;
        return [baseR * shade, baseG * shade, baseB * shade];
    };

    const roughnessAt = (u, v, h) => 0.74 + fbm(u, v, { octaves: 3, basePeriod: 36, seed: 167 }) * 0.07 + (1 - h) * 0.05;
    const aoAt = () => 0.95;

    bakeMaps({ slug: 'red_sandstone_noise', heightAt, albedoAt, roughnessAt, aoAt, normalStrength: 4 });
    writeMaterialConfig({ slug: 'red_sandstone_noise', label: 'Red Sandstone Noise', classId: 'stone', tileMeters: 2.0 });
}

// ---------------------------------------------------------------------------
// 2. Smooth terracotta — moulded trim matching the salmon brick family.
// ---------------------------------------------------------------------------
function bakeTerracottaSmooth() {
    const heightAt = (u, v) => fbm(u, v, { octaves: 3, basePeriod: 7, seed: 171 }) * 0.3
        + fbm(u, v, { octaves: 5, basePeriod: 52, seed: 175 }) * 0.1;

    const albedoAt = (u, v) => {
        const mottle = fbm(u, v, { octaves: 4, basePeriod: 8, seed: 179 }) * 9
            + fbm(u, v, { octaves: 5, basePeriod: 80, seed: 183 }) * 4;
        const speck = Math.max(0, valueNoise(u, v, 460, 187) - 0.93) * 30;
        const r = 112 + mottle - speck;
        const g = 74 + mottle * 0.9 - speck;
        const b = 57 + mottle * 0.78 - speck;
        return [r, g, b];
    };

    const roughnessAt = (u, v) => 0.66 + fbm(u, v, { octaves: 3, basePeriod: 26, seed: 191 }) * 0.06;
    const aoAt = () => 0.985;

    bakeMaps({ slug: 'terracotta_smooth', heightAt, albedoAt, roughnessAt, aoAt, normalStrength: 1.5 });
    writeMaterialConfig({ slug: 'terracotta_smooth', label: 'Terracotta Smooth', classId: 'stone', tileMeters: 4.0 });
}

bakeRedSandstoneBlock();
bakeRedSandstoneNoise();
bakeTerracottaSmooth();
