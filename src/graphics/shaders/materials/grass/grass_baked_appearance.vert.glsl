// @section pars
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
ivec2 bakedGrassCell = ivec2(floor(bakedGrassCenter));
uint bakedGrassHash = uint(bakedGrassCell.x) * 1597334677u ^ uint(bakedGrassCell.y) * 3812015801u;
bakedGrassHash = (bakedGrassHash ^ (bakedGrassHash >> 16u)) * 2246822519u;
vec2 bakedGrassLocal = (vBakedGrassWorld - bakedGrassCenter) * vec2(0.5, -0.5);
if ((bakedGrassHash & 1u) != 0u) bakedGrassLocal = bakedGrassLocal.yx;
bakedGrassLocal *= vec2((bakedGrassHash & 2u) == 0u ? 1.0 : -1.0, (bakedGrassHash & 4u) == 0u ? 1.0 : -1.0);
vBakedGrassTile = vec3(bakedGrassLocal + vec2(float((bakedGrassHash >> 4u) & 255u), float((bakedGrassHash >> 12u) & 255u)) / 256.0, float((bakedGrassHash >> 3u) & 1u));
#endif
#ifdef BAKED_GRASS_CANOPY_VIEW
vec3 bakedGrassRay = (modelMatrix * bakedGrassWorld).xyz - cameraPosition;
// Upright grass reveals dark roots from above; its flat replacement must retain that appearance.
float bakedGrassElevation = abs(bakedGrassRay.y) / max(length(bakedGrassRay), 0.001);
vBakedGrassCanopyColor = mix(vec3(0.80, 0.88, 0.73), vec3(0.47, 0.48, 0.44), smoothstep(0.10, 0.55, bakedGrassElevation));
#endif
