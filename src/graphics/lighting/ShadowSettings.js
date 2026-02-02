// src/graphics/lighting/ShadowSettings.js
// Persisted global shadow quality settings.
// @ts-check

const STORAGE_KEY = 'bus_sim.shadows.v1';

export const SHADOW_DEFAULTS = Object.freeze({
    quality: 'medium'
});

export const SHADOW_QUALITY_PRESETS = Object.freeze({
    off: Object.freeze({ enabled: false, shadowMapType: 'pcf_soft', mapSize: 0, radius: 1, bias: 0, normalBias: 0, twoSidedCasting: false }),
    low: Object.freeze({ enabled: true, shadowMapType: 'pcf_soft', mapSize: 1024, radius: 2, bias: -0.0001, normalBias: 0, twoSidedCasting: false }),
    medium: Object.freeze({ enabled: true, shadowMapType: 'pcf_soft', mapSize: 2048, radius: 1.5, bias: -0.00015, normalBias: 0, twoSidedCasting: true }),
    high: Object.freeze({ enabled: true, shadowMapType: 'pcf_soft', mapSize: 4096, radius: 1.25, bias: -0.0002, normalBias: 0, twoSidedCasting: true }),
    ultra: Object.freeze({ enabled: true, shadowMapType: 'pcf', mapSize: 4096, radius: 1, bias: -0.0002, normalBias: 0, twoSidedCasting: true })
});

function sanitizeQuality(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === '0' || raw === 'off' || raw === 'none' || raw === 'false' || raw === 'no' || raw === 'disabled') return 'off';
    if (raw === '1' || raw === 'low' || raw === 'l') return 'low';
    if (raw === '2' || raw === 'medium' || raw === 'med' || raw === 'm') return 'medium';
    if (raw === '3' || raw === 'high' || raw === 'h') return 'high';
    if (raw === '4' || raw === 'ultra' || raw === 'u' || raw === 'max') return 'ultra';
    return SHADOW_DEFAULTS.quality;
}

export function sanitizeShadowSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    return { quality: sanitizeQuality(src.quality ?? SHADOW_DEFAULTS.quality) };
}

export function getShadowQualityPreset(quality) {
    const id = sanitizeQuality(quality);
    return SHADOW_QUALITY_PRESETS[id] ?? SHADOW_QUALITY_PRESETS[SHADOW_DEFAULTS.quality];
}

export function loadSavedShadowSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return sanitizeShadowSettings(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function saveShadowSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeShadowSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedShadowSettings() {
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

export function getResolvedShadowSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedShadowSettings();
    const merged = sanitizeShadowSettings({ ...SHADOW_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.has('shadowQuality')) merged.quality = sanitizeQuality(params.get('shadowQuality'));
        if (params.has('shadows')) merged.quality = sanitizeQuality(params.get('shadows'));
    }

    return merged;
}

export function getDefaultResolvedShadowSettings() {
    return sanitizeShadowSettings(SHADOW_DEFAULTS);
}

