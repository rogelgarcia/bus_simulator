// src/graphics/visuals/postprocessing/AmbientOcclusionSettings.js
// Persisted ambient occlusion (AO) settings (Off/SSAO/GTAO) for the post-processing pipeline.
// @ts-check

const STORAGE_KEY = 'bus_sim.ambientOcclusion.v1';

export const AMBIENT_OCCLUSION_DEFAULTS = Object.freeze({
    mode: 'off',
    ssao: {
        intensity: 0.35,
        radius: 8,
        quality: 'medium'
    },
    gtao: {
        intensity: 0.35,
        radius: 0.25,
        quality: 'medium',
        denoise: true
    }
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function sanitizeMode(mode) {
    const raw = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
    if (raw === 'off' || raw === 'none' || raw === 'no' || raw === 'false' || raw === 'disabled') return 'off';
    if (raw === 'ssao') return 'ssao';
    if (raw === 'gtao') return 'gtao';
    return AMBIENT_OCCLUSION_DEFAULTS.mode;
}

function sanitizeQuality(quality, fallback) {
    const raw = typeof quality === 'string' ? quality.trim().toLowerCase() : '';
    if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
    return fallback;
}

export function sanitizeAmbientOcclusionSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const ssao = src.ssao && typeof src.ssao === 'object' ? src.ssao : {};
    const gtao = src.gtao && typeof src.gtao === 'object' ? src.gtao : {};

    const ssaoQuality = sanitizeQuality(ssao.quality, AMBIENT_OCCLUSION_DEFAULTS.ssao.quality);
    const gtaoQuality = sanitizeQuality(gtao.quality, AMBIENT_OCCLUSION_DEFAULTS.gtao.quality);

    return {
        mode: sanitizeMode(src.mode),
        ssao: {
            intensity: clamp(ssao.intensity, 0, 2, AMBIENT_OCCLUSION_DEFAULTS.ssao.intensity),
            radius: clamp(ssao.radius, 0.1, 64, AMBIENT_OCCLUSION_DEFAULTS.ssao.radius),
            quality: ssaoQuality
        },
        gtao: {
            intensity: clamp(gtao.intensity, 0, 2, AMBIENT_OCCLUSION_DEFAULTS.gtao.intensity),
            radius: clamp(gtao.radius, 0.05, 8, AMBIENT_OCCLUSION_DEFAULTS.gtao.radius),
            quality: gtaoQuality,
            denoise: gtao.denoise !== undefined ? !!gtao.denoise : AMBIENT_OCCLUSION_DEFAULTS.gtao.denoise
        }
    };
}

export function loadSavedAmbientOcclusionSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return sanitizeAmbientOcclusionSettings(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function saveAmbientOcclusionSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeAmbientOcclusionSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedAmbientOcclusionSettings() {
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

export function getResolvedAmbientOcclusionSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedAmbientOcclusionSettings();
    const merged = sanitizeAmbientOcclusionSettings({ ...AMBIENT_OCCLUSION_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.has('ao')) merged.mode = sanitizeMode(params.get('ao'));
        if (params.has('ssaoIntensity')) merged.ssao.intensity = clamp(params.get('ssaoIntensity'), 0, 2, merged.ssao.intensity);
        if (params.has('ssaoRadius')) merged.ssao.radius = clamp(params.get('ssaoRadius'), 0.1, 64, merged.ssao.radius);
        if (params.has('ssaoQuality')) merged.ssao.quality = sanitizeQuality(params.get('ssaoQuality'), merged.ssao.quality);
    }

    return merged;
}

export function getDefaultResolvedAmbientOcclusionSettings() {
    return sanitizeAmbientOcclusionSettings(AMBIENT_OCCLUSION_DEFAULTS);
}

