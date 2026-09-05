// Owns persisted player intent for optional baked-lighting channels.
// @ts-check

const STORAGE_KEY = 'bus_sim.bakedLighting.v1';

export const BAKED_DYNAMIC_SHADOW_RESOLUTIONS = Object.freeze({
    medium: 'medium',
    high: 'high'
});

export const BAKED_LIGHTING_DEFAULTS = Object.freeze({
    shadows: Object.freeze({
        enabled: true,
        dynamicResolution: BAKED_DYNAMIC_SHADOW_RESOLUTIONS.high
    }),
    receivers: Object.freeze({ direct: false, indirect: false, linked: true, enhanced: false, debug: 'final' })
});

/**
 * @param {unknown} input
 * @returns {{shadows: {enabled: boolean, dynamicResolution: 'medium' | 'high'}, receivers: {direct: boolean, indirect: boolean, linked: boolean, enhanced: boolean, debug: string}}}
 */
export function sanitizeBakedLightingSettings(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const shadows = source.shadows && typeof source.shadows === 'object' && !Array.isArray(source.shadows)
        ? source.shadows
        : {};
    const dynamicResolution = shadows.dynamicResolution === BAKED_DYNAMIC_SHADOW_RESOLUTIONS.high
        ? BAKED_DYNAMIC_SHADOW_RESOLUTIONS.high
        : BAKED_DYNAMIC_SHADOW_RESOLUTIONS.medium;
    const receivers = source.receivers ?? {};
    const debugModes = ['final', 'direct', 'indirect', 'combined', 'uv', 'pages', 'unmapped', 'difference', 'mip'];
    return { shadows: { enabled: shadows.enabled === true, dynamicResolution },
        receivers: { direct: receivers.direct === true, indirect: receivers.indirect === true,
            linked: receivers.linked !== false, enhanced: receivers.enhanced === true,
            debug: debugModes.includes(receivers.debug) ? receivers.debug : 'final' } };
}

export function loadSavedBakedLightingSettings() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage?.getItem(STORAGE_KEY);
        return raw ? sanitizeBakedLightingSettings(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

/** @param {unknown} settings */
export function saveBakedLightingSettings(settings) {
    if (typeof window === 'undefined') return false;
    try {
        const storage = window.localStorage;
        if (!storage) return false;
        storage.setItem(STORAGE_KEY, JSON.stringify(sanitizeBakedLightingSettings(settings)));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedBakedLightingSettings() {
    if (typeof window === 'undefined') return false;
    try {
        const storage = window.localStorage;
        if (!storage) return false;
        storage.removeItem(STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

export function getResolvedBakedLightingSettings() {
    return sanitizeBakedLightingSettings(loadSavedBakedLightingSettings() ?? BAKED_LIGHTING_DEFAULTS);
}

export function getDefaultResolvedBakedLightingSettings() {
    return sanitizeBakedLightingSettings(BAKED_LIGHTING_DEFAULTS);
}
