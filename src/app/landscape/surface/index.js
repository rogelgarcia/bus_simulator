// Exposes the landscape-surface-model v1 domain: catalogs, recipe, inputs, derivation and overrides.
// @ts-check
export { LANDSCAPE_SURFACE_MODEL, LANDSCAPE_SURFACE_SUBSTRATES, LANDSCAPE_SURFACE_COVERS, LANDSCAPE_SURFACE_INPUTS, LANDSCAPE_SURFACE_INPUT_INDEX, LANDSCAPE_SURFACE_TARGETS,
    validateLandscapeSurfaceRecipe, canonicalLandscapeSurfaceJson, landscapeSurfaceSha256, landscapeSurfaceRecipeIdentity } from './SurfaceModel.js';
export { LANDSCAPE_SURFACE_RECIPE } from './SurfaceRecipe.js';
export { LANDSCAPE_SURFACE_CATEGORIES, createLandscapeSurfaceInputVector, landscapeStratumHardness, landscapeSurfaceOneHot, createLandscapeSurfaceOneHot, landscapeSurfaceInputsFrom } from './SurfaceInputs.js';
export { landscapeSurfaceRamp, compileLandscapeSurfaceRecipe, createLandscapeSurfaceResult, sampleLandscapeSurface, describeLandscapeSurface } from './SurfaceDerivation.js';
export { LANDSCAPE_SURFACE_OVERRIDE_LAYER, validateLandscapeSurfaceOverrides, landscapeSurfaceOverridesIdentity, createLandscapeSurfaceOverride, landscapeSurfaceOverrideAt, applyLandscapeSurfaceOverride,
    applyLandscapeSurfaceOverrides, encodeLandscapeSurfaceOverride, decodeLandscapeSurfaceOverride, rasterizeLandscapeSurfaceOverrideLayer, sampleLandscapeSurfaceOverrideLayer, loadLandscapeSurfaceOverrides } from './SurfaceOverrides.js';
