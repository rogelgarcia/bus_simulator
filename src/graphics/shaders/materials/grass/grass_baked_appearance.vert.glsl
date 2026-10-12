// @section pars
#include <shaderlib:grass/baked_canopy.glsl>
varying vec2 vBakedGrassWorld;
#ifdef BAKED_GRASS_TILE_VARIATION
varying vec3 vBakedGrassTile;
#endif
#ifdef BAKED_GRASS_CANOPY_VIEW
varying vec3 vBakedGrassCanopyColor;
#endif
// @section project
vec4 bakedGrassWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
    bakedGrassWorld = instanceMatrix * bakedGrassWorld;
#endif
vBakedGrassWorld = (modelMatrix * bakedGrassWorld).xz;
#ifdef BAKED_GRASS_TILE_VARIATION
// Constant per instance: decorrelate repeats in vertex work, retaining a single texture lookup.
vec4 bakedGrassOrigin = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
bakedGrassOrigin = instanceMatrix * bakedGrassOrigin;
#endif
vec2 bakedGrassCenter = (modelMatrix * bakedGrassOrigin).xz;
mat2 bakedGrassUvTransform;
#ifdef BAKED_GRASS_CANOPY_UV_SCALE
vBakedGrassTile = grassBakedCanopyTile(vBakedGrassWorld, bakedGrassCenter, BAKED_GRASS_CANOPY_UV_SCALE, bakedGrassUvTransform);
#else
vBakedGrassTile = grassBakedCanopyTile(vBakedGrassWorld, bakedGrassCenter, 1.0, bakedGrassUvTransform);
#endif
#endif
#ifdef BAKED_GRASS_CANOPY_VIEW
vec3 bakedGrassRay = (modelMatrix * bakedGrassWorld).xyz - cameraPosition;
// Upright grass reveals dark roots from above; its flat replacement must retain that appearance.
vBakedGrassCanopyColor = grassBakedCanopyViewColor(bakedGrassRay);
#endif
