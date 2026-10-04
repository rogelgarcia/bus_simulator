// Defines each material's physical texture period and optional micro-detail period; feature sizes never change with view distance.
// @ts-check
// The former four-times-larger macro lattice magnified ripples and pebbles at distance. Every material is now sampled at its calibrated
// physical period at all distances (stochastic tiling hides repetition, mips filter the detail), landscape-scale variation comes from
// the separate macro field, and close-up detail from the paired micro layer with its own physical period.
import { LANDSCAPE_MICRO_DETAIL } from './LandscapeMicroDetail.js';

export const LANDSCAPE_MATERIAL_TILING = Object.freeze({ id: 'landscape-physical-tiling-v1', scale: 'physical', macroLattice: false });

/** @param {number} tileMeters calibrated physical period @param {{microTileMeters?:number|null}} [options] */
export function createLandscapeMaterialTiling(tileMeters, { microTileMeters = null } = {}) {
    if (!Number.isFinite(tileMeters) || tileMeters <= 0) throw new Error('Landscape material tile size must be positive');
    if (microTileMeters !== null && !(Number.isFinite(microTileMeters) && microTileMeters > 0 && microTileMeters < tileMeters)) throw new Error('Landscape micro tile size must be positive and smaller than the material period');
    return Object.freeze({ model: LANDSCAPE_MATERIAL_TILING.id, tileMeters, microTileMeters,
        microFadeStartMetersPerPixel: microTileMeters === null ? null : microTileMeters * LANDSCAPE_MICRO_DETAIL.fadeStartPeriods,
        microFadeEndMetersPerPixel: microTileMeters === null ? null : microTileMeters * LANDSCAPE_MICRO_DETAIL.fadeEndPeriods });
}
