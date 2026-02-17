// src/graphics/gui/noise_fabrication/NoiseTextureGeneratorRegistry.js
// Registry-driven deterministic noise texture generators for the Noise fabrication tool.
// @ts-check

import { createValueNoise2DSampler, hashIntPairU32, hashStringToU32, sampleFbm2D } from '../../../app/core/noise/DeterministicNoise.js';

export const NOISE_FABRICATION_STATE_VERSION = 1;
export const NOISE_FABRICATION_TOOL_ID = 'noise_fabrication';
export const NOISE_FABRICATION_TEXTURE_SIZES = Object.freeze([128, 256, 512, 1024]);

const DEFAULT_GENERATOR_ID = 'value_fbm';
const DEFAULT_PREVIEW_MODE = 'texture';
const DEFAULT_BASE_COLOR = '#888888';
const DEFAULT_TEXTURE_SIZE = 512;

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

function sanitizeTextureSize(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return DEFAULT_TEXTURE_SIZE;
    if (NOISE_FABRICATION_TEXTURE_SIZES.includes(n)) return n;
    let closest = NOISE_FABRICATION_TEXTURE_SIZES[0];
    let bestDist = Math.abs(n - closest);
    for (let i = 1; i < NOISE_FABRICATION_TEXTURE_SIZES.length; i++) {
        const size = NOISE_FABRICATION_TEXTURE_SIZES[i];
        const dist = Math.abs(n - size);
        if (dist < bestDist) {
            closest = size;
            bestDist = dist;
        }
    }
    return closest;
}

function sanitizePreviewMode(value) {
    return value === 'normal' ? 'normal' : DEFAULT_PREVIEW_MODE;
}

const COMMON_CONTROLS = Object.freeze([
    Object.freeze({ id: 'seed', label: 'Seed', type: 'text' }),
    Object.freeze({ id: 'scale', label: 'Scale', type: 'range', min: 0.5, max: 64.0, step: 0.1, digits: 1 }),
    Object.freeze({ id: 'octaves', label: 'Octaves', type: 'range', min: 1, max: 8, step: 1, digits: 0 }),
    Object.freeze({ id: 'gain', label: 'Gain', type: 'range', min: 0.05, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'lacunarity', label: 'Lacunarity', type: 'range', min: 1.0, max: 4.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'bias', label: 'Bias', type: 'range', min: -1.0, max: 1.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'contrast', label: 'Contrast', type: 'range', min: 0.1, max: 3.0, step: 0.01, digits: 2 }),
    Object.freeze({ id: 'rotationDeg', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, digits: 0 }),
    Object.freeze({ id: 'invert', label: 'Invert', type: 'toggle' })
]);

const VALUE_FBM_DEFAULTS = Object.freeze({
    seed: 'noise-fabrication-v1',
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
    seed: 'noise-fabrication-ridged-v1',
    scale: 18.0,
    octaves: 5,
    gain: 0.58,
    lacunarity: 2.18,
    bias: -0.08,
    contrast: 1.45,
    rotationDeg: 0,
    invert: false
});

function sanitizeFbmParams(input, defaults) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        seed: normalizeText(src.seed, defaults.seed),
        scale: clampNumber(src.scale, 0.5, 64.0, defaults.scale),
        octaves: clampInt(src.octaves, 1, 8, defaults.octaves),
        gain: clampNumber(src.gain, 0.05, 1.0, defaults.gain),
        lacunarity: clampNumber(src.lacunarity, 1.0, 4.0, defaults.lacunarity),
        bias: clampNumber(src.bias, -1.0, 1.0, defaults.bias),
        contrast: clampNumber(src.contrast, 0.1, 3.0, defaults.contrast),
        rotationDeg: clampNumber(src.rotationDeg, -180, 180, defaults.rotationDeg),
        invert: src.invert === true
    };
}

function evalGeneratorSignal(value, kind) {
    const v = clamp01(value);
    if (kind === 'ridged_fbm') {
        return 1.0 - Math.abs(v * 2.0 - 1.0);
    }
    return v;
}

function generateFbmField({ width, height, params, kind }) {
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    const p = params && typeof params === 'object' ? params : VALUE_FBM_DEFAULTS;

    const seedU32 = hashStringToU32(p.seed);
    const sampler = createValueNoise2DSampler({
        hashU32: (ix, iy) => hashIntPairU32(ix, iy, seedU32),
        smoothing: 'quintic'
    });

    const out = new Float32Array(w * h);
    const rad = (Number(p.rotationDeg) || 0) * (Math.PI / 180);
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    let idx = 0;
    for (let y = 0; y < h; y++) {
        const v = (y + 0.5) / h - 0.5;
        for (let x = 0; x < w; x++) {
            const u = (x + 0.5) / w - 0.5;
            const rx = u * cosR - v * sinR;
            const ry = u * sinR + v * cosR;
            const sx = rx * p.scale;
            const sy = ry * p.scale;

            let value = sampleFbm2D(sx, sy, {
                noise2: sampler.sample,
                octaves: p.octaves,
                gain: p.gain,
                lacunarity: p.lacunarity,
                maxOctaves: 8
            });
            value = evalGeneratorSignal(value, kind);
            if (p.invert) value = 1.0 - value;
            value = 0.5 + (value - 0.5) * p.contrast + p.bias;
            out[idx++] = clamp01(value);
        }
    }

    return out;
}

const GENERATORS = Object.freeze([
    Object.freeze({
        id: 'value_fbm',
        label: 'Value fBm',
        description: 'Classic smooth layered value noise.',
        controls: COMMON_CONTROLS,
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
        controls: COMMON_CONTROLS,
        defaultParams: RIDGED_FBM_DEFAULTS,
        defaultPresetId: 'cracked',
        presets: Object.freeze([
            Object.freeze({ id: 'cracked', label: 'Cracked', params: {} }),
            Object.freeze({ id: 'dunes', label: 'Dunes', params: { scale: 11.0, octaves: 4, gain: 0.7, lacunarity: 1.7, contrast: 1.12, bias: -0.22 } }),
            Object.freeze({ id: 'veins', label: 'Veins', params: { scale: 26.0, octaves: 6, gain: 0.48, lacunarity: 2.4, contrast: 1.85, bias: -0.1 } })
        ]),
        sanitizeParams: (input) => sanitizeFbmParams(input, RIDGED_FBM_DEFAULTS),
        generateField: ({ width, height, params }) => generateFbmField({ width, height, params, kind: 'ridged_fbm' })
    })
]);

const GENERATOR_BY_ID = new Map(GENERATORS.map((g) => [g.id, g]));

function resolveGeneratorId(id) {
    const raw = typeof id === 'string' ? id.trim().toLowerCase() : '';
    return GENERATOR_BY_ID.has(raw) ? raw : DEFAULT_GENERATOR_ID;
}

function resolvePreset(generator, presetId) {
    const g = generator && typeof generator === 'object' ? generator : GENERATOR_BY_ID.get(DEFAULT_GENERATOR_ID);
    const pid = typeof presetId === 'string' ? presetId.trim().toLowerCase() : '';
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

export function listNoiseTextureGenerators() {
    return GENERATORS;
}

export function getNoiseTextureGeneratorById(id) {
    const key = resolveGeneratorId(id);
    return GENERATOR_BY_ID.get(key) ?? GENERATOR_BY_ID.get(DEFAULT_GENERATOR_ID) ?? null;
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
    const generatorId = DEFAULT_GENERATOR_ID;
    const generator = getNoiseTextureGeneratorById(generatorId);
    const paramsById = sanitizeGeneratorParamsById({});
    const preset = resolvePreset(generator, generator?.defaultPresetId ?? '');
    return {
        version: NOISE_FABRICATION_STATE_VERSION,
        tool: NOISE_FABRICATION_TOOL_ID,
        generatorId,
        previewMode: DEFAULT_PREVIEW_MODE,
        baseColor: DEFAULT_BASE_COLOR,
        textureSize: DEFAULT_TEXTURE_SIZE,
        activePresetId: preset?.id ?? null,
        generatorParamsById: paramsById
    };
}

export function sanitizeNoiseFabricationState(input) {
    const defaults = getNoiseFabricationDefaultState();
    const src = input && typeof input === 'object' ? input : {};
    const generatorId = resolveGeneratorId(src.generatorId ?? defaults.generatorId);
    const generator = getNoiseTextureGeneratorById(generatorId);
    const generatorParamsById = sanitizeGeneratorParamsById(src.generatorParamsById);
    const activePreset = resolvePreset(generator, src.activePresetId);
    return {
        version: NOISE_FABRICATION_STATE_VERSION,
        tool: NOISE_FABRICATION_TOOL_ID,
        generatorId,
        previewMode: sanitizePreviewMode(src.previewMode ?? defaults.previewMode),
        baseColor: normalizeHexColor(src.baseColor ?? defaults.baseColor, defaults.baseColor),
        textureSize: sanitizeTextureSize(src.textureSize ?? defaults.textureSize),
        activePresetId: activePreset?.id ?? null,
        generatorParamsById
    };
}

export function generateNoiseFieldFromState(state) {
    const sanitized = sanitizeNoiseFabricationState(state);
    const generator = getNoiseTextureGeneratorById(sanitized.generatorId);
    if (!generator) throw new Error('[NoiseTextureGeneratorRegistry] Missing generator.');

    const width = sanitized.textureSize;
    const height = sanitized.textureSize;
    const params = generator.sanitizeParams(sanitized.generatorParamsById?.[generator.id]);
    const field = generator.generateField({ width, height, params });

    return {
        width,
        height,
        field,
        generatorId: generator.id,
        params,
        state: {
            ...sanitized,
            generatorParamsById: {
                ...sanitized.generatorParamsById,
                [generator.id]: params
            }
        }
    };
}
