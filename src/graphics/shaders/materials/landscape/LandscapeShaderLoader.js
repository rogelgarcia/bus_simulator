// Loads terrain, water and inspection shaders with one shared morph contract.
// @ts-check
// The terrain variant compiles the shared surface warp of the generated surface-detail recipe; its octave count and
// shaping are recipe constants, so every terrain material and the slot sizing use the same compile-time warp. The material
// sampling mode and the lighting tier are compile-time defines as well, so a view compiles only the variant it renders; the
// calibrated atmosphere and water constants of the lighting tier are defines, not uniforms. AI577 D6: the terrain inspection views are
// compiled only into the diagnostics variant (LANDSCAPE_TERRAIN_DIAGNOSTICS), so the default program carries no diagnostic code, and the
// terrain-driven natural appearance is compiled in (LANDSCAPE_TERRAIN_APPEARANCE) unless its switch is off.
import { createShaderPayload, loadShaderSourceSet } from '../../core/ShaderLoader.js';
import { assertLandscapeCoverageSlots, landscapeFragmentUniformVectors, landscapeFragmentVariantUniformVectors, LANDSCAPE_COVERAGE_SLOT_DEFINE } from '../../../engine3d/landscape/LandscapeCoverageSlots.js';
import { landscapeSurfaceCacheDefines } from '../../../engine3d/landscape/LandscapeSurfaceCacheLayout.js';
import { LANDSCAPE_SURFACE_DETAIL_RECIPE, landscapeSurfaceWarpDefines } from '../../../engine3d/landscape/LandscapeSurfaceDetailRecipe.js';
import { LANDSCAPE_MATERIAL_SAMPLING, LANDSCAPE_MATERIAL_SAMPLING_DEFINE, landscapeMaterialSamplingMode } from '../../../engine3d/landscape/LandscapeMaterialSampling.js';
import { LANDSCAPE_LIGHTING, landscapeLightingDefines } from '../../../engine3d/landscape/LandscapeLightingModel.js';
import { landscapeSurfaceLevelColorDefine } from '../../../engine3d/landscape/LandscapeTerrainDiagnostics.js';
import { landscapeDressingDefines, landscapeTerrainAppearanceDefines } from '../../../engine3d/landscape/LandscapeTerrainAppearance.js';
import { LANDSCAPE_TERRAIN_PROGRAM_VARIANT, landscapeProgramVariantDefines } from '../../../engine3d/landscape/LandscapeTerrainProgramVariant.js';

const [terrain, lines, water, backdrop, surfaceCacheUnpack] = await Promise.all([
    loadShaderSourceSet({ vertexPath: 'materials/landscape/terrain.vert.glsl', fragmentPath: 'materials/landscape/terrain.frag.glsl' }),
    loadShaderSourceSet({ vertexPath: 'materials/landscape/lines.vert.glsl', fragmentPath: 'materials/landscape/lines.frag.glsl' }),
    loadShaderSourceSet({ vertexPath: 'materials/landscape/water.vert.glsl', fragmentPath: 'materials/landscape/water.frag.glsl' }),
    loadShaderSourceSet({ vertexPath: 'materials/landscape/backdrop.vert.glsl', fragmentPath: 'materials/landscape/backdrop.frag.glsl' }),
    loadShaderSourceSet({ vertexPath: 'materials/landscape/surface_cache_unpack.vert.glsl', fragmentPath: 'materials/landscape/surface_cache_unpack.frag.glsl' })
]);
// the backdrop blends into the HDR background within half a degree of the horizon
const BACKDROP_HORIZON_BAND = Math.sin(.5 * Math.PI / 180);
const recipeWarp = landscapeSurfaceWarpDefines(LANDSCAPE_SURFACE_DETAIL_RECIPE), warpOctaves = Number(recipeWarp.LANDSCAPE_SURFACE_WARP_OCTAVES);
if (!Number.isSafeInteger(warpOctaves) || warpOctaves < 2) throw new Error(`[Landscape] The terrain surface warp needs at least two octaves; the recipe declares ${recipeWarp.LANDSCAPE_SURFACE_WARP_OCTAVES}`);
const warpDefines = Object.freeze({ LANDSCAPE_SURFACE_WARP_OCTAVES: warpOctaves, ...('LANDSCAPE_SURFACE_WARP_QUINTIC' in recipeWarp ? { LANDSCAPE_SURFACE_WARP_QUINTIC: true } : {}) });
const terrainUniformVectors = landscapeFragmentUniformVectors(terrain.fragmentSource, { LANDSCAPE_SURFACE_WARP_OCTAVES: warpOctaves });
const terrainVariantUniformVectors = landscapeFragmentVariantUniformVectors(terrain.fragmentSource, { LANDSCAPE_SURFACE_WARP_OCTAVES: warpOctaves });
const levelColorDefine = Object.freeze({ LANDSCAPE_SURFACE_LEVEL_COLOR_LIST: landscapeSurfaceLevelColorDefine() });
// AI577 D5 terrain-driven appearance and the dressing diagnostics: compile-time model constants, no uniform vectors
const terrainAppearanceDefines = Object.freeze({ ...landscapeTerrainAppearanceDefines(), ...landscapeDressingDefines() });
// AI577 D6 runtime surface cache constants (landscape-surface-cache-v1), used by the cached frame and the generation programs
const surfaceCacheDefines = landscapeSurfaceCacheDefines();

/** @returns {Readonly<{fixedVectors:number,slotVectors:number}>} conservative terrain fragment uniform vectors */
export function landscapeTerrainUniformVectors() { return terrainUniformVectors; }

/** @returns {Readonly<{variantVectors:number}>} conservative vectors the surface cache variant declares beyond the shared ones (AI577 D6) */
export function landscapeTerrainVariantUniformVectors() { return terrainVariantUniformVectors; }

/** @returns {Readonly<{LANDSCAPE_SURFACE_WARP_OCTAVES:number,LANDSCAPE_SURFACE_WARP_QUINTIC?:boolean}>} compile-time terrain warp defines */
export function landscapeTerrainWarpDefines() { return warpDefines; }

/**
 * @param {'terrain'|'lines'|'water'|'backdrop'|'surface-cache-unpack'} kind surface-cache-unpack (AI577 D6) copies packed generated pages into the cache atlases
 * @param {{coverageSlots?:number,materialSampling?:string,lightingTier?:string,reflection?:boolean,diagnostics?:boolean,terrainAppearance?:boolean,surfaceCache?:boolean,
 *   surfaceCacheGeneration?:boolean}} [options]
 *   terrain requires its compile-time coverage slot count; materialSampling defaults to the recipe mode and lightingTier to the lighting default;
 *   diagnostics (terrain only, default false) compiles the inspection views selected by uDiagnostic, without it uDiagnostic is ignored and the shaded
 *   surface is drawn; terrainAppearance (terrain only, default true) compiles the terrain-driven natural appearance, false keeps its inputs neutral;
 *   surfaceCache (terrain only, AI577 D6, default false) reads the composited surface from the runtime surface cache unless diagnostics are compiled;
 *   surfaceCacheGeneration (terrain only) builds the unlit cache generation program instead of a frame program;
 *   water samples the prefiltered sky reflection map when reflection is true and the sky harmonics otherwise
 * @returns {any}
 */
export function createLandscapeShaderPayload(kind, { coverageSlots, materialSampling = LANDSCAPE_MATERIAL_SAMPLING.defaultMode, lightingTier = LANDSCAPE_LIGHTING.defaultTier, reflection = false,
    diagnostics = LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defaults.diagnostics, terrainAppearance = LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defaults.terrainAppearance,
    surfaceCache = LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defaults.surfaceCache, surfaceCacheGeneration = false } = {}) {
    if (kind === 'lines') return createShaderPayload({ shaderId: 'landscape/lines', sourceSet: lines });
    if (kind === 'surface-cache-unpack') return createShaderPayload({ shaderId: 'landscape/surface-cache-unpack', sourceSet: surfaceCacheUnpack });
    if (kind === 'backdrop') return createShaderPayload({ shaderId: 'landscape/backdrop', sourceSet: backdrop, defines: { ...landscapeLightingDefines(lightingTier), LANDSCAPE_BACKDROP_HORIZON_BAND: String(BACKDROP_HORIZON_BAND) } });
    if (kind === 'water') {
        if (typeof reflection !== 'boolean') throw new Error('[Landscape] The water reflection option must be boolean');
        return createShaderPayload({ shaderId: 'landscape/water', sourceSet: water, defines: { ...landscapeLightingDefines(lightingTier), ...(reflection ? { LANDSCAPE_WATER_REFLECTION: true } : {}) } });
    }
    if (kind !== 'terrain') throw new Error(`Unknown landscape shader ${kind}`);
    if (typeof surfaceCacheGeneration !== 'boolean') throw new Error('[Landscape] The surface cache generation option must be boolean');
    // the generation program evaluates coverage and materials unlit: never the cached frame or the inspection views
    const variant = surfaceCacheGeneration ? { diagnostics: false, terrainAppearance, surfaceCache: false } : { diagnostics, terrainAppearance, surfaceCache };
    const variantDefines = landscapeProgramVariantDefines(variant), cached = !!variantDefines[LANDSCAPE_TERRAIN_PROGRAM_VARIANT.defines.surfaceCache] || surfaceCacheGeneration;
    // parenthesized because the shared define builder turns the literal value 1 into a valueless flag define
    return createShaderPayload({ shaderId: surfaceCacheGeneration ? 'landscape/terrain-surface-cache-generation' : 'landscape/terrain', sourceSet: terrain, defines: {
        [LANDSCAPE_COVERAGE_SLOT_DEFINE]: assertLandscapeCoverageSlots(coverageSlots), ...warpDefines,
        [LANDSCAPE_MATERIAL_SAMPLING_DEFINE]: `(${landscapeMaterialSamplingMode(materialSampling)})`, ...landscapeLightingDefines(lightingTier), ...levelColorDefine, ...terrainAppearanceDefines,
        ...(cached ? surfaceCacheDefines : {}), ...variantDefines, ...(surfaceCacheGeneration ? { LANDSCAPE_SURFACE_CACHE_GENERATION: true } : {}) } });
}
