// src/graphics/visuals/city/AsphaltNoiseSettings.js
// Persisted asphalt shader noise controls (coarse + fine).
// @ts-check

const STORAGE_KEY = 'bus_sim.asphaltNoise.v1';

export const ASPHALT_NOISE_DEFAULTS = Object.freeze({
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

export function sanitizeAsphaltNoiseSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const coarseIn = src.coarse && typeof src.coarse === 'object' ? src.coarse : null;
    const fineIn = src.fine && typeof src.fine === 'object' ? src.fine : null;

    const legacy = {
        albedo: src.albedo,
        roughness: src.roughness
    };
    const coarseMerged = { ...legacy, ...(coarseIn ?? {}) };

    return {
        coarse: sanitizeAsphaltNoiseLayerSettings(coarseMerged, ASPHALT_NOISE_DEFAULTS.coarse, { scaleMax: 10.0 }),
        fine: sanitizeAsphaltNoiseLayerSettings(fineIn, ASPHALT_NOISE_DEFAULTS.fine, { scaleMax: 15.0, includeNormal: true })
    };
}

export function loadSavedAsphaltNoiseSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return sanitizeAsphaltNoiseSettings(JSON.parse(raw));
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
