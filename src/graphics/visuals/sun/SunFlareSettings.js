// src/graphics/visuals/sun/SunFlareSettings.js
// Persisted sun lens flare settings.
// @ts-check

const STORAGE_KEY = 'bus_sim.sunFlare.v1';

export const SUN_FLARE_DEFAULTS = Object.freeze({
    enabled: true,
    preset: 'subtle',
    strength: 0.65,
    components: Object.freeze({
        core: true,
        halo: true,
        starburst: true,
        ghosting: true
    })
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function normalizePresetId(id, fallback) {
    const raw = typeof id === 'string' ? id.trim().toLowerCase() : '';
    return raw || fallback;
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
    const v = typeof raw === 'string' ? raw.trim() : '';
    return v || fallback;
}

export function sanitizeSunFlareSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const enabled = src.enabled !== undefined ? !!src.enabled : SUN_FLARE_DEFAULTS.enabled;
    const rawComponents = src.components && typeof src.components === 'object' ? src.components : {};
    const componentsDefaults = SUN_FLARE_DEFAULTS.components ?? {};
    const components = {
        core: rawComponents.core !== undefined ? !!rawComponents.core : !!componentsDefaults.core,
        halo: rawComponents.halo !== undefined ? !!rawComponents.halo : !!componentsDefaults.halo,
        starburst: rawComponents.starburst !== undefined ? !!rawComponents.starburst : !!componentsDefaults.starburst,
        ghosting: rawComponents.ghosting !== undefined ? !!rawComponents.ghosting : !!componentsDefaults.ghosting
    };
    return {
        enabled,
        preset: normalizePresetId(src.preset, SUN_FLARE_DEFAULTS.preset),
        strength: clamp(src.strength ?? SUN_FLARE_DEFAULTS.strength, 0, 2, SUN_FLARE_DEFAULTS.strength),
        components
    };
}

export function loadSavedSunFlareSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return sanitizeSunFlareSettings(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function saveSunFlareSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeSunFlareSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedSunFlareSettings() {
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

export function getResolvedSunFlareSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedSunFlareSettings();
    const merged = sanitizeSunFlareSettings({ ...SUN_FLARE_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        merged.enabled = readUrlParamBool(params, 'sunFlare', merged.enabled);
        merged.preset = normalizePresetId(readUrlParamString(params, 'sunFlarePreset', merged.preset), merged.preset);
        merged.strength = readUrlParamNumber(params, 'sunFlareStrength', merged.strength, { min: 0, max: 2 });
    }

    return merged;
}

export function getDefaultResolvedSunFlareSettings() {
    return sanitizeSunFlareSettings(SUN_FLARE_DEFAULTS);
}
