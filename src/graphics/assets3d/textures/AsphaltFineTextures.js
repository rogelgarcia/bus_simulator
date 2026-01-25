// src/graphics/assets3d/textures/AsphaltFineTextures.js
// Runtime-generated fine asphalt albedo + roughness textures (tileable, deterministic).
// @ts-check
import * as THREE from 'three';

const VERSION = 1;
const QUANT = 1000;
const MAX_CACHE_ENTRIES = 32;

const _cache = new Map();

function q(value) {
    return Math.round(Number(value) * QUANT);
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function clamp01(value) {
    return clamp(value, 0, 1);
}

function smoothstep(edge0, edge1, x) {
    const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
    return t * t * (3 - 2 * t);
}

function applyTextureColorSpace(tex, { srgb = true } = {}) {
    if (!tex) return;
    if ('colorSpace' in tex) {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        return;
    }
    if ('encoding' in tex) tex.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
}

function fnv1a32FromString(text) {
    const str = String(text ?? '');
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i) & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

function makeRng(seed) {
    let s = (Number(seed) >>> 0) || 1;
    return () => {
        s ^= (s << 13) >>> 0;
        s ^= (s >>> 17) >>> 0;
        s ^= (s << 5) >>> 0;
        return (s >>> 0) / 0xffffffff;
    };
}

function blurWrap(src, size, passes) {
    const out = new Float32Array(src.length);
    const tmp = new Float32Array(src.length);
    tmp.set(src);

    const N = Math.max(0, Math.trunc(passes));
    for (let pass = 0; pass < N; pass++) {
        for (let y = 0; y < size; y++) {
            const row = y * size;
            for (let x = 0; x < size; x++) {
                const xm = (x - 1 + size) % size;
                const xp = (x + 1) % size;
                const a = tmp[row + xm];
                const b = tmp[row + x];
                const c = tmp[row + xp];
                out[row + x] = (a + 2 * b + c) * 0.25;
            }
        }

        for (let y = 0; y < size; y++) {
            const ym = ((y - 1 + size) % size) * size;
            const yp = ((y + 1) % size) * size;
            const row = y * size;
            for (let x = 0; x < size; x++) {
                const a = out[ym + x];
                const b = out[row + x];
                const c = out[yp + x];
                tmp[row + x] = (a + 2 * b + c) * 0.25;
            }
        }
    }
    return tmp;
}

function makeNoise(size, rng, { blurPasses = 0 } = {}) {
    const N = size * size;
    const base = new Float32Array(N);
    for (let i = 0; i < N; i++) base[i] = rng();
    if (!(blurPasses > 0)) return base;
    return blurWrap(base, size, blurPasses);
}

function makeDataTextureRGBA8({ size, pixels, srgb }) {
    const tex = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    applyTextureColorSpace(tex, { srgb });
    tex.needsUpdate = true;
    return tex;
}

/**
 * @typedef {Object} AsphaltFineTextures
 * @property {THREE.DataTexture} map
 * @property {THREE.DataTexture} roughnessMap
 * @property {THREE.DataTexture} normalMap
 */

/**
 * @param {Object} options
 * @param {string|number} options.seed
 * @param {number} [options.size]
 * @param {number} [options.baseColorHex]
 * @param {number} [options.baseRoughness]
 * @param {number} [options.colorStrength]
 * @param {number} [options.dirtyStrength]
 * @param {number} [options.roughnessStrength]
 * @returns {AsphaltFineTextures}
 */
export function getAsphaltFineTextures({
    seed,
    size = 512,
    baseColorHex = 0x2b2b2b,
    baseRoughness = 0.95,
    colorStrength = 0.06,
    dirtyStrength = 0.0,
    roughnessStrength = 0.16
} = {}) {
    const safeSize = Math.max(32, Math.min(2048, Math.trunc(Number(size) || 512)));
    const safeColorHex = (Number(baseColorHex) >>> 0) & 0xffffff;
    const safeBaseRough = clamp(baseRoughness, 0.0, 1.0);
    const safeColorStrength = clamp(colorStrength, 0.0, 0.5);
    const safeDirtyStrength = clamp(dirtyStrength, 0.0, 1.0);
    const safeRoughStrength = clamp(roughnessStrength, 0.0, 0.5);
    const seedStr = String(seed ?? '');

    const key = [
        `v${VERSION}`,
        `s${safeSize}`,
        `seed:${seedStr}`,
        `bc:${safeColorHex.toString(16)}`,
        `br:${q(safeBaseRough)}`,
        `cs:${q(safeColorStrength)}`,
        `ds:${q(safeDirtyStrength)}`,
        `rs:${q(safeRoughStrength)}`
    ].join('|');

    const cached = _cache.get(key);
    if (cached) return cached;

    const seedU32 = fnv1a32FromString(`asphalt_fine#${seedStr}`) ^ (safeColorHex << 1);
    const rngA = makeRng(seedU32);
    const rngB = makeRng(seedU32 ^ 0x9e3779b9);
    const rngC = makeRng(seedU32 ^ 0x243f6a88);

    const grain = makeNoise(safeSize, rngA, { blurPasses: 1 });
    const stones = makeNoise(safeSize, rngB, { blurPasses: 5 });
    const pits = makeNoise(safeSize, rngC, { blurPasses: 2 });

    const baseR = (safeColorHex >> 16) & 0xff;
    const baseG = (safeColorHex >> 8) & 0xff;
    const baseB = safeColorHex & 0xff;

    const pixelsAlbedo = new Uint8Array(safeSize * safeSize * 4);
    const pixelsRough = new Uint8Array(safeSize * safeSize * 4);
    const pixelsNormal = new Uint8Array(safeSize * safeSize * 4);
    const height = new Float32Array(safeSize * safeSize);

    const stoneScale = clamp(safeColorStrength / 0.06, 0.0, 3.0);
    const stoneStrength = 0.22;
    const pitStrength = 0.18;

    for (let i = 0; i < grain.length; i++) {
        const g = grain[i];
        const s = stones[i];
        const p = pits[i];

        const signed = (g - 0.5) * 2.0;
        const tone = signed * safeColorStrength;

        const stoneMask = smoothstep(0.76, 0.93, s);
        const pitMask = smoothstep(0.80, 0.96, p);
        const dirtMask = smoothstep(0.64, 0.90, p) * (0.65 + 0.35 * (1.0 - g));
        const dirt = clamp01(safeDirtyStrength * (dirtMask * 1.25 + pitMask * 0.75));

        const stone = stoneMask * (0.55 + g * 0.35) * stoneStrength * stoneScale;

        const dirtDarken = 1.0 - dirt * 0.32;
        const r01 = clamp01(((baseR / 255) + tone + stone * 0.92) * dirtDarken);
        const g01 = clamp01(((baseG / 255) + tone + stone) * dirtDarken);
        const b01 = clamp01(((baseB / 255) + tone + stone * 0.88) * dirtDarken);

        const outR = Math.round(r01 * 255);
        const outG = Math.round(g01 * 255);
        const outB = Math.round(b01 * 255);

        const idx = i * 4;
        pixelsAlbedo[idx] = outR;
        pixelsAlbedo[idx + 1] = outG;
        pixelsAlbedo[idx + 2] = outB;
        pixelsAlbedo[idx + 3] = 255;

        const roughSigned = (g - 0.5) * 2.0;
        const roughBase = safeBaseRough;
        const roughStone = stoneMask * (-0.06);
        const roughPit = pitMask * 0.06 * (0.25 + 0.75 * safeDirtyStrength);
        const roughDirt = dirt * 0.10;
        const rough = clamp01(roughBase + roughSigned * safeRoughStrength + roughStone + roughPit + roughDirt);
        const outRough = Math.round(rough * 255);

        pixelsRough[idx] = outRough;
        pixelsRough[idx + 1] = outRough;
        pixelsRough[idx + 2] = outRough;
        pixelsRough[idx + 3] = 255;

        height[i] = (g - 0.5) * 0.22 + stoneMask * 0.38 - pitMask * (0.55 + safeDirtyStrength * 0.25) - dirtMask * safeDirtyStrength * 0.12;
    }

    const map = makeDataTextureRGBA8({ size: safeSize, pixels: pixelsAlbedo, srgb: true });
    map.name = `AsphaltFineMap_${key}`;

    const roughnessMap = makeDataTextureRGBA8({ size: safeSize, pixels: pixelsRough, srgb: false });
    roughnessMap.name = `AsphaltFineRoughness_${key}`;

    const derivScale = 6.0;
    for (let y = 0; y < safeSize; y++) {
        const ym = ((y - 1 + safeSize) % safeSize) * safeSize;
        const yp = ((y + 1) % safeSize) * safeSize;
        const row = y * safeSize;
        for (let x = 0; x < safeSize; x++) {
            const xm = (x - 1 + safeSize) % safeSize;
            const xp = (x + 1) % safeSize;
            const idx = row + x;
            const dhx = (height[row + xp] - height[row + xm]) * derivScale;
            const dhy = (height[yp + x] - height[ym + x]) * derivScale;
            const nx = -dhx;
            const ny = 1.0;
            const nz = -dhy;
            const invLen = 1.0 / Math.max(1e-6, Math.hypot(nx, ny, nz));
            const r = Math.round((nx * invLen * 0.5 + 0.5) * 255);
            const g = Math.round((ny * invLen * 0.5 + 0.5) * 255);
            const b = Math.round((nz * invLen * 0.5 + 0.5) * 255);
            const pix = idx * 4;
            pixelsNormal[pix] = r;
            pixelsNormal[pix + 1] = g;
            pixelsNormal[pix + 2] = b;
            pixelsNormal[pix + 3] = 255;
        }
    }

    const normalMap = makeDataTextureRGBA8({ size: safeSize, pixels: pixelsNormal, srgb: false });
    normalMap.name = `AsphaltFineNormal_${key}`;

    const out = { map, roughnessMap, normalMap };
    _cache.set(key, out);
    if (_cache.size > MAX_CACHE_ENTRIES) {
        const oldest = _cache.keys().next().value ?? null;
        if (oldest && oldest !== key) {
            const entry = _cache.get(oldest) ?? null;
            _cache.delete(oldest);
            entry?.map?.dispose?.();
            entry?.roughnessMap?.dispose?.();
            entry?.normalMap?.dispose?.();
        }
    }
    return out;
}
