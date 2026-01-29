// src/graphics/visuals/city/AsphaltNoiseSettings.js
// Persisted asphalt road visuals controls (noise + art direction + lived-in overlays).
// @ts-check

const STORAGE_KEY = 'bus_sim.asphaltNoise.v1';

const LEGACY_ASPHALT_NOISE_DEFAULTS_V1 = Object.freeze({
    coarse: Object.freeze({
        albedo: true,
        roughness: true,
        scale: 0.07,
        colorStrength: 0.18,
        dirtyStrength: 0.18,
        roughnessStrength: 0.28
    }),
    fine: Object.freeze({
        albedo: true,
        roughness: true,
        normal: true,
        scale: 12.0,
        colorStrength: 0.06,
        dirtyStrength: 0.0,
        roughnessStrength: 0.16,
        normalStrength: 0.35
    }),
    markings: Object.freeze({
        enabled: false,
        colorStrength: 0.025,
        roughnessStrength: 0.09,
        debug: false
    }),
    color: Object.freeze({
        value: 0.0,
        warmCool: 0.0,
        saturation: 0.0
    }),
    livedIn: Object.freeze({
        edgeDirt: Object.freeze({
            enabled: true,
            strength: 0.18,
            width: 0.65,
            scale: 0.55
        }),
        cracks: Object.freeze({
            enabled: true,
            strength: 0.12,
            scale: 3.2
        }),
        patches: Object.freeze({
            enabled: true,
            strength: 0.1,
            scale: 4.0,
            coverage: 0.84
        }),
        tireWear: Object.freeze({
            enabled: true,
            strength: 0.1,
            scale: 1.6
        })
    })
});

export const ASPHALT_NOISE_DEFAULTS = Object.freeze({
    coarse: Object.freeze({
        albedo: false,
        roughness: false,
        scale: 0.226,
        colorStrength: 0.16,
        dirtyStrength: 0.34,
        roughnessStrength: 0.1
    }),
    fine: Object.freeze({
        albedo: true,
        roughness: false,
        normal: true,
        scale: 0.4,
        colorStrength: 0.23,
        dirtyStrength: 0.49,
        roughnessStrength: 0.29,
        normalStrength: 0.32
    }),
    markings: Object.freeze({
        enabled: false,
        colorStrength: 0.025,
        roughnessStrength: 0.09,
        debug: false
    }),
    color: Object.freeze({
        value: 0.0,
        warmCool: 0.0,
        saturation: 0.0
    }),
    livedIn: Object.freeze({
        edgeDirt: Object.freeze({
            enabled: true,
            strength: 0.35,
            width: 0.65,
            scale: 0.55
        }),
        cracks: Object.freeze({
            enabled: true,
            strength: 0.25,
            scale: 3.2
        }),
        patches: Object.freeze({
            enabled: true,
            strength: 0.2,
            scale: 4.0,
            coverage: 0.84
        }),
        tireWear: Object.freeze({
            enabled: true,
            strength: 0.25,
            scale: 1.6
        })
    })
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function readUrlParamBool(params, key, fallback) {
    if (!params?.has?.(key)) return fallback;
    const raw = params.get(key);
    const v = String(raw).trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    return fallback;
}

function readUrlParamNumber(params, key, fallback, { min = -Infinity, max = Infinity } = {}) {
    if (!params?.has?.(key)) return fallback;
    const raw = params.get(key);
    const num = Number(raw);
    if (!Number.isFinite(num)) return fallback;
    return clamp(num, min, max, fallback);
}

function sanitizeAsphaltNoiseLayerSettings(input, defaults, { scaleMax = 10.0, includeNormal = false } = {}) {
    const src = input && typeof input === 'object' ? input : {};
    const d = defaults && typeof defaults === 'object' ? defaults : {};
    const out = {
        albedo: src.albedo !== undefined ? !!src.albedo : !!d.albedo,
        roughness: src.roughness !== undefined ? !!src.roughness : !!d.roughness,
        scale: clamp(src.scale ?? d.scale, 0.001, scaleMax, d.scale ?? 0.07),
        colorStrength: clamp(src.colorStrength ?? d.colorStrength, 0.0, 0.5, d.colorStrength ?? 0),
        dirtyStrength: clamp(src.dirtyStrength ?? d.dirtyStrength, 0.0, 1.0, d.dirtyStrength ?? 0),
        roughnessStrength: clamp(src.roughnessStrength ?? d.roughnessStrength, 0.0, 0.5, d.roughnessStrength ?? 0)
    };
    if (includeNormal) {
        out.normal = src.normal !== undefined ? !!src.normal : !!d.normal;
        out.normalStrength = clamp(src.normalStrength ?? d.normalStrength, 0.0, 2.0, d.normalStrength ?? 0.35);
    }
    return out;
}

function sanitizeAsphaltColorSettings(input, defaults) {
    const src = input && typeof input === 'object' ? input : {};
    const d = defaults && typeof defaults === 'object' ? defaults : {};
    return {
        value: clamp(src.value ?? src.brightness ?? d.value, -0.35, 0.35, d.value ?? 0),
        warmCool: clamp(src.warmCool ?? src.tint ?? d.warmCool, -0.25, 0.25, d.warmCool ?? 0),
        saturation: clamp(src.saturation ?? d.saturation, -0.5, 0.5, d.saturation ?? 0)
    };
}

function sanitizeAsphaltMarkingsSettings(input, defaults) {
    const src = input && typeof input === 'object' ? input : {};
    const d = defaults && typeof defaults === 'object' ? defaults : {};
    return {
        enabled: src.enabled !== undefined ? !!src.enabled : !!d.enabled,
        colorStrength: clamp(src.colorStrength ?? d.colorStrength, 0.0, 0.5, d.colorStrength ?? 0.025),
        roughnessStrength: clamp(src.roughnessStrength ?? d.roughnessStrength, 0.0, 0.5, d.roughnessStrength ?? 0.09),
        debug: src.debug !== undefined ? !!src.debug : !!d.debug
    };
}

function sanitizeAsphaltLivedInLayerSettings(input, defaults, { includeCoverage = false, includeWidth = false } = {}) {
    const src = input && typeof input === 'object' ? input : {};
    const d = defaults && typeof defaults === 'object' ? defaults : {};
    const out = {
        enabled: src.enabled !== undefined ? !!src.enabled : !!d.enabled,
        strength: clamp(src.strength ?? src.intensity ?? d.strength, 0.0, 4.0, d.strength ?? 0),
        scale: clamp(src.scale ?? d.scale, 0.001, 50.0, d.scale ?? 1.0)
    };

    if (includeCoverage) {
        out.coverage = clamp(src.coverage ?? src.patchCoverage ?? d.coverage, 0.0, 1.0, d.coverage ?? 0.84);
    }

    if (includeWidth) {
        out.width = clamp(src.width ?? d.width, 0.0, 3.0, d.width ?? 0.65);
    }

    return out;
}

function sanitizeAsphaltLivedInSettings(input, defaults) {
    const src = input && typeof input === 'object' ? input : {};
    const d = defaults && typeof defaults === 'object' ? defaults : {};
    return {
        edgeDirt: sanitizeAsphaltLivedInLayerSettings(src.edgeDirt, d.edgeDirt, { includeWidth: true }),
        cracks: sanitizeAsphaltLivedInLayerSettings(src.cracks, d.cracks),
        patches: sanitizeAsphaltLivedInLayerSettings(src.patches, d.patches, { includeCoverage: true }),
        tireWear: sanitizeAsphaltLivedInLayerSettings(src.tireWear, d.tireWear)
    };
}

export function sanitizeAsphaltNoiseSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const coarseIn = src.coarse && typeof src.coarse === 'object' ? src.coarse : null;
    const fineIn = src.fine && typeof src.fine === 'object' ? src.fine : null;
    const markingsIn = src.markings && typeof src.markings === 'object' ? src.markings : null;
    const colorIn = src.color && typeof src.color === 'object' ? src.color : null;
    const livedInIn = src.livedIn && typeof src.livedIn === 'object' ? src.livedIn : null;

    const legacy = {
        albedo: src.albedo,
        roughness: src.roughness
    };
    const coarseMerged = { ...legacy, ...(coarseIn ?? {}) };

    return {
        coarse: sanitizeAsphaltNoiseLayerSettings(coarseMerged, ASPHALT_NOISE_DEFAULTS.coarse, { scaleMax: 10.0 }),
        fine: sanitizeAsphaltNoiseLayerSettings(fineIn, ASPHALT_NOISE_DEFAULTS.fine, { scaleMax: 15.0, includeNormal: true }),
        markings: sanitizeAsphaltMarkingsSettings(markingsIn, ASPHALT_NOISE_DEFAULTS.markings),
        color: sanitizeAsphaltColorSettings(colorIn, ASPHALT_NOISE_DEFAULTS.color),
        livedIn: sanitizeAsphaltLivedInSettings(livedInIn, ASPHALT_NOISE_DEFAULTS.livedIn)
    };
}

export function loadSavedAsphaltNoiseSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const saved = sanitizeAsphaltNoiseSettings(JSON.parse(raw));
        const legacy = sanitizeAsphaltNoiseSettings(LEGACY_ASPHALT_NOISE_DEFAULTS_V1);
        const isLegacyDefault = JSON.stringify(saved) === JSON.stringify(legacy);
        if (!isLegacyDefault) return saved;

        const migrated = sanitizeAsphaltNoiseSettings(ASPHALT_NOISE_DEFAULTS);
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        } catch {
            // ignore storage write failures
        }
        return migrated;
    } catch {
        return null;
    }
}

export function saveAsphaltNoiseSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeAsphaltNoiseSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedAsphaltNoiseSettings() {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    try {
        storage.removeItem(STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

export function getResolvedAsphaltNoiseSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedAsphaltNoiseSettings();
    const merged = sanitizeAsphaltNoiseSettings({ ...ASPHALT_NOISE_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        merged.coarse.albedo = readUrlParamBool(params, 'asphaltNoiseCoarseAlbedo', merged.coarse.albedo);
        merged.coarse.roughness = readUrlParamBool(params, 'asphaltNoiseCoarseRoughness', merged.coarse.roughness);
        merged.coarse.scale = readUrlParamNumber(params, 'asphaltNoiseCoarseScale', merged.coarse.scale, { min: 0.001, max: 10.0 });
        merged.coarse.colorStrength = readUrlParamNumber(params, 'asphaltNoiseCoarseColorStrength', merged.coarse.colorStrength, { min: 0, max: 0.5 });
        merged.coarse.dirtyStrength = readUrlParamNumber(params, 'asphaltNoiseCoarseDirtyStrength', merged.coarse.dirtyStrength, { min: 0, max: 1.0 });
        merged.coarse.roughnessStrength = readUrlParamNumber(params, 'asphaltNoiseCoarseRoughnessStrength', merged.coarse.roughnessStrength, { min: 0, max: 0.5 });

        merged.fine.albedo = readUrlParamBool(params, 'asphaltNoiseFineAlbedo', merged.fine.albedo);
        merged.fine.roughness = readUrlParamBool(params, 'asphaltNoiseFineRoughness', merged.fine.roughness);
        merged.fine.normal = readUrlParamBool(params, 'asphaltNoiseFineNormal', merged.fine.normal);
        merged.fine.scale = readUrlParamNumber(params, 'asphaltNoiseFineScale', merged.fine.scale, { min: 0.001, max: 15.0 });
        merged.fine.colorStrength = readUrlParamNumber(params, 'asphaltNoiseFineColorStrength', merged.fine.colorStrength, { min: 0, max: 0.5 });
        merged.fine.dirtyStrength = readUrlParamNumber(params, 'asphaltNoiseFineDirtyStrength', merged.fine.dirtyStrength, { min: 0, max: 1.0 });
        merged.fine.roughnessStrength = readUrlParamNumber(params, 'asphaltNoiseFineRoughnessStrength', merged.fine.roughnessStrength, { min: 0, max: 0.5 });
        merged.fine.normalStrength = readUrlParamNumber(params, 'asphaltNoiseFineNormalStrength', merged.fine.normalStrength, { min: 0, max: 2.0 });
    }

    return merged;
}

export function getDefaultResolvedAsphaltNoiseSettings() {
    return sanitizeAsphaltNoiseSettings(ASPHALT_NOISE_DEFAULTS);
}
