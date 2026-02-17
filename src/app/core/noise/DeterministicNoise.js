// src/app/core/noise/DeterministicNoise.js
// Shared deterministic scalar noise helpers (CPU-side).
// @ts-check

const EPS = 1e-6;
const UINT32_INV = 1 / 0xffffffff;

function smoothstepHermite01(t) {
    const x = Number(t);
    if (!Number.isFinite(x)) return 0;
    const clamped = Math.max(0, Math.min(1, x));
    return clamped * clamped * (3 - 2 * clamped);
}

function smoothstepQuintic01(t) {
    const x = Number(t);
    if (!Number.isFinite(x)) return 0;
    const clamped = Math.max(0, Math.min(1, x));
    return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

function resolveSmoothing(smoothing) {
    return smoothing === 'quintic' ? smoothstepQuintic01 : smoothstepHermite01;
}

export function hashStringToU32(str) {
    const s = typeof str === 'string' ? str : '';
    let h = 2166136261 >>> 0; // FNV-1a
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i) & 0xff;
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

export function mixU32(h) {
    let x = h >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
}

export function hashIntPairU32(x, y, seedU32 = 0) {
    const xi = x | 0;
    const yi = y | 0;
    const seed = seedU32 >>> 0;
    const h = seed ^ Math.imul(xi, 0x9e3779b1) ^ Math.imul(yi, 0x85ebca6b);
    return mixU32(h >>> 0);
}

export function u32ToUnitFloat01(h) {
    return (h >>> 0) * UINT32_INV;
}

/**
 * @typedef {(ix: number, iy: number) => number} NoiseHashU32
 */

/**
 * @param {{ hashU32: NoiseHashU32, smoothing?: 'hermite'|'quintic' }} options
 */
export function createValueNoise2DSampler(options) {
    const hashU32 = options?.hashU32;
    if (typeof hashU32 !== 'function') {
        throw new Error('[DeterministicNoise] createValueNoise2DSampler requires hashU32(ix, iy).');
    }
    const smooth = resolveSmoothing(options?.smoothing);

    const sample = (x, y) => {
        const fx = Math.floor(Number(x) || 0);
        const fy = Math.floor(Number(y) || 0);
        const x0 = fx | 0;
        const y0 = fy | 0;
        const x1 = (x0 + 1) | 0;
        const y1 = (y0 + 1) | 0;
        const tx = (Number(x) || 0) - fx;
        const ty = (Number(y) || 0) - fy;

        const ux = smooth(tx);
        const uy = smooth(ty);

        const a = u32ToUnitFloat01(hashU32(x0, y0));
        const b = u32ToUnitFloat01(hashU32(x1, y0));
        const c = u32ToUnitFloat01(hashU32(x0, y1));
        const d = u32ToUnitFloat01(hashU32(x1, y1));

        const ab = a + (b - a) * ux;
        const cd = c + (d - c) * ux;
        return ab + (cd - ab) * uy;
    };

    return Object.freeze({ sample });
}

/**
 * @typedef {(ctx: { x: number, y: number, octave: number, amplitude: number }) => ({ x: number, y: number } | null | undefined)} FbmAdvanceFn
 */

/**
 * @param {number} x
 * @param {number} y
 * @param {{
 *   noise2: (x: number, y: number) => number,
 *   octaves?: number,
 *   gain?: number,
 *   lacunarity?: number,
 *   normalize?: boolean,
 *   initialAmplitude?: number,
 *   advance?: FbmAdvanceFn | null,
 *   maxOctaves?: number
 * }} options
 */
export function sampleFbm2D(x, y, options = {}) {
    const noise2 = options?.noise2;
    if (typeof noise2 !== 'function') {
        throw new Error('[DeterministicNoise] sampleFbm2D requires noise2(x, y).');
    }

    const octavesRaw = Math.round(Number(options?.octaves) || 1);
    const maxOctaves = Math.max(1, Math.round(Number(options?.maxOctaves) || 8));
    const octaves = Math.max(1, Math.min(maxOctaves, octavesRaw));
    const gain = Number.isFinite(options?.gain) ? Number(options.gain) : 0.5;
    const lacunarity = Number.isFinite(options?.lacunarity) ? Number(options.lacunarity) : 2.0;
    const normalize = options?.normalize !== false;
    const initialAmplitude = Number.isFinite(options?.initialAmplitude) ? Number(options.initialAmplitude) : 1.0;
    const advance = typeof options?.advance === 'function' ? options.advance : null;

    let fx = Number(x) || 0;
    let fy = Number(y) || 0;
    let amp = initialAmplitude;
    let sum = 0;
    let norm = 0;

    for (let i = 0; i < octaves; i++) {
        sum += amp * noise2(fx, fy);
        norm += amp;

        if (advance) {
            const next = advance({ x: fx, y: fy, octave: i, amplitude: amp });
            if (next && Number.isFinite(next.x) && Number.isFinite(next.y)) {
                fx = next.x;
                fy = next.y;
            } else {
                fx *= lacunarity;
                fy *= lacunarity;
            }
        } else {
            fx *= lacunarity;
            fy *= lacunarity;
        }

        amp *= gain;
    }

    if (!normalize) return sum;
    if (!(norm > EPS)) return 0.5;
    return sum / norm;
}
