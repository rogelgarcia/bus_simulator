// @section pars
#if defined(GRASS_PATCH_RISE) || defined(GRASS_PATCH_SHORTEN)
uniform vec3 grassPatchCamera;
uniform int grassPatchMode;
uniform float grassPatchGroundY;
uniform float grassPatchBladeHeight;
uniform vec2 grassPatchHeightBand;
#endif
#ifdef GRASS_PATCH_TRIM
// Thin MSAA triangles need covered-sample interpolation to avoid leaking clipped tips.
centroid varying float vGrassPatchHeight;
#endif
#ifdef GRASS_PATCH_HANDOFF
varying vec3 vGrassPatchRay;
#endif
#ifndef GRASS_PATCH_SURFACE
attribute vec2 grassPatchOffset;
#endif
// @section begin
#ifndef GRASS_PATCH_SURFACE
vec2 grassPatchTile = floor((modelMatrix[3].xz + grassPatchOffset) * 0.5);
uint grassPatchSeed = uint(int(grassPatchTile.x)) * 1597334677u ^ uint(int(grassPatchTile.y)) * 3812015801u;
grassPatchSeed = (grassPatchSeed ^ (grassPatchSeed >> 16u)) * 2246822519u;
if ((grassPatchSeed & 1u) != 0u) transformed.xz = vec2(-transformed.z, transformed.x);
if ((grassPatchSeed & 2u) != 0u) transformed.xz = -transformed.xz;
transformed.xz += grassPatchOffset;
#endif
#if defined(GRASS_PATCH_RISE) || defined(GRASS_PATCH_SHORTEN)
if (grassPatchMode < 0) {
    vec2 grassRiseWorld = (modelMatrix * vec4(transformed, 1.0)).xz;
    float grassRiseDistance = distance(vec3(grassRiseWorld.x, grassPatchGroundY, grassRiseWorld.y), grassPatchCamera);
#ifdef GRASS_PATCH_SHORTEN
    transformed.y *= 1.0 - smoothstep(grassPatchHeightBand.x, grassPatchHeightBand.y, grassRiseDistance);
#else
    transformed.y -= grassPatchBladeHeight * smoothstep(grassPatchHeightBand.x, grassPatchHeightBand.y, grassRiseDistance);
#endif
}
#endif
#ifdef GRASS_PATCH_TRIM
vGrassPatchHeight = transformed.y;
#endif
#ifdef GRASS_PATCH_HANDOFF
vGrassPatchRay = (modelMatrix * vec4(transformed, 1.0)).xyz - cameraPosition;
#endif
