// src/graphics/visuals/postprocessing/ColorGradingSettings.js
// Persisted LUT-based color grading settings.
// @ts-check

const STORAGE_KEY = 'bus_sim.colorGrading.v1';

const LEGACY_COLOR_GRADING_DEFAULTS_V1 = Object.freeze({
    preset: 'off',
    intensity: 1.0
});

export const COLOR_GRADING_DEFAULTS = Object.freeze({
    preset: 'off',
    intensity: 0.5
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

function readUrlParamString(params, key, fallback) {
    if (!params?.has?.(key)) return fallback;
    const raw = params.get(key);
    const v = typeof raw === 'string' ? raw.trim() : '';
    return v || fallback;
}

export function sanitizeColorGradingSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        preset: normalizePresetId(src.preset, COLOR_GRADING_DEFAULTS.preset),
        intensity: clamp(src.intensity ?? COLOR_GRADING_DEFAULTS.intensity, 0, 1, COLOR_GRADING_DEFAULTS.intensity)
    };
}

export function loadSavedColorGradingSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const saved = sanitizeColorGradingSettings(JSON.parse(raw));
        const isLegacyDefault = saved.preset === LEGACY_COLOR_GRADING_DEFAULTS_V1.preset
            && saved.intensity === LEGACY_COLOR_GRADING_DEFAULTS_V1.intensity;
        if (!isLegacyDefault) return saved;

        const migrated = sanitizeColorGradingSettings(COLOR_GRADING_DEFAULTS);
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

export function saveColorGradingSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeColorGradingSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedColorGradingSettings() {
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

export function getResolvedColorGradingSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedColorGradingSettings();
    const merged = sanitizeColorGradingSettings({ ...COLOR_GRADING_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        merged.preset = normalizePresetId(readUrlParamString(params, 'grade', merged.preset), merged.preset);
        merged.intensity = readUrlParamNumber(params, 'gradeIntensity', merged.intensity, { min: 0, max: 1 });
    }

    return merged;
}

export function getDefaultResolvedColorGradingSettings() {
    return sanitizeColorGradingSettings(COLOR_GRADING_DEFAULTS);
}
