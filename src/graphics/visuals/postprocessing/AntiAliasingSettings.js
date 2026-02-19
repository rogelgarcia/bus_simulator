// src/graphics/visuals/postprocessing/AntiAliasingSettings.js
// Persisted anti-aliasing settings (MSAA/TAA/SMAA/FXAA) for the post-processing pipeline.
// @ts-check

const STORAGE_KEY = 'bus_sim.antiAliasing.v1';

export const ANTIALIASING_DEFAULTS = Object.freeze({
    mode: 'msaa',
    msaa: {
        samples: 8
    },
    taa: {
        preset: 'high',
        historyStrength: 0.9,
        jitter: 1.0,
        sharpen: 0.15,
        clampStrength: 0.8
    },
    smaa: {
        preset: 'custom',
        threshold: 0.02,
        maxSearchSteps: 23,
        maxSearchStepsDiag: 12,
        cornerRounding: 20
    },
    fxaa: {
        preset: 'balanced',
        edgeThreshold: 0.2
    }
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

function sanitizeMode(mode) {
    const raw = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
    if (raw === 'off' || raw === 'none' || raw === 'noaa' || raw === 'no_aa') return 'off';
    if (raw === 'msaa') return 'msaa';
    if (raw === 'taa' || raw === 't2x' || raw === 'temporal' || raw === 'temporal_aa' || raw === 'temporal-aa') return 'taa';
    if (raw === 'smaa t2x' || raw === 'smaa_t2x' || raw === 'smaa-t2x') return 'taa';
    if (raw === 'smaa') return 'smaa';
    if (raw === 'fxaa') return 'fxaa';
    return ANTIALIASING_DEFAULTS.mode;
}

function sanitizeMsaaSamples(samples) {
    const num = Math.round(clamp(samples, 0, 16, ANTIALIASING_DEFAULTS.msaa.samples));
    if (num <= 0) return 0;
    if (num <= 2) return 2;
    if (num <= 4) return 4;
    return 8;
}

function sanitizeSmaaPreset(preset) {
    const raw = typeof preset === 'string' ? preset.trim().toLowerCase() : '';
    if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'ultra' || raw === 'custom') return raw;
    return ANTIALIASING_DEFAULTS.smaa.preset;
}

function sanitizeTaaPreset(preset) {
    const raw = typeof preset === 'string' ? preset.trim().toLowerCase() : '';
    if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'ultra' || raw === 'custom') return raw;
    return ANTIALIASING_DEFAULTS.taa.preset;
}

function sanitizeFxaaPreset(preset) {
    const raw = typeof preset === 'string' ? preset.trim().toLowerCase() : '';
    if (raw === 'sharp' || raw === 'balanced' || raw === 'soft' || raw === 'custom') return raw;
    return ANTIALIASING_DEFAULTS.fxaa.preset;
}

export function sanitizeAntiAliasingSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const msaa = src.msaa && typeof src.msaa === 'object' ? src.msaa : {};
    const taa = src.taa && typeof src.taa === 'object' ? src.taa : {};
    const smaa = src.smaa && typeof src.smaa === 'object' ? src.smaa : {};
    const fxaa = src.fxaa && typeof src.fxaa === 'object' ? src.fxaa : {};

    const taaHistoryStrength = clamp(
        taa.historyStrength ?? ANTIALIASING_DEFAULTS.taa.historyStrength,
        0,
        0.98,
        ANTIALIASING_DEFAULTS.taa.historyStrength
    );
    const taaJitter = clamp(
        taa.jitter ?? ANTIALIASING_DEFAULTS.taa.jitter,
        0,
        1,
        ANTIALIASING_DEFAULTS.taa.jitter
    );
    const taaSharpen = clamp(
        taa.sharpen ?? ANTIALIASING_DEFAULTS.taa.sharpen,
        0,
        1,
        ANTIALIASING_DEFAULTS.taa.sharpen
    );
    const taaClampStrength = clamp(
        taa.clampStrength ?? ANTIALIASING_DEFAULTS.taa.clampStrength,
        0,
        1,
        ANTIALIASING_DEFAULTS.taa.clampStrength
    );

    const smaaThreshold = clamp(smaa.threshold ?? ANTIALIASING_DEFAULTS.smaa.threshold, 0.01, 0.5, ANTIALIASING_DEFAULTS.smaa.threshold);
    const smaaMaxSearchSteps = Math.round(
        clamp(smaa.maxSearchSteps ?? ANTIALIASING_DEFAULTS.smaa.maxSearchSteps, 4, 64, ANTIALIASING_DEFAULTS.smaa.maxSearchSteps)
    );
    const smaaMaxSearchStepsDiag = Math.round(
        clamp(smaa.maxSearchStepsDiag ?? ANTIALIASING_DEFAULTS.smaa.maxSearchStepsDiag, 0, 32, ANTIALIASING_DEFAULTS.smaa.maxSearchStepsDiag)
    );
    const smaaCornerRounding = Math.round(
        clamp(smaa.cornerRounding ?? ANTIALIASING_DEFAULTS.smaa.cornerRounding, 0, 100, ANTIALIASING_DEFAULTS.smaa.cornerRounding)
    );

    const fxaaEdgeThreshold = clamp(fxaa.edgeThreshold ?? ANTIALIASING_DEFAULTS.fxaa.edgeThreshold, 0.02, 0.5, ANTIALIASING_DEFAULTS.fxaa.edgeThreshold);

    return {
        mode: sanitizeMode(src.mode),
        msaa: {
            samples: sanitizeMsaaSamples(msaa.samples ?? ANTIALIASING_DEFAULTS.msaa.samples)
        },
        taa: {
            preset: sanitizeTaaPreset(taa.preset),
            historyStrength: taaHistoryStrength,
            jitter: taaJitter,
            sharpen: taaSharpen,
            clampStrength: taaClampStrength
        },
        smaa: {
            preset: sanitizeSmaaPreset(smaa.preset),
            threshold: smaaThreshold,
            maxSearchSteps: smaaMaxSearchSteps,
            maxSearchStepsDiag: smaaMaxSearchStepsDiag,
            cornerRounding: smaaCornerRounding
        },
        fxaa: {
            preset: sanitizeFxaaPreset(fxaa.preset),
            edgeThreshold: fxaaEdgeThreshold
        }
    };
}

export function loadSavedAntiAliasingSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return sanitizeAntiAliasingSettings(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function saveAntiAliasingSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeAntiAliasingSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedAntiAliasingSettings() {
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

export function getResolvedAntiAliasingSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedAntiAliasingSettings();
    const merged = sanitizeAntiAliasingSettings({ ...ANTIALIASING_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.has('aa')) merged.mode = sanitizeMode(params.get('aa'));
        if (params.has('msaaSamples')) merged.msaa.samples = sanitizeMsaaSamples(params.get('msaaSamples'));
        if (params.has('taaPreset')) merged.taa.preset = sanitizeTaaPreset(params.get('taaPreset'));
        if (params.has('taaHistory')) merged.taa.historyStrength = clamp(params.get('taaHistory'), 0, 0.98, merged.taa.historyStrength);
        if (params.has('taaJitter')) merged.taa.jitter = clamp(params.get('taaJitter'), 0, 1, merged.taa.jitter);
        if (params.has('taaSharpen')) merged.taa.sharpen = clamp(params.get('taaSharpen'), 0, 1, merged.taa.sharpen);
        if (params.has('taaClamp')) merged.taa.clampStrength = clamp(params.get('taaClamp'), 0, 1, merged.taa.clampStrength);
    }

    return merged;
}

export function getDefaultResolvedAntiAliasingSettings() {
    return sanitizeAntiAliasingSettings(ANTIALIASING_DEFAULTS);
}
