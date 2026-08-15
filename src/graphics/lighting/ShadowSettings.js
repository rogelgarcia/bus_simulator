// src/graphics/lighting/ShadowSettings.js
// Persisted global shadow quality settings.
// @ts-check

const STORAGE_KEY = 'bus_sim.shadows.v1';

export const SHADOW_DEFAULTS = Object.freeze({
    quality: 'high',
    cascades: 4,
    // Scales every cascade split distance: >1 pushes the sharpness step-down
    // further from the camera at the cost of texel density, <1 the reverse.
    splitScale: 1,
    // Cast each building's shadow from one merged mesh instead of one per
    // material. Lossless (same triangles), purely a draw-call saving.
    mergeCasters: true
});

// `cascades` marks a preset as cascaded shadow maps (N camera-fitted maps by
// depth range) instead of the single fitted map; mapSize is then per cascade.
//
// shadowMapType is 'pcf' everywhere: three 0.183 deprecated PCFSoftShadowMap
// and silently coerces it to PCFShadowMap at render time (with a console
// warning), so 'pcf_soft' was never a distinct filter -- naming it directly
// keeps the console clean and makes `radius` obviously the softness dial.
//
// `radius` is the PCF sampling disk in TEXELS (5-tap Vogel disk), so its
// world-space penumbra scales with each cascade's texel size automatically.
//
// Keep it small. The sun subtends ~0.53 deg, so a physically honest penumbra
// is ~0.0093 x the caster-to-receiver distance: ~3 cm under a bus roof 3.2 m
// up, and near zero at contact points. On the near cascade (0.024 m/texel)
// that is ~1.25-1.5 texels. Larger values were tried to hide edge stepping and
// read as wrong -- a midday sun makes hard shadows, and a blurred edge looks
// like an overcast sky. Sharpen edges with resolution, not with radius.
export const SHADOW_QUALITY_PRESETS = Object.freeze({
    off: Object.freeze({ enabled: false, shadowMapType: 'pcf', mapSize: 0, radius: 1, bias: 0, normalBias: 0, twoSidedCasting: false }),
    low: Object.freeze({ enabled: true, shadowMapType: 'pcf', mapSize: 1024, radius: 2, bias: -0.0001, normalBias: 0.01, twoSidedCasting: false }),
    medium: Object.freeze({ enabled: true, shadowMapType: 'pcf', mapSize: 2048, radius: 1.5, bias: -0.00015, normalBias: 0.02, twoSidedCasting: true }),
    high: Object.freeze({ enabled: true, shadowMapType: 'pcf', mapSize: 4096, radius: 1.25, bias: -0.0002, normalBias: 0.03, twoSidedCasting: true }),
    ultra: Object.freeze({ enabled: true, shadowMapType: 'pcf', mapSize: 4096, radius: 1, bias: -0.0002, normalBias: 0.035, twoSidedCasting: true }),
    // Cascade Ultra — the top cascaded preset. A shadow-map box is ~2.2x its
    // split distance, so one wide near cascade cannot be both sharp and
    // long-range; splitting the near range instead keeps everything inside
    // ~190 m at or below the single fitted map's 0.054 m/texel while still
    // reaching the skyline. Yields 0.012 / 0.024 / 0.051 / 0.185 m per texel.
    //
    // A cascade preset is self-describing: `splits` are metres from the camera
    // (the last one is also the shadow horizon) and `mapSizeScales` multiply
    // `mapSize` per cascade. Both must have `cascades` entries, and the scales
    // must be powers of two — the texel-snapping grid needs every cascade's
    // texel size to be a whole multiple of the smallest. Sibling presets
    // (lighter cascade tiers) should be added here as data, not as new code.
    cascade_ultra: Object.freeze({
        enabled: true,
        shadowMapType: 'pcf',
        mapSize: 4096,
        radius: 1.5,
        bias: -0.00015,
        normalBias: 0.02,
        twoSidedCasting: true,
        cascades: 4,
        splits: Object.freeze([45, 90, 190, 340]),
        mapSizeScales: Object.freeze([2, 2, 2, 1])
    })
});

function sanitizeQuality(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === '0' || raw === 'off' || raw === 'none' || raw === 'false' || raw === 'no' || raw === 'disabled') return 'off';
    if (raw === '1' || raw === 'low' || raw === 'l') return 'low';
    if (raw === '2' || raw === 'medium' || raw === 'med' || raw === 'm') return 'medium';
    if (raw === '3' || raw === 'high' || raw === 'h') return 'high';
    if (raw === '4' || raw === 'ultra' || raw === 'u' || raw === 'max') return 'ultra';
    // 'cascaded' was the id before the cascade tiers were named; keep it (and
    // the other spellings) resolving so saved settings and URLs still work.
    if (raw === '5' || raw === 'cascade_ultra' || raw === 'cascade ultra' || raw === 'cascadeultra'
        || raw === 'cascaded' || raw === 'cascade' || raw === 'csm') return 'cascade_ultra';
    return SHADOW_DEFAULTS.quality;
}

function sanitizeCascades(value) {
    const num = Math.round(Number(value));
    if (!Number.isFinite(num)) return SHADOW_DEFAULTS.cascades;
    return Math.max(2, Math.min(4, num));
}

function sanitizeSplitScale(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return SHADOW_DEFAULTS.splitScale;
    return Math.max(0.5, Math.min(2.5, num));
}

function sanitizeBool(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const raw = value.trim().toLowerCase();
        if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes') return true;
        if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
    }
    return fallback;
}

export function sanitizeShadowSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        quality: sanitizeQuality(src.quality ?? SHADOW_DEFAULTS.quality),
        cascades: sanitizeCascades(src.cascades ?? SHADOW_DEFAULTS.cascades),
        splitScale: sanitizeSplitScale(src.splitScale ?? SHADOW_DEFAULTS.splitScale),
        mergeCasters: sanitizeBool(src.mergeCasters, SHADOW_DEFAULTS.mergeCasters)
    };
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
        if (params.has('shadowCascades')) merged.cascades = sanitizeCascades(params.get('shadowCascades'));
        if (params.has('shadowSplitScale')) merged.splitScale = sanitizeSplitScale(params.get('shadowSplitScale'));
        if (params.has('shadowMergeCasters')) merged.mergeCasters = sanitizeBool(params.get('shadowMergeCasters'), merged.mergeCasters);
    }

    return merged;
}

export function getDefaultResolvedShadowSettings() {
    return sanitizeShadowSettings(SHADOW_DEFAULTS);
}
