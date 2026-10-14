// Persisted gameplay grass quality, with migration from the former Texture/3D modes.
// @ts-check
export const GRASS_STORAGE_KEY = 'bus_sim.grass.v1';
export const GRASS_DEFAULTS = Object.freeze({ mode: 'high' });
export const GRASS_QUALITY_PRESETS = Object.freeze(Object.fromEntries([
    ['flat', 'Flat', 'Original ground texture.', 'OFF', 18, 36],
    ['low', 'Low', 'Grass canopy texture without individual blades.', 'LOD5', 18, 36],
    ['medium', 'Medium', '3D grass with a shorter viewing distance.', 'AUTO', 16, 24],
    ['high', 'High', '3D grass with an extended viewing distance.', 'AUTO', 18, 36],
    ['ultra', 'Ultra', '3D grass at the longest viewing distance.', 'AUTO', 22, 42]
].map(([id, label, description, fieldMode, lod3, lod4]) => [id, Object.freeze({ label, description, fieldMode,
    distances: Object.freeze([.6, .8, 8, lod3, lod4]) })])));

/** @param {{mode?:unknown}|null} [input] */
export function sanitizeGrassSettings(input) {
    const mode = input?.mode === 'texture' ? 'flat' : input?.mode;
    return { mode: typeof mode === 'string' && Object.hasOwn(GRASS_QUALITY_PRESETS, mode) ? mode : GRASS_DEFAULTS.mode };
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
