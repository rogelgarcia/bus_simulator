// Declares the shared landscape appearance shader interface.
// @ts-check
import * as THREE from 'three';
import { LANDSCAPE_SURFACE_COVERAGE } from './LandscapeSurfaceCoverage.js';
import { LANDSCAPE_CONTOUR_COVERAGE } from './LandscapeContourCoverage.js';
import { LANDSCAPE_MATERIAL_BLEND, LANDSCAPE_MATERIAL_CLUMP_OCTAVES, LANDSCAPE_MATERIAL_CLUMPS } from './LandscapeMaterialBlend.js';
import { LANDSCAPE_MATERIAL_SAMPLING } from './LandscapeMaterialSampling.js';
import { LANDSCAPE_MACRO_VARIATION_OCTAVES } from './LandscapeMacroVariation.js';
import { landscapeSurfaceLayerUniforms } from './LandscapeSurfaceLayers.js';
import { assertLandscapeCoverageSlots, resolveLandscapeCoverageSlots } from './LandscapeCoverageSlots.js';
import { landscapeTerrainUniformVectors, landscapeTerrainWarpDefines } from '../../shaders/materials/landscape/LandscapeShaderLoader.js';

export { LANDSCAPE_MASK_SLOTS, LANDSCAPE_DETAIL_SLOTS_MAX, LANDSCAPE_COVERAGE_SLOTS_MAX } from './LandscapeCoverageSlots.js';
export const LANDSCAPE_SOIL_SLOTS = 6;
const WARP_ARRAYS = Object.freeze({ uLandscapeWarpWaves: 4, uLandscapeWarpOffsets: 4, uLandscapeWarpSalts: 2 });
const CLUMP_ARRAYS = Object.freeze(['uSoilClumps', 'uSoilClumpSalts', 'uClumpOctaves', 'uClumpSettings', 'uClumpConfidence']);
const SAMPLING_ARRAYS = Object.freeze(['uSoilStochastic', 'uSoilStochasticSalts', 'uStochasticSettings']);
const MACRO_ARRAYS = Object.freeze(['uMacroOctaves', 'uMacroSalts', 'uMacroSettings', 'uSoilMacro']);
const LAYER_ARRAYS = Object.freeze(['uSurfaceLayers', 'uMicroSampling']);

function copyUniformArrays(uniforms, source, names, label) {
    for (const name of names) {
        const value = source?.[name], target = uniforms[name]?.value;
        if (!ArrayBuffer.isView(value) || !target || value.length !== target.length || value.constructor !== target.constructor) throw new Error(`[Landscape] ${label} ${name} does not match the terrain interface`);
        target.set(value);
    }
}

/** @param {{capabilities:{maxFragmentUniforms:number}}} renderer @returns {ReturnType<typeof resolveLandscapeCoverageSlots>} */
export function chooseLandscapeCoverageSlots(renderer) {
    return resolveLandscapeCoverageSlots({ maxFragmentUniforms: renderer.capabilities.maxFragmentUniforms, ...landscapeTerrainUniformVectors() });
}

/**
 * Copies a recipe warp (landscapeSurfaceWarpUniforms) into shared appearance uniforms; disabled warps keep world coverage.
 * @param {any} uniforms @param {{uniforms:{uLandscapeWarpWaves:Float32Array,uLandscapeWarpOffsets:Float32Array,uLandscapeWarpSalts:Int32Array}}} warp @param {boolean} enabled
 */
export function setLandscapeSurfaceWarpUniforms(uniforms, warp, enabled) {
    if (typeof enabled !== 'boolean') throw new Error('[Landscape] Surface warp enablement must be boolean');
    for (const name of Object.keys(WARP_ARRAYS)) {
        const source = warp?.uniforms?.[name], target = uniforms[name]?.value;
        if (!ArrayBuffer.isView(source) || !target || source.length !== target.length || source.constructor !== target.constructor) throw new Error(`[Landscape] Surface warp ${name} does not match the compiled octave count`);
        target.set(source);
    }
    uniforms.uSurfaceWarpEnabled.value = enabled ? 1 : 0;
}

/**
 * Copies material clump relief (landscapeMaterialClumpUniforms) into shared appearance uniforms; disabled clumps keep the
 * semantic coverage for the texture relief competition.
 * @param {any} uniforms @param {Readonly<Record<string, Float32Array|Int32Array>>} clumps @param {boolean} enabled
 */
export function setLandscapeMaterialClumpUniforms(uniforms, clumps, enabled) {
    if (typeof enabled !== 'boolean') throw new Error('[Landscape] Material clump enablement must be boolean');
    for (const name of CLUMP_ARRAYS) {
        const source = clumps?.[name], target = uniforms[name]?.value;
        if (!ArrayBuffer.isView(source) || !target || source.length !== target.length || source.constructor !== target.constructor) throw new Error(`[Landscape] Material clump ${name} does not match the terrain interface`);
        target.set(source);
    }
    uniforms.uClumpSettings.value[3] = enabled ? 1 : 0;
}

/**
 * Copies stochastic tiling parameters (landscapeMaterialSamplingUniforms) into shared appearance uniforms; disabled sampling
 * zeroes every soil's lattice cells, which selects the single lattice sample without recompiling the terrain programs.
 * @param {any} uniforms @param {Readonly<Record<string, Float32Array|Int32Array>>} sampling @param {boolean} enabled
 */
export function setLandscapeMaterialSamplingUniforms(uniforms, sampling, enabled) {
    if (typeof enabled !== 'boolean') throw new Error('[Landscape] Material sampling enablement must be boolean');
    for (const name of SAMPLING_ARRAYS) {
        const source = sampling?.[name], target = uniforms[name]?.value;
        if (!ArrayBuffer.isView(source) || !target || source.length !== target.length || source.constructor !== target.constructor) throw new Error(`[Landscape] Material sampling ${name} does not match the terrain interface`);
        target.set(source);
    }
    if (!enabled) uniforms.uSoilStochastic.value.fill(0);
}

/**
 * Copies the landscape-scale variation (landscapeMacroVariationUniforms) into shared appearance uniforms; disabled variation keeps
 * every material's calibrated albedo and roughness.
 * @param {any} uniforms @param {Readonly<Record<string, Float32Array|Int32Array>>} macro @param {boolean} enabled
 */
export function setLandscapeMacroVariationUniforms(uniforms, macro, enabled) {
    if (typeof enabled !== 'boolean') throw new Error('[Landscape] Macro variation enablement must be boolean');
    copyUniformArrays(uniforms, macro, MACRO_ARRAYS, 'Macro variation');
    uniforms.uMacroSettings.value[0] = enabled ? 1 : 0;
}

/**
 * Copies slope-adaptive projection, normal filtering and micro sampling settings (landscapeSurfaceLayerUniforms) into shared uniforms.
 * @param {any} uniforms @param {Readonly<Record<string, Float32Array>>} layers
 */
export function setLandscapeSurfaceLayerUniforms(uniforms, layers) { copyUniformArrays(uniforms, layers, LAYER_ARRAYS, 'Surface layer'); }

/** @param {number} coverageSlots compile-time terrain coverage slot count @returns {any} */
export function createLandscapeAppearanceUniforms(coverageSlots) {
    const slots = assertLandscapeCoverageSlots(coverageSlots), octaves = landscapeTerrainWarpDefines().LANDSCAPE_SURFACE_WARP_OCTAVES;
    const coverage = LANDSCAPE_SURFACE_COVERAGE, blend = LANDSCAPE_MATERIAL_BLEND, clumps = LANDSCAPE_MATERIAL_CLUMPS, sampling = LANDSCAPE_MATERIAL_SAMPLING;
    const disabledLayers = landscapeSurfaceLayerUniforms({ projection: false, normalFiltering: false });
    const uniforms = {
        uAppearanceReady: { value: 0 },
        uMaskPages: { value: null },
        uMaskDimensions: { value: new THREE.Vector2(257, 257) },
        uCoverageSettings: { value: new THREE.Vector4(coverage.blendWidthMeters, coverage.minificationStartCells, coverage.minificationEndCells, coverage.haloSamples) },
        uCoverageFilter: { value: new THREE.Vector4(coverage.ancestorFilterStartCells, coverage.ancestorFilterEndCells, coverage.maximumFilterWidthCells, coverage.projectionDegenerateWidth) },
        uCoveragePositiveClamp: { value: coverage.positiveClampWidth },
        uContourDistanceRange: { value: LANDSCAPE_CONTOUR_COVERAGE.distanceRangeSamples },
        uMaskBounds: { value: Array.from({ length: slots }, () => new THREE.Vector4()) },
        uMaskMeta: { value: Array.from({ length: slots }, () => new THREE.Vector4(-1, 0, 0, 0)) },
        uMaskNeighbors0: { value: Array.from({ length: slots }, () => new THREE.Vector4()) },
        uMaskNeighbors1: { value: Array.from({ length: slots }, () => new THREE.Vector4()) },
        uMaskSlotRanges: { value: new THREE.Vector3(slots, 0, slots) },
        uSoilScale: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(4, 1, 1, 0)) },
        uSoilTiling: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(4, 0, 0, 0)) },
        uSoilAlbedo: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(1, 0, 0, 0)) },
        uSoilRoughness: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(0, 1, 1, 0)) },
        uSoilRange: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(0, 1, 1, 0)) },
        uSurfaceBlendEnabled: { value: 0 },
        uSurfaceBlendSettings: { value: new THREE.Vector4(blend.heightStrength, blend.scoreTransitionWidth, blend.fadeStartMetersPerPixel, blend.fadeEndMetersPerPixel) },
        uSoilState: { value: Array.from({ length: LANDSCAPE_SOIL_SLOTS }, () => new THREE.Vector4(0, 32, 0, 0)) },
        uMaterialBlendIndex: { value: -1 },
        uMaterialBlend: { value: 1 },
        uBlendResolution: { value: 32 },
        uSoilClumps: { value: new Float32Array(LANDSCAPE_SOIL_SLOTS * 4) },
        uSoilClumpSalts: { value: new Int32Array(LANDSCAPE_SOIL_SLOTS * 4) },
        uClumpOctaves: { value: new Float32Array(LANDSCAPE_MATERIAL_CLUMP_OCTAVES * 4) },
        uClumpSettings: { value: Float32Array.of(clumps.gain, clumps.fadeStartWavelengths, clumps.fadeEndWavelengths, 0) },
        uClumpConfidence: { value: Float32Array.of(clumps.coverageConfidence[0], clumps.coverageConfidence[1], clumps.reliefFloor, 0) },
        uSoilStochastic: { value: new Float32Array(LANDSCAPE_SOIL_SLOTS * 4) },
        uSoilStochasticSalts: { value: new Int32Array(8) },
        uStochasticSettings: { value: Float32Array.of(sampling.contrastFalloff, sampling.weightCutoff, sampling.varianceExponent, sampling.samplesPerLattice) },
        uMacroOctaves: { value: new Float32Array(LANDSCAPE_MACRO_VARIATION_OCTAVES * 4) },
        uMacroSalts: { value: new Int32Array(4) },
        uMacroSettings: { value: new Float32Array(4) },
        uSoilMacro: { value: new Float32Array(LANDSCAPE_SOIL_SLOTS * 4) },
        uSurfaceLayers: { value: Float32Array.from(disabledLayers.uSurfaceLayers) },
        uMicroSampling: { value: Float32Array.from(disabledLayers.uMicroSampling) },
        uBlendBase: { value: null },
        uBlendSurface: { value: null },
        uSurfaceWarpEnabled: { value: 0 },
        uLandscapeWarpWaves: { value: new Float32Array(octaves * WARP_ARRAYS.uLandscapeWarpWaves) },
        uLandscapeWarpOffsets: { value: new Float32Array(octaves * WARP_ARRAYS.uLandscapeWarpOffsets) },
        uLandscapeWarpSalts: { value: new Int32Array(octaves * WARP_ARRAYS.uLandscapeWarpSalts) }
    };
    for (let i = 0; i < LANDSCAPE_SOIL_SLOTS; i++) { uniforms[`uSoilBase${i}`] = { value: null }; uniforms[`uSoilSurface${i}`] = { value: null }; }
    return uniforms;
}
