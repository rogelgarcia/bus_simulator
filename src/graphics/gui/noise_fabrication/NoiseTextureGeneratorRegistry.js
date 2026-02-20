// src/graphics/gui/noise_fabrication/NoiseTextureGeneratorRegistry.js
// Registry-driven deterministic layered noise generation for the Noise fabrication tool.
// @ts-check

import { createValueNoise2DSampler, hashIntPairU32, hashStringToU32, sampleFbm2D } from '../../../app/core/noise/DeterministicNoise.js';
import { findNoiseCatalogEntryByGeneratorId, getNoiseCatalogEntryById, listNoiseCatalogEntries } from './NoiseFabricationCatalog.js';
import {
    buildNoiseExecutionPlan,
    getNoiseExecutionAssistantDefaultQuestions,
    NOISE_EXECUTION_MODES,
    NOISE_EXECUTION_PATHS,
    sanitizeNoiseExecutionAssistantQuestions,
    sanitizeNoiseExecutionConfig,
    sanitizeNoiseExecutionMode,
    sanitizeNoiseExecutionPath
} from './NoiseExecutionPathChecker.js';

export const NOISE_FABRICATION_STATE_VERSION = 2;
export const NOISE_FABRICATION_TOOL_ID = 'noise_fabrication';
export const NOISE_FABRICATION_MAX_LAYERS = 8;
export const NOISE_FABRICATION_TEXTURE_SIZES = Object.freeze([128, 256, 512, 1024]);
export const NOISE_FABRICATION_ORM_PACKING = Object.freeze({
    R: 'AO',
    G: 'Roughness',
    B: 'Metalness'
});

const DEFAULT_GENERATOR_ID = 'value_fbm';
const DEFAULT_PREVIEW_MODE = 'texture';
const DEFAULT_BASE_COLOR = '#888888';
const DEFAULT_TEXTURE_SIZE = 512;
const DEFAULT_EXPORT_TARGETS = Object.freeze({ normal: true, albedo: false, orm: false });

export const NOISE_FABRICATION_LAYER_MAP_TARGETS = Object.freeze([
    Object.freeze({ id: 'normal', label: 'Normal' }),
    Object.freeze({ id: 'albedo', label: 'Albedo' }),
    Object.freeze({ id: 'orm_ao', label: 'ORM AO' }),
    Object.freeze({ id: 'orm_roughness', label: 'ORM Roughness' }),
    Object.freeze({ id: 'orm_metalness', label: 'ORM Metalness' })
]);

export const NOISE_FABRICATION_BLEND_MODES = Object.freeze([
    Object.freeze({ id: 'normal', label: 'Normal (Lerp)' }),
    Object.freeze({ id: 'add', label: 'Add' }),
    Object.freeze({ id: 'multiply', label: 'Multiply' }),
    Object.freeze({ id: 'screen', label: 'Screen' }),
    Object.freeze({ id: 'subtract', label: 'Subtract' }),
    Object.freeze({ id: 'max', label: 'Max' }),
    Object.freeze({ id: 'min', label: 'Min' })
]);
export const NOISE_FABRICATION_EXECUTION_PATHS = NOISE_EXECUTION_PATHS;
export const NOISE_FABRICATION_EXECUTION_MODES = NOISE_EXECUTION_MODES;

const BLEND_MODE_SET = new Set(NOISE_FABRICATION_BLEND_MODES.map((mode) => mode.id));
const MAP_TARGET_SET = new Set(NOISE_FABRICATION_LAYER_MAP_TARGETS.map((target) => target.id));

function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function clamp01(value) {
    return clampNumber(value, 0.0, 1.0, 0.0);
}

function normalizeText(value, fallback = '') {
    const raw = typeof value === 'string' ? value.trim() : '';
    return raw || fallback;
}

function normalizeId(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeHexColor(value, fallback = DEFAULT_BASE_COLOR) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return fallback;
    const v = raw.startsWith('#') ? raw.slice(1) : (raw.toLowerCase().startsWith('0x') ? raw.slice(2) : raw);
    if (v.length === 3 && /^[0-9a-fA-F]{3}$/.test(v)) {
        return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`.toUpperCase();
    }
    if (v.length === 6 && /^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`.toUpperCase();
    return fallback;
}

function sanitizePreviewMode(value) {
    return value === 'normal' ? 'normal' : DEFAULT_PREVIEW_MODE;
}

function pushWarning(list, warning) {
    if (!warning) return;
    if (!list.includes(warning)) list.push(warning);
}

function sanitizeTextureSize(value, warnings = null) {
    const maxResolution = NOISE_FABRICATION_TEXTURE_SIZES[NOISE_FABRICATION_TEXTURE_SIZES.length - 1];
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return DEFAULT_TEXTURE_SIZE;
    if (n > maxResolution && warnings) {
        pushWarning(warnings, `[NoiseFabrication] Resolution clamped to ${maxResolution}.`);
    }
    if (NOISE_FABRICATION_TEXTURE_SIZES.includes(n)) return n;
    let closest = NOISE_FABRICATION_TEXTURE_SIZES[0];
    let bestDist = Math.abs(n - closest);
    for (let i = 1; i < NOISE_FABRICATION_TEXTURE_SIZES.length; i++) {
        const candidate = NOISE_FABRICATION_TEXTURE_SIZES[i];
        const dist = Math.abs(n - candidate);
        if (dist < bestDist) {
            closest = candidate;
            bestDist = dist;
        }
    }
    return closest;
}

function sanitizeBlendMode(value) {
    const id = normalizeId(value);
    return BLEND_MODE_SET.has(id) ? id : 'normal';
}

function sanitizeLayerMapTarget(value, fallback = 'normal') {
    const id = normalizeId(value);
    if (MAP_TARGET_SET.has(id)) return id;
    return MAP_TARGET_SET.has(fallback) ? fallback : 'normal';
}

function sanitizeExportTargets(input) {
    const src = input && typeof input === 'object' ? input : DEFAULT_EXPORT_TARGETS;
    return {
        normal: src.normal !== false,
        albedo: src.albedo === true,
        orm: src.orm === true
    };
}

function smoothstep(edge0, edge1, x) {
    if (edge1 <= edge0) return x < edge0 ? 0 : 1;
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3.0 - 2.0 * t);
}

function mix(a, b, t) {
    return a + (b - a) * t;
}

function wrap01(value) {
    const f = value - Math.floor(value);
    return f < 0 ? f + 1 : f;
}

function wrapIndex(i, size) {
    if (size <= 0) return 0;
    let out = i % size;
    if (out < 0) out += size;
    return out;
}

function u32ToUnit01(value) {
    return (value >>> 0) / 4294967295;
}

function createNoiseSampler(seedText) {
    const seedU32 = hashStringToU32(seedText);
    const sampler = createValueNoise2DSampler({
        hashU32: (ix, iy) => hashIntPairU32(ix, iy, seedU32),
        smoothing: 'quintic'
    });
    return { sampler, seedU32 };
}

function applySignalAdjustments(value, { invert = false, contrast = 1.0, bias = 0.0 } = {}) {
    let v = clamp01(value);
    if (invert) v = 1.0 - v;
    v = 0.5 + (v - 0.5) * contrast + bias;
    return clamp01(v);
}

function sampleCellularNearestDistances({ x, y, jitter = 0.8, seedU32 = 0 }) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let d1 = Number.POSITIVE_INFINITY;
    let d2 = Number.POSITIVE_INFINITY;

    for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
            const cx = ix + ox;
            const cy = iy + oy;
            const hx = hashIntPairU32(cx, cy, seedU32);
            const hy = hashIntPairU32(cx, cy, seedU32 ^ 0x9e3779b9);
            const fx = cx + 0.5 + (u32ToUnit01(hx) - 0.5) * jitter;
            const fy = cy + 0.5 + (u32ToUnit01(hy) - 0.5) * jitter;
            const dx = x - fx;
            const dy = y - fy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < d1) {
                d2 = d1;
                d1 = dist;
            } else if (dist < d2) {
                d2 = dist;
            }
        }
    }

    return { d1, d2 };
}

function sampleFieldBilinearWrapped(field, width, height, u, v) {
    const uu = wrap01(u);
    const vv = wrap01(v);
    const x = uu * width - 0.5;
    const y = vv * height - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;

    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const sx0 = wrapIndex(x0, width);
    const sx1 = wrapIndex(x1, width);
    const sy0 = wrapIndex(y0, height);
    const sy1 = wrapIndex(y1, height);

    const i00 = sy0 * width + sx0;
    const i10 = sy0 * width + sx1;
    const i01 = sy1 * width + sx0;
    const i11 = sy1 * width + sx1;

    const a = mix(field[i00], field[i10], tx);
    const b = mix(field[i01], field[i11], tx);
    return mix(a, b, ty);
}

function applyUvTransformToField(field, width, height, transform) {
    const src = transform && typeof transform === 'object' ? transform : {
        space: 'uv',
        scale: 1,
        rotationDeg: 0,
        offsetU: 0,
        offsetV: 0
    };
    const scale = clampNumber(src.scale, 0.05, 16.0, 1.0);
    const rotationDeg = clampNumber(src.rotationDeg, -180, 180, 0);
    const offsetU = clampNumber(src.offsetU, -8.0, 8.0, 0.0);
    const offsetV = clampNumber(src.offsetV, -8.0, 8.0, 0.0);

    if (Math.abs(scale - 1.0) < 1e-6 && Math.abs(rotationDeg) < 1e-6 && Math.abs(offsetU) < 1e-6 && Math.abs(offsetV) < 1e-6) {
        return field;
    }

    const out = new Float32Array(width * height);
    const rad = rotationDeg * (Math.PI / 180);
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    let idx = 0;
    for (let y = 0; y < height; y++) {
        const v = (y + 0.5) / height - 0.5;
        for (let x = 0; x < width; x++) {
            const u = (x + 0.5) / width - 0.5;
            const rx = (u * cosR - v * sinR) * scale;
            const ry = (u * sinR + v * cosR) * scale;
            const su = rx + 0.5 + offsetU;
            const sv = ry + 0.5 + offsetV;
            out[idx++] = sampleFieldBilinearWrapped(field, width, height, su, sv);
        }
    }

    return out;
}

const COMMON_FBM_CONTROLS = Object.freeze([
    Object.freeze({ id: 'seed', label: 'Seed', type: 'text' }),
    Object.freeze({ id: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 96.0, step: 0.1, digits: 1 }),
    Object.freeze({ id: 'octaves', label: 'Octaves', type: 'range', min: 1, max: 8, step: 1, digits: 0 }),
    Object.freeze({ id: 'gain', label: 'Gain', type: 'range', min: 0.05, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'lacunarity', label: 'Lacunarity', type: 'range', min: 1.0, max: 4.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'bias', label: 'Bias', type: 'range', min: -1.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'contrast', label: 'Contrast', type: 'range', min: 0.1, max: 3.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'rotationDeg', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, digits: 0 }),
    Object.freeze({ id: 'invert', label: 'Invert', type: 'toggle' })
]);

const DIRECTIONAL_FBM_CONTROLS = Object.freeze([
    ...COMMON_FBM_CONTROLS,
    Object.freeze({ id: 'horizontalStretch', label: 'Horizontal stretch', type: 'range', min: 0.2, max: 8.0, step: 0.05, digits: 2 }),
    Object.freeze({ id: 'verticalStretch', label: 'Vertical stretch', type: 'range', min: 0.2, max: 8.0, step: 0.05, digits: 2 })
]);

const LINE_BANDS_CONTROLS = Object.freeze([
    Object.freeze({ id: 'seed', label: 'Seed', type: 'text' }),
    Object.freeze({ id: 'orientation', label: 'Orientation', type: 'select', options: [{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }] }),
    Object.freeze({ id: 'lineCount', label: 'Line count', type: 'range', min: 1, max: 96, step: 1, digits: 0 }),
    Object.freeze({ id: 'lineWidth', label: 'Line width', type: 'range', min: 0.01, max: 0.95, step: 0.005, digits: 3 }),
    Object.freeze({ id: 'softness', label: 'Softness', type: 'range', min: 0.0, max: 0.45, step: 0.005, digits: 3 }),
    Object.freeze({ id: 'jitter', label: 'Jitter', type: 'range', min: 0.0, max: 0.45, step: 0.005, digits: 3 }),
    Object.freeze({ id: 'bias', label: 'Bias', type: 'range', min: -1.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'contrast', label: 'Contrast', type: 'range', min: 0.1, max: 3.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'invert', label: 'Invert', type: 'toggle' })
]);

const TILE_GRID_CONTROLS = Object.freeze([
    Object.freeze({ id: 'seed', label: 'Seed', type: 'text' }),
    Object.freeze({ id: 'verticalLines', label: 'Vertical lines', type: 'range', min: 0, max: 64, step: 1, digits: 0 }),
    Object.freeze({ id: 'horizontalLines', label: 'Horizontal lines', type: 'range', min: 0, max: 64, step: 1, digits: 0 }),
    Object.freeze({ id: 'jointWidth', label: 'Joint width', type: 'range', min: 0.01, max: 0.95, step: 0.005, digits: 3 }),
    Object.freeze({ id: 'jointSoftness', label: 'Joint softness', type: 'range', min: 0.0, max: 0.45, step: 0.005, digits: 3 }),
    Object.freeze({ id: 'grooveDepth', label: 'Groove depth', type: 'range', min: 0.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'jitter', label: 'Joint jitter', type: 'range', min: 0.0, max: 0.35, step: 0.005, digits: 3 }),
    Object.freeze({ id: 'bias', label: 'Bias', type: 'range', min: -1.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'contrast', label: 'Contrast', type: 'range', min: 0.1, max: 3.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'invert', label: 'Invert', type: 'toggle' })
]);

const CELLULAR_CONTROLS = Object.freeze([
    Object.freeze({ id: 'seed', label: 'Seed', type: 'text' }),
    Object.freeze({ id: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 64.0, step: 0.1, digits: 1 }),
    Object.freeze({ id: 'jitter', label: 'Jitter', type: 'range', min: 0.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'edgeBlend', label: 'Edge blend', type: 'range', min: 0.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'bias', label: 'Bias', type: 'range', min: -1.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'contrast', label: 'Contrast', type: 'range', min: 0.1, max: 3.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'invert', label: 'Invert', type: 'toggle' })
]);

const EDGE_WEAR_CONTROLS = Object.freeze([
    Object.freeze({ id: 'seed', label: 'Seed', type: 'text' }),
    Object.freeze({ id: 'edgeWidth', label: 'Edge width', type: 'range', min: 0.01, max: 0.48, step: 0.005, digits: 3 }),
    Object.freeze({ id: 'edgeSoftness', label: 'Edge softness', type: 'range', min: 0.001, max: 0.5, step: 0.005, digits: 3 }),
    Object.freeze({ id: 'breakupScale', label: 'Breakup scale', type: 'range', min: 0.5, max: 64.0, step: 0.1, digits: 1 }),
    Object.freeze({ id: 'breakupStrength', label: 'Breakup strength', type: 'range', min: 0.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'bias', label: 'Bias', type: 'range', min: -1.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'contrast', label: 'Contrast', type: 'range', min: 0.1, max: 3.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'invert', label: 'Invert', type: 'toggle' })
]);

const MICRO_GRAIN_CONTROLS = Object.freeze([
    Object.freeze({ id: 'seed', label: 'Seed', type: 'text' }),
    Object.freeze({ id: 'scale', label: 'Scale', type: 'range', min: 8.0, max: 256.0, step: 0.5, digits: 1 }),
    Object.freeze({ id: 'octaves', label: 'Octaves', type: 'range', min: 1, max: 6, step: 1, digits: 0 }),
    Object.freeze({ id: 'gain', label: 'Gain', type: 'range', min: 0.05, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'bias', label: 'Bias', type: 'range', min: -1.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'contrast', label: 'Contrast', type: 'range', min: 0.1, max: 3.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'invert', label: 'Invert', type: 'toggle' })
]);

const DIRECTIONAL_STREAK_CONTROLS = Object.freeze([
    Object.freeze({ id: 'seed', label: 'Seed', type: 'text' }),
    Object.freeze({ id: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 96.0, step: 0.1, digits: 1 }),
    Object.freeze({ id: 'directionDeg', label: 'Direction', type: 'range', min: -180, max: 180, step: 1, digits: 0 }),
    Object.freeze({ id: 'stretch', label: 'Stretch', type: 'range', min: 0.2, max: 8.0, step: 0.05, digits: 2 }),
    Object.freeze({ id: 'warpScale', label: 'Warp scale', type: 'range', min: 0.2, max: 64.0, step: 0.1, digits: 1 }),
    Object.freeze({ id: 'warpStrength', label: 'Warp strength', type: 'range', min: 0.0, max: 2.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'bias', label: 'Bias', type: 'range', min: -1.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'contrast', label: 'Contrast', type: 'range', min: 0.1, max: 3.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'invert', label: 'Invert', type: 'toggle' })
]);

const CRACKLE_CONTROLS = Object.freeze([
    Object.freeze({ id: 'seed', label: 'Seed', type: 'text' }),
    Object.freeze({ id: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 96.0, step: 0.1, digits: 1 }),
    Object.freeze({ id: 'crackWidth', label: 'Crack width', type: 'range', min: 0.01, max: 0.5, step: 0.005, digits: 3 }),
    Object.freeze({ id: 'crackSoftness', label: 'Crack softness', type: 'range', min: 0.001, max: 0.5, step: 0.005, digits: 3 }),
    Object.freeze({ id: 'distortion', label: 'Distortion', type: 'range', min: 0.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'bias', label: 'Bias', type: 'range', min: -1.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'contrast', label: 'Contrast', type: 'range', min: 0.1, max: 3.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'invert', label: 'Invert', type: 'toggle' })
]);

const LOW_FREQ_BLOTCH_CONTROLS = Object.freeze([
    Object.freeze({ id: 'seed', label: 'Seed', type: 'text' }),
    Object.freeze({ id: 'scale', label: 'Scale', type: 'range', min: 0.1, max: 12.0, step: 0.05, digits: 2 }),
    Object.freeze({ id: 'octaves', label: 'Octaves', type: 'range', min: 1, max: 6, step: 1, digits: 0 }),
    Object.freeze({ id: 'gain', label: 'Gain', type: 'range', min: 0.05, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'threshold', label: 'Threshold', type: 'range', min: 0.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'softness', label: 'Softness', type: 'range', min: 0.01, max: 0.5, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'bias', label: 'Bias', type: 'range', min: -1.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'contrast', label: 'Contrast', type: 'range', min: 0.1, max: 3.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'invert', label: 'Invert', type: 'toggle' })
]);

const VALUE_FBM_DEFAULTS = Object.freeze({
    seed: 'noise-fabrication-v2',
    scale: 12.0,
    octaves: 4,
    gain: 0.5,
    lacunarity: 2.0,
    bias: 0.0,
    contrast: 1.0,
    rotationDeg: 0,
    invert: false
});

const RIDGED_FBM_DEFAULTS = Object.freeze({
    seed: 'noise-fabrication-ridged-v2',
    scale: 18.0,
    octaves: 5,
    gain: 0.58,
    lacunarity: 2.18,
    bias: -0.08,
    contrast: 1.45,
    rotationDeg: 0,
    invert: false
});

const DIRECTIONAL_FBM_DEFAULTS = Object.freeze({
    seed: 'noise-fabrication-directional-v2',
    scale: 16.0,
    octaves: 5,
    gain: 0.52,
    lacunarity: 2.0,
    bias: -0.02,
    contrast: 1.12,
    rotationDeg: 0,
    invert: false,
    horizontalStretch: 3.0,
    verticalStretch: 0.85
});

const LINE_BANDS_DEFAULTS = Object.freeze({
    seed: 'noise-fabrication-line-bands-v2',
    orientation: 'vertical',
    lineCount: 12,
    lineWidth: 0.08,
    softness: 0.02,
    jitter: 0.0,
    bias: 0.0,
    contrast: 1.0,
    invert: false
});

const TILE_GRID_DEFAULTS = Object.freeze({
    seed: 'noise-fabrication-tile-grid-v2',
    verticalLines: 6,
    horizontalLines: 3,
    jointWidth: 0.08,
    jointSoftness: 0.03,
    grooveDepth: 0.85,
    jitter: 0.0,
    bias: 0.0,
    contrast: 1.0,
    invert: false
});

const CELLULAR_DEFAULTS = Object.freeze({
    seed: 'noise-fabrication-cellular-v2',
    scale: 8.0,
    jitter: 0.85,
    edgeBlend: 0.62,
    bias: 0.0,
    contrast: 1.0,
    invert: false
});

const EDGE_WEAR_DEFAULTS = Object.freeze({
    seed: 'noise-fabrication-edge-wear-v2',
    edgeWidth: 0.14,
    edgeSoftness: 0.09,
    breakupScale: 12.0,
    breakupStrength: 0.55,
    bias: 0.0,
    contrast: 1.0,
    invert: false
});

const MICRO_GRAIN_DEFAULTS = Object.freeze({
    seed: 'noise-fabrication-micro-grain-v2',
    scale: 96.0,
    octaves: 3,
    gain: 0.46,
    bias: 0.0,
    contrast: 1.0,
    invert: false
});

const DIRECTIONAL_STREAK_DEFAULTS = Object.freeze({
    seed: 'noise-fabrication-directional-streak-v2',
    scale: 14.0,
    directionDeg: -90,
    stretch: 3.2,
    warpScale: 6.0,
    warpStrength: 0.42,
    bias: 0.0,
    contrast: 1.0,
    invert: false
});

const CRACKLE_DEFAULTS = Object.freeze({
    seed: 'noise-fabrication-crackle-v2',
    scale: 12.0,
    crackWidth: 0.09,
    crackSoftness: 0.05,
    distortion: 0.28,
    bias: 0.0,
    contrast: 1.15,
    invert: false
});

const LOW_FREQ_BLOTCH_DEFAULTS = Object.freeze({
    seed: 'noise-fabrication-low-frequency-blotch-v2',
    scale: 1.8,
    octaves: 3,
    gain: 0.58,
    threshold: 0.54,
    softness: 0.15,
    bias: 0.0,
    contrast: 1.0,
    invert: false
});

function sanitizeFbmParams(input, defaults) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        seed: normalizeText(src.seed, defaults.seed),
        scale: clampNumber(src.scale, 0.5, 96.0, defaults.scale),
        octaves: clampInt(src.octaves, 1, 8, defaults.octaves),
        gain: clampNumber(src.gain, 0.05, 1.0, defaults.gain),
        lacunarity: clampNumber(src.lacunarity, 1.0, 4.0, defaults.lacunarity),
        bias: clampNumber(src.bias, -1.0, 1.0, defaults.bias),
        contrast: clampNumber(src.contrast, 0.1, 3.0, defaults.contrast),
        rotationDeg: clampNumber(src.rotationDeg, -180, 180, defaults.rotationDeg),
        invert: src.invert === true
    };
}

function sanitizeDirectionalFbmParams(input, defaults = DIRECTIONAL_FBM_DEFAULTS) {
    const base = sanitizeFbmParams(input, defaults);
    const src = input && typeof input === 'object' ? input : {};
    return {
        ...base,
        horizontalStretch: clampNumber(src.horizontalStretch, 0.2, 8.0, defaults.horizontalStretch),
        verticalStretch: clampNumber(src.verticalStretch, 0.2, 8.0, defaults.verticalStretch)
    };
}

function sanitizeLineBandsParams(input, defaults = LINE_BANDS_DEFAULTS) {
    const src = input && typeof input === 'object' ? input : {};
    const orientation = src.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    return {
        seed: normalizeText(src.seed, defaults.seed),
        orientation,
        lineCount: clampInt(src.lineCount, 1, 96, defaults.lineCount),
        lineWidth: clampNumber(src.lineWidth, 0.01, 0.95, defaults.lineWidth),
        softness: clampNumber(src.softness, 0.0, 0.45, defaults.softness),
        jitter: clampNumber(src.jitter, 0.0, 0.45, defaults.jitter),
        bias: clampNumber(src.bias, -1.0, 1.0, defaults.bias),
        contrast: clampNumber(src.contrast, 0.1, 3.0, defaults.contrast),
        invert: src.invert === true
    };
}

function sanitizeTileGridParams(input, defaults = TILE_GRID_DEFAULTS) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        seed: normalizeText(src.seed, defaults.seed),
        verticalLines: clampInt(src.verticalLines, 0, 64, defaults.verticalLines),
        horizontalLines: clampInt(src.horizontalLines, 0, 64, defaults.horizontalLines),
        jointWidth: clampNumber(src.jointWidth, 0.01, 0.95, defaults.jointWidth),
        jointSoftness: clampNumber(src.jointSoftness, 0.0, 0.45, defaults.jointSoftness),
        grooveDepth: clampNumber(src.grooveDepth, 0.0, 1.0, defaults.grooveDepth),
        jitter: clampNumber(src.jitter, 0.0, 0.35, defaults.jitter),
        bias: clampNumber(src.bias, -1.0, 1.0, defaults.bias),
        contrast: clampNumber(src.contrast, 0.1, 3.0, defaults.contrast),
        invert: src.invert === true
    };
}

function sanitizeCellularParams(input, defaults = CELLULAR_DEFAULTS) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        seed: normalizeText(src.seed, defaults.seed),
        scale: clampNumber(src.scale, 0.5, 64.0, defaults.scale),
        jitter: clampNumber(src.jitter, 0.0, 1.0, defaults.jitter),
        edgeBlend: clampNumber(src.edgeBlend, 0.0, 1.0, defaults.edgeBlend),
        bias: clampNumber(src.bias, -1.0, 1.0, defaults.bias),
        contrast: clampNumber(src.contrast, 0.1, 3.0, defaults.contrast),
        invert: src.invert === true
    };
}

function sanitizeEdgeWearParams(input, defaults = EDGE_WEAR_DEFAULTS) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        seed: normalizeText(src.seed, defaults.seed),
        edgeWidth: clampNumber(src.edgeWidth, 0.01, 0.48, defaults.edgeWidth),
        edgeSoftness: clampNumber(src.edgeSoftness, 0.001, 0.5, defaults.edgeSoftness),
        breakupScale: clampNumber(src.breakupScale, 0.5, 64.0, defaults.breakupScale),
        breakupStrength: clampNumber(src.breakupStrength, 0.0, 1.0, defaults.breakupStrength),
        bias: clampNumber(src.bias, -1.0, 1.0, defaults.bias),
        contrast: clampNumber(src.contrast, 0.1, 3.0, defaults.contrast),
        invert: src.invert === true
    };
}

function sanitizeMicroGrainParams(input, defaults = MICRO_GRAIN_DEFAULTS) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        seed: normalizeText(src.seed, defaults.seed),
        scale: clampNumber(src.scale, 8.0, 256.0, defaults.scale),
        octaves: clampInt(src.octaves, 1, 6, defaults.octaves),
        gain: clampNumber(src.gain, 0.05, 1.0, defaults.gain),
        bias: clampNumber(src.bias, -1.0, 1.0, defaults.bias),
        contrast: clampNumber(src.contrast, 0.1, 3.0, defaults.contrast),
        invert: src.invert === true
    };
}

function sanitizeDirectionalStreakParams(input, defaults = DIRECTIONAL_STREAK_DEFAULTS) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        seed: normalizeText(src.seed, defaults.seed),
        scale: clampNumber(src.scale, 0.5, 96.0, defaults.scale),
        directionDeg: clampNumber(src.directionDeg, -180, 180, defaults.directionDeg),
        stretch: clampNumber(src.stretch, 0.2, 8.0, defaults.stretch),
        warpScale: clampNumber(src.warpScale, 0.2, 64.0, defaults.warpScale),
        warpStrength: clampNumber(src.warpStrength, 0.0, 2.0, defaults.warpStrength),
        bias: clampNumber(src.bias, -1.0, 1.0, defaults.bias),
        contrast: clampNumber(src.contrast, 0.1, 3.0, defaults.contrast),
        invert: src.invert === true
    };
}

function sanitizeCrackleParams(input, defaults = CRACKLE_DEFAULTS) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        seed: normalizeText(src.seed, defaults.seed),
        scale: clampNumber(src.scale, 0.5, 96.0, defaults.scale),
        crackWidth: clampNumber(src.crackWidth, 0.01, 0.5, defaults.crackWidth),
        crackSoftness: clampNumber(src.crackSoftness, 0.001, 0.5, defaults.crackSoftness),
        distortion: clampNumber(src.distortion, 0.0, 1.0, defaults.distortion),
        bias: clampNumber(src.bias, -1.0, 1.0, defaults.bias),
        contrast: clampNumber(src.contrast, 0.1, 3.0, defaults.contrast),
        invert: src.invert === true
    };
}

function sanitizeLowFreqBlotchParams(input, defaults = LOW_FREQ_BLOTCH_DEFAULTS) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        seed: normalizeText(src.seed, defaults.seed),
        scale: clampNumber(src.scale, 0.1, 12.0, defaults.scale),
        octaves: clampInt(src.octaves, 1, 6, defaults.octaves),
        gain: clampNumber(src.gain, 0.05, 1.0, defaults.gain),
        threshold: clampNumber(src.threshold, 0.0, 1.0, defaults.threshold),
        softness: clampNumber(src.softness, 0.01, 0.5, defaults.softness),
        bias: clampNumber(src.bias, -1.0, 1.0, defaults.bias),
        contrast: clampNumber(src.contrast, 0.1, 3.0, defaults.contrast),
        invert: src.invert === true
    };
}

function generateFbmField({ width, height, params, kind = 'value_fbm', stretchX = 1.0, stretchY = 1.0 }) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    const p = params && typeof params === 'object' ? params : VALUE_FBM_DEFAULTS;

    const { sampler } = createNoiseSampler(p.seed);
    const rad = (Number(p.rotationDeg) || 0) * (Math.PI / 180);
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);
    const sxDiv = Math.max(0.05, Number(stretchX) || 1.0);
    const syDiv = Math.max(0.05, Number(stretchY) || 1.0);

    const out = new Float32Array(w * h);
    let idx = 0;

    for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h - 0.5;
        for (let x = 0; x < w; x++) {
            const u = (x + 0.5) / w - 0.5;
            const rx = u * cosR - v * sinR;
            const ry = u * sinR + v * cosR;

            const sampleX = (rx * p.scale) / sxDiv;
            const sampleY = (ry * p.scale) / syDiv;

            let value = sampleFbm2D(sampleX, sampleY, {
                noise2: sampler.sample,
                octaves: p.octaves,
                gain: p.gain,
                lacunarity: p.lacunarity,
                maxOctaves: 8
            });

            if (kind === 'ridged_fbm') {
                value = 1.0 - Math.abs(value * 2.0 - 1.0);
            }

            out[idx++] = applySignalAdjustments(value, p);
        }
    }

    return out;
}

function sampleBandSignal(axisCoord, count, width, softness, jitter, seedU32, salt) {
    if (!Number.isFinite(axisCoord) || count <= 0) return 0.0;
    const phase = axisCoord * count;
    const cell = Math.floor(phase);
    const local = phase - cell;
    const jitterRandom = u32ToUnit01(hashIntPairU32(cell, salt, seedU32));
    const center = 0.5 + (jitterRandom - 0.5) * jitter;
    const dist = Math.abs(local - center);
    const inner = Math.max(0.0005, width * 0.5);
    const outer = inner + Math.max(0.0005, softness);
    return 1.0 - smoothstep(inner, outer, dist);
}

function generateLineBandsField({ width, height, params }) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    const p = sanitizeLineBandsParams(params, LINE_BANDS_DEFAULTS);
    const seedU32 = hashStringToU32(p.seed);
    const out = new Float32Array(w * h);

    let idx = 0;
    for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h;
        for (let x = 0; x < w; x++) {
            const u = (x + 0.5) / w;
            const axis = p.orientation === 'horizontal' ? v : u;
            const line = sampleBandSignal(axis, p.lineCount, p.lineWidth, p.softness, p.jitter, seedU32, p.orientation === 'horizontal' ? 67 : 11);
            out[idx++] = applySignalAdjustments(line, p);
        }
    }

    return out;
}

function generateTileGridField({ width, height, params }) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    const p = sanitizeTileGridParams(params, TILE_GRID_DEFAULTS);
    const seedU32 = hashStringToU32(p.seed);
    const out = new Float32Array(w * h);

    let idx = 0;
    for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h;
        for (let x = 0; x < w; x++) {
            const u = (x + 0.5) / w;
            const vertical = sampleBandSignal(u, p.verticalLines, p.jointWidth, p.jointSoftness, p.jitter, seedU32, 23);
            const horizontal = sampleBandSignal(v, p.horizontalLines, p.jointWidth, p.jointSoftness, p.jitter, seedU32, 41);
            const seam = Math.max(vertical, horizontal);
            const grooveSignal = 1.0 - seam * p.grooveDepth;
            out[idx++] = applySignalAdjustments(grooveSignal, p);
        }
    }

    return out;
}

function generateCellularField({ width, height, params }) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    const p = sanitizeCellularParams(params, CELLULAR_DEFAULTS);
    const seedU32 = hashStringToU32(p.seed);
    const out = new Float32Array(w * h);

    let idx = 0;
    for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h - 0.5;
        for (let x = 0; x < w; x++) {
            const u = (x + 0.5) / w - 0.5;
            const sx = u * p.scale;
            const sy = v * p.scale;
            const { d1, d2 } = sampleCellularNearestDistances({ x: sx, y: sy, jitter: p.jitter, seedU32 });
            const cellBody = 1.0 - clamp01(d1 * 1.7);
            const edgeSignal = clamp01((d2 - d1) * 4.5);
            const value = mix(cellBody, edgeSignal, p.edgeBlend);
            out[idx++] = applySignalAdjustments(value, p);
        }
    }

    return out;
}

function generateEdgeWearMaskField({ width, height, params }) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    const p = sanitizeEdgeWearParams(params, EDGE_WEAR_DEFAULTS);
    const { sampler } = createNoiseSampler(p.seed);
    const out = new Float32Array(w * h);

    let idx = 0;
    for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h;
        for (let x = 0; x < w; x++) {
            const u = (x + 0.5) / w;
            const edgeDistance = Math.min(u, 1 - u, v, 1 - v);
            const edgeMask = 1.0 - smoothstep(p.edgeWidth, p.edgeWidth + p.edgeSoftness, edgeDistance);
            const nu = (u - 0.5) * p.breakupScale;
            const nv = (v - 0.5) * p.breakupScale;
            const breakupNoise = sampleFbm2D(nu, nv, {
                noise2: sampler.sample,
                octaves: 4,
                gain: 0.52,
                lacunarity: 2.07,
                maxOctaves: 8
            });
            const breakup = mix(1.0, breakupNoise, p.breakupStrength);
            const value = edgeMask * breakup;
            out[idx++] = applySignalAdjustments(value, p);
        }
    }

    return out;
}

function generateMicroGrainField({ width, height, params }) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    const p = sanitizeMicroGrainParams(params, MICRO_GRAIN_DEFAULTS);
    const { sampler } = createNoiseSampler(p.seed);
    const out = new Float32Array(w * h);

    let idx = 0;
    for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h - 0.5;
        for (let x = 0; x < w; x++) {
            const u = (x + 0.5) / w - 0.5;
            const value = sampleFbm2D(u * p.scale, v * p.scale, {
                noise2: sampler.sample,
                octaves: p.octaves,
                gain: p.gain,
                lacunarity: 2.13,
                maxOctaves: 8
            });
            out[idx++] = applySignalAdjustments(value, p);
        }
    }

    return out;
}

function generateDirectionalStreakField({ width, height, params }) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    const p = sanitizeDirectionalStreakParams(params, DIRECTIONAL_STREAK_DEFAULTS);
    const { sampler, seedU32 } = createNoiseSampler(p.seed);
    const warpSampler = createValueNoise2DSampler({
        hashU32: (ix, iy) => hashIntPairU32(ix, iy, seedU32 ^ 0x6a09e667),
        smoothing: 'quintic'
    });

    const rad = p.directionDeg * (Math.PI / 180);
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    const out = new Float32Array(w * h);
    let idx = 0;

    for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h - 0.5;
        for (let x = 0; x < w; x++) {
            const u = (x + 0.5) / w - 0.5;
            const along = u * cosR - v * sinR;
            const cross = u * sinR + v * cosR;

            const warpA = sampleFbm2D(along * p.warpScale, cross * p.warpScale, {
                noise2: warpSampler.sample,
                octaves: 3,
                gain: 0.56,
                lacunarity: 2.09,
                maxOctaves: 8
            });
            const warp = (warpA - 0.5) * p.warpStrength;

            const sampleX = along * (p.scale / Math.max(0.2, p.stretch)) + warp;
            const sampleY = cross * (p.scale * Math.max(0.2, p.stretch)) + warp * 0.4;
            const value = sampleFbm2D(sampleX, sampleY, {
                noise2: sampler.sample,
                octaves: 5,
                gain: 0.52,
                lacunarity: 2.05,
                maxOctaves: 8
            });
            out[idx++] = applySignalAdjustments(value, p);
        }
    }

    return out;
}

function generateCrackleField({ width, height, params }) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    const p = sanitizeCrackleParams(params, CRACKLE_DEFAULTS);
    const { sampler, seedU32 } = createNoiseSampler(p.seed);
    const out = new Float32Array(w * h);

    let idx = 0;
    for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h - 0.5;
        for (let x = 0; x < w; x++) {
            const u = (x + 0.5) / w - 0.5;

            const dxNoise = sampleFbm2D(u * p.scale * 0.7 + 13.7, v * p.scale * 0.7 + 2.3, {
                noise2: sampler.sample,
                octaves: 3,
                gain: 0.55,
                lacunarity: 2.04,
                maxOctaves: 8
            });
            const dyNoise = sampleFbm2D(u * p.scale * 0.7 - 5.1, v * p.scale * 0.7 + 17.9, {
                noise2: sampler.sample,
                octaves: 3,
                gain: 0.55,
                lacunarity: 2.04,
                maxOctaves: 8
            });

            const sx = u * p.scale + (dxNoise - 0.5) * p.distortion;
            const sy = v * p.scale + (dyNoise - 0.5) * p.distortion;
            const { d1, d2 } = sampleCellularNearestDistances({ x: sx, y: sy, jitter: 0.9, seedU32 });
            const crackMetric = Math.max(0, d2 - d1);
            const crack = 1.0 - smoothstep(p.crackWidth, p.crackWidth + p.crackSoftness, crackMetric);
            out[idx++] = applySignalAdjustments(crack, p);
        }
    }

    return out;
}

function generateLowFrequencyBlotchField({ width, height, params }) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    const p = sanitizeLowFreqBlotchParams(params, LOW_FREQ_BLOTCH_DEFAULTS);
    const { sampler } = createNoiseSampler(p.seed);
    const out = new Float32Array(w * h);

    let idx = 0;
    for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h - 0.5;
        for (let x = 0; x < w; x++) {
            const u = (x + 0.5) / w - 0.5;
            const n = sampleFbm2D(u * p.scale, v * p.scale, {
                noise2: sampler.sample,
                octaves: p.octaves,
                gain: p.gain,
                lacunarity: 2.01,
                maxOctaves: 8
            });
            const blotch = smoothstep(p.threshold - p.softness, p.threshold + p.softness, n);
            out[idx++] = applySignalAdjustments(blotch, p);
        }
    }

    return out;
}

const GENERATORS = Object.freeze([
    Object.freeze({
        id: 'value_fbm',
        label: 'Value fBm',
        description: 'Classic smooth layered value noise.',
        controls: COMMON_FBM_CONTROLS,
        defaultParams: VALUE_FBM_DEFAULTS,
        defaultPresetId: 'default',
        presets: Object.freeze([
            Object.freeze({ id: 'default', label: 'Default', params: {} }),
            Object.freeze({ id: 'clouds', label: 'Clouds', params: { scale: 7.5, octaves: 5, gain: 0.56, lacunarity: 1.9, contrast: 0.82 } }),
            Object.freeze({ id: 'grain', label: 'Grain', params: { scale: 32.0, octaves: 3, gain: 0.45, lacunarity: 2.45, contrast: 1.25 } })
        ]),
        sanitizeParams: (input) => sanitizeFbmParams(input, VALUE_FBM_DEFAULTS),
        generateField: ({ width, height, params }) => generateFbmField({ width, height, params, kind: 'value_fbm' })
    }),
    Object.freeze({
        id: 'ridged_fbm',
        label: 'Ridged fBm',
        description: 'Inverted-ridge variant for rock-like details.',
        controls: COMMON_FBM_CONTROLS,
        defaultParams: RIDGED_FBM_DEFAULTS,
        defaultPresetId: 'cracked',
        presets: Object.freeze([
            Object.freeze({ id: 'cracked', label: 'Cracked', params: {} }),
            Object.freeze({ id: 'dunes', label: 'Dunes', params: { scale: 11.0, octaves: 4, gain: 0.7, lacunarity: 1.7, contrast: 1.12, bias: -0.22 } }),
            Object.freeze({ id: 'veins', label: 'Veins', params: { scale: 26.0, octaves: 6, gain: 0.48, lacunarity: 2.4, contrast: 1.85, bias: -0.1 } })
        ]),
        sanitizeParams: (input) => sanitizeFbmParams(input, RIDGED_FBM_DEFAULTS),
        generateField: ({ width, height, params }) => generateFbmField({ width, height, params, kind: 'ridged_fbm' })
    }),
    Object.freeze({
        id: 'directional_fbm',
        label: 'Directional fBm',
        description: 'fBm with horizontal/vertical stretch controls for directional wear.',
        controls: DIRECTIONAL_FBM_CONTROLS,
        defaultParams: DIRECTIONAL_FBM_DEFAULTS,
        defaultPresetId: 'sidewalk_streaks',
        presets: Object.freeze([
            Object.freeze({ id: 'sidewalk_streaks', label: 'Sidewalk Streaks', params: {} }),
            Object.freeze({ id: 'vertical_drag', label: 'Vertical Drag', params: { horizontalStretch: 4.4, verticalStretch: 0.65, scale: 14.0 } }),
            Object.freeze({ id: 'horizontal_wear', label: 'Horizontal Wear', params: { horizontalStretch: 0.7, verticalStretch: 4.2, scale: 13.0 } })
        ]),
        sanitizeParams: (input) => sanitizeDirectionalFbmParams(input, DIRECTIONAL_FBM_DEFAULTS),
        generateField: ({ width, height, params }) => {
            const p = sanitizeDirectionalFbmParams(params, DIRECTIONAL_FBM_DEFAULTS);
            return generateFbmField({
                width,
                height,
                params: p,
                kind: 'value_fbm',
                stretchX: p.horizontalStretch,
                stretchY: p.verticalStretch
            });
        }
    }),
    Object.freeze({
        id: 'line_bands',
        label: 'Line Bands',
        description: 'Horizontal/vertical procedural seam lines with soft edges.',
        controls: LINE_BANDS_CONTROLS,
        defaultParams: LINE_BANDS_DEFAULTS,
        defaultPresetId: 'vertical_seam_single',
        presets: Object.freeze([
            Object.freeze({ id: 'vertical_seam_single', label: 'Vertical Seam (Single)', params: { orientation: 'vertical', lineCount: 1, lineWidth: 0.14, softness: 0.035, jitter: 0.0 } }),
            Object.freeze({ id: 'horizontal_seam_single', label: 'Horizontal Seam (Single)', params: { orientation: 'horizontal', lineCount: 1, lineWidth: 0.14, softness: 0.035, jitter: 0.0 } }),
            Object.freeze({ id: 'multi_strip', label: 'Multi Strip', params: { orientation: 'vertical', lineCount: 18, lineWidth: 0.05, softness: 0.015, jitter: 0.025 } })
        ]),
        sanitizeParams: (input) => sanitizeLineBandsParams(input, LINE_BANDS_DEFAULTS),
        generateField: ({ width, height, params }) => generateLineBandsField({ width, height, params })
    }),
    Object.freeze({
        id: 'tile_grid_subdivision',
        label: 'Tile/Grid Subdivision',
        description: 'Independent vertical/horizontal groove joints for tile and stone plates.',
        controls: TILE_GRID_CONTROLS,
        defaultParams: TILE_GRID_DEFAULTS,
        defaultPresetId: 'stone_plates_grid',
        presets: Object.freeze([
            Object.freeze({ id: 'stone_plates_grid', label: 'Stone Plates Grid', params: {} }),
            Object.freeze({ id: 'wide_blocks', label: 'Wide Blocks', params: { verticalLines: 4, horizontalLines: 2, jointWidth: 0.1, grooveDepth: 0.9 } }),
            Object.freeze({ id: 'dense_tiles', label: 'Dense Tiles', params: { verticalLines: 12, horizontalLines: 10, jointWidth: 0.05, jointSoftness: 0.02, grooveDepth: 0.82 } })
        ]),
        sanitizeParams: (input) => sanitizeTileGridParams(input, TILE_GRID_DEFAULTS),
        generateField: ({ width, height, params }) => generateTileGridField({ width, height, params })
    }),
    Object.freeze({
        id: 'cellular_worley',
        label: 'Cellular/Worley',
        description: 'Cellular distance noise for chipped stone and clustered breakup.',
        controls: CELLULAR_CONTROLS,
        defaultParams: CELLULAR_DEFAULTS,
        defaultPresetId: 'stone_cells',
        presets: Object.freeze([
            Object.freeze({ id: 'stone_cells', label: 'Stone Cells', params: {} }),
            Object.freeze({ id: 'bubble_cells', label: 'Bubble Cells', params: { edgeBlend: 0.15, jitter: 0.95, contrast: 1.2 } }),
            Object.freeze({ id: 'edge_cells', label: 'Edge Cells', params: { edgeBlend: 0.9, jitter: 0.7 } })
        ]),
        sanitizeParams: (input) => sanitizeCellularParams(input, CELLULAR_DEFAULTS),
        generateField: ({ width, height, params }) => generateCellularField({ width, height, params })
    }),
    Object.freeze({
        id: 'edge_wear_mask',
        label: 'Edge Wear Mask',
        description: 'Perimeter-focused wear mask with breakup.',
        controls: EDGE_WEAR_CONTROLS,
        defaultParams: EDGE_WEAR_DEFAULTS,
        defaultPresetId: 'edge_dust',
        presets: Object.freeze([
            Object.freeze({ id: 'edge_dust', label: 'Edge Dust', params: {} }),
            Object.freeze({ id: 'strong_edges', label: 'Strong Edges', params: { edgeWidth: 0.2, edgeSoftness: 0.05, breakupStrength: 0.42 } }),
            Object.freeze({ id: 'soft_falloff', label: 'Soft Falloff', params: { edgeWidth: 0.08, edgeSoftness: 0.14, breakupStrength: 0.65 } })
        ]),
        sanitizeParams: (input) => sanitizeEdgeWearParams(input, EDGE_WEAR_DEFAULTS),
        generateField: ({ width, height, params }) => generateEdgeWearMaskField({ width, height, params })
    }),
    Object.freeze({
        id: 'micro_grain',
        label: 'Micro Grain',
        description: 'High-frequency fine-grain texture signal.',
        controls: MICRO_GRAIN_CONTROLS,
        defaultParams: MICRO_GRAIN_DEFAULTS,
        defaultPresetId: 'fine_concrete',
        presets: Object.freeze([
            Object.freeze({ id: 'fine_concrete', label: 'Fine Concrete', params: {} }),
            Object.freeze({ id: 'dusty_micro', label: 'Dusty Micro', params: { scale: 128.0, octaves: 2, contrast: 0.9 } }),
            Object.freeze({ id: 'sharp_micro', label: 'Sharp Micro', params: { scale: 84.0, octaves: 4, gain: 0.52, contrast: 1.3 } })
        ]),
        sanitizeParams: (input) => sanitizeMicroGrainParams(input, MICRO_GRAIN_DEFAULTS),
        generateField: ({ width, height, params }) => generateMicroGrainField({ width, height, params })
    }),
    Object.freeze({
        id: 'directional_streak_flow',
        label: 'Directional Streak/Flow',
        description: 'Flow-oriented directional streak noise for runoff and drag.',
        controls: DIRECTIONAL_STREAK_CONTROLS,
        defaultParams: DIRECTIONAL_STREAK_DEFAULTS,
        defaultPresetId: 'runoff_flow',
        presets: Object.freeze([
            Object.freeze({ id: 'runoff_flow', label: 'Runoff Flow', params: {} }),
            Object.freeze({ id: 'vertical_rain', label: 'Vertical Rain', params: { directionDeg: -90, stretch: 4.0, warpStrength: 0.3 } }),
            Object.freeze({ id: 'angled_drag', label: 'Angled Drag', params: { directionDeg: -35, stretch: 2.7, warpStrength: 0.52 } })
        ]),
        sanitizeParams: (input) => sanitizeDirectionalStreakParams(input, DIRECTIONAL_STREAK_DEFAULTS),
        generateField: ({ width, height, params }) => generateDirectionalStreakField({ width, height, params })
    }),
    Object.freeze({
        id: 'crackle_fracture',
        label: 'Crackle/Fracture',
        description: 'Fracture-like crack network generator.',
        controls: CRACKLE_CONTROLS,
        defaultParams: CRACKLE_DEFAULTS,
        defaultPresetId: 'fractured_wall',
        presets: Object.freeze([
            Object.freeze({ id: 'fractured_wall', label: 'Fractured Wall', params: {} }),
            Object.freeze({ id: 'hairline_cracks', label: 'Hairline Cracks', params: { crackWidth: 0.05, crackSoftness: 0.025, contrast: 1.2 } }),
            Object.freeze({ id: 'wide_fracture', label: 'Wide Fracture', params: { crackWidth: 0.16, crackSoftness: 0.09, distortion: 0.4 } })
        ]),
        sanitizeParams: (input) => sanitizeCrackleParams(input, CRACKLE_DEFAULTS),
        generateField: ({ width, height, params }) => generateCrackleField({ width, height, params })
    }),
    Object.freeze({
        id: 'low_frequency_blotch',
        label: 'Low-frequency Blotch',
        description: 'Large-scale blotches for broad weathering variation.',
        controls: LOW_FREQ_BLOTCH_CONTROLS,
        defaultParams: LOW_FREQ_BLOTCH_DEFAULTS,
        defaultPresetId: 'large_stains',
        presets: Object.freeze([
            Object.freeze({ id: 'large_stains', label: 'Large Stains', params: {} }),
            Object.freeze({ id: 'broad_dirty', label: 'Broad Dirty', params: { scale: 1.2, threshold: 0.48, softness: 0.2 } }),
            Object.freeze({ id: 'spotty', label: 'Spotty', params: { scale: 3.1, threshold: 0.61, softness: 0.09 } })
        ]),
        sanitizeParams: (input) => sanitizeLowFreqBlotchParams(input, LOW_FREQ_BLOTCH_DEFAULTS),
        generateField: ({ width, height, params }) => generateLowFrequencyBlotchField({ width, height, params })
    })
]);

const GENERATOR_BY_ID = new Map(GENERATORS.map((generator) => [generator.id, generator]));

function resolveGeneratorId(id) {
    const key = normalizeId(id);
    return GENERATOR_BY_ID.has(key) ? key : DEFAULT_GENERATOR_ID;
}

function resolvePreset(generator, presetId) {
    const g = generator && typeof generator === 'object' ? generator : GENERATOR_BY_ID.get(DEFAULT_GENERATOR_ID);
    const pid = normalizeId(presetId);
    if (!g) return null;
    const presets = Array.isArray(g.presets) ? g.presets : [];
    if (!presets.length) return null;
    return presets.find((preset) => preset.id === pid)
        ?? presets.find((preset) => preset.id === g.defaultPresetId)
        ?? presets[0]
        ?? null;
}

function sanitizeGeneratorParamsById(input) {
    const src = input && typeof input === 'object' ? input : {};
    const out = {};
    for (const generator of GENERATORS) {
        out[generator.id] = generator.sanitizeParams(src[generator.id]);
    }
    return out;
}

function sanitizeLayerTransform(input, warnings = null, layerName = 'Layer') {
    const src = input && typeof input === 'object' ? input : {};
    const requestedSpace = normalizeId(src.space);
    if (requestedSpace && requestedSpace !== 'uv' && warnings) {
        pushWarning(warnings, `[NoiseFabrication] ${layerName}: world-space transforms are unsupported in this tool; using UV space.`);
    }
    return {
        space: 'uv',
        scale: clampNumber(src.scale, 0.05, 16.0, 1.0),
        rotationDeg: clampNumber(src.rotationDeg, -180, 180, 0),
        offsetU: clampNumber(src.offsetU, -8.0, 8.0, 0.0),
        offsetV: clampNumber(src.offsetV, -8.0, 8.0, 0.0)
    };
}

function normalizeLayerId(rawId, usedIds, nextIdRef) {
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (/^layer_\d+$/.test(id) && !usedIds.has(id)) {
        usedIds.add(id);
        const n = Number(id.split('_')[1]);
        if (Number.isFinite(n) && n >= nextIdRef.value) nextIdRef.value = n + 1;
        return id;
    }

    let assigned;
    do {
        assigned = `layer_${nextIdRef.value++}`;
    } while (usedIds.has(assigned));
    usedIds.add(assigned);
    return assigned;
}

function cloneLayer(layer) {
    return {
        ...layer,
        transform: { ...layer.transform },
        params: { ...layer.params },
        execution: {
            ...(layer.execution && typeof layer.execution === 'object' ? layer.execution : sanitizeNoiseExecutionConfig(null))
        }
    };
}

function cloneStateForMutation(state) {
    return {
        ...state,
        exportTargets: { ...state.exportTargets },
        executionAssistantQuestions: {
            ...(state.executionAssistantQuestions && typeof state.executionAssistantQuestions === 'object'
                ? state.executionAssistantQuestions
                : getNoiseExecutionAssistantDefaultQuestions())
        },
        statusWarnings: Array.isArray(state.statusWarnings) ? [...state.statusWarnings] : [],
        layers: Array.isArray(state.layers) ? state.layers.map((layer) => cloneLayer(layer)) : []
    };
}

function withStateMutation(state, mutate) {
    const sanitized = sanitizeNoiseFabricationState(state);
    const draft = cloneStateForMutation(sanitized);
    mutate?.(draft);
    return sanitizeNoiseFabricationState(draft);
}

function getDefaultCatalogEntry() {
    return getNoiseCatalogEntryById(DEFAULT_GENERATOR_ID)
        ?? findNoiseCatalogEntryByGeneratorId(DEFAULT_GENERATOR_ID)
        ?? listNoiseCatalogEntries()[0]
        ?? null;
}

function resolveCatalogEntry(noiseId, generatorIdFallback = '') {
    const byId = getNoiseCatalogEntryById(noiseId);
    if (byId) return byId;
    const byGenerator = findNoiseCatalogEntryByGeneratorId(generatorIdFallback);
    if (byGenerator) return byGenerator;
    return getDefaultCatalogEntry();
}

function countLayersWithDisplayName(layers, displayName) {
    let count = 0;
    for (const layer of layers) {
        if (String(layer?.name ?? '').toLowerCase().startsWith(String(displayName ?? '').toLowerCase())) count++;
    }
    return count;
}

function buildLayerFromCatalogEntry({
    entry,
    layerId,
    layerName,
    description = '',
    mapTarget = '',
    blendMode = 'normal',
    strength = 1.0,
    lock = false,
    solo = false,
    transform = null,
    presetId = null,
    params = null,
    execution = null
}) {
    const catalogEntry = entry ?? getDefaultCatalogEntry();
    const generator = getNoiseTextureGeneratorById(catalogEntry?.generatorId ?? DEFAULT_GENERATOR_ID);
    const resolvedPreset = resolvePreset(generator, presetId ?? catalogEntry?.defaultPresetId ?? generator?.defaultPresetId ?? '');
    const presetParams = applyGeneratorPresetToParams(generator?.id ?? DEFAULT_GENERATOR_ID, resolvedPreset?.id ?? '', generator?.defaultParams ?? null);
    const resolvedParams = params ? generator?.sanitizeParams(params) : presetParams;

    return {
        id: layerId,
        noiseId: catalogEntry?.id ?? generator?.id ?? DEFAULT_GENERATOR_ID,
        generatorId: generator?.id ?? DEFAULT_GENERATOR_ID,
        name: normalizeText(layerName, catalogEntry?.displayName ?? generator?.label ?? 'Layer'),
        description: String(description ?? ''),
        presetId: resolvedPreset?.id ?? null,
        blendMode: sanitizeBlendMode(blendMode),
        strength: clampNumber(strength, 0.0, 1.0, 1.0),
        lock: lock === true,
        solo: solo === true,
        mapTarget: sanitizeLayerMapTarget(mapTarget, catalogEntry?.defaultLayerTarget ?? 'normal'),
        transform: sanitizeLayerTransform(transform),
        params: resolvedParams,
        execution: sanitizeNoiseExecutionConfig(execution)
    };
}

function migrateLegacySingleStateToLayers(input, warnings) {
    const src = input && typeof input === 'object' ? input : {};
    if (Array.isArray(src.layers) && src.layers.length > 0) return null;

    const hasLegacyState = typeof src.generatorId === 'string'
        || (src.generatorParamsById && typeof src.generatorParamsById === 'object')
        || typeof src.activePresetId === 'string';

    if (!hasLegacyState) return null;

    const generatorId = resolveGeneratorId(src.generatorId);
    const entry = resolveCatalogEntry('', generatorId);
    const generator = getNoiseTextureGeneratorById(generatorId);
    const requestedPreset = src.activePresetId;
    const resolvedPreset = resolvePreset(generator, requestedPreset ?? entry?.defaultPresetId ?? '');
    const legacyParams = src.generatorParamsById && typeof src.generatorParamsById === 'object' ? src.generatorParamsById[generator.id] : null;
    const params = legacyParams
        ? generator.sanitizeParams(legacyParams)
        : applyGeneratorPresetToParams(generator.id, resolvedPreset?.id ?? '', generator.defaultParams);

    pushWarning(warnings, '[NoiseFabrication] Migrated legacy single-generator recipe to layered stack (v2).');

    return [
        {
            id: 'layer_1',
            noiseId: entry?.id ?? generator.id,
            generatorId: generator.id,
            name: entry?.displayName ?? generator.label,
            description: '',
            presetId: resolvedPreset?.id ?? null,
            blendMode: 'normal',
            strength: 1.0,
            lock: false,
            solo: false,
            mapTarget: sanitizeLayerMapTarget(entry?.defaultLayerTarget ?? 'normal', 'normal'),
            transform: { space: 'uv', scale: 1.0, rotationDeg: 0, offsetU: 0, offsetV: 0 },
            params,
            execution: sanitizeNoiseExecutionConfig(null)
        }
    ];
}

function sanitizeLayer(layerInput, { usedIds, nextIdRef, warnings, layersForNaming }) {
    const src = layerInput && typeof layerInput === 'object' ? layerInput : {};
    const entry = resolveCatalogEntry(src.noiseId, src.generatorId);
    const generator = getNoiseTextureGeneratorById(entry?.generatorId ?? src.generatorId);
    const fallbackName = `${entry?.displayName ?? generator?.label ?? 'Layer'} ${Math.max(1, countLayersWithDisplayName(layersForNaming, entry?.displayName ?? generator?.label ?? 'Layer') + 1)}`;
    const id = normalizeLayerId(src.id, usedIds, nextIdRef);

    const requestedPreset = src.presetId;
    const resolvedPreset = resolvePreset(generator, requestedPreset ?? entry?.defaultPresetId ?? generator?.defaultPresetId ?? '');

    let paramsInput = null;
    if (src.params && typeof src.params === 'object') {
        paramsInput = src.params;
    } else if (src.generatorParamsById && typeof src.generatorParamsById === 'object') {
        paramsInput = src.generatorParamsById[generator.id] ?? null;
    }

    const params = paramsInput
        ? generator.sanitizeParams(paramsInput)
        : applyGeneratorPresetToParams(generator.id, resolvedPreset?.id ?? '', generator.defaultParams);

    const layerName = normalizeText(src.name, fallbackName);
    const description = String(src.description ?? '').slice(0, 320);
    const blendMode = sanitizeBlendMode(src.blendMode);
    const strength = clampNumber(src.strength, 0.0, 1.0, 1.0);
    const lock = src.lock === true;
    const solo = src.solo === true;
    const mapTarget = sanitizeLayerMapTarget(src.mapTarget, entry?.defaultLayerTarget ?? 'normal');
    const transform = sanitizeLayerTransform(src.transform, warnings, layerName);
    const execution = sanitizeNoiseExecutionConfig(src.execution ?? {
        mode: src.executionMode,
        manualPath: src.executionManualPath,
        dynamicRuntime: src.dynamicRuntime,
        largeScaleWorld: src.largeScaleWorld
    });

    return {
        id,
        noiseId: entry?.id ?? generator.id,
        generatorId: generator.id,
        name: layerName,
        description,
        presetId: resolvedPreset?.id ?? null,
        blendMode,
        strength,
        lock,
        solo,
        mapTarget,
        transform,
        params,
        execution
    };
}

function composeLayerStack(width, height, layers) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    const out = new Float32Array(w * h);
    out.fill(0.5);

    for (const layer of layers) {
        const generator = getNoiseTextureGeneratorById(layer.generatorId);
        if (!generator) continue;
        const strength = clampNumber(layer.strength, 0.0, 1.0, 1.0);
        if (strength <= 0.0) continue;

        const baseField = generator.generateField({ width: w, height: h, params: layer.params });
        const transformed = applyUvTransformToField(baseField, w, h, layer.transform);

        for (let i = 0; i < out.length; i++) {
            const dst = out[i];
            const src = clamp01(transformed[i]);
            let next;
            switch (layer.blendMode) {
            case 'add':
                next = clamp01(dst + src * strength);
                break;
            case 'subtract':
                next = clamp01(dst - src * strength);
                break;
            case 'multiply': {
                const mul = dst * src;
                next = mix(dst, mul, strength);
                break;
            }
            case 'screen': {
                const screen = 1.0 - (1.0 - dst) * (1.0 - src);
                next = mix(dst, screen, strength);
                break;
            }
            case 'max':
                next = Math.max(dst, src * strength);
                break;
            case 'min': {
                const minValue = Math.min(dst, src);
                next = mix(dst, minValue, strength);
                break;
            }
            case 'normal':
            default:
                next = mix(dst, src, strength);
                break;
            }
            out[i] = clamp01(next);
        }
    }

    return out;
}

function getPreviewTargetFromMode(previewMode) {
    return previewMode === 'normal' ? 'normal' : 'albedo';
}

function filterLayersForPreview(layers, previewTarget) {
    const src = Array.isArray(layers) ? layers : [];
    const soloLayers = src.filter((layer) => layer.solo === true);
    const base = soloLayers.length ? soloLayers : src;
    if (previewTarget === 'normal') return base.filter((layer) => layer.mapTarget === 'normal');
    return base.filter((layer) => layer.mapTarget === 'albedo');
}

function sanitizeLayersArray(inputLayers, warnings) {
    const rawLayers = Array.isArray(inputLayers) ? inputLayers : [];
    const usedIds = new Set();
    const nextIdRef = { value: 1 };

    const outLayers = [];
    const limit = rawLayers.length > NOISE_FABRICATION_MAX_LAYERS ? NOISE_FABRICATION_MAX_LAYERS : rawLayers.length;
    if (rawLayers.length > NOISE_FABRICATION_MAX_LAYERS) {
        pushWarning(warnings, `[NoiseFabrication] Layer count clamped to ${NOISE_FABRICATION_MAX_LAYERS}.`);
    }

    for (let i = 0; i < limit; i++) {
        const sanitizedLayer = sanitizeLayer(rawLayers[i], {
            usedIds,
            nextIdRef,
            warnings,
            layersForNaming: outLayers
        });
        outLayers.push(sanitizedLayer);
    }

    if (!outLayers.length) {
        const defaultEntry = getDefaultCatalogEntry();
        const defaultLayer = buildLayerFromCatalogEntry({
            entry: defaultEntry,
            layerId: normalizeLayerId('layer_1', usedIds, nextIdRef),
            layerName: `${defaultEntry?.displayName ?? 'Noise'} 1`,
            mapTarget: defaultEntry?.defaultLayerTarget ?? 'normal'
        });
        outLayers.push(defaultLayer);
    }

    return { layers: outLayers, nextIdRef };
}

export function listNoiseTextureGenerators() {
    return GENERATORS;
}

export function getNoiseTextureGeneratorById(id) {
    const key = resolveGeneratorId(id);
    return GENERATOR_BY_ID.get(key) ?? GENERATOR_BY_ID.get(DEFAULT_GENERATOR_ID) ?? null;
}

export function listNoiseBlendModes() {
    return NOISE_FABRICATION_BLEND_MODES;
}

export function listNoiseLayerMapTargets() {
    return NOISE_FABRICATION_LAYER_MAP_TARGETS;
}

export function listNoiseExecutionPaths() {
    return NOISE_FABRICATION_EXECUTION_PATHS;
}

export function listNoiseExecutionModes() {
    return NOISE_FABRICATION_EXECUTION_MODES;
}

export function getGeneratorPreset(generatorId, presetId) {
    const generator = getNoiseTextureGeneratorById(generatorId);
    return resolvePreset(generator, presetId);
}

export function applyGeneratorPresetToParams(generatorId, presetId, currentParams = null) {
    const generator = getNoiseTextureGeneratorById(generatorId);
    if (!generator) return {};
    const preset = resolvePreset(generator, presetId);
    const base = generator.sanitizeParams(currentParams);
    if (!preset) return base;
    return generator.sanitizeParams({ ...base, ...preset.params });
}

export function getNoiseFabricationDefaultState() {
    const defaultEntry = getDefaultCatalogEntry();
    const initialLayer = buildLayerFromCatalogEntry({
        entry: defaultEntry,
        layerId: 'layer_1',
        layerName: `${defaultEntry?.displayName ?? 'Noise'} 1`,
        mapTarget: defaultEntry?.defaultLayerTarget ?? 'normal'
    });

    return {
        version: NOISE_FABRICATION_STATE_VERSION,
        tool: NOISE_FABRICATION_TOOL_ID,
        previewMode: DEFAULT_PREVIEW_MODE,
        baseColor: DEFAULT_BASE_COLOR,
        textureSize: DEFAULT_TEXTURE_SIZE,
        activeLayerId: initialLayer.id,
        nextLayerId: 2,
        exportTargets: { ...DEFAULT_EXPORT_TARGETS },
        executionAssistantQuestions: getNoiseExecutionAssistantDefaultQuestions(),
        layers: [initialLayer],
        statusWarnings: []
    };
}

export function sanitizeNoiseFabricationState(input) {
    const defaults = getNoiseFabricationDefaultState();
    const src = input && typeof input === 'object' ? input : {};
    const warnings = [];
    if (Array.isArray(src.statusWarnings)) {
        for (const warning of src.statusWarnings) {
            pushWarning(warnings, typeof warning === 'string' ? warning : '');
        }
    }

    const migratedLayers = migrateLegacySingleStateToLayers(src, warnings);
    const layerSource = migratedLayers ?? src.layers;

    const textureSize = sanitizeTextureSize(src.textureSize ?? defaults.textureSize, warnings);
    const { layers, nextIdRef } = sanitizeLayersArray(layerSource, warnings);

    const requestedNextLayerId = clampInt(src.nextLayerId, 1, 1_000_000, nextIdRef.value);
    const nextLayerId = Math.max(nextIdRef.value, requestedNextLayerId);

    const activeLayerIdRaw = typeof src.activeLayerId === 'string' ? src.activeLayerId.trim() : '';
    const activeLayerId = layers.find((layer) => layer.id === activeLayerIdRaw)?.id ?? layers[0].id;

    const previewMode = sanitizePreviewMode(src.previewMode ?? defaults.previewMode);
    const baseColor = normalizeHexColor(src.baseColor ?? defaults.baseColor, defaults.baseColor);
    const exportTargets = sanitizeExportTargets(src.exportTargets ?? defaults.exportTargets);
    const executionAssistantQuestions = sanitizeNoiseExecutionAssistantQuestions(src.executionAssistantQuestions ?? defaults.executionAssistantQuestions);

    return {
        version: NOISE_FABRICATION_STATE_VERSION,
        tool: NOISE_FABRICATION_TOOL_ID,
        previewMode,
        baseColor,
        textureSize,
        activeLayerId,
        nextLayerId,
        exportTargets,
        executionAssistantQuestions,
        layers,
        statusWarnings: warnings
    };
}

export function getNoiseFabricationStateWarnings(state) {
    const sanitized = sanitizeNoiseFabricationState(state);
    return [...sanitized.statusWarnings];
}

export function getNoiseLayerById(state, layerId) {
    const sanitized = sanitizeNoiseFabricationState(state);
    const id = typeof layerId === 'string' ? layerId.trim() : '';
    return sanitized.layers.find((layer) => layer.id === id) ?? null;
}

export function getNoiseFabricationExecutionPlan(state, {
    questions = null,
    manualOverridesByLayerId = null
} = {}) {
    const sanitized = sanitizeNoiseFabricationState(state);
    const resolvedQuestions = sanitizeNoiseExecutionAssistantQuestions(questions ?? sanitized.executionAssistantQuestions);
    const plan = buildNoiseExecutionPlan(sanitized.layers, {
        questions: resolvedQuestions,
        manualOverridesByLayerId
    });
    return {
        ...plan,
        state: sanitized
    };
}

export function setNoiseFabricationActiveLayer(state, layerId) {
    return withStateMutation(state, (draft) => {
        const id = typeof layerId === 'string' ? layerId.trim() : '';
        if (!id) return;
        if (draft.layers.some((layer) => layer.id === id)) {
            draft.activeLayerId = id;
        }
    });
}

export function setNoiseFabricationPreviewMode(state, previewMode) {
    return withStateMutation(state, (draft) => {
        draft.previewMode = sanitizePreviewMode(previewMode);
    });
}

export function setNoiseFabricationBaseColor(state, baseColor) {
    return withStateMutation(state, (draft) => {
        draft.baseColor = normalizeHexColor(baseColor, DEFAULT_BASE_COLOR);
    });
}

export function setNoiseFabricationTextureSize(state, textureSize) {
    return withStateMutation(state, (draft) => {
        draft.textureSize = sanitizeTextureSize(textureSize, draft.statusWarnings);
    });
}

export function setNoiseFabricationExportTargets(state, exportTargets) {
    return withStateMutation(state, (draft) => {
        draft.exportTargets = sanitizeExportTargets(exportTargets);
    });
}

export function setNoiseFabricationExecutionAssistantQuestions(state, questions) {
    return withStateMutation(state, (draft) => {
        draft.executionAssistantQuestions = sanitizeNoiseExecutionAssistantQuestions(questions);
    });
}

export function addNoiseLayerFromCatalog(state, noiseId) {
    return withStateMutation(state, (draft) => {
        if (draft.layers.length >= NOISE_FABRICATION_MAX_LAYERS) {
            pushWarning(draft.statusWarnings, `[NoiseFabrication] Cannot add more than ${NOISE_FABRICATION_MAX_LAYERS} layers.`);
            return;
        }

        const entry = resolveCatalogEntry(noiseId);
        const layerId = `layer_${draft.nextLayerId++}`;
        const duplicateCount = countLayersWithDisplayName(draft.layers, entry?.displayName ?? 'Noise');
        const layerName = `${entry?.displayName ?? 'Noise'} ${duplicateCount + 1}`;
        const layer = buildLayerFromCatalogEntry({
            entry,
            layerId,
            layerName,
            mapTarget: entry?.defaultLayerTarget ?? 'normal',
            blendMode: 'normal',
            strength: 1.0,
            description: ''
        });

        draft.layers.push(layer);
        draft.activeLayerId = layer.id;
    });
}

export function replaceNoiseLayerFromCatalog(state, layerId, noiseId) {
    return withStateMutation(state, (draft) => {
        const id = typeof layerId === 'string' ? layerId.trim() : '';
        const index = draft.layers.findIndex((layer) => layer.id === id);
        if (index < 0) return;

        const currentLayer = draft.layers[index];
        if (currentLayer.lock) {
            pushWarning(draft.statusWarnings, `[NoiseFabrication] Layer "${currentLayer.name}" is locked and cannot be replaced.`);
            return;
        }

        const entry = resolveCatalogEntry(noiseId);
        const replacement = buildLayerFromCatalogEntry({
            entry,
            layerId: currentLayer.id,
            layerName: currentLayer.name,
            description: currentLayer.description,
            mapTarget: currentLayer.mapTarget,
            blendMode: currentLayer.blendMode,
            strength: currentLayer.strength,
            lock: currentLayer.lock,
            solo: currentLayer.solo,
            transform: currentLayer.transform,
            presetId: entry?.defaultPresetId ?? null
        });

        draft.layers[index] = replacement;
        draft.activeLayerId = replacement.id;
    });
}

export function duplicateNoiseLayer(state, layerId) {
    return withStateMutation(state, (draft) => {
        if (draft.layers.length >= NOISE_FABRICATION_MAX_LAYERS) {
            pushWarning(draft.statusWarnings, `[NoiseFabrication] Cannot duplicate because the stack already has ${NOISE_FABRICATION_MAX_LAYERS} layers.`);
            return;
        }

        const id = typeof layerId === 'string' ? layerId.trim() : '';
        const index = draft.layers.findIndex((layer) => layer.id === id);
        if (index < 0) return;

        const source = draft.layers[index];
        const copy = cloneLayer(source);
        copy.id = `layer_${draft.nextLayerId++}`;
        copy.name = `${source.name} Copy`;
        copy.lock = false;
        copy.solo = false;

        draft.layers.splice(index + 1, 0, copy);
        draft.activeLayerId = copy.id;
    });
}

export function renameNoiseLayer(state, layerId, nextName) {
    return withStateMutation(state, (draft) => {
        const id = typeof layerId === 'string' ? layerId.trim() : '';
        const layer = draft.layers.find((candidate) => candidate.id === id);
        if (!layer) return;
        if (layer.lock) {
            pushWarning(draft.statusWarnings, `[NoiseFabrication] Layer "${layer.name}" is locked and cannot be renamed.`);
            return;
        }
        layer.name = normalizeText(nextName, layer.name);
    });
}

export function describeNoiseLayer(state, layerId, nextDescription) {
    return withStateMutation(state, (draft) => {
        const id = typeof layerId === 'string' ? layerId.trim() : '';
        const layer = draft.layers.find((candidate) => candidate.id === id);
        if (!layer) return;
        if (layer.lock) {
            pushWarning(draft.statusWarnings, `[NoiseFabrication] Layer "${layer.name}" is locked and cannot change description.`);
            return;
        }
        layer.description = String(nextDescription ?? '').slice(0, 320);
    });
}

export function setNoiseLayerLock(state, layerId, lock) {
    return withStateMutation(state, (draft) => {
        const id = typeof layerId === 'string' ? layerId.trim() : '';
        const layer = draft.layers.find((candidate) => candidate.id === id);
        if (!layer) return;
        layer.lock = lock === true;
    });
}

export function setNoiseLayerSolo(state, layerId, solo) {
    return withStateMutation(state, (draft) => {
        const id = typeof layerId === 'string' ? layerId.trim() : '';
        const layer = draft.layers.find((candidate) => candidate.id === id);
        if (!layer) return;
        layer.solo = solo === true;
    });
}

export function reorderNoiseLayers(state, orderedLayerIds) {
    return withStateMutation(state, (draft) => {
        const ids = Array.isArray(orderedLayerIds) ? orderedLayerIds.map((id) => String(id ?? '').trim()) : [];
        const validIds = new Set(draft.layers.map((layer) => layer.id));
        const used = new Set();
        const sorted = [];

        for (const id of ids) {
            if (!id || !validIds.has(id) || used.has(id)) continue;
            used.add(id);
            const layer = draft.layers.find((candidate) => candidate.id === id);
            if (layer) sorted.push(layer);
        }

        for (const layer of draft.layers) {
            if (used.has(layer.id)) continue;
            sorted.push(layer);
        }

        draft.layers = sorted;
    });
}

function updateLayerMutable(draft, layerId, updater) {
    const id = typeof layerId === 'string' ? layerId.trim() : '';
    const layer = draft.layers.find((candidate) => candidate.id === id);
    if (!layer) return;
    updater(layer, draft);
}

export function setNoiseLayerBlendMode(state, layerId, blendMode) {
    return withStateMutation(state, (draft) => {
        updateLayerMutable(draft, layerId, (layer, inDraft) => {
            if (layer.lock) {
                pushWarning(inDraft.statusWarnings, `[NoiseFabrication] Layer "${layer.name}" is locked and cannot change blend mode.`);
                return;
            }
            layer.blendMode = sanitizeBlendMode(blendMode);
        });
    });
}

export function setNoiseLayerStrength(state, layerId, strength) {
    return withStateMutation(state, (draft) => {
        updateLayerMutable(draft, layerId, (layer, inDraft) => {
            if (layer.lock) {
                pushWarning(inDraft.statusWarnings, `[NoiseFabrication] Layer "${layer.name}" is locked and cannot change strength.`);
                return;
            }
            layer.strength = clampNumber(strength, 0.0, 1.0, layer.strength);
        });
    });
}

export function setNoiseLayerMapTarget(state, layerId, mapTarget) {
    return withStateMutation(state, (draft) => {
        updateLayerMutable(draft, layerId, (layer, inDraft) => {
            if (layer.lock) {
                pushWarning(inDraft.statusWarnings, `[NoiseFabrication] Layer "${layer.name}" is locked and cannot change map target.`);
                return;
            }
            layer.mapTarget = sanitizeLayerMapTarget(mapTarget, layer.mapTarget);
        });
    });
}

export function setNoiseLayerExecutionMode(state, layerId, mode) {
    return withStateMutation(state, (draft) => {
        updateLayerMutable(draft, layerId, (layer, inDraft) => {
            if (layer.lock) {
                pushWarning(inDraft.statusWarnings, `[NoiseFabrication] Layer "${layer.name}" is locked and cannot change execution mode.`);
                return;
            }
            const current = sanitizeNoiseExecutionConfig(layer.execution);
            layer.execution = {
                ...current,
                mode: sanitizeNoiseExecutionMode(mode, current.mode)
            };
        });
    });
}

export function setNoiseLayerExecutionManualPath(state, layerId, manualPath) {
    return withStateMutation(state, (draft) => {
        updateLayerMutable(draft, layerId, (layer, inDraft) => {
            if (layer.lock) {
                pushWarning(inDraft.statusWarnings, `[NoiseFabrication] Layer "${layer.name}" is locked and cannot change execution path override.`);
                return;
            }
            const current = sanitizeNoiseExecutionConfig(layer.execution);
            layer.execution = {
                ...current,
                mode: 'manual',
                manualPath: sanitizeNoiseExecutionPath(manualPath, current.manualPath)
            };
        });
    });
}

export function setNoiseLayerDynamicRuntime(state, layerId, dynamicRuntime) {
    return withStateMutation(state, (draft) => {
        updateLayerMutable(draft, layerId, (layer, inDraft) => {
            if (layer.lock) {
                pushWarning(inDraft.statusWarnings, `[NoiseFabrication] Layer "${layer.name}" is locked and cannot change dynamic-runtime flag.`);
                return;
            }
            const current = sanitizeNoiseExecutionConfig(layer.execution);
            layer.execution = {
                ...current,
                dynamicRuntime: dynamicRuntime === true
            };
        });
    });
}

export function setNoiseLayerLargeScaleWorld(state, layerId, largeScaleWorld) {
    return withStateMutation(state, (draft) => {
        updateLayerMutable(draft, layerId, (layer, inDraft) => {
            if (layer.lock) {
                pushWarning(inDraft.statusWarnings, `[NoiseFabrication] Layer "${layer.name}" is locked and cannot change large-scale/world usage flag.`);
                return;
            }
            const current = sanitizeNoiseExecutionConfig(layer.execution);
            layer.execution = {
                ...current,
                largeScaleWorld: largeScaleWorld === true
            };
        });
    });
}

export function setNoiseLayerTransform(state, layerId, patch) {
    return withStateMutation(state, (draft) => {
        updateLayerMutable(draft, layerId, (layer, inDraft) => {
            if (layer.lock) {
                pushWarning(inDraft.statusWarnings, `[NoiseFabrication] Layer "${layer.name}" is locked and cannot change transforms.`);
                return;
            }
            const merged = {
                ...(layer.transform && typeof layer.transform === 'object' ? layer.transform : {}),
                ...(patch && typeof patch === 'object' ? patch : {})
            };
            layer.transform = sanitizeLayerTransform(merged, inDraft.statusWarnings, layer.name);
        });
    });
}

export function setNoiseLayerPreset(state, layerId, presetId) {
    return withStateMutation(state, (draft) => {
        updateLayerMutable(draft, layerId, (layer, inDraft) => {
            if (layer.lock) {
                pushWarning(inDraft.statusWarnings, `[NoiseFabrication] Layer "${layer.name}" is locked and cannot apply presets.`);
                return;
            }
            const generator = getNoiseTextureGeneratorById(layer.generatorId);
            if (!generator) return;
            const preset = resolvePreset(generator, presetId);
            if (!preset) return;
            layer.params = applyGeneratorPresetToParams(generator.id, preset.id, layer.params);
            layer.presetId = preset.id;
        });
    });
}

export function setNoiseLayerParam(state, layerId, paramId, value) {
    return withStateMutation(state, (draft) => {
        updateLayerMutable(draft, layerId, (layer, inDraft) => {
            if (layer.lock) {
                pushWarning(inDraft.statusWarnings, `[NoiseFabrication] Layer "${layer.name}" is locked and cannot change parameters.`);
                return;
            }
            const generator = getNoiseTextureGeneratorById(layer.generatorId);
            if (!generator) return;
            const id = String(paramId ?? '').trim();
            if (!id) return;
            layer.params = generator.sanitizeParams({
                ...(layer.params && typeof layer.params === 'object' ? layer.params : {}),
                [id]: value
            });
            layer.presetId = null;
        });
    });
}

export function generateNoiseFieldFromState(state) {
    const sanitized = sanitizeNoiseFabricationState(state);
    const width = sanitized.textureSize;
    const height = sanitized.textureSize;
    const previewTarget = getPreviewTargetFromMode(sanitized.previewMode);
    const previewLayers = filterLayersForPreview(sanitized.layers, previewTarget);

    const warnings = [...sanitized.statusWarnings];
    if (!previewLayers.length) {
        pushWarning(warnings, `[NoiseFabrication] No ${previewTarget === 'normal' ? 'Normal' : 'Albedo'} layers are active for preview.`);
    }

    const field = composeLayerStack(width, height, previewLayers);

    return {
        width,
        height,
        field,
        generatorId: previewLayers[previewLayers.length - 1]?.generatorId ?? null,
        state: {
            ...sanitized,
            statusWarnings: warnings
        },
        evaluatedLayerIds: previewLayers.map((layer) => layer.id)
    };
}

export function buildNoiseFabricationExportScope(state) {
    const sanitized = sanitizeNoiseFabricationState(state);
    const executionPlan = buildNoiseExecutionPlan(sanitized.layers, { questions: sanitized.executionAssistantQuestions });
    const normalLayers = [];
    const albedoLayers = [];
    const ormAoLayers = [];
    const ormRoughnessLayers = [];
    const ormMetalnessLayers = [];

    for (const layer of sanitized.layers) {
        if (layer.mapTarget === 'normal') normalLayers.push(layer.id);
        else if (layer.mapTarget === 'albedo') albedoLayers.push(layer.id);
        else if (layer.mapTarget === 'orm_ao') ormAoLayers.push(layer.id);
        else if (layer.mapTarget === 'orm_roughness') ormRoughnessLayers.push(layer.id);
        else if (layer.mapTarget === 'orm_metalness') ormMetalnessLayers.push(layer.id);
    }

    return {
        normal: {
            enabled: sanitized.exportTargets.normal,
            layerIds: normalLayers
        },
        albedo: {
            enabled: sanitized.exportTargets.albedo,
            layerIds: albedoLayers
        },
        orm: {
            enabled: sanitized.exportTargets.orm,
            packing: {
                R: NOISE_FABRICATION_ORM_PACKING.R,
                G: NOISE_FABRICATION_ORM_PACKING.G,
                B: NOISE_FABRICATION_ORM_PACKING.B
            },
            channelLayerIds: {
                ao: ormAoLayers,
                roughness: ormRoughnessLayers,
                metalness: ormMetalnessLayers
            }
        },
        executionPlan: {
            questions: executionPlan.questions,
            summary: executionPlan.summary,
            layers: executionPlan.layers.map((entry) => ({
                layerId: entry.layerId,
                recommendedPath: entry.recommendedPath,
                finalPath: entry.finalPath,
                flags: entry.flags,
                scores: entry.scores
            }))
        },
        bakedMaps: {
            available: false,
            reason: 'Baked map export is unavailable in this AI scope; stack recipe JSON export only.'
        }
    };
}

export function validateNoiseFabricationExportScope(state) {
    const sanitized = sanitizeNoiseFabricationState(state);
    const scope = buildNoiseFabricationExportScope(sanitized);
    const errors = [];

    if (scope.normal.enabled && scope.normal.layerIds.length === 0) {
        errors.push('[NoiseFabrication] Normal export is enabled but no layers target Normal.');
    }
    if (scope.albedo.enabled && scope.albedo.layerIds.length === 0) {
        errors.push('[NoiseFabrication] Albedo export is enabled but no layers target Albedo.');
    }
    if (scope.orm.enabled) {
        if (scope.orm.channelLayerIds.ao.length === 0) {
            errors.push('[NoiseFabrication] ORM export requires at least one AO layer source (R channel).');
        }
        if (scope.orm.channelLayerIds.roughness.length === 0) {
            errors.push('[NoiseFabrication] ORM export requires at least one Roughness layer source (G channel).');
        }
        if (scope.orm.channelLayerIds.metalness.length === 0) {
            errors.push('[NoiseFabrication] ORM export requires at least one Metalness layer source (B channel).');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        scope,
        state: sanitized
    };
}

export function getLegacyCompatibleGeneratorParamsById(state) {
    const sanitized = sanitizeNoiseFabricationState(state);
    const out = sanitizeGeneratorParamsById({});
    for (const layer of sanitized.layers) {
        if (!out[layer.generatorId]) continue;
        out[layer.generatorId] = getNoiseTextureGeneratorById(layer.generatorId).sanitizeParams(layer.params);
    }
    return out;
}
