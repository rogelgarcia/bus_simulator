// @section pars
#ifdef GRASS_PATCH_RISE
uniform vec3 grassPatchCamera;
uniform int grassPatchMode;
uniform float grassPatchGroundY;
uniform float grassPatchSinkHeight;
uniform vec2 grassPatchRiseBand;
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
#ifdef GRASS_PATCH_RISE
if (grassPatchMode < 0) {
    vec2 grassRiseWorld = (modelMatrix * vec4(transformed, 1.0)).xz;
    float grassRiseDistance = distance(vec3(grassRiseWorld.x, grassPatchGroundY, grassRiseWorld.y), grassPatchCamera);
    transformed.y -= grassPatchSinkHeight * smoothstep(grassPatchRiseBand.x, grassPatchRiseBand.y, grassRiseDistance);
}
#endif
#ifdef GRASS_PATCH_HANDOFF
vGrassPatchRay = (modelMatrix * vec4(transformed, 1.0)).xyz - cameraPosition;
#endif
