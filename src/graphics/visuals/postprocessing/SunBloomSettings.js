// src/graphics/visuals/postprocessing/SunBloomSettings.js
// Persisted sun-only bloom settings (occlusion-aware bloom around sun).
// @ts-check

const STORAGE_KEY = 'bus_sim.sunBloom.v1';

export const SUN_BLOOM_DEFAULTS = Object.freeze({
    enabled: false,
    mode: 'occlusion', // 'occlusion' | 'selective'
    strength: 0.9,
    radius: 0.25,
    threshold: 1.05,
    brightnessOnly: true,
    discRadiusDeg: 0.55,
    discIntensity: 25,
    discFalloff: 2.2,
    raysEnabled: false,
    raysIntensity: 0.85,
    raysSizePx: 950,
    raysCount: 48,
    raysLength: 0.95,
    raysLengthJitter: 0.45,
    raysBaseWidthDeg: 1.6,
    raysTipWidthDeg: 0.28,
    raysSoftnessDeg: 0.9,
    raysCoreGlow: 0.35,
    raysOuterGlow: 0.18,
    raysRotationDeg: 0
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function normalizeMode(value, fallback) {
    const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (v === 'selective') return 'selective';
    if (v === 'occlusion' || v === 'occlusion-aware' || v === 'occlusion_aware') return 'occlusion';
    return fallback;
}

function readUrlParamNumber(params, key, fallback, { min = -Infinity, max = Infinity } = {}) {
    if (!params?.has?.(key)) return fallback;
    const raw = params.get(key);
    const num = Number(raw);
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

function readUrlParamString(params, key, fallback) {
    if (!params?.has?.(key)) return fallback;
    const raw = params.get(key);
    return typeof raw === 'string' ? raw : fallback;
}

export function sanitizeSunBloomSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const enabled = src.enabled !== undefined ? !!src.enabled : SUN_BLOOM_DEFAULTS.enabled;
    return {
        enabled,
        mode: normalizeMode(src.mode, SUN_BLOOM_DEFAULTS.mode),
        strength: clamp(src.strength ?? SUN_BLOOM_DEFAULTS.strength, 0, 5, SUN_BLOOM_DEFAULTS.strength),
        radius: clamp(src.radius ?? SUN_BLOOM_DEFAULTS.radius, 0, 1, SUN_BLOOM_DEFAULTS.radius),
        threshold: clamp(src.threshold ?? SUN_BLOOM_DEFAULTS.threshold, 0, 5, SUN_BLOOM_DEFAULTS.threshold),
        brightnessOnly: src.brightnessOnly !== undefined ? !!src.brightnessOnly : SUN_BLOOM_DEFAULTS.brightnessOnly,
        discRadiusDeg: clamp(src.discRadiusDeg ?? SUN_BLOOM_DEFAULTS.discRadiusDeg, 0.05, 6, SUN_BLOOM_DEFAULTS.discRadiusDeg),
        discIntensity: clamp(src.discIntensity ?? SUN_BLOOM_DEFAULTS.discIntensity, 0, 200, SUN_BLOOM_DEFAULTS.discIntensity),
        discFalloff: clamp(src.discFalloff ?? SUN_BLOOM_DEFAULTS.discFalloff, 0.5, 10, SUN_BLOOM_DEFAULTS.discFalloff),
        raysEnabled: src.raysEnabled !== undefined ? !!src.raysEnabled : SUN_BLOOM_DEFAULTS.raysEnabled,
        raysIntensity: clamp(src.raysIntensity ?? SUN_BLOOM_DEFAULTS.raysIntensity, 0, 6, SUN_BLOOM_DEFAULTS.raysIntensity),
        raysSizePx: clamp(src.raysSizePx ?? SUN_BLOOM_DEFAULTS.raysSizePx, 64, 2400, SUN_BLOOM_DEFAULTS.raysSizePx),
        raysCount: clamp(src.raysCount ?? SUN_BLOOM_DEFAULTS.raysCount, 3, 256, SUN_BLOOM_DEFAULTS.raysCount),
        raysLength: clamp(src.raysLength ?? SUN_BLOOM_DEFAULTS.raysLength, 0, 1.6, SUN_BLOOM_DEFAULTS.raysLength),
        raysLengthJitter: clamp(src.raysLengthJitter ?? SUN_BLOOM_DEFAULTS.raysLengthJitter, 0, 1.0, SUN_BLOOM_DEFAULTS.raysLengthJitter),
        raysBaseWidthDeg: clamp(src.raysBaseWidthDeg ?? SUN_BLOOM_DEFAULTS.raysBaseWidthDeg, 0, 12, SUN_BLOOM_DEFAULTS.raysBaseWidthDeg),
        raysTipWidthDeg: clamp(src.raysTipWidthDeg ?? SUN_BLOOM_DEFAULTS.raysTipWidthDeg, 0, 12, SUN_BLOOM_DEFAULTS.raysTipWidthDeg),
        raysSoftnessDeg: clamp(src.raysSoftnessDeg ?? SUN_BLOOM_DEFAULTS.raysSoftnessDeg, 0, 12, SUN_BLOOM_DEFAULTS.raysSoftnessDeg),
        raysCoreGlow: clamp(src.raysCoreGlow ?? SUN_BLOOM_DEFAULTS.raysCoreGlow, 0, 2.0, SUN_BLOOM_DEFAULTS.raysCoreGlow),
        raysOuterGlow: clamp(src.raysOuterGlow ?? SUN_BLOOM_DEFAULTS.raysOuterGlow, 0, 2.0, SUN_BLOOM_DEFAULTS.raysOuterGlow),
        raysRotationDeg: clamp(src.raysRotationDeg ?? SUN_BLOOM_DEFAULTS.raysRotationDeg, -360, 360, SUN_BLOOM_DEFAULTS.raysRotationDeg)
    };
}

export function loadSavedSunBloomSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return sanitizeSunBloomSettings(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function saveSunBloomSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeSunBloomSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedSunBloomSettings() {
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

export function getResolvedSunBloomSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedSunBloomSettings();
    const merged = sanitizeSunBloomSettings({ ...SUN_BLOOM_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        merged.enabled = readUrlParamBool(params, 'sunBloom', merged.enabled);
        merged.mode = normalizeMode(readUrlParamString(params, 'sunBloomMode', merged.mode), merged.mode);
        merged.strength = readUrlParamNumber(params, 'sunBloomStrength', merged.strength, { min: 0, max: 5 });
        merged.radius = readUrlParamNumber(params, 'sunBloomRadius', merged.radius, { min: 0, max: 1 });
        merged.threshold = readUrlParamNumber(params, 'sunBloomThreshold', merged.threshold, { min: 0, max: 5 });
        merged.brightnessOnly = readUrlParamBool(params, 'sunBloomBrightnessOnly', merged.brightnessOnly);
        merged.discRadiusDeg = readUrlParamNumber(params, 'sunBloomDiscRadiusDeg', merged.discRadiusDeg, { min: 0.05, max: 6 });
        merged.discIntensity = readUrlParamNumber(params, 'sunBloomDiscIntensity', merged.discIntensity, { min: 0, max: 200 });
        merged.discFalloff = readUrlParamNumber(params, 'sunBloomDiscFalloff', merged.discFalloff, { min: 0.5, max: 10 });
        merged.raysEnabled = readUrlParamBool(params, 'sunBloomRays', merged.raysEnabled);
        merged.raysIntensity = readUrlParamNumber(params, 'sunBloomRaysIntensity', merged.raysIntensity, { min: 0, max: 6 });
        merged.raysSizePx = readUrlParamNumber(params, 'sunBloomRaysSizePx', merged.raysSizePx, { min: 64, max: 2400 });
        merged.raysCount = readUrlParamNumber(params, 'sunBloomRaysCount', merged.raysCount, { min: 3, max: 256 });
        merged.raysLength = readUrlParamNumber(params, 'sunBloomRaysLength', merged.raysLength, { min: 0, max: 1.6 });
        merged.raysLengthJitter = readUrlParamNumber(params, 'sunBloomRaysLengthJitter', merged.raysLengthJitter, { min: 0, max: 1.0 });
        merged.raysBaseWidthDeg = readUrlParamNumber(params, 'sunBloomRaysBaseWidthDeg', merged.raysBaseWidthDeg, { min: 0, max: 12 });
        merged.raysTipWidthDeg = readUrlParamNumber(params, 'sunBloomRaysTipWidthDeg', merged.raysTipWidthDeg, { min: 0, max: 12 });
        merged.raysSoftnessDeg = readUrlParamNumber(params, 'sunBloomRaysSoftnessDeg', merged.raysSoftnessDeg, { min: 0, max: 12 });
        merged.raysCoreGlow = readUrlParamNumber(params, 'sunBloomRaysCoreGlow', merged.raysCoreGlow, { min: 0, max: 2.0 });
        merged.raysOuterGlow = readUrlParamNumber(params, 'sunBloomRaysOuterGlow', merged.raysOuterGlow, { min: 0, max: 2.0 });
        merged.raysRotationDeg = readUrlParamNumber(params, 'sunBloomRaysRotationDeg', merged.raysRotationDeg, { min: -360, max: 360 });
    }

    return merged;
}

export function getDefaultResolvedSunBloomSettings() {
    return sanitizeSunBloomSettings(SUN_BLOOM_DEFAULTS);
}
