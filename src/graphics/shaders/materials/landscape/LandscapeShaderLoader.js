// Loads terrain and inspection shaders with one shared morph contract.
// @ts-check
// The terrain variant compiles the shared surface warp of the generated surface-detail recipe; its octave count and
// shaping are recipe constants, so every terrain material and the slot sizing use the same compile-time warp. The material
// sampling mode is a compile-time define as well, so a view compiles only the stochastic tiling variant it renders.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
import { assertLandscapeCoverageSlots, landscapeFragmentUniformVectors, LANDSCAPE_COVERAGE_SLOT_DEFINE } from '../../../engine3d/landscape/LandscapeCoverageSlots.js';
import { LANDSCAPE_SURFACE_DETAIL_RECIPE, landscapeSurfaceWarpDefines } from '../../../engine3d/landscape/LandscapeSurfaceDetailRecipe.js';
import { LANDSCAPE_MATERIAL_SAMPLING, LANDSCAPE_MATERIAL_SAMPLING_DEFINE, landscapeMaterialSamplingMode } from '../../../engine3d/landscape/LandscapeMaterialSampling.js';

const [terrain, lines] = await Promise.all([
    loadShaderSourceSet({ vertexPath: 'materials/landscape/terrain.vert.glsl', fragmentPath: 'materials/landscape/terrain.frag.glsl' }),
    loadShaderSourceSet({ vertexPath: 'materials/landscape/lines.vert.glsl', fragmentPath: 'materials/landscape/lines.frag.glsl' })
]);
const recipeWarp = landscapeSurfaceWarpDefines(LANDSCAPE_SURFACE_DETAIL_RECIPE), warpOctaves = Number(recipeWarp.LANDSCAPE_SURFACE_WARP_OCTAVES);
if (!Number.isSafeInteger(warpOctaves) || warpOctaves < 2) throw new Error(`[Landscape] The terrain surface warp needs at least two octaves; the recipe declares ${recipeWarp.LANDSCAPE_SURFACE_WARP_OCTAVES}`);
const warpDefines = Object.freeze({ LANDSCAPE_SURFACE_WARP_OCTAVES: warpOctaves, ...('LANDSCAPE_SURFACE_WARP_QUINTIC' in recipeWarp ? { LANDSCAPE_SURFACE_WARP_QUINTIC: true } : {}) });
const terrainUniformVectors = landscapeFragmentUniformVectors(terrain.fragmentSource, { LANDSCAPE_SURFACE_WARP_OCTAVES: warpOctaves });

/** @returns {Readonly<{fixedVectors:number,slotVectors:number}>} conservative terrain fragment uniform vectors */
export function landscapeTerrainUniformVectors() { return terrainUniformVectors; }

/** @returns {Readonly<{LANDSCAPE_SURFACE_WARP_OCTAVES:number,LANDSCAPE_SURFACE_WARP_QUINTIC?:boolean}>} compile-time terrain warp defines */
export function landscapeTerrainWarpDefines() { return warpDefines; }

/**
 * @param {'terrain'|'lines'} kind
 * @param {{coverageSlots?:number,materialSampling?:string}} [options] terrain requires its compile-time coverage slot count; materialSampling defaults to the recipe mode
 * @returns {any}
 */
export function createLandscapeShaderPayload(kind, { coverageSlots, materialSampling = LANDSCAPE_MATERIAL_SAMPLING.defaultMode } = {}) {
    if (kind === 'lines') return createShaderPayload({ shaderId: 'landscape/lines', sourceSet: lines });
    if (kind !== 'terrain') throw new Error(`Unknown landscape shader ${kind}`);
    // parenthesized because the shared define builder turns the literal value 1 into a valueless flag define
    return createShaderPayload({ shaderId: 'landscape/terrain', sourceSet: terrain, defines: { [LANDSCAPE_COVERAGE_SLOT_DEFINE]: assertLandscapeCoverageSlots(coverageSlots), ...warpDefines,
        [LANDSCAPE_MATERIAL_SAMPLING_DEFINE]: `(${landscapeMaterialSamplingMode(materialSampling)})` } });
}
