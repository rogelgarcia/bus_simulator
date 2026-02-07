// src/graphics/visuals/postprocessing/AmbientOcclusionSettings.js
// Persisted ambient occlusion (AO) settings (Off/SSAO/GTAO) for the post-processing pipeline.
// @ts-check

const STORAGE_KEY = 'bus_sim.ambientOcclusion.v1';

export const AMBIENT_OCCLUSION_DEFAULTS = Object.freeze({
    mode: 'off',
    alpha: {
        handling: 'alpha_test',
        threshold: 0.5
    },
    staticAo: {
        mode: 'off',
        intensity: 0.6,
        quality: 'medium',
        radius: 4.0,
        wallHeight: 1.6,
        debugView: false
    },
    busContactShadow: {
        enabled: false,
        intensity: 0.4,
        radius: 0.9,
        softness: 0.75,
        maxDistance: 0.75
    },
    ssao: {
        intensity: 0.35,
        radius: 8,
        quality: 'medium'
    },
    gtao: {
        intensity: 0.35,
        radius: 0.25,
        quality: 'medium',
        denoise: true,
        updateMode: 'every_frame',
        motionThreshold: {
            positionMeters: 0.02,
            rotationDeg: 0.15,
            fovDeg: 0
        }
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

function sanitizeAlphaHandling(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'exclude' || raw === 'off' || raw === 'none' || raw === 'opaque') return 'exclude';
    if (raw === 'alpha_test' || raw === 'alpha-test' || raw === 'alphatest' || raw === 'cutout' || raw === 'alpha') return 'alpha_test';
    return AMBIENT_OCCLUSION_DEFAULTS.alpha.handling;
}

function sanitizeQuality(quality, fallback) {
    const raw = typeof quality === 'string' ? quality.trim().toLowerCase() : '';
    if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
    return fallback;
}

function sanitizeStaticAoMode(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'off' || raw === 'none' || raw === 'no' || raw === 'false' || raw === 'disabled') return 'off';
    if (raw === 'vertex' || raw === 'vertex_ao' || raw === 'vertexao') return 'vertex';
    return AMBIENT_OCCLUSION_DEFAULTS.staticAo.mode;
}

function sanitizeGtaoUpdateMode(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'every_frame' || raw === 'everyframe') return 'every_frame';
    if (raw === 'when_camera_moves' || raw === 'whencameramoves') return 'when_camera_moves';
    if (raw === 'half_rate' || raw === 'halfrate') return 'half_rate';
    if (raw === 'third_rate' || raw === 'thirdrate') return 'third_rate';
    if (raw === 'quarter_rate' || raw === 'quarterrate') return 'quarter_rate';
    return AMBIENT_OCCLUSION_DEFAULTS.gtao.updateMode;
}

function sanitizeMotionThreshold(input) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        positionMeters: clamp(
            src.positionMeters,
            0,
            5,
            AMBIENT_OCCLUSION_DEFAULTS.gtao.motionThreshold.positionMeters
        ),
        rotationDeg: clamp(
            src.rotationDeg,
            0,
            180,
            AMBIENT_OCCLUSION_DEFAULTS.gtao.motionThreshold.rotationDeg
        ),
        fovDeg: clamp(
            src.fovDeg,
            0,
            180,
            AMBIENT_OCCLUSION_DEFAULTS.gtao.motionThreshold.fovDeg
        )
    };
}

export function sanitizeAmbientOcclusionSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const alpha = src.alpha && typeof src.alpha === 'object' ? src.alpha : {};
    const staticAo = src.staticAo && typeof src.staticAo === 'object' ? src.staticAo : {};
    const busContactShadow = src.busContactShadow && typeof src.busContactShadow === 'object' ? src.busContactShadow : {};
    const ssao = src.ssao && typeof src.ssao === 'object' ? src.ssao : {};
    const gtao = src.gtao && typeof src.gtao === 'object' ? src.gtao : {};

    const staticAoQuality = sanitizeQuality(staticAo.quality, AMBIENT_OCCLUSION_DEFAULTS.staticAo.quality);
    const ssaoQuality = sanitizeQuality(ssao.quality, AMBIENT_OCCLUSION_DEFAULTS.ssao.quality);
    const gtaoQuality = sanitizeQuality(gtao.quality, AMBIENT_OCCLUSION_DEFAULTS.gtao.quality);

    return {
        mode: sanitizeMode(src.mode),
        alpha: {
            handling: sanitizeAlphaHandling(alpha.handling),
            threshold: clamp(alpha.threshold, 0.01, 0.99, AMBIENT_OCCLUSION_DEFAULTS.alpha.threshold)
        },
        staticAo: {
            mode: sanitizeStaticAoMode(staticAo.mode),
            intensity: clamp(staticAo.intensity, 0, 2, AMBIENT_OCCLUSION_DEFAULTS.staticAo.intensity),
            quality: staticAoQuality,
            radius: clamp(staticAo.radius, 0.25, 32, AMBIENT_OCCLUSION_DEFAULTS.staticAo.radius),
            wallHeight: clamp(staticAo.wallHeight, 0.25, 12, AMBIENT_OCCLUSION_DEFAULTS.staticAo.wallHeight),
            debugView: staticAo.debugView !== undefined ? !!staticAo.debugView : AMBIENT_OCCLUSION_DEFAULTS.staticAo.debugView
        },
        busContactShadow: {
            enabled: busContactShadow.enabled !== undefined ? !!busContactShadow.enabled : AMBIENT_OCCLUSION_DEFAULTS.busContactShadow.enabled,
            intensity: clamp(busContactShadow.intensity, 0, 2, AMBIENT_OCCLUSION_DEFAULTS.busContactShadow.intensity),
            radius: clamp(busContactShadow.radius, 0.05, 5, AMBIENT_OCCLUSION_DEFAULTS.busContactShadow.radius),
            softness: clamp(busContactShadow.softness, 0.02, 1, AMBIENT_OCCLUSION_DEFAULTS.busContactShadow.softness),
            maxDistance: clamp(busContactShadow.maxDistance, 0, 5, AMBIENT_OCCLUSION_DEFAULTS.busContactShadow.maxDistance)
        },
        ssao: {
            intensity: clamp(ssao.intensity, 0, 2, AMBIENT_OCCLUSION_DEFAULTS.ssao.intensity),
            radius: clamp(ssao.radius, 0.1, 64, AMBIENT_OCCLUSION_DEFAULTS.ssao.radius),
            quality: ssaoQuality
        },
        gtao: {
            intensity: clamp(gtao.intensity, 0, 2, AMBIENT_OCCLUSION_DEFAULTS.gtao.intensity),
            radius: clamp(gtao.radius, 0.05, 8, AMBIENT_OCCLUSION_DEFAULTS.gtao.radius),
            quality: gtaoQuality,
            denoise: gtao.denoise !== undefined ? !!gtao.denoise : AMBIENT_OCCLUSION_DEFAULTS.gtao.denoise,
            updateMode: sanitizeGtaoUpdateMode(gtao.updateMode),
            motionThreshold: sanitizeMotionThreshold(gtao.motionThreshold)
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
