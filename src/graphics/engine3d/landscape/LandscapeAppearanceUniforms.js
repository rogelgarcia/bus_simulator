// Declares the shared landscape appearance shader interface.
// @ts-check
import * as THREE from 'three';
import { LANDSCAPE_SURFACE_COVERAGE } from './LandscapeSurfaceCoverage.js';
import { LANDSCAPE_CONTOUR_COVERAGE } from './LandscapeContourCoverage.js';
import { LANDSCAPE_MATERIAL_BLEND } from './LandscapeMaterialBlend.js';

export const LANDSCAPE_MASK_SLOTS = 17;
export const LANDSCAPE_SOIL_SLOTS = 6;

/** @returns {any} */
export function createLandscapeAppearanceUniforms() {
    const coverage = LANDSCAPE_SURFACE_COVERAGE, blend = LANDSCAPE_MATERIAL_BLEND;
    const uniforms = {
        uAppearanceReady: { value: 0 },
        uMaskPages: { value: null },
        uMaskDimensions: { value: new THREE.Vector2(257, 257) },
        uCoverageSettings: { value: new THREE.Vector4(coverage.blendWidthMeters, coverage.minificationStartCells, coverage.minificationEndCells, coverage.haloSamples) },
        uCoverageFilter: { value: new THREE.Vector4(coverage.ancestorFilterStartCells, coverage.ancestorFilterEndCells, coverage.maximumFilterWidthCells, coverage.projectionDegenerateWidth) },
        uCoveragePositiveClamp: { value: coverage.positiveClampWidth },
        uContourDistanceRange: { value: LANDSCAPE_CONTOUR_COVERAGE.distanceRangeSamples },
        uMaskBounds: { value: Array.from({ length: LANDSCAPE_MASK_SLOTS }, () => new THREE.Vector4()) },
        uMaskMeta: { value: Array.from({ length: LANDSCAPE_MASK_SLOTS }, () => new THREE.Vector4(-1, 0, 0, 0)) },
        uMaskNeighbors0: { value: Array.from({ length: LANDSCAPE_MASK_SLOTS }, () => new THREE.Vector4()) },
        uMaskNeighbors1: { value: Array.from({ length: LANDSCAPE_MASK_SLOTS }, () => new THREE.Vector4()) },
        uSoilScale: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(4, 1, 1, 0)) },
        uSoilTiling: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(4, 16, 4 / 128, 4 / 16)) },
        uSoilAlbedo: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(1, 0, 0, 0)) },
        uSoilRoughness: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(0, 1, 1, 0)) },
        uSoilRange: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(0, 1, 1, 0)) },
        uSurfaceBlendEnabled: { value: 0 },
        uSurfaceBlendSettings: { value: new THREE.Vector4(blend.heightStrength, blend.scoreTransitionWidth, blend.fadeStartMetersPerPixel, blend.fadeEndMetersPerPixel) },
        uSoilHeightEnabled: { value: new Float32Array(LANDSCAPE_SOIL_SLOTS) },
        uSoilResolution: { value: new Float32Array(LANDSCAPE_SOIL_SLOTS).fill(32) },
        uMaterialBlendIndex: { value: -1 },
        uMaterialBlend: { value: 1 },
        uBlendResolution: { value: 32 },
        uBlendBase: { value: null },
        uBlendSurface: { value: null }
    };
    for (let i = 0; i < LANDSCAPE_SOIL_SLOTS; i++) { uniforms[`uSoilBase${i}`] = { value: null }; uniforms[`uSoilSurface${i}`] = { value: null }; }
    return uniforms;
}
