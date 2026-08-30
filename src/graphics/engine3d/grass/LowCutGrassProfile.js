// Versioned low-cut grass profile, deterministic authoring recipe, and lightweight runtime derivation.
// @ts-check

import { makeRng } from './GrassRng.js';

export const LOW_CUT_GRASS_PROFILE_SCHEMA = 'bus-simulator.low-cut-grass-profile';
export const LOW_CUT_GRASS_RUNTIME_SCHEMA = 'bus-simulator.low-cut-grass-runtime';
export const LOW_CUT_GRASS_PROFILE_VERSION = 1;
export const LOW_CUT_GRASS_DEFAULT_PROFILE_ID = 'grass.lowcut.maintained.v1';
export const LOW_CUT_GRASS_AUTHORING_SOURCE_MESH_ID = 'mesh.soccer_grass_blade_hires.v1';
export const LOW_CUT_GRASS_RUNTIME_SOURCE_MESH_ID = 'mesh.soccer_grass_blade.v1';

function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function round(value, digits = 9) {
    const scale = 10 ** digits;
    return Math.round(Number(value) * scale) / scale;
}

function normalizeHex(value, fallback) {
    const match = String(value ?? '').trim().match(/^#?([0-9a-f]{6})$/i);
    return match ? `#${match[1].toUpperCase()}` : fallback;
}

function normalizeId(value, fallback) {
    const id = String(value ?? '').trim();
    return /^[a-z0-9][a-z0-9._-]{2,95}$/i.test(id) ? id : fallback;
}

function normalizeSeed(value, fallback) {
    const seed = String(value ?? '').trim();
    return seed ? seed.slice(0, 128) : fallback;
}

function sanitizeRange(source, { min, max, defaultMin, defaultMax }) {
    const input = source && typeof source === 'object' ? source : {};
    const low = clamp(input.min, min, max, defaultMin);
    const high = Math.max(low, clamp(input.max, min, max, defaultMax));
    return { min: round(low), max: round(high) };
}

function parseHexRgb(hex) {
    const normalized = normalizeHex(hex, '#FFFFFF').slice(1);
    return {
        r: parseInt(normalized.slice(0, 2), 16) / 255,
        g: parseInt(normalized.slice(2, 4), 16) / 255,
        b: parseInt(normalized.slice(4, 6), 16) / 255
    };
}

function hashText(value) {
    const text = String(value ?? '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/** @returns {object} */
export function createDefaultLowCutGrassProfile() {
    return {
        schema: LOW_CUT_GRASS_PROFILE_SCHEMA,
        version: LOW_CUT_GRASS_PROFILE_VERSION,
        profileId: LOW_CUT_GRASS_DEFAULT_PROFILE_ID,
        seed: 'maintained-turf-v1',
        blade: {
            heightMeters: { min: 0.025, max: 0.030 },
            widthMeters: { min: 0.0022, max: 0.0032 }
        },
        shape: {
            bendDegrees: { mean: 10, variation: 7 },
            inclinationDegrees: { mean: 4, variation: 4 },
            curvature: { mean: 0.65, variation: 0.18 }
        },
        appearance: {
            baseColor: '#285F2E',
            tipColor: '#568C44',
            colorVariation: {
                hueDegrees: 5,
                saturation: 0.08,
                brightness: 0.10
            },
            dryness: 0.25,
            humidity: 0.35
        },
        carpet: {
            layout: 'area_patch',
            bladeDensityPerSquareMeter: 12000,
            patchSizeMeters: 1.5,
            coverage: 0.92,
            clumpiness: 0.08
        },
        accents: {
            layout: 'localized_tufts',
            enabled: true,
            bladesPerTuft: 7,
            radiusMeters: 0.035,
            densityMultiplier: 0.30
        }
    };
}

/** @param {unknown} input @returns {object} */
export function sanitizeLowCutGrassProfile(input) {
    const defaults = createDefaultLowCutGrassProfile();
    const source = input && typeof input === 'object' ? input : {};
    const blade = source.blade && typeof source.blade === 'object' ? source.blade : {};
    const shape = source.shape && typeof source.shape === 'object' ? source.shape : {};
    const appearance = source.appearance && typeof source.appearance === 'object' ? source.appearance : {};
    const colorVariation = appearance.colorVariation && typeof appearance.colorVariation === 'object' ? appearance.colorVariation : {};
    const carpet = source.carpet && typeof source.carpet === 'object' ? source.carpet : {};
    const accents = source.accents && typeof source.accents === 'object' ? source.accents : {};
    const bend = shape.bendDegrees && typeof shape.bendDegrees === 'object' ? shape.bendDegrees : {};
    const inclination = shape.inclinationDegrees && typeof shape.inclinationDegrees === 'object' ? shape.inclinationDegrees : {};
    const curvature = shape.curvature && typeof shape.curvature === 'object' ? shape.curvature : {};

    return {
        schema: LOW_CUT_GRASS_PROFILE_SCHEMA,
        version: LOW_CUT_GRASS_PROFILE_VERSION,
        profileId: normalizeId(source.profileId, defaults.profileId),
        seed: normalizeSeed(source.seed, defaults.seed),
        blade: {
            heightMeters: sanitizeRange(blade.heightMeters, { min: 0.015, max: 0.080, defaultMin: 0.025, defaultMax: 0.030 }),
            widthMeters: sanitizeRange(blade.widthMeters, { min: 0.0008, max: 0.010, defaultMin: 0.0022, defaultMax: 0.0032 })
        },
        shape: {
            bendDegrees: {
                mean: round(clamp(bend.mean, -60, 60, 10)),
                variation: round(clamp(bend.variation, 0, 45, 7))
            },
            inclinationDegrees: {
                mean: round(clamp(inclination.mean, -45, 45, 4)),
                variation: round(clamp(inclination.variation, 0, 35, 4))
            },
            curvature: {
                mean: round(clamp(curvature.mean, 0, 3, 0.65)),
                variation: round(clamp(curvature.variation, 0, 1.5, 0.18))
            }
        },
        appearance: {
            baseColor: normalizeHex(appearance.baseColor, defaults.appearance.baseColor),
            tipColor: normalizeHex(appearance.tipColor, defaults.appearance.tipColor),
            colorVariation: {
                hueDegrees: round(clamp(colorVariation.hueDegrees, 0, 40, 5)),
                saturation: round(clamp(colorVariation.saturation, 0, 0.5, 0.08)),
                brightness: round(clamp(colorVariation.brightness, 0, 0.5, 0.10))
            },
            dryness: round(clamp(appearance.dryness, 0, 1, 0.25)),
            humidity: round(clamp(appearance.humidity, 0, 1, 0.35))
        },
        carpet: {
            layout: 'area_patch',
            bladeDensityPerSquareMeter: Math.round(clamp(carpet.bladeDensityPerSquareMeter, 1000, 30000, 12000)),
            patchSizeMeters: round(clamp(carpet.patchSizeMeters, 0.25, 8, 1.5)),
            coverage: round(clamp(carpet.coverage, 0.1, 1, 0.92)),
            clumpiness: round(clamp(carpet.clumpiness, 0, 0.45, 0.08))
        },
        accents: {
            layout: 'localized_tufts',
            enabled: accents.enabled !== false,
            bladesPerTuft: Math.round(clamp(accents.bladesPerTuft, 1, 32, 7)),
            radiusMeters: round(clamp(accents.radiusMeters, 0.005, 0.25, 0.035)),
            densityMultiplier: round(clamp(accents.densityMultiplier, 0, 2, 0.30))
        }
    };
}

/** @param {string} json @returns {object} */
export function parseLowCutGrassProfileJson(json) {
    let parsed;
    try {
        parsed = JSON.parse(String(json ?? ''));
    } catch (error) {
        throw new Error(`[LowCutGrassProfile] Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== 'object') throw new Error('[LowCutGrassProfile] Profile must be an object.');
    if (parsed.schema !== LOW_CUT_GRASS_PROFILE_SCHEMA) throw new Error(`[LowCutGrassProfile] Unsupported schema: ${String(parsed.schema ?? '')}`);
    if (parsed.version !== LOW_CUT_GRASS_PROFILE_VERSION) throw new Error(`[LowCutGrassProfile] Unsupported version: ${String(parsed.version ?? '')}`);
    return sanitizeLowCutGrassProfile(parsed);
}

/** @param {unknown} profile @returns {string} */
export function serializeLowCutGrassProfile(profile) {
    return JSON.stringify(sanitizeLowCutGrassProfile(profile), null, 2);
}

/** @param {unknown} profile @param {{count?: number, patchSizeMeters?: number}} [options] @returns {Array<object>} */
export function createLowCutGrassAuthoringBladeDescriptors(profile, { count = 24, patchSizeMeters = 0.24 } = {}) {
    const config = sanitizeLowCutGrassProfile(profile);
    const bladeCount = Math.round(clamp(count, 1, 128, 24));
    const patchSize = clamp(patchSizeMeters, 0.05, 2, 0.24);
    const rng = makeRng(`${config.profileId}|${config.seed}|authoring:${bladeCount}|patch:${patchSize.toFixed(4)}`);
    const columns = Math.ceil(Math.sqrt(bladeCount));
    const rows = Math.ceil(bladeCount / columns);
    const cellX = patchSize / columns;
    const cellZ = patchSize / rows;
    const descriptors = [];

    for (let index = 0; index < bladeCount; index++) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = -patchSize * 0.5 + (column + 0.5 + (rng() - 0.5) * 0.52) * cellX;
        const z = -patchSize * 0.5 + (row + 0.5 + (rng() - 0.5) * 0.52) * cellZ;
        const height = config.blade.heightMeters.min + (config.blade.heightMeters.max - config.blade.heightMeters.min) * rng();
        const width = config.blade.widthMeters.min + (config.blade.widthMeters.max - config.blade.widthMeters.min) * rng();
        const bend = config.shape.bendDegrees.mean + (rng() * 2 - 1) * config.shape.bendDegrees.variation;
        const inclination = config.shape.inclinationDegrees.mean + (rng() * 2 - 1) * config.shape.inclinationDegrees.variation;
        const curvature = Math.max(0, config.shape.curvature.mean + (rng() * 2 - 1) * config.shape.curvature.variation);
        const color = config.appearance.colorVariation;
        descriptors.push({
            index,
            x: round(x),
            z: round(z),
            yawRadians: round(rng() * Math.PI * 2),
            heightMeters: round(height),
            widthMeters: round(width),
            bendDegrees: round(bend),
            inclinationDegrees: round(inclination),
            curvature: round(curvature),
            hueShiftDegrees: round((rng() * 2 - 1) * color.hueDegrees),
            saturationMultiplier: round(1 + (rng() * 2 - 1) * color.saturation),
            brightnessMultiplier: round(1 + (rng() * 2 - 1) * color.brightness)
        });
    }
    return descriptors;
}

/** @param {unknown} profile @returns {object} */
export function createLowCutGrassRuntimeBladeData(profile) {
    const config = sanitizeLowCutGrassProfile(profile);
    const width = (config.blade.widthMeters.min + config.blade.widthMeters.max) * 0.5;
    const height = (config.blade.heightMeters.min + config.blade.heightMeters.max) * 0.5;
    const angle = (config.shape.bendDegrees.mean + config.shape.inclinationDegrees.mean) * Math.PI / 180;
    const tipY = Math.cos(angle) * height;
    const tipZ = Math.sin(angle) * height;
    const base = parseHexRgb(config.appearance.baseColor);
    const tip = parseHexRgb(config.appearance.tipColor);
    return {
        sourceMeshId: LOW_CUT_GRASS_RUNTIME_SOURCE_MESH_ID,
        positions: [-width * 0.5, 0, 0, width * 0.5, 0, 0, 0, tipY, tipZ].map((value) => round(value)),
        colors: [base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b].map((value) => round(value)),
        indices: [0, 1, 2],
        triangleCount: 1,
        materialSlots: 1,
        groupCount: 0,
        vertexColors: true
    };
}

/** @param {unknown} profile @returns {object} */
export function deriveLowCutGrassRuntimeProfile(profile) {
    const config = sanitizeLowCutGrassProfile(profile);
    const dryness = config.appearance.dryness;
    const humidity = config.appearance.humidity;
    const runtimeGeometry = createLowCutGrassRuntimeBladeData(config);
    return {
        schema: LOW_CUT_GRASS_RUNTIME_SCHEMA,
        version: LOW_CUT_GRASS_PROFILE_VERSION,
        profileId: config.profileId,
        seed: config.seed,
        blade: config.blade,
        shape: config.shape,
        appearance: {
            baseColor: config.appearance.baseColor,
            tipColor: config.appearance.tipColor,
            colorVariation: config.appearance.colorVariation,
            dryness,
            humidity,
            roughness: round(clamp(0.90 + dryness * 0.08 - humidity * 0.30, 0.45, 1, 0.82)),
            saturationMultiplier: round(clamp(1 - dryness * 0.18 + humidity * 0.08, 0.5, 1.4, 1)),
            brightnessMultiplier: round(clamp(1 + dryness * 0.12 - humidity * 0.10, 0.6, 1.4, 1))
        },
        carpet: { ...config.carpet },
        accents: { ...config.accents },
        geometry: {
            sourceMeshId: runtimeGeometry.sourceMeshId,
            triangleCount: runtimeGeometry.triangleCount,
            materialSlots: runtimeGeometry.materialSlots,
            groupCount: runtimeGeometry.groupCount,
            vertexColors: runtimeGeometry.vertexColors
        }
    };
}

/** @param {unknown} profile @param {{count?: number, patchSizeMeters?: number}} [options] @returns {string} */
export function getLowCutGrassAuthoringSignature(profile, options = {}) {
    const config = sanitizeLowCutGrassProfile(profile);
    const source = {
        sourceMeshId: LOW_CUT_GRASS_AUTHORING_SOURCE_MESH_ID,
        profile: config,
        descriptors: createLowCutGrassAuthoringBladeDescriptors(config, options),
        runtimeBlade: createLowCutGrassRuntimeBladeData(config)
    };
    return `grass-source-v1-${hashText(JSON.stringify(source))}`;
}
