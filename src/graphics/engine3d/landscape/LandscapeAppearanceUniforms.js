// Declares the shared landscape appearance shader interface.
// @ts-check
// AI 598 D3a: the per-material values ride in the RGBA32F parameter texture (LandscapeMaterialParameters: one texel row per material) and the
// materials draw from three resolution-grouped texture arrays (LandscapeMaterialSlots), so the interface holds one parameter sampler, six array
// samplers and the transition uniform instead of six sampler pairs, a blend pair and eleven six-entry uniform arrays; the per-soil setters of
// the clump, stochastic and macro recipes write the material rows of the table.
import * as THREE from 'three';
import { LANDSCAPE_SURFACE_COVERAGE } from './LandscapeSurfaceCoverage.js';
import { LANDSCAPE_CONTOUR_COVERAGE } from './LandscapeContourCoverage.js';
import { LANDSCAPE_MATERIAL_BLEND, LANDSCAPE_MATERIAL_CLUMP_OCTAVES, LANDSCAPE_MATERIAL_CLUMPS } from './LandscapeMaterialBlend.js';
import { LANDSCAPE_MATERIAL_SAMPLING } from './LandscapeMaterialSampling.js';
import { LANDSCAPE_MACRO_VARIATION_OCTAVES } from './LandscapeMacroVariation.js';
import { landscapeSurfaceLayerUniforms } from './LandscapeSurfaceLayers.js';
import { assertLandscapeCoverageSlots, resolveLandscapeCoverageSlots, LANDSCAPE_SOIL_SLOTS } from './LandscapeCoverageSlots.js';
import { LANDSCAPE_MATERIAL_PARAMETER_ROW, LANDSCAPE_MATERIAL_SLOTS_MAX, LandscapeMaterialParameterTable, landscapeMaterialParameterTable } from './LandscapeMaterialParameters.js';
import { landscapeTerrainUniformVectors, landscapeTerrainWarpDefines } from '../../shaders/materials/landscape/LandscapeShaderLoader.js';

export { LANDSCAPE_MASK_SLOTS, LANDSCAPE_DETAIL_SLOTS_MAX, LANDSCAPE_COVERAGE_SLOTS_MAX, LANDSCAPE_SOIL_SLOTS } from './LandscapeCoverageSlots.js';
export { LANDSCAPE_MATERIAL_SLOTS_MAX, landscapeMaterialParameterTable } from './LandscapeMaterialParameters.js';
const WARP_ARRAYS = Object.freeze({ uLandscapeWarpWaves: 4, uLandscapeWarpOffsets: 4, uLandscapeWarpSalts: 2 });
const CLUMP_ARRAYS = Object.freeze(['uClumpOctaves', 'uClumpSettings', 'uClumpConfidence']);
const SAMPLING_ARRAYS = Object.freeze(['uStochasticSettings']);
const MACRO_ARRAYS = Object.freeze(['uMacroOctaves', 'uMacroSalts', 'uMacroSettings']);
const LAYER_ARRAYS = Object.freeze(['uSurfaceLayers', 'uMicroSampling']);
/** The array sampler names of the three material tiers, coarse to fine (LandscapeMaterialSlots binds them). */
export const LANDSCAPE_MATERIAL_ARRAY_UNIFORMS = Object.freeze(['Coarse', 'Mid', 'Fine'].map(name => Object.freeze({ base: `uMaterialBase${name}`, surface: `uMaterialSurface${name}` })));

function copyUniformArrays(uniforms, source, names, label) {
    for (const name of names) {
        const value = source?.[name], target = uniforms[name]?.value;
        if (!ArrayBuffer.isView(value) || !target || value.length !== target.length || value.constructor !== target.constructor) throw new Error(`[Landscape] ${label} ${name} does not match the terrain interface`);
        target.set(value);
    }
}

// a per-soil recipe array (four components per soil slot unless stated) must address the material rows the table holds
function materialRows(uniforms, source, name, label, length = LANDSCAPE_SOIL_SLOTS * 4) {
    const value = source?.[name], table = landscapeMaterialParameterTable(uniforms);
    if (!ArrayBuffer.isView(value) || value.length !== length) throw new Error(`[Landscape] ${label} ${name} does not match the terrain interface`);
    if (LANDSCAPE_SOIL_SLOTS > table.capacity) throw new Error(`[Landscape] ${label} addresses ${LANDSCAPE_SOIL_SLOTS} soils; the parameter table holds ${table.capacity} materials`);
    return { value: /** @type {any} */ (value), table };
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
 * Copies material clump relief (landscapeMaterialClumpUniforms) into shared appearance uniforms: the shared octaves and settings into their cells, each
 * soil's row and octave salts into the parameter table; disabled clumps keep the semantic coverage for the texture relief competition.
 * @param {any} uniforms @param {Readonly<Record<string, Float32Array|Int32Array>>} clumps @param {boolean} enabled
 */
export function setLandscapeMaterialClumpUniforms(uniforms, clumps, enabled) {
    if (typeof enabled !== 'boolean') throw new Error('[Landscape] Material clump enablement must be boolean');
    copyUniformArrays(uniforms, clumps, CLUMP_ARRAYS, 'Material clump');
    const rows = materialRows(uniforms, clumps, 'uSoilClumps', 'Material clump'), salts = materialRows(uniforms, clumps, 'uSoilClumpSalts', 'Material clump');
    for (let soil = 0; soil < LANDSCAPE_SOIL_SLOTS; soil++) {
        rows.table.setRow(soil, LANDSCAPE_MATERIAL_PARAMETER_ROW.clumps, rows.value.subarray(soil * 4, soil * 4 + 4));
        rows.table.setSalts(soil, Array.from(salts.value.subarray(soil * 4, soil * 4 + 4)), rows.table.stochasticSalt(soil));
    }
    uniforms.uClumpSettings.value[3] = enabled ? 1 : 0;
}

/**
 * Copies stochastic tiling parameters (landscapeMaterialSamplingUniforms) into shared appearance uniforms: the shared settings into their cell, each
 * soil's lattice row and top-projection salt into the parameter table; disabled sampling zeroes every soil's lattice cells, which selects the single
 * lattice sample without recompiling the terrain programs.
 * @param {any} uniforms @param {Readonly<Record<string, Float32Array|Int32Array>>} sampling @param {boolean} enabled
 */
export function setLandscapeMaterialSamplingUniforms(uniforms, sampling, enabled) {
    if (typeof enabled !== 'boolean') throw new Error('[Landscape] Material sampling enablement must be boolean');
    copyUniformArrays(uniforms, sampling, SAMPLING_ARRAYS, 'Material sampling');
    const rows = materialRows(uniforms, sampling, 'uSoilStochastic', 'Material sampling'), salts = materialRows(uniforms, sampling, 'uSoilStochasticSalts', 'Material sampling', 8);
    for (let soil = 0; soil < LANDSCAPE_SOIL_SLOTS; soil++) {
        rows.table.setRow(soil, LANDSCAPE_MATERIAL_PARAMETER_ROW.stochastic, enabled ? rows.value.subarray(soil * 4, soil * 4 + 4) : [0, 0, 0, 0]);
        rows.table.setSalts(soil, [0, 1, 2, 3].map(octave => rows.table.clumpSalt(soil, octave)), salts.value[soil]);
    }
}

/**
 * Copies the landscape-scale variation (landscapeMacroVariationUniforms) into shared appearance uniforms: the shared octaves, salts and settings into
 * their cells, each soil's response row into the parameter table; disabled variation keeps every material's calibrated albedo and roughness.
 * @param {any} uniforms @param {Readonly<Record<string, Float32Array|Int32Array>>} macro @param {boolean} enabled
 */
export function setLandscapeMacroVariationUniforms(uniforms, macro, enabled) {
    if (typeof enabled !== 'boolean') throw new Error('[Landscape] Macro variation enablement must be boolean');
    copyUniformArrays(uniforms, macro, MACRO_ARRAYS, 'Macro variation');
    const rows = materialRows(uniforms, macro, 'uSoilMacro', 'Macro variation');
    for (let soil = 0; soil < LANDSCAPE_SOIL_SLOTS; soil++) rows.table.setRow(soil, LANDSCAPE_MATERIAL_PARAMETER_ROW.macro, rows.value.subarray(soil * 4, soil * 4 + 4));
    uniforms.uMacroSettings.value[0] = enabled ? 1 : 0;
}

/**
 * Copies slope-adaptive projection, normal filtering and micro sampling settings (landscapeSurfaceLayerUniforms) into shared uniforms.
 * @param {any} uniforms @param {Readonly<Record<string, Float32Array>>} layers
 */
export function setLandscapeSurfaceLayerUniforms(uniforms, layers) { copyUniformArrays(uniforms, layers, LAYER_ARRAYS, 'Surface layer'); }

/**
 * One-texel RGBA8UI array the surface cache indirection sampler binds while no cache is attached: an integer sampler must never see a normalized
 * placeholder texture, and its zero entry is never read because uSurfaceCacheState.x stays 0 (AI577 D6).
 */
export function createLandscapeSurfaceCacheIndirectionPlaceholder() {
    const texture = new THREE.DataArrayTexture(new Uint8Array(4), 1, 1, 1);
    texture.format = THREE.RGBAIntegerFormat;
    texture.type = THREE.UnsignedByteType;
    texture.internalFormat = 'RGBA8UI';
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
}

/**
 * The RGBA32F parameter texture over a table (AI 598 D3a): nearest, no mips, re-uploaded by three.js whenever the table changes.
 * @param {LandscapeMaterialParameterTable} table
 */
export function createLandscapeMaterialParameterTexture(table) {
    const texture = new THREE.DataTexture(table.data, table.rows, table.capacity, THREE.RGBAFormat, THREE.FloatType);
    texture.internalFormat = 'RGBA32F';
    texture.colorSpace = THREE.NoColorSpace;
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.unpackAlignment = 4;
    texture.needsUpdate = true;
    table.onChange(() => { texture.needsUpdate = true; });
    return texture;
}

/**
 * @param {number} coverageSlots compile-time terrain coverage slot count
 * @param {{materialCapacity?:number}} [options] materials the parameter table addresses (default every slot the shader can fetch)
 * @returns {any}
 */
export function createLandscapeAppearanceUniforms(coverageSlots, { materialCapacity = LANDSCAPE_MATERIAL_SLOTS_MAX } = {}) {
    const slots = assertLandscapeCoverageSlots(coverageSlots), octaves = landscapeTerrainWarpDefines().LANDSCAPE_SURFACE_WARP_OCTAVES;
    const coverage = LANDSCAPE_SURFACE_COVERAGE, blend = LANDSCAPE_MATERIAL_BLEND, clumps = LANDSCAPE_MATERIAL_CLUMPS, sampling = LANDSCAPE_MATERIAL_SAMPLING;
    const disabledLayers = landscapeSurfaceLayerUniforms({ projection: false, normalFiltering: false });
    const table = new LandscapeMaterialParameterTable(materialCapacity);
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
        // AI 598 D3a (chunks/landscape/material_parameters.glsl): every per-material value as one texel row per material, read by material index; the
        // table is the CPU mirror the owners write; the transition cell names the one material mixing toward an arriving array slot
        uMaterialParameters: { value: createLandscapeMaterialParameterTexture(table), table },
        uMaterialTransition: { value: new THREE.Vector4(-1, 1, 0, 0) },
        uSurfaceBlendEnabled: { value: 0 },
        uSurfaceBlendSettings: { value: new THREE.Vector4(blend.heightStrength, blend.scoreTransitionWidth, blend.fadeStartMetersPerPixel, blend.fadeEndMetersPerPixel) },
        uClumpOctaves: { value: new Float32Array(LANDSCAPE_MATERIAL_CLUMP_OCTAVES * 4) },
        uClumpSettings: { value: Float32Array.of(clumps.gain, clumps.fadeStartWavelengths, clumps.fadeEndWavelengths, 0) },
        uClumpConfidence: { value: Float32Array.of(clumps.coverageConfidence[0], clumps.coverageConfidence[1], clumps.reliefFloor, 0) },
        uStochasticSettings: { value: Float32Array.of(sampling.contrastFalloff, sampling.weightCutoff, sampling.varianceExponent, sampling.samplesPerLattice) },
        uMacroOctaves: { value: new Float32Array(LANDSCAPE_MACRO_VARIATION_OCTAVES * 4) },
        uMacroSalts: { value: new Int32Array(4) },
        uMacroSettings: { value: new Float32Array(4) },
        uSurfaceLayers: { value: Float32Array.from(disabledLayers.uSurfaceLayers) },
        uMicroSampling: { value: Float32Array.from(disabledLayers.uMicroSampling) },
        uSurfaceWarpEnabled: { value: 0 },
        uLandscapeWarpWaves: { value: new Float32Array(octaves * WARP_ARRAYS.uLandscapeWarpWaves) },
        uLandscapeWarpOffsets: { value: new Float32Array(octaves * WARP_ARRAYS.uLandscapeWarpOffsets) },
        uLandscapeWarpSalts: { value: new Int32Array(octaves * WARP_ARRAYS.uLandscapeWarpSalts) },
        // AI577 D5 terrain fields (chunks/landscape/terrain_fields.glsl): the field array and uvec4(stale cells low, high, flags, layers per page)
        uTerrainFields: { value: null },
        uTerrainFieldsState: { value: new Uint32Array(4) },
        // AI577 D5 terrain-driven appearance (chunks/landscape/terrain_appearance.glsl): bitmask of the planning-only land-cover IDs 0..127
        uPlanningCover: { value: new Uint32Array(4) },
        // AI577 D6 runtime surface cache (chunks/landscape/surface_cache.glsl), read only by the cached frame program; LandscapeSurfaceCache binds them
        uSurfaceCacheIndirection: { value: createLandscapeSurfaceCacheIndirectionPlaceholder() },
        uSurfaceCacheAlbedo: { value: null },
        uSurfaceCacheMaterial: { value: null },
        uSurfaceCacheResponse: { value: null },
        uSurfaceCacheFrame: { value: new THREE.Vector4(0, 0, 0, 0) },
        uSurfaceCacheState: { value: new THREE.Vector4(0, 2, 0, -1) },
        // the cache's near pass (chunks/landscape/surface_cache_near.glsl): footprints of its hand-over band and the sampler anisotropy; disabled while y is 0
        uSurfaceCacheNear: { value: new THREE.Vector4(0, 0, 2, 0) }
    };
    // the material arrays (LandscapeMaterialSlots binds the ExternalTexture wrappers of its arrays)
    for (const names of LANDSCAPE_MATERIAL_ARRAY_UNIFORMS) { uniforms[names.base] = { value: null }; uniforms[names.surface] = { value: null }; }
    return uniforms;
}
