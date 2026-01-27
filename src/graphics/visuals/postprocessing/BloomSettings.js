// src/graphics/visuals/postprocessing/BloomSettings.js
// Persisted bloom (glow) post-processing settings.
// @ts-check

const STORAGE_KEY = 'bus_sim.bloom.v3';

const LEGACY_BLOOM_DEFAULTS_V3 = Object.freeze({
    enabled: false,
    strength: 0.22,
    radius: 0.12,
    threshold: 1.05
});

export const BLOOM_DEFAULTS = Object.freeze({
    enabled: false,
    strength: 0.02,
    radius: 0.05,
    threshold: 5
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
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

export function sanitizeBloomSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const enabled = src.enabled !== undefined ? !!src.enabled : BLOOM_DEFAULTS.enabled;

    return {
        enabled,
        strength: clamp(src.strength ?? BLOOM_DEFAULTS.strength, 0, 3, BLOOM_DEFAULTS.strength),
        radius: clamp(src.radius ?? BLOOM_DEFAULTS.radius, 0, 1, BLOOM_DEFAULTS.radius),
        threshold: clamp(src.threshold ?? BLOOM_DEFAULTS.threshold, 0, 5, BLOOM_DEFAULTS.threshold)
    };
}

export function loadSavedBloomSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const saved = sanitizeBloomSettings(JSON.parse(raw));
        const isLegacyDefault = saved.enabled === LEGACY_BLOOM_DEFAULTS_V3.enabled
            && saved.strength === LEGACY_BLOOM_DEFAULTS_V3.strength
            && saved.radius === LEGACY_BLOOM_DEFAULTS_V3.radius
            && saved.threshold === LEGACY_BLOOM_DEFAULTS_V3.threshold;
        if (!isLegacyDefault) return saved;

        const migrated = sanitizeBloomSettings(BLOOM_DEFAULTS);
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

export function saveBloomSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeBloomSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedBloomSettings() {
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

export function getResolvedBloomSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedBloomSettings();
    const merged = sanitizeBloomSettings({ ...BLOOM_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        merged.enabled = readUrlParamBool(params, 'bloom', merged.enabled);
        merged.strength = readUrlParamNumber(params, 'bloomStrength', merged.strength, { min: 0, max: 3 });
        merged.radius = readUrlParamNumber(params, 'bloomRadius', merged.radius, { min: 0, max: 1 });
        merged.threshold = readUrlParamNumber(params, 'bloomThreshold', merged.threshold, { min: 0, max: 5 });
    }

    return merged;
}

export function getDefaultResolvedBloomSettings() {
    return sanitizeBloomSettings(BLOOM_DEFAULTS);
}
