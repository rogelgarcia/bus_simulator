// Defines world-anchored detail and macro periods selected by projected surface footprint.
// @ts-check

/** @param {number} tileMeters */
export function createLandscapeMaterialTiling(tileMeters) {
    if (!Number.isFinite(tileMeters) || tileMeters <= 0) throw new Error('Landscape material tile size must be positive');
    return Object.freeze({ nearTileMeters: tileMeters, macroTileMeters: tileMeters * 4,
        blendStartMetersPerPixel: tileMeters / 128, blendEndMetersPerPixel: tileMeters / 16 });
}

/** @param {ReturnType<typeof createLandscapeMaterialTiling>} tiling @param {number} metersPerPixel */
export function landscapeMaterialMacroWeight(tiling, metersPerPixel) {
    if (!Number.isFinite(metersPerPixel) || metersPerPixel < 0) throw new Error('Landscape texture footprint must be nonnegative');
    const t = Math.max(0, Math.min(1, (metersPerPixel - tiling.blendStartMetersPerPixel) / (tiling.blendEndMetersPerPixel - tiling.blendStartMetersPerPixel)));
    return t * t * (3 - 2 * t);
}
