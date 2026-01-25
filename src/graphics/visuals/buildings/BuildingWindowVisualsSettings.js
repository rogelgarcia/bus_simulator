// src/graphics/visuals/buildings/BuildingWindowVisualsSettings.js
// Persisted building window visuals settings.
//
// Storage: localStorage key `bus_sim.buildingWindowVisuals.v1`
// Access: `getResolvedBuildingWindowVisualsSettings()` (thread into building generation entry points).

const STORAGE_KEY = 'bus_sim.buildingWindowVisuals.v1';

export const BUILDING_WINDOW_VISUALS_DEFAULTS = Object.freeze({
    reflective: Object.freeze({
        enabled: false,
        glass: Object.freeze({
            colorHex: 0xffffff,
            metalness: 0.0,
            roughness: 0.02,
            transmission: 0.0,
            ior: 2.2,
            envMapIntensity: 4.0
        })
    })
});

const LEGACY_GLASS_DEFAULTS_V1 = Object.freeze({
    colorHex: 0x222222,
    metalness: 0.1,
    roughness: 0.05,
    transmission: 0.5,
    ior: 1.5,
    envMapIntensity: 1.5
});

const LEGACY_GLASS_DEFAULTS_V2 = Object.freeze({
    colorHex: 0xffffff,
    metalness: 0.0,
    roughness: 0.02,
    transmission: 0.85,
    ior: 2.2,
    envMapIntensity: 4.0
});

const LEGACY_VISUALS_DEFAULTS_V1 = Object.freeze({
    reflective: Object.freeze({
        enabled: true,
        glass: BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass
    })
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
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

function matchesGlassDefaults(glass, defaults) {
    if (!glass || !defaults) return false;
    return glass.colorHex === defaults.colorHex
        && glass.metalness === defaults.metalness
        && glass.roughness === defaults.roughness
        && glass.transmission === defaults.transmission
        && glass.ior === defaults.ior
        && glass.envMapIntensity === defaults.envMapIntensity;
}

export function sanitizeBuildingWindowVisualsSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const reflective = src.reflective && typeof src.reflective === 'object' ? src.reflective : {};
    const glass = reflective.glass && typeof reflective.glass === 'object' ? reflective.glass : {};

    return {
        reflective: {
            enabled: reflective.enabled !== undefined ? !!reflective.enabled : BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.enabled,
            glass: {
                colorHex: Number.isFinite(glass.colorHex)
                    ? (Number(glass.colorHex) >>> 0) & 0xffffff
                    : BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.colorHex,
                metalness: clamp(glass.metalness, 0, 1, BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.metalness),
                roughness: clamp(glass.roughness, 0, 1, BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.roughness),
                transmission: clamp(glass.transmission, 0, 1, BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.transmission),
                ior: clamp(glass.ior, 1, 2.5, BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.ior),
                envMapIntensity: clamp(glass.envMapIntensity, 0, 5, BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.envMapIntensity)
            }
        }
    };
}

export function loadSavedBuildingWindowVisualsSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const saved = sanitizeBuildingWindowVisualsSettings(JSON.parse(raw));
        if (saved?.reflective?.enabled === LEGACY_VISUALS_DEFAULTS_V1.reflective.enabled) {
            const glass = saved?.reflective?.glass ?? null;
            if (matchesGlassDefaults(glass, LEGACY_VISUALS_DEFAULTS_V1.reflective.glass)) {
                saved.reflective.enabled = BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.enabled;
            }
        }
        const glass = saved?.reflective?.glass ?? null;
        if (glass && typeof glass === 'object') {
            if (glass.colorHex === LEGACY_GLASS_DEFAULTS_V1.colorHex) {
                glass.colorHex = BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.colorHex;
            }
            if (glass.metalness === LEGACY_GLASS_DEFAULTS_V1.metalness) {
                glass.metalness = BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.metalness;
            }
            if (glass.roughness === LEGACY_GLASS_DEFAULTS_V1.roughness) {
                glass.roughness = BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.roughness;
            }
            if (glass.transmission === LEGACY_GLASS_DEFAULTS_V1.transmission) {
                glass.transmission = BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.transmission;
            }
            if (glass.ior === LEGACY_GLASS_DEFAULTS_V1.ior) {
                glass.ior = BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.ior;
            }
            if (glass.envMapIntensity === LEGACY_GLASS_DEFAULTS_V1.envMapIntensity) {
                glass.envMapIntensity = BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.envMapIntensity;
            }

            if (matchesGlassDefaults(glass, LEGACY_GLASS_DEFAULTS_V2)) {
                glass.transmission = BUILDING_WINDOW_VISUALS_DEFAULTS.reflective.glass.transmission;
            }
        }
        return saved;
    } catch {
        return null;
    }
}

export function saveBuildingWindowVisualsSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeBuildingWindowVisualsSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedBuildingWindowVisualsSettings() {
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

export function getResolvedBuildingWindowVisualsSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedBuildingWindowVisualsSettings();
    const merged = sanitizeBuildingWindowVisualsSettings({ ...BUILDING_WINDOW_VISUALS_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        merged.reflective.enabled = readUrlParamBool(params, 'buildingWindowsReflective', merged.reflective.enabled);
    }

    return merged;
}

export function getDefaultResolvedBuildingWindowVisualsSettings() {
    return sanitizeBuildingWindowVisualsSettings(BUILDING_WINDOW_VISUALS_DEFAULTS);
}
