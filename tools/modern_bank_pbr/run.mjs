// tools/modern_bank_pbr/run.mjs
// Generates the Modern Bank PBR sets procedurally (deterministic, tileable),
// matching downloads/buildings_references/10 front.png:
//   - burnt_cement_panel: the monumental base. Burnt/scorched cement in large
//     SQUARE panels (~1.4m) whose joints live in the normal + AO maps, over a
//     warm grey cement body blotched with soot.
//   - bronze_anodized_panel: the curtain wall spandrel/mullion skin. Dark
//     bronze anodized metal with a fine vertical brushed grain (building wall
//     materials render non-metallic and IBL-free, so the set carries its look
//     in albedo + micro-normal rather than in reflectivity).
// Each set emits basecolor.png, normal_gl.png and arm.png (AO/rough/metal) at
// 1024x1024 plus pbr.material.config.js / pbr.material.correction.config.js.
// Same encoder and noise kit as tools/bradbury_generate_stone_pbr.mjs.
//
// Run: node tools/modern_bank_pbr/run.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
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

// Anisotropic value noise: independent periods per axis, still tileable.
function valueNoise2(u, v, periodU, periodV, seed) {
    const x = u * periodU;
    const y = v * periodV;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smootherstep(x - x0);
    const fy = smootherstep(y - y0);
    const i0 = ((x0 % periodU) + periodU) % periodU;
    const i1 = (i0 + 1) % periodU;
    const j0 = ((y0 % periodV) + periodV) % periodV;
    const j1 = (j0 + 1) % periodV;
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
// Map baking
// ---------------------------------------------------------------------------
function bakeMaps({ slug, heightAt, albedoAt, roughnessAt, aoAt, metalAt = null, normalStrength }) {
    const n = SIZE;
    const height = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
        const v = y / n;
        for (let x = 0; x < n; x++) height[y * n + x] = heightAt(x / n, v);
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
            arm[idx * 3 + 2] = metalAt ? clamp255(clamp01(metalAt(u, v, h)) * 255) : 0;
        }
    }

    const dir = path.join(PBR_DIR, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'basecolor.png'), encodePngRgb(n, n, base));
    writeFileSync(path.join(dir, 'normal_gl.png'), encodePngRgb(n, n, normal));
    writeFileSync(path.join(dir, 'arm.png'), encodePngRgb(n, n, arm));
    console.log('baked ' + slug);
}

function writeMaterialConfig({ slug, label, classId, tileMeters }) {
    const dir = path.join(PBR_DIR, slug);
    mkdirSync(dir, { recursive: true });
    const materialSource = [
        'export default Object.freeze({',
        "    materialId: 'pbr." + slug + "',",
        "    label: '" + label + "',",
        "    classId: '" + classId + "',",
        "    root: 'wall',",
        '    buildingEligible: true,',
        '    groundEligible: false,',
        '    tileMeters: ' + tileMeters + ',',
        '    mapFiles: Object.freeze({',
        "        baseColor: 'basecolor.png',",
        "        normal: 'normal_gl.png',",
        "        orm: 'arm.png'",
        '    }),',
        '    allMapFiles: Object.freeze({',
        "        baseColor: 'assets/public/pbr/" + slug + "/basecolor.png',",
        "        normal: 'assets/public/pbr/" + slug + "/normal_gl.png',",
        "        orm: 'assets/public/pbr/" + slug + "/arm.png',",
        '        variants: Object.freeze({})',
        '    }),',
        '    normalization: Object.freeze({',
        "        notes: 'Procedurally generated (tools/modern_bank_pbr/run.mjs); neutral calibration pending an AI 312 pass.',",
        "        albedoNotes: '',",
        "        roughnessIntent: ''",
        '    })',
        '});',
        ''
    ].join('\n');
    writeFileSync(path.join(dir, 'pbr.material.config.js'), materialSource);

    // Minimal correction config so the async calibration probe does not 500
    // (sets without one log console errors and break console-clean e2e specs).
    const correctionSource = [
        'export default Object.freeze({',
        "    schema: 'bus_sim.pbr_material_correction',",
        '    version: 1,',
        "    materialId: 'pbr." + slug + "',",
        "    label: '" + label + "',",
        "    classId: '" + classId + "',",
        "    sourceConfigFile: 'assets/public/pbr/" + slug + "/pbr.material.config.js',",
        "    textureFolder: 'assets/public/pbr/" + slug + "',",
        '    resolvedMapFiles: Object.freeze({',
        "        baseColor: 'assets/public/pbr/" + slug + "/basecolor.png',",
        "        normal: 'assets/public/pbr/" + slug + "/normal_gl.png',",
        "        orm: 'assets/public/pbr/" + slug + "/arm.png'",
        '    }),',
        '    presets: Object.freeze({})',
        '});',
        ''
    ].join('\n');
    writeFileSync(path.join(dir, 'pbr.material.correction.config.js'), correctionSource);
}

// ---------------------------------------------------------------------------
// 1. Burnt cement panel — the bank's monumental base. The reference base is a
// grid of large SQUARE cast panels with hairline recessed joints; the body is
// a warm grey cement scorched with soot-dark blotches. The tile covers 4.2m:
// 3x3 panels of 1.4m, so a square reads square on the wall.
// ---------------------------------------------------------------------------
function bakeBurntCementPanel() {
    const CELLS = 3;
    const JOINT = 0.0035;   // half-width of the recessed joint, in tile units
    const DRAFT = 0.006;    // chamfered shoulder either side of the joint

    const panelInfo = (u, v) => {
        const cu = u * CELLS;
        const cv = v * CELLS;
        const col = Math.floor(cu);
        const row = Math.floor(cv);
        const du = Math.min(cu - col, 1 - (cu - col)) / CELLS;
        const dv = Math.min(cv - row, 1 - (cv - row)) / CELLS;
        return { col, row, edge: Math.min(du, dv) };
    };

    const sootAt = (u, v) => Math.max(0, fbm(u, v, { octaves: 4, basePeriod: 6, seed: 933 })) * 1.0
        + Math.max(0, fbm(u, v, { octaves: 4, basePeriod: 19, seed: 937 })) * 0.55;

    const plateau = (edge) => smootherstep(clamp01((edge - JOINT) / DRAFT));

    const heightAt = (u, v) => {
        const { col, row, edge } = panelInfo(u, v);
        // Each cast panel sits at a very slightly different set-out depth.
        const lift = 0.95 + hash2(col * 13 + 3, row * 17 + 7, 911) * 0.05;
        // Cement body: fine sandy grain plus shallow casting undulation.
        const grain = fbm(u, v, { octaves: 4, basePeriod: 120, seed: 917 }) * 0.035;
        const cast = fbm(u, v, { octaves: 3, basePeriod: 14, seed: 921 }) * 0.02;
        return plateau(edge) * (lift + grain + cast);
    };

    const albedoAt = (u, v, h) => {
        const { col, row, edge } = panelInfo(u, v);
        // Panel-to-panel tonal drift, as cast batches differ.
        const batch = (hash2(col * 5 + 2, row * 11 + 9, 929) - 0.5) * 11;
        const soot = sootAt(u, v) * 11;
        const wash = fbm(u, v, { octaves: 3, basePeriod: 11, seed: 941 }) * 9;
        const speck = (valueNoise(u, v, 420, 945) - 0.5) * 13;
        const r = 28 + batch + wash + speck - soot * 1.00;
        const g = 26 + batch + wash + speck - soot * 1.06;
        const b = 24 + batch + wash + speck - soot * 1.14;
        // Joints read as a dark hairline.
        const jointMix = (1 - smootherstep(clamp01((edge - JOINT * 0.5) / (JOINT + DRAFT * 0.6)))) * 0.3;
        const shade = 0.94 + h * 0.06;
        return [
            (r * (1 - jointMix) + 38 * jointMix) * shade,
            (g * (1 - jointMix) + 36 * jointMix) * shade,
            (b * (1 - jointMix) + 34 * jointMix) * shade
        ];
    };

    // Scorched patches read a touch rougher than the polished cast face.
    const roughnessAt = (u, v, h) => 0.72 + sootAt(u, v) * 0.06
        + fbm(u, v, { octaves: 3, basePeriod: 40, seed: 949 }) * 0.05 + (1 - h) * 0.06;

    const aoAt = (u, v) => {
        const { edge } = panelInfo(u, v);
        return 0.55 + 0.45 * smootherstep(clamp01((edge - JOINT * 0.4) / (JOINT + DRAFT)));
    };

    bakeMaps({ slug: 'burnt_cement_panel', heightAt, albedoAt, roughnessAt, aoAt, normalStrength: 10 });
    writeMaterialConfig({ slug: 'burnt_cement_panel', label: 'Burnt Cement Panel', classId: 'concrete', tileMeters: 4.2 });
}

// ---------------------------------------------------------------------------
// 2. Bronze anodized panel — the curtain wall skin (mullion faces + spandrel
// backing). Near-black warm bronze with a fine VERTICAL brushed grain and a
// slow tonal drift, so a 30m wall of it does not read as flat paint. No panel
// joints: the mullion grid is real geometry.
// ---------------------------------------------------------------------------
function bakeBronzeAnodizedPanel() {
    // Brushing runs along +v (vertical on the wall): long period in v, short in u.
    const brushAt = (u, v) => valueNoise2(u, v, 512, 16, 601);

    const heightAt = (u, v) => brushAt(u, v) * 0.55
        + valueNoise2(u, v, 128, 8, 605) * 0.3
        + fbm(u, v, { octaves: 3, basePeriod: 24, seed: 609 }) * 0.15;

    const albedoAt = (u, v, h) => {
        const brush = (brushAt(u, v) - 0.5) * 4;
        const drift = fbm(u, v, { octaves: 3, basePeriod: 7, seed: 613 }) * 3;
        const r = 21 + brush + drift;
        const g = 12 + brush * 0.94 + drift * 0.9;
        const b = 5 + brush * 0.86 + drift * 0.8;
        const shade = 0.96 + h * 0.04;
        return [r * shade, g * shade, b * shade];
    };

    // Building walls render IBL-free, so a low roughness here buys no real
    // reflection and instead blows the whole shaft out into a neutral specular
    // sheen. Anodized bronze is kept matte and lets the GLASS do the shining.
    const roughnessAt = (u, v) => 0.78 + (brushAt(u, v) - 0.5) * 0.07
        + fbm(u, v, { octaves: 2, basePeriod: 18, seed: 617 }) * 0.04;
    const aoAt = () => 0.98;
    const metalAt = () => 0.9;

    bakeMaps({ slug: 'bronze_anodized_panel', heightAt, albedoAt, roughnessAt, aoAt, metalAt, normalStrength: 1.6 });
    writeMaterialConfig({ slug: 'bronze_anodized_panel', label: 'Bronze Anodized Panel', classId: 'metal', tileMeters: 2.0 });
}

bakeBurntCementPanel();
bakeBronzeAnodizedPanel();
