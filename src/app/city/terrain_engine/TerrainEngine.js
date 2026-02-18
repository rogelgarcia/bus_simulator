// src/app/city/terrain_engine/TerrainEngine.js
// Deterministic patch-based biome + humidity sampler (renderer-agnostic).
// @ts-check

import { createValueNoise2DSampler, hashIntPairU32, hashStringToU32, mixU32, sampleFbm2D, u32ToUnitFloat01 } from '../../core/noise/DeterministicNoise.js';

const EPS = 1e-6;

export const TERRAIN_BIOME_ID = Object.freeze({
    STONE: 'stone',
    GRASS: 'grass',
    LAND: 'land'
});

export const TERRAIN_BIOME_INDEX = Object.freeze({
    [TERRAIN_BIOME_ID.STONE]: 0,
    [TERRAIN_BIOME_ID.GRASS]: 1,
    [TERRAIN_BIOME_ID.LAND]: 2
});

const TERRAIN_BIOME_BY_INDEX = Object.freeze([
    TERRAIN_BIOME_ID.STONE,
    TERRAIN_BIOME_ID.GRASS,
    TERRAIN_BIOME_ID.LAND
]);

const TERRAIN_TRANSITION_INTENT_ID = Object.freeze({
    SOFT: 'soft',
    MEDIUM: 'medium',
    HARD: 'hard'
});

const TERRAIN_TRANSITION_INTENT_PRESETS = Object.freeze({
    [TERRAIN_TRANSITION_INTENT_ID.SOFT]: Object.freeze({
        widthScale: 1.45,
        falloffPower: 0.85,
        edgeNoiseScale: 0.02,
        edgeNoiseStrength: 0.42,
        dominanceBias: 0.0,
        heightInfluence: 0.28,
        contrast: 0.82
    }),
    [TERRAIN_TRANSITION_INTENT_ID.MEDIUM]: Object.freeze({
        widthScale: 1.0,
        falloffPower: 1.0,
        edgeNoiseScale: 0.02,
        edgeNoiseStrength: 0.22,
        dominanceBias: 0.0,
        heightInfluence: 0.0,
        contrast: 1.0
    }),
    [TERRAIN_TRANSITION_INTENT_ID.HARD]: Object.freeze({
        widthScale: 0.65,
        falloffPower: 1.45,
        edgeNoiseScale: 0.02,
        edgeNoiseStrength: 0.08,
        dominanceBias: 0.0,
        heightInfluence: -0.12,
        contrast: 1.45
    })
});

const TERRAIN_TRANSITION_PROFILE_DEFAULTS = Object.freeze({
    intent: TERRAIN_TRANSITION_INTENT_ID.MEDIUM,
    ...TERRAIN_TRANSITION_INTENT_PRESETS[TERRAIN_TRANSITION_INTENT_ID.MEDIUM]
});

/**
 * @typedef {object} TerrainBounds
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minZ
 * @property {number} maxZ
 */

/**
 * @typedef {object} TerrainEnginePatchConfig
 * @property {number} sizeMeters
 * @property {number} originX
 * @property {number} originZ
 * @property {'grid'|'voronoi'} layout
 * @property {number} voronoiJitter
 * @property {number} warpScale
 * @property {number} warpAmplitudeMeters
 */

/**
 * @typedef {object} TerrainEngineBiomesConfig
 * @property {'patch_grid'|'source_map'} mode
 * @property {string} defaultBiomeId
 * @property {{ stone: number, grass: number, land: number }} weights
 */

/**
 * @typedef {object} TerrainEngineHumidityConfig
 * @property {'noise'|'source_map'} mode
 * @property {number} noiseScale
 * @property {number} octaves
 * @property {number} gain
 * @property {number} lacunarity
 * @property {number} bias
 * @property {number} amplitude
 */

/**
 * @typedef {object} TerrainEngineTransitionConfig
 * @property {number} cameraBlendRadiusMeters
 * @property {number} cameraBlendFeatherMeters
 * @property {number} boundaryBandMeters
 * @property {TerrainEngineTransitionPairProfile} profileDefaults
 * @property {Record<string, TerrainEngineTransitionPairProfile>} pairProfiles
 */

/**
 * @typedef {object} TerrainEngineTransitionPairProfile
 * @property {'soft'|'medium'|'hard'} intent
 * @property {number} widthScale
 * @property {number} falloffPower
 * @property {number} edgeNoiseScale
 * @property {number} edgeNoiseStrength
 * @property {number} dominanceBias
 * @property {number} heightInfluence
 * @property {number} contrast
 */

/**
 * @typedef {object} TerrainEngineConfig
 * @property {1} version
 * @property {string} seed
 * @property {TerrainBounds} bounds
 * @property {TerrainEnginePatchConfig} patch
 * @property {TerrainEngineBiomesConfig} biomes
 * @property {TerrainEngineHumidityConfig} humidity
 * @property {TerrainEngineTransitionConfig} transition
 */

/**
 * @typedef {object} TerrainEngineSourceMap
 * @property {number} width
 * @property {number} height
 * @property {Uint8Array} data
 * @property {TerrainBounds} bounds
 */

/**
 * @typedef {object} TerrainEngineSourceMaps
 * @property {TerrainEngineSourceMap|null} biome
 * @property {TerrainEngineSourceMap|null} humidity
 */

/**
 * @typedef {object} TerrainEngineSample
 * @property {number} patchId
 * @property {string} primaryBiomeId
 * @property {string} secondaryBiomeId
 * @property {number} biomeBlend
 * @property {number} humidity
 * @property {number} edgeDistanceMeters
 * @property {{
 *   active: boolean,
 *   cameraAlpha: number,
 *   pairKey: string,
 *   intent: 'soft'|'medium'|'hard',
 *   widthScale: number,
 *   falloffPower: number,
 *   edgeNoiseStrength: number,
 *   dominanceBias: number,
 *   heightInfluence: number,
 *   contrast: number,
 *   rawWeight: number,
 *   falloffWeight: number,
 *   dominanceWeight: number,
 *   finalWeight: number,
 *   noiseOffsetMeters: number
 * }} transition
 */

function clamp(value, min, max, fallback = min) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function clamp01(value) {
    return clamp(value, 0.0, 1.0, 0.0);
}

function isFiniteBounds(bounds) {
    return !!bounds
        && Number.isFinite(bounds.minX)
        && Number.isFinite(bounds.maxX)
        && Number.isFinite(bounds.minZ)
        && Number.isFinite(bounds.maxZ)
        && bounds.maxX > bounds.minX
        && bounds.maxZ > bounds.minZ;
}

function smoothstep(edge0, edge1, x) {
    const a = Number(edge0);
    const b = Number(edge1);
    const xx = Number(x);
    if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(xx))) return 0;
    const denom = b - a;
    if (Math.abs(denom) < EPS) return xx >= b ? 1 : 0;
    const t = clamp((xx - a) / denom, 0, 1, 0);
    return t * t * (3 - 2 * t);
}

function hash2i(x, z, seedU32) {
    return hashIntPairU32(x, z, seedU32);
}

function normalizeBiomeId(value, fallback) {
    const id = String(value ?? '').trim();
    if (id === TERRAIN_BIOME_ID.STONE || id === TERRAIN_BIOME_ID.GRASS || id === TERRAIN_BIOME_ID.LAND) return id;
    return String(fallback ?? TERRAIN_BIOME_ID.LAND);
}

function getBiomeSortIndex(id) {
    const biomeId = normalizeBiomeId(id, TERRAIN_BIOME_ID.LAND);
    if (biomeId === TERRAIN_BIOME_ID.STONE) return 0;
    if (biomeId === TERRAIN_BIOME_ID.GRASS) return 1;
    if (biomeId === TERRAIN_BIOME_ID.LAND) return 2;
    return 3;
}

function makeBiomePairKey(a, b) {
    const aId = normalizeBiomeId(a, TERRAIN_BIOME_ID.LAND);
    const bId = normalizeBiomeId(b, aId);
    if (aId === bId) return `${aId}|${aId}`;
    if (getBiomeSortIndex(aId) <= getBiomeSortIndex(bId)) return `${aId}|${bId}`;
    return `${bId}|${aId}`;
}

function normalizeTransitionIntent(value, fallback = TERRAIN_TRANSITION_INTENT_ID.MEDIUM) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === TERRAIN_TRANSITION_INTENT_ID.SOFT || raw === TERRAIN_TRANSITION_INTENT_ID.MEDIUM || raw === TERRAIN_TRANSITION_INTENT_ID.HARD) return raw;
    const fb = String(fallback ?? '').trim().toLowerCase();
    if (fb === TERRAIN_TRANSITION_INTENT_ID.SOFT || fb === TERRAIN_TRANSITION_INTENT_ID.HARD) return fb;
    return TERRAIN_TRANSITION_INTENT_ID.MEDIUM;
}

function getTransitionIntentPreset(intentId) {
    const intent = normalizeTransitionIntent(intentId, TERRAIN_TRANSITION_INTENT_ID.MEDIUM);
    return TERRAIN_TRANSITION_INTENT_PRESETS[intent] ?? TERRAIN_TRANSITION_INTENT_PRESETS[TERRAIN_TRANSITION_INTENT_ID.MEDIUM];
}

function normalizeTransitionPairProfile(src, { fallbackProfile = null, defaultIntent = TERRAIN_TRANSITION_INTENT_ID.MEDIUM } = {}) {
    const inProfile = src && typeof src === 'object' ? src : {};
    const fallback = fallbackProfile && typeof fallbackProfile === 'object' ? fallbackProfile : TERRAIN_TRANSITION_PROFILE_DEFAULTS;
    const intent = normalizeTransitionIntent(inProfile.intent, fallback.intent ?? defaultIntent);
    const preset = getTransitionIntentPreset(intent);
    return {
        intent,
        widthScale: clamp(inProfile.widthScale, 0.25, 4.0, preset.widthScale ?? fallback.widthScale ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS.widthScale),
        falloffPower: clamp(inProfile.falloffPower, 0.3, 3.5, preset.falloffPower ?? fallback.falloffPower ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS.falloffPower),
        edgeNoiseScale: clamp(inProfile.edgeNoiseScale, 0.0005, 0.2, preset.edgeNoiseScale ?? fallback.edgeNoiseScale ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS.edgeNoiseScale),
        edgeNoiseStrength: clamp(inProfile.edgeNoiseStrength, 0.0, 1.0, preset.edgeNoiseStrength ?? fallback.edgeNoiseStrength ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS.edgeNoiseStrength),
        dominanceBias: clamp(inProfile.dominanceBias, -0.5, 0.5, preset.dominanceBias ?? fallback.dominanceBias ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS.dominanceBias),
        heightInfluence: clamp(inProfile.heightInfluence, -1.0, 1.0, preset.heightInfluence ?? fallback.heightInfluence ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS.heightInfluence),
        contrast: clamp(inProfile.contrast, 0.25, 3.0, preset.contrast ?? fallback.contrast ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS.contrast)
    };
}

function sanitizeTransitionPairProfiles(src, defaultProfile) {
    const out = {};
    const source = src && typeof src === 'object' ? src : {};
    for (const [rawKey, rawProfile] of Object.entries(source)) {
        const key = String(rawKey ?? '').trim();
        if (!key) continue;
        const parts = key.split('|');
        if (parts.length !== 2) continue;
        const pairKey = makeBiomePairKey(parts[0], parts[1]);
        out[pairKey] = normalizeTransitionPairProfile(rawProfile, { fallbackProfile: defaultProfile, defaultIntent: defaultProfile?.intent });
    }
    return out;
}

function normalizeWeights(src) {
    const s = src && typeof src === 'object' ? src : {};
    const stone = Math.max(0, Number(s.stone) || 0);
    const grass = Math.max(0, Number(s.grass) || 0);
    const land = Math.max(0, Number(s.land) || 0);
    const sum = stone + grass + land;
    if (!(sum > EPS)) return { stone: 0.25, grass: 0.35, land: 0.40 };
    return { stone: stone / sum, grass: grass / sum, land: land / sum };
}

function pickWeightedBiome01(u, weights) {
    const x = clamp01(u);
    const a = weights.stone;
    const b = a + weights.grass;
    if (x < a) return TERRAIN_BIOME_ID.STONE;
    if (x < b) return TERRAIN_BIOME_ID.GRASS;
    return TERRAIN_BIOME_ID.LAND;
}

function sanitizeSourceMap(input) {
    const src = input && typeof input === 'object' ? input : null;
    if (!src) return null;
    const width = Math.max(1, Math.round(Number(src.width) || 0));
    const height = Math.max(1, Math.round(Number(src.height) || 0));
    const data = src.data instanceof Uint8Array ? src.data : null;
    const bounds = src.bounds && typeof src.bounds === 'object' ? src.bounds : null;
    if (!data) return null;
    if (data.length < width * height) return null;
    if (!isFiniteBounds(bounds)) return null;
    return { width, height, data, bounds };
}

function sampleSourceMapNearest(map, x, z) {
    if (!map) return 0;
    const b = map.bounds;
    const u = clamp((x - b.minX) / (b.maxX - b.minX), 0, 1, 0);
    const v = clamp((z - b.minZ) / (b.maxZ - b.minZ), 0, 1, 0);
    const ix = Math.max(0, Math.min(map.width - 1, Math.floor(u * map.width)));
    const iz = Math.max(0, Math.min(map.height - 1, Math.floor(v * map.height)));
    return map.data[iz * map.width + ix] | 0;
}

function sampleSourceMapBilinear01(map, x, z) {
    if (!map) return 0.5;
    const b = map.bounds;
    const u = clamp((x - b.minX) / (b.maxX - b.minX), 0, 1, 0);
    const v = clamp((z - b.minZ) / (b.maxZ - b.minZ), 0, 1, 0);
    const gx = u * (map.width - 1);
    const gz = v * (map.height - 1);
    const x0 = Math.max(0, Math.min(map.width - 1, Math.floor(gx)));
    const z0 = Math.max(0, Math.min(map.height - 1, Math.floor(gz)));
    const x1 = Math.max(0, Math.min(map.width - 1, x0 + 1));
    const z1 = Math.max(0, Math.min(map.height - 1, z0 + 1));
    const fx = gx - x0;
    const fz = gz - z0;
    const idx00 = z0 * map.width + x0;
    const idx10 = z0 * map.width + x1;
    const idx01 = z1 * map.width + x0;
    const idx11 = z1 * map.width + x1;
    const v00 = (map.data[idx00] | 0) / 255;
    const v10 = (map.data[idx10] | 0) / 255;
    const v01 = (map.data[idx01] | 0) / 255;
    const v11 = (map.data[idx11] | 0) / 255;
    const a = v00 + (v10 - v00) * fx;
    const b0 = v01 + (v11 - v01) * fx;
    return a + (b0 - a) * fz;
}

export function sanitizeTerrainEngineConfig(input) {
    const src = input && typeof input === 'object' ? input : {};

    const boundsSrc = src.bounds && typeof src.bounds === 'object' ? src.bounds : {};
    const bounds = {
        minX: Number(boundsSrc.minX) || -120,
        maxX: Number(boundsSrc.maxX) || 120,
        minZ: Number(boundsSrc.minZ) || -240,
        maxZ: Number(boundsSrc.maxZ) || 240
    };
    if (!isFiniteBounds(bounds)) throw new Error('[TerrainEngine] Invalid bounds (expected finite min/max and max > min).');

    const patchSrc = src.patch && typeof src.patch === 'object' ? src.patch : {};
    const patchLayout = patchSrc.layout === 'voronoi' ? 'voronoi' : 'grid';
    const patch = {
        sizeMeters: Math.max(0.01, Number(patchSrc.sizeMeters) || 72),
        originX: Number.isFinite(patchSrc.originX) ? Number(patchSrc.originX) : 0,
        originZ: Number.isFinite(patchSrc.originZ) ? Number(patchSrc.originZ) : 0,
        layout: patchLayout,
        voronoiJitter: clamp(patchSrc.voronoiJitter, 0.0, 1.0, 0.85),
        warpScale: clamp(patchSrc.warpScale, 0.000001, 10.0, 0.01),
        warpAmplitudeMeters: Math.max(0, Number(patchSrc.warpAmplitudeMeters) || 0)
    };

    const biomesSrc = src.biomes && typeof src.biomes === 'object' ? src.biomes : {};
    const biomes = {
        mode: biomesSrc.mode === 'source_map' ? 'source_map' : 'patch_grid',
        defaultBiomeId: normalizeBiomeId(biomesSrc.defaultBiomeId, TERRAIN_BIOME_ID.LAND),
        weights: normalizeWeights(biomesSrc.weights)
    };

    const humiditySrc = src.humidity && typeof src.humidity === 'object' ? src.humidity : {};
    const humidity = {
        mode: humiditySrc.mode === 'source_map' ? 'source_map' : 'noise',
        noiseScale: clamp(humiditySrc.noiseScale, 0.000001, 10.0, 0.01),
        octaves: Math.max(1, Math.min(8, Math.round(Number(humiditySrc.octaves) || 4))),
        gain: clamp(humiditySrc.gain, 0.01, 1.0, 0.5),
        lacunarity: clamp(humiditySrc.lacunarity, 1.0, 4.0, 2.0),
        bias: clamp(humiditySrc.bias, -1.0, 1.0, 0.0),
        amplitude: clamp(humiditySrc.amplitude, 0.0, 1.0, 1.0)
    };

    const transSrc = src.transition && typeof src.transition === 'object' ? src.transition : {};
    const profileDefaultsSrc = transSrc.profileDefaults && typeof transSrc.profileDefaults === 'object' ? transSrc.profileDefaults : transSrc;
    const profileDefaults = normalizeTransitionPairProfile(profileDefaultsSrc, {
        fallbackProfile: TERRAIN_TRANSITION_PROFILE_DEFAULTS,
        defaultIntent: TERRAIN_TRANSITION_PROFILE_DEFAULTS.intent
    });
    const pairProfiles = sanitizeTransitionPairProfiles(transSrc.pairProfiles, profileDefaults);
    const transition = {
        cameraBlendRadiusMeters: Math.max(0, Number(transSrc.cameraBlendRadiusMeters) || 140),
        cameraBlendFeatherMeters: Math.max(0, Number(transSrc.cameraBlendFeatherMeters) || 24),
        boundaryBandMeters: Math.max(0, Number(transSrc.boundaryBandMeters) || 10),
        profileDefaults,
        pairProfiles
    };

    const seed = typeof src.seed === 'string' && src.seed.trim() ? src.seed.trim() : 'terrain-v1';

    return {
        version: 1,
        seed,
        bounds,
        patch,
        biomes,
        humidity,
        transition
    };
}

function freezeConfig(cfg) {
    const bounds = Object.freeze({ ...cfg.bounds });
    const patch = Object.freeze({ ...cfg.patch });
    const weights = Object.freeze({ ...cfg.biomes.weights });
    const biomes = Object.freeze({ ...cfg.biomes, weights });
    const humidity = Object.freeze({ ...cfg.humidity });
    const transitionDefaults = Object.freeze({
        ...(cfg.transition?.profileDefaults ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS)
    });
    const transitionProfilesSrc = cfg.transition?.pairProfiles && typeof cfg.transition.pairProfiles === 'object'
        ? cfg.transition.pairProfiles
        : {};
    const transitionProfiles = {};
    for (const [key, value] of Object.entries(transitionProfilesSrc)) {
        transitionProfiles[key] = Object.freeze({ ...(value ?? {}) });
    }
    const transition = Object.freeze({
        ...cfg.transition,
        profileDefaults: transitionDefaults,
        pairProfiles: Object.freeze(transitionProfiles)
    });
    return Object.freeze({
        ...cfg,
        bounds,
        patch,
        biomes,
        humidity,
        transition
    });
}

export function createTerrainEngine(initialConfig) {
    let config = freezeConfig(sanitizeTerrainEngineConfig(initialConfig));
    let seedU32 = hashStringToU32(config.seed);
    const valueNoiseSamplerBySeed = new Map();
    const pairSeedByKey = new Map();
    /** @type {TerrainEngineSourceMaps} */
    let sourceMaps = { biome: null, humidity: null };

    let viewX = 0;
    let viewZ = 0;

    const setConfig = (nextConfig) => {
        config = freezeConfig(sanitizeTerrainEngineConfig(nextConfig));
        seedU32 = hashStringToU32(config.seed);
        valueNoiseSamplerBySeed.clear();
        pairSeedByKey.clear();
    };

    const getValueNoise2Sampler = (seed) => {
        const key = seed >>> 0;
        let sampler = valueNoiseSamplerBySeed.get(key);
        if (sampler) return sampler;
        sampler = createValueNoise2DSampler({
            hashU32: (ix, iz) => hash2i(ix, iz, key),
            smoothing: 'hermite'
        });
        valueNoiseSamplerBySeed.set(key, sampler);
        return sampler;
    };

    const sampleSeededFbm = (x, z, { seed, octaves, gain, lacunarity }) => {
        const sampler = getValueNoise2Sampler(seed);
        return sampleFbm2D(x, z, {
            noise2: sampler.sample,
            octaves,
            gain,
            lacunarity,
            maxOctaves: 8
        });
    };

    const getConfig = () => config;

    const setViewOrigin = ({ x, z } = {}) => {
        viewX = Number(x) || 0;
        viewZ = Number(z) || 0;
    };

    const setSourceMaps = ({ biome, humidity } = {}) => {
        sourceMaps = {
            biome: sanitizeSourceMap(biome),
            humidity: sanitizeSourceMap(humidity)
        };
    };

    const getPatchCoord = (x, origin, size) => Math.floor((x - origin) / size);

    const getPatchId = (keyX, keyZ) => hash2i(keyX, keyZ, seedU32);

    const getPairSeed = (pairKey) => {
        const key = String(pairKey ?? '');
        let seed = pairSeedByKey.get(key);
        if (seed !== undefined) return seed;
        seed = hashStringToU32(key) >>> 0;
        pairSeedByKey.set(key, seed);
        return seed;
    };

    const getTransitionPairProfile = (primaryBiomeId, secondaryBiomeId) => {
        const pairKey = makeBiomePairKey(primaryBiomeId, secondaryBiomeId);
        const transitionCfg = config.transition ?? {};
        const defaults = transitionCfg.profileDefaults ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS;
        const profile = transitionCfg.pairProfiles?.[pairKey] ?? defaults;
        return { pairKey, profile, defaults };
    };

    const sampleTransitionEdgeNoise = (x, z, pairKey, noiseScale) => {
        const scale = clamp(noiseScale, 0.0005, 0.2, TERRAIN_TRANSITION_PROFILE_DEFAULTS.edgeNoiseScale);
        const noiseSeed = (seedU32 ^ getPairSeed(pairKey) ^ 0x4f1bbcdc) >>> 0;
        const noise = sampleSeededFbm(x * scale, z * scale, {
            seed: noiseSeed,
            octaves: 3,
            gain: 0.5,
            lacunarity: 2.0
        });
        return clamp((noise - 0.5) * 2.0, -1.0, 1.0, 0.0);
    };

    const shapeTransitionWeight = ({
        rawWeight,
        humidity,
        pairKey,
        profile,
        secondaryBiomeId
    } = {}) => {
        const p = profile && typeof profile === 'object'
            ? profile
            : TERRAIN_TRANSITION_PROFILE_DEFAULTS;
        const pairParts = String(pairKey ?? '').split('|');
        const preferredBiome = normalizeBiomeId(pairParts[1], normalizeBiomeId(secondaryBiomeId, TERRAIN_BIOME_ID.LAND));
        const secondary = normalizeBiomeId(secondaryBiomeId, preferredBiome);
        const dominanceSign = secondary === preferredBiome ? 1 : -1;
        const base = clamp01(rawWeight);
        const centered = clamp(base * 2.0 - 1.0, -1.0, 1.0, 0.0);
        const centeredAbs = Math.abs(centered);
        const falloffPower = Math.max(0.001, Number(p.falloffPower) || 1.0);
        const falloffCentered = Math.sign(centered) * Math.pow(centeredAbs, falloffPower);
        const falloffWeight = clamp01(falloffCentered * 0.5 + 0.5);
        const humidityCentered = (clamp01(humidity) - 0.5) * 2.0;
        const dominanceBias = clamp(p.dominanceBias, -0.5, 0.5, 0.0) * dominanceSign;
        const heightBias = clamp(p.heightInfluence, -1.0, 1.0, 0.0) * humidityCentered * 0.35 * dominanceSign;
        const dominanceWeight = clamp01(falloffWeight + (dominanceBias + heightBias) * centeredAbs);
        const contrast = clamp(p.contrast, 0.25, 3.0, 1.0);
        const finalWeight = clamp01((dominanceWeight - 0.5) * contrast + 0.5);
        return {
            falloffWeight,
            dominanceWeight,
            finalWeight
        };
    };

    const getGridPatchCenterWorld = (px, pz) => {
        const size = config.patch.sizeMeters;
        const x = config.patch.originX + (px + 0.5) * size;
        const z = config.patch.originZ + (pz + 0.5) * size;
        return { x, z };
    };

    const getVoronoiSeedWorld = (cx, cz) => {
        const size = config.patch.sizeMeters;
        const ox = config.patch.originX;
        const oz = config.patch.originZ;
        const jitter = clamp(config.patch.voronoiJitter, 0.0, 1.0, 0.85);
        const h = hash2i(cx, cz, seedU32 ^ 0xa2c2a3b1);
        const u0 = u32ToUnitFloat01(h);
        const u1 = u32ToUnitFloat01(mixU32(h ^ 0x68bc21eb));
        const jx = 0.5 + (u0 - 0.5) * jitter;
        const jz = 0.5 + (u1 - 0.5) * jitter;
        const x = ox + (cx + jx) * size;
        const z = oz + (cz + jz) * size;
        return { x, z };
    };

    const sampleVoronoiPatches = (x, z) => {
        const size = config.patch.sizeMeters;
        const ox = config.patch.originX;
        const oz = config.patch.originZ;

        let wx = x;
        let wz = z;
        const warpAmp = Math.max(0, Number(config.patch.warpAmplitudeMeters) || 0);
        if (warpAmp > EPS) {
            const scale = clamp(config.patch.warpScale, 0.000001, 10.0, 0.01);
            const w0 = sampleSeededFbm(x * scale, z * scale, {
                seed: seedU32 ^ 0x2d8b6c1f,
                octaves: 3,
                gain: 0.5,
                lacunarity: 2.0
            });
            const w1 = sampleSeededFbm((x + 37.2) * scale, (z - 19.7) * scale, {
                seed: seedU32 ^ 0x8f6a0e3b,
                octaves: 3,
                gain: 0.5,
                lacunarity: 2.0
            });
            wx = x + (w0 - 0.5) * 2.0 * warpAmp;
            wz = z + (w1 - 0.5) * 2.0 * warpAmp;
        }
        const baseCx = getPatchCoord(wx, ox, size);
        const baseCz = getPatchCoord(wz, oz, size);

        let bestDist2 = Infinity;
        let bestCx = baseCx;
        let bestCz = baseCz;
        let bestSeedX = 0;
        let bestSeedZ = 0;

        let secondDist2 = Infinity;
        let secondCx = baseCx;
        let secondCz = baseCz;
        let secondSeedX = 0;
        let secondSeedZ = 0;

        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const cx = baseCx + dx;
                const cz = baseCz + dz;
                const seed = getVoronoiSeedWorld(cx, cz);
                const ddx = wx - seed.x;
                const ddz = wz - seed.z;
                const dist2 = ddx * ddx + ddz * ddz;

                if (dist2 < bestDist2) {
                    secondDist2 = bestDist2;
                    secondCx = bestCx;
                    secondCz = bestCz;
                    secondSeedX = bestSeedX;
                    secondSeedZ = bestSeedZ;

                    bestDist2 = dist2;
                    bestCx = cx;
                    bestCz = cz;
                    bestSeedX = seed.x;
                    bestSeedZ = seed.z;
                } else if (dist2 < secondDist2) {
                    secondDist2 = dist2;
                    secondCx = cx;
                    secondCz = cz;
                    secondSeedX = seed.x;
                    secondSeedZ = seed.z;
                }
            }
        }

        const d0 = Math.sqrt(bestDist2);
        const d1 = Math.sqrt(secondDist2);
        const edgeDistanceMeters = Math.max(0, (d1 - d0) * 0.5);

        return {
            primary: { cx: bestCx, cz: bestCz, seedX: bestSeedX, seedZ: bestSeedZ },
            secondary: { cx: secondCx, cz: secondCz, seedX: secondSeedX, seedZ: secondSeedZ },
            edgeDistanceMeters
        };
    };

    const getPatchBiomeId = ({ keyX, keyZ, centerX, centerZ } = {}) => {
        const mode = config.biomes.mode;
        if (mode === 'source_map' && sourceMaps.biome) {
            const cx = Number(centerX) || 0;
            const cz = Number(centerZ) || 0;
            const idx = sampleSourceMapNearest(sourceMaps.biome, cx, cz);
            return TERRAIN_BIOME_BY_INDEX[Math.max(0, Math.min(2, idx | 0))] ?? config.biomes.defaultBiomeId;
        }

        const h = getPatchId(keyX | 0, keyZ | 0);
        const u = u32ToUnitFloat01(h);
        return pickWeightedBiome01(u, config.biomes.weights);
    };

    const getHumidity01 = (x, z) => {
        const hCfg = config.humidity;
        if (hCfg.mode === 'source_map' && sourceMaps.humidity) {
            return clamp01(sampleSourceMapBilinear01(sourceMaps.humidity, x, z));
        }

        const v = sampleSeededFbm(x * hCfg.noiseScale, z * hCfg.noiseScale, {
            seed: seedU32 ^ 0x3c6ef372,
            octaves: hCfg.octaves,
            gain: hCfg.gain,
            lacunarity: hCfg.lacunarity
        });
        // Center on 0.5 baseline, scale by amplitude, then bias.
        return clamp01(0.5 + (v - 0.5) * hCfg.amplitude + hCfg.bias);
    };

    const sample = (x, z, { viewOrigin = null } = {}) => {
        const bounds = config.bounds;
        const xx = Number(x);
        const zz = Number(z);
        if (!(Number.isFinite(xx) && Number.isFinite(zz))) throw new Error('[TerrainEngine] sample(x,z) expected finite numbers.');

        if (xx < bounds.minX || xx > bounds.maxX || zz < bounds.minZ || zz > bounds.maxZ) {
            const d = config.biomes.defaultBiomeId;
            const pairKey = makeBiomePairKey(d, d);
            const profile = config.transition?.profileDefaults ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS;
            return {
                patchId: 0,
                primaryBiomeId: d,
                secondaryBiomeId: d,
                biomeBlend: 0.0,
                humidity: 0.5,
                edgeDistanceMeters: 0.0,
                transition: {
                    active: false,
                    cameraAlpha: 0.0,
                    pairKey,
                    intent: normalizeTransitionIntent(profile.intent, TERRAIN_TRANSITION_INTENT_ID.MEDIUM),
                    widthScale: Number(profile.widthScale) || 1.0,
                    falloffPower: Number(profile.falloffPower) || 1.0,
                    edgeNoiseStrength: Number(profile.edgeNoiseStrength) || 0.0,
                    dominanceBias: Number(profile.dominanceBias) || 0.0,
                    heightInfluence: Number(profile.heightInfluence) || 0.0,
                    contrast: Number(profile.contrast) || 1.0,
                    rawWeight: 0.0,
                    falloffWeight: 0.0,
                    dominanceWeight: 0.0,
                    finalWeight: 0.0,
                    noiseOffsetMeters: 0.0
                }
            };
        }

        const humidity = getHumidity01(xx, zz);

        const patch = config.patch;
        const patchSize = patch.sizeMeters;
        const ox = patch.originX;
        const oz = patch.originZ;

        const vxo = viewOrigin && typeof viewOrigin === 'object' ? Number(viewOrigin.x) : viewX;
        const vzo = viewOrigin && typeof viewOrigin === 'object' ? Number(viewOrigin.z) : viewZ;
        const tx = Number.isFinite(vxo) ? vxo : viewX;
        const tz = Number.isFinite(vzo) ? vzo : viewZ;

        const tr = config.transition;
        const radius = Math.max(0, Number(tr.cameraBlendRadiusMeters) || 0);
        const feather = Math.max(0, Number(tr.cameraBlendFeatherMeters) || 0);
        const band = Math.max(0, Number(tr.boundaryBandMeters) || 0);

        const dx = xx - tx;
        const dz = zz - tz;
        const distToCamera = Math.sqrt(dx * dx + dz * dz);
        const cameraAlpha = radius > EPS ? (1 - smoothstep(radius, radius + feather, distToCamera)) : 0.0;
        const transitionActive = cameraAlpha > EPS && band > EPS;

        let patchId = 0;
        let primaryBiomeId = config.biomes.defaultBiomeId;
        let secondaryBiomeId = primaryBiomeId;
        let biomeBlend = 0.0;
        let edgeDistanceMeters = 0.0;
        let transitionPairKey = makeBiomePairKey(primaryBiomeId, secondaryBiomeId);
        let transitionIntent = TERRAIN_TRANSITION_INTENT_ID.MEDIUM;
        let transitionWidthScale = TERRAIN_TRANSITION_PROFILE_DEFAULTS.widthScale;
        let transitionFalloffPower = TERRAIN_TRANSITION_PROFILE_DEFAULTS.falloffPower;
        let transitionEdgeNoiseStrength = TERRAIN_TRANSITION_PROFILE_DEFAULTS.edgeNoiseStrength;
        let transitionDominanceBias = TERRAIN_TRANSITION_PROFILE_DEFAULTS.dominanceBias;
        let transitionHeightInfluence = TERRAIN_TRANSITION_PROFILE_DEFAULTS.heightInfluence;
        let transitionContrast = TERRAIN_TRANSITION_PROFILE_DEFAULTS.contrast;
        let transitionRawWeight = 0.0;
        let transitionFalloffWeight = 0.0;
        let transitionDominanceWeight = 0.0;
        let transitionFinalWeight = 0.0;
        let transitionNoiseOffsetMeters = 0.0;
        let transitionProfileForReport = null;

        if (patch.layout === 'voronoi') {
            const vor = sampleVoronoiPatches(xx, zz);
            patchId = getPatchId(vor.primary.cx, vor.primary.cz);
            primaryBiomeId = getPatchBiomeId({
                keyX: vor.primary.cx,
                keyZ: vor.primary.cz,
                centerX: vor.primary.seedX,
                centerZ: vor.primary.seedZ
            });
            secondaryBiomeId = primaryBiomeId;
            edgeDistanceMeters = vor.edgeDistanceMeters;

            if (transitionActive) {
                const minD = edgeDistanceMeters;
                if (minD < band + EPS) {
                    secondaryBiomeId = getPatchBiomeId({
                        keyX: vor.secondary.cx,
                        keyZ: vor.secondary.cz,
                        centerX: vor.secondary.seedX,
                        centerZ: vor.secondary.seedZ
                    });
                    if (secondaryBiomeId !== primaryBiomeId) {
                        const pairInfo = getTransitionPairProfile(primaryBiomeId, secondaryBiomeId);
                        const profile = pairInfo.profile ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS;
                        transitionProfileForReport = profile;
                        transitionPairKey = pairInfo.pairKey;
                        transitionIntent = normalizeTransitionIntent(profile.intent, TERRAIN_TRANSITION_INTENT_ID.MEDIUM);
                        transitionWidthScale = clamp(profile.widthScale, 0.25, 4.0, TERRAIN_TRANSITION_PROFILE_DEFAULTS.widthScale);
                        transitionFalloffPower = clamp(profile.falloffPower, 0.3, 3.5, TERRAIN_TRANSITION_PROFILE_DEFAULTS.falloffPower);
                        transitionEdgeNoiseStrength = clamp(profile.edgeNoiseStrength, 0.0, 1.0, TERRAIN_TRANSITION_PROFILE_DEFAULTS.edgeNoiseStrength);
                        transitionDominanceBias = clamp(profile.dominanceBias, -0.5, 0.5, TERRAIN_TRANSITION_PROFILE_DEFAULTS.dominanceBias);
                        transitionHeightInfluence = clamp(profile.heightInfluence, -1.0, 1.0, TERRAIN_TRANSITION_PROFILE_DEFAULTS.heightInfluence);
                        transitionContrast = clamp(profile.contrast, 0.25, 3.0, TERRAIN_TRANSITION_PROFILE_DEFAULTS.contrast);

                        const localBand = Math.max(EPS, band * transitionWidthScale);
                        const noiseNorm = sampleTransitionEdgeNoise(xx, zz, transitionPairKey, profile.edgeNoiseScale);
                        transitionNoiseOffsetMeters = noiseNorm * transitionEdgeNoiseStrength * localBand;
                        const minDNoisy = Math.max(0, minD + transitionNoiseOffsetMeters);
                        transitionRawWeight = clamp01(0.5 * (1 - smoothstep(0.0, localBand, minDNoisy)));
                        const shaped = shapeTransitionWeight({
                            rawWeight: transitionRawWeight,
                            humidity,
                            pairKey: transitionPairKey,
                            profile,
                            secondaryBiomeId
                        });
                        transitionFalloffWeight = shaped.falloffWeight;
                        transitionDominanceWeight = shaped.dominanceWeight;
                        transitionFinalWeight = shaped.finalWeight;
                        biomeBlend = clamp01(transitionFinalWeight * cameraAlpha);
                    }
                }
            }
        } else {
            const px = getPatchCoord(xx, ox, patchSize);
            const pz = getPatchCoord(zz, oz, patchSize);
            patchId = getPatchId(px, pz);
            const center = getGridPatchCenterWorld(px, pz);
            primaryBiomeId = getPatchBiomeId({ keyX: px, keyZ: pz, centerX: center.x, centerZ: center.z });
            secondaryBiomeId = primaryBiomeId;

            const localX = (xx - ox) - px * patchSize;
            const localZ = (zz - oz) - pz * patchSize;
            const distLeft = localX;
            const distRight = patchSize - localX;
            const distBottom = localZ;
            const distTop = patchSize - localZ;
            edgeDistanceMeters = Math.max(0, Math.min(distLeft, distRight, distBottom, distTop));

            if (transitionActive) {
                const minD = edgeDistanceMeters;
                if (minD < band + EPS) {
                    const candidates = [
                        { distance: distLeft, signed: xx - (ox + px * patchSize), neighborPx: px - 1, neighborPz: pz, primaryOnPositive: true },
                        { distance: distRight, signed: xx - (ox + (px + 1) * patchSize), neighborPx: px + 1, neighborPz: pz, primaryOnPositive: false },
                        { distance: distBottom, signed: zz - (oz + pz * patchSize), neighborPx: px, neighborPz: pz - 1, primaryOnPositive: true },
                        { distance: distTop, signed: zz - (oz + (pz + 1) * patchSize), neighborPx: px, neighborPz: pz + 1, primaryOnPositive: false }
                    ].sort((a, b) => a.distance - b.distance);

                    for (const candidate of candidates) {
                        if (!(candidate.distance < band + EPS)) break;
                        const neighborCenter = getGridPatchCenterWorld(candidate.neighborPx, candidate.neighborPz);
                        const neighborBiomeId = getPatchBiomeId({
                            keyX: candidate.neighborPx,
                            keyZ: candidate.neighborPz,
                            centerX: neighborCenter.x,
                            centerZ: neighborCenter.z
                        });
                        if (neighborBiomeId === primaryBiomeId) continue;

                        secondaryBiomeId = neighborBiomeId;
                        const pairInfo = getTransitionPairProfile(primaryBiomeId, secondaryBiomeId);
                        const profile = pairInfo.profile ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS;
                        transitionProfileForReport = profile;
                        transitionPairKey = pairInfo.pairKey;
                        transitionIntent = normalizeTransitionIntent(profile.intent, TERRAIN_TRANSITION_INTENT_ID.MEDIUM);
                        transitionWidthScale = clamp(profile.widthScale, 0.25, 4.0, TERRAIN_TRANSITION_PROFILE_DEFAULTS.widthScale);
                        transitionFalloffPower = clamp(profile.falloffPower, 0.3, 3.5, TERRAIN_TRANSITION_PROFILE_DEFAULTS.falloffPower);
                        transitionEdgeNoiseStrength = clamp(profile.edgeNoiseStrength, 0.0, 1.0, TERRAIN_TRANSITION_PROFILE_DEFAULTS.edgeNoiseStrength);
                        transitionDominanceBias = clamp(profile.dominanceBias, -0.5, 0.5, TERRAIN_TRANSITION_PROFILE_DEFAULTS.dominanceBias);
                        transitionHeightInfluence = clamp(profile.heightInfluence, -1.0, 1.0, TERRAIN_TRANSITION_PROFILE_DEFAULTS.heightInfluence);
                        transitionContrast = clamp(profile.contrast, 0.25, 3.0, TERRAIN_TRANSITION_PROFILE_DEFAULTS.contrast);

                        const localBand = Math.max(EPS, band * transitionWidthScale);
                        const noiseNorm = sampleTransitionEdgeNoise(xx, zz, transitionPairKey, profile.edgeNoiseScale);
                        transitionNoiseOffsetMeters = noiseNorm * transitionEdgeNoiseStrength * localBand;
                        const signedNoisy = candidate.signed + transitionNoiseOffsetMeters;
                        const tPositive = smoothstep(-localBand, localBand, signedNoisy);
                        transitionRawWeight = clamp01(candidate.primaryOnPositive ? (1 - tPositive) : tPositive);
                        const shaped = shapeTransitionWeight({
                            rawWeight: transitionRawWeight,
                            humidity,
                            pairKey: transitionPairKey,
                            profile,
                            secondaryBiomeId
                        });
                        transitionFalloffWeight = shaped.falloffWeight;
                        transitionDominanceWeight = shaped.dominanceWeight;
                        transitionFinalWeight = shaped.finalWeight;
                        biomeBlend = clamp01(transitionFinalWeight * cameraAlpha);
                        break;
                    }
                }
            }
        }

        if (secondaryBiomeId === primaryBiomeId) biomeBlend = 0.0;
        if (biomeBlend < 1 / 255) biomeBlend = 0.0;
        if (!biomeBlend) {
            secondaryBiomeId = primaryBiomeId;
            transitionRawWeight = 0.0;
            transitionFalloffWeight = 0.0;
            transitionDominanceWeight = 0.0;
            transitionFinalWeight = 0.0;
            transitionNoiseOffsetMeters = 0.0;
        }

        if (!transitionProfileForReport) {
            const pairInfo = getTransitionPairProfile(primaryBiomeId, secondaryBiomeId);
            const profile = pairInfo.profile ?? TERRAIN_TRANSITION_PROFILE_DEFAULTS;
            transitionProfileForReport = profile;
            transitionPairKey = pairInfo.pairKey;
            transitionIntent = normalizeTransitionIntent(profile.intent, TERRAIN_TRANSITION_INTENT_ID.MEDIUM);
            transitionWidthScale = clamp(profile.widthScale, 0.25, 4.0, TERRAIN_TRANSITION_PROFILE_DEFAULTS.widthScale);
            transitionFalloffPower = clamp(profile.falloffPower, 0.3, 3.5, TERRAIN_TRANSITION_PROFILE_DEFAULTS.falloffPower);
            transitionEdgeNoiseStrength = clamp(profile.edgeNoiseStrength, 0.0, 1.0, TERRAIN_TRANSITION_PROFILE_DEFAULTS.edgeNoiseStrength);
            transitionDominanceBias = clamp(profile.dominanceBias, -0.5, 0.5, TERRAIN_TRANSITION_PROFILE_DEFAULTS.dominanceBias);
            transitionHeightInfluence = clamp(profile.heightInfluence, -1.0, 1.0, TERRAIN_TRANSITION_PROFILE_DEFAULTS.heightInfluence);
            transitionContrast = clamp(profile.contrast, 0.25, 3.0, TERRAIN_TRANSITION_PROFILE_DEFAULTS.contrast);
        }

        /** @type {TerrainEngineSample} */
        const out = {
            patchId,
            primaryBiomeId,
            secondaryBiomeId,
            biomeBlend,
            humidity,
            edgeDistanceMeters,
            transition: {
                active: transitionActive,
                cameraAlpha: clamp01(cameraAlpha),
                pairKey: transitionPairKey,
                intent: transitionIntent,
                widthScale: transitionWidthScale,
                falloffPower: transitionFalloffPower,
                edgeNoiseStrength: transitionEdgeNoiseStrength,
                dominanceBias: transitionDominanceBias,
                heightInfluence: transitionHeightInfluence,
                contrast: transitionContrast,
                rawWeight: clamp01(transitionRawWeight),
                falloffWeight: clamp01(transitionFalloffWeight),
                dominanceWeight: clamp01(transitionDominanceWeight),
                finalWeight: clamp01(transitionFinalWeight),
                noiseOffsetMeters: Number(transitionNoiseOffsetMeters) || 0.0
            }
        };
        return out;
    };

    const exportPackedMaskRgba8 = ({ width = 256, height = 256, viewOrigin = null } = {}) => {
        const w = Math.max(1, Math.round(Number(width) || 0));
        const h = Math.max(1, Math.round(Number(height) || 0));
        const b = config.bounds;
        const sizeX = b.maxX - b.minX;
        const sizeZ = b.maxZ - b.minZ;
        const rgba = new Uint8Array(w * h * 4);
        const patchIds = new Uint32Array(w * h);
        const transitionRawWeight = new Float32Array(w * h);
        const transitionFalloffWeight = new Float32Array(w * h);
        const transitionDominanceWeight = new Float32Array(w * h);
        const transitionFinalWeight = new Float32Array(w * h);
        const transitionNoiseOffset = new Float32Array(w * h);

        const view = viewOrigin && typeof viewOrigin === 'object'
            ? { x: Number(viewOrigin.x) || 0, z: Number(viewOrigin.z) || 0 }
            : null;

        let idx = 0;
        let pIdx = 0;
        for (let iz = 0; iz < h; iz++) {
            const vz = (iz + 0.5) / h;
            const z = b.minZ + vz * sizeZ;
            for (let ix = 0; ix < w; ix++) {
                const vx = (ix + 0.5) / w;
                const x = b.minX + vx * sizeX;
                const s = sample(x, z, { viewOrigin: view });
                const p = TERRAIN_BIOME_INDEX[s.primaryBiomeId] ?? 2;
                const q = TERRAIN_BIOME_INDEX[s.secondaryBiomeId] ?? p;
                rgba[idx] = p & 255;
                rgba[idx + 1] = q & 255;
                rgba[idx + 2] = Math.max(0, Math.min(255, Math.round(s.biomeBlend * 255)));
                rgba[idx + 3] = Math.max(0, Math.min(255, Math.round(s.humidity * 255)));
                idx += 4;
                patchIds[pIdx] = s.patchId >>> 0;
                transitionRawWeight[pIdx] = Number(s.transition?.rawWeight) || 0.0;
                transitionFalloffWeight[pIdx] = Number(s.transition?.falloffWeight) || 0.0;
                transitionDominanceWeight[pIdx] = Number(s.transition?.dominanceWeight) || 0.0;
                transitionFinalWeight[pIdx] = Number(s.transition?.finalWeight) || 0.0;
                transitionNoiseOffset[pIdx] = Number(s.transition?.noiseOffsetMeters) || 0.0;
                pIdx++;
            }
        }

        return {
            width: w,
            height: h,
            bounds: b,
            rgba,
            patchIds,
            transitionDebug: {
                rawWeight: transitionRawWeight,
                falloffWeight: transitionFalloffWeight,
                dominanceWeight: transitionDominanceWeight,
                finalWeight: transitionFinalWeight,
                noiseOffsetMeters: transitionNoiseOffset
            }
        };
    };

    const dispose = () => {
        sourceMaps = { biome: null, humidity: null };
        valueNoiseSamplerBySeed.clear();
        pairSeedByKey.clear();
    };

    return Object.freeze({
        setConfig,
        getConfig,
        setViewOrigin,
        setSourceMaps,
        sample,
        exportPackedMaskRgba8,
        dispose
    });
}
