// Persisted gameplay grass mode; missing and obsolete values follow the 3D default.
// @ts-check
export const GRASS_STORAGE_KEY = 'bus_sim.grass.v1';
export const GRASS_DEFAULTS = Object.freeze({ mode: '3d' });

/** @param {{mode?:unknown}|null} [input] */
export function sanitizeGrassSettings(input) {
    return { mode: input?.mode === 'texture' ? 'texture' : GRASS_DEFAULTS.mode };
}

export function getResolvedGrassSettings() {
    try { return sanitizeGrassSettings(JSON.parse(localStorage.getItem(GRASS_STORAGE_KEY) ?? 'null')); }
    catch { return sanitizeGrassSettings(); }
}

/** @param {{mode?:unknown}} input */
export function saveGrassSettings(input) {
    try { localStorage.setItem(GRASS_STORAGE_KEY, JSON.stringify(sanitizeGrassSettings(input))); return true; }
    catch { return false; }
}

export function clearSavedGrassSettings() {
    try { localStorage.removeItem(GRASS_STORAGE_KEY); return true; }
    catch { return false; }
}
