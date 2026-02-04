// src/app/vehicle/VehicleVisualSmoothingSettings.js
// Persisted vehicle visual smoothing settings (visual-only anchor smoothing under uneven frame pacing).
// @ts-check

const STORAGE_KEY = 'bus_sim.vehicleVisualSmoothing.v1';

export const VEHICLE_VISUAL_SMOOTHING_DEFAULTS = Object.freeze({
    enabled: false,
    // If a frame runs long, physics advances farther in that one frame. This caps how much the *visual*
    // anchor can move toward the physics pose per frame (based on a nominal dt), then "catches up".
    catchupFactor: 1.6,
    maxLagMeters: 2.0,
    nominalFps: 60
});

function clamp(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
}

export function sanitizeVehicleVisualSmoothingSettings(input) {
    const src = input && typeof input === 'object' ? input : {};
    const nominalFps = Math.round(clamp(src.nominalFps ?? VEHICLE_VISUAL_SMOOTHING_DEFAULTS.nominalFps, 15, 240, VEHICLE_VISUAL_SMOOTHING_DEFAULTS.nominalFps));
    return {
        enabled: src.enabled === true,
        catchupFactor: clamp(src.catchupFactor ?? VEHICLE_VISUAL_SMOOTHING_DEFAULTS.catchupFactor, 1.0, 6.0, VEHICLE_VISUAL_SMOOTHING_DEFAULTS.catchupFactor),
        maxLagMeters: clamp(src.maxLagMeters ?? VEHICLE_VISUAL_SMOOTHING_DEFAULTS.maxLagMeters, 0.1, 20.0, VEHICLE_VISUAL_SMOOTHING_DEFAULTS.maxLagMeters),
        nominalFps
    };
}

export function loadSavedVehicleVisualSmoothingSettings() {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return sanitizeVehicleVisualSmoothingSettings(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function saveVehicleVisualSmoothingSettings(settings) {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const payload = sanitizeVehicleVisualSmoothingSettings(settings);
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearSavedVehicleVisualSmoothingSettings() {
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

export function getResolvedVehicleVisualSmoothingSettings({ includeUrlOverrides = true } = {}) {
    const saved = loadSavedVehicleVisualSmoothingSettings();
    const merged = sanitizeVehicleVisualSmoothingSettings({ ...VEHICLE_VISUAL_SMOOTHING_DEFAULTS, ...(saved ?? {}) });

    if (includeUrlOverrides && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.has('vehicleSmooth')) {
            const raw = String(params.get('vehicleSmooth') ?? '').trim().toLowerCase();
            merged.enabled = !(['0', 'false', 'no', 'off'].includes(raw));
        }
        if (params.has('vehicleSmoothCatchup')) {
            merged.catchupFactor = clamp(params.get('vehicleSmoothCatchup'), 1.0, 6.0, merged.catchupFactor);
        }
        if (params.has('vehicleSmoothMaxLag')) {
            merged.maxLagMeters = clamp(params.get('vehicleSmoothMaxLag'), 0.1, 20.0, merged.maxLagMeters);
        }
    }

    return merged;
}

export function getDefaultResolvedVehicleVisualSmoothingSettings() {
    return sanitizeVehicleVisualSmoothingSettings(VEHICLE_VISUAL_SMOOTHING_DEFAULTS);
}

