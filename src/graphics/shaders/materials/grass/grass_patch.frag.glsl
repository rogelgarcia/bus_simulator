// @section pars
uniform vec3 grassPatchCamera;
uniform vec4 grassPatchBand;
uniform int grassPatchMode;
uniform float grassPatchGroundY;
#ifdef GRASS_PATCH_HANDOFF
varying vec3 vGrassPatchRay;
#endif
#if defined(GRASS_PATCH_SURFACE) || defined(GRASS_PATCH_HANDOFF)
#include <shaderlib:grass/baked_canopy.glsl>
uniform sampler2D grassPatchCanopyA;
uniform sampler2D grassPatchCanopyB;
uniform float grassPatchCanopyScale;
uniform vec3 grassPatchCanopyColor;
uniform vec2 grassPatchHandoffBand;
vec3 grassPatchCanopy(vec2 world, vec2 dx, vec2 dy, vec3 ray) {
    mat2 transform;
    vec3 uv = grassBakedCanopyTile(world, floor(world) + 0.5, grassPatchCanopyScale, transform);
    vec3 color = uv.z > 0.5 ? textureGrad(grassPatchCanopyB, uv.xy, transform * dx, transform * dy).rgb
        : textureGrad(grassPatchCanopyA, uv.xy, transform * dx, transform * dy).rgb;
    return color * grassBakedCanopyViewColor(ray);
}
#endif
#ifdef GRASS_PATCH_SURFACE
uniform sampler2D grassPatchLitterA;
uniform sampler2D grassPatchLitterB;
uniform vec3 grassPatchLitterGain;
#ifdef GRASS_PATCH_LEAF_FILL
#include <shaderlib:grass/leaf_fill.glsl>
#endif
#endif
// @section mask
#if defined(GRASS_PATCH_SURFACE) || defined(GRASS_PATCH_HANDOFF)
#ifdef GRASS_PATCH_HANDOFF
vec3 grassPatchRay = vGrassPatchRay;
float grassPatchRayY = grassPatchRay.y < 0.0 ? min(grassPatchRay.y, -0.0001) : max(grassPatchRay.y, 0.0001);
vec2 grassPatchGround = cameraPosition.xz + grassPatchRay.xz * ((grassPatchGroundY + 0.005 - cameraPosition.y) / grassPatchRayY);
#else
vec3 grassPatchRay = vec3(vBakedGrassWorld.x, grassPatchGroundY + 0.005, vBakedGrassWorld.y) - cameraPosition;
vec2 grassPatchGround = vBakedGrassWorld;
#endif
vec2 grassPatchGroundDx = dFdx(grassPatchGround), grassPatchGroundDy = dFdy(grassPatchGround);
float grassPatchColorFade = grassPatchMode < 0 ? smoothstep(grassPatchHandoffBand.x, grassPatchHandoffBand.y,
    distance(vec3(grassPatchGround.x, grassPatchGroundY, grassPatchGround.y), grassPatchCamera)) : 0.0;
#endif
#ifndef GRASS_PATCH_SURFACE
if (grassPatchMode < 0) {
    float grassPatchDistance = distance(vec3(vBakedGrassWorld.x, grassPatchGroundY, vBakedGrassWorld.y), grassPatchCamera);
    float grassPatchIncoming = smoothstep(grassPatchBand.x, grassPatchBand.y, grassPatchDistance);
#ifdef GRASS_PATCH_RISE
    // Only the LOD3 -> LOD4 entrance keeps its existing complementary dissolve.
    if (grassPatchIncoming < 1.0) {
        float grassPatchSample = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
        if (grassPatchSample >= grassPatchIncoming) discard;
    }
#else
    float grassPatchOutgoing = smoothstep(grassPatchBand.z, grassPatchBand.w, grassPatchDistance);
    float grassPatchSample = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
    if (grassPatchSample >= grassPatchIncoming || grassPatchSample < grassPatchOutgoing) discard;
#endif
}
#endif
// @section map
float grassSurfaceFade = grassPatchMode == 5 ? 1.0 : grassPatchColorFade;
float grassSurfaceLeafFill = grassPatchMode == 4 ? 1.0 : (grassPatchMode < 0 ? smoothstep(grassPatchBand.x, grassPatchBand.y,
    distance(vec3(grassPatchGround.x, grassPatchGroundY, grassPatchGround.y), grassPatchCamera)) : 0.0);
#ifdef GRASS_PATCH_LEAF_FILL
vec3 grassSurfaceCanopy = grassSurfaceFade > 0.0
    ? grassPatchCanopy(grassPatchGround, grassPatchGroundDx, grassPatchGroundDy, grassPatchRay) : vec3(0.0);
#else
vec3 grassSurfaceCanopy = grassSurfaceFade > 0.0 || grassSurfaceLeafFill > 0.0
    ? grassPatchCanopy(grassPatchGround, grassPatchGroundDx, grassPatchGroundDy, grassPatchRay) : vec3(0.0);
float grassSurfaceLeafHighlight = smoothstep(0.02, 0.055, dot(grassSurfaceCanopy, vec3(0.2126, 0.7152, 0.0722)));
#endif
vec2 grassSurfaceCenter = floor(vBakedGrassWorld) + 0.5;
vec2 grassSurfaceDx = dFdx(vBakedGrassWorld), grassSurfaceDy = dFdy(vBakedGrassWorld);
vec3 grassSurfaceColor = vec3(0.0);
if (grassSurfaceFade < 1.0) {
    mat2 grassLitterTransform;
    vec3 grassLitterUv = grassBakedCanopyTile(vBakedGrassWorld, grassSurfaceCenter, 1.0, grassLitterTransform);
    vec3 grassLitter = grassLitterUv.z > 0.5
        ? textureGrad(grassPatchLitterB, grassLitterUv.xy, grassLitterTransform * grassSurfaceDx, grassLitterTransform * grassSurfaceDy).rgb
        : textureGrad(grassPatchLitterA, grassLitterUv.xy, grassLitterTransform * grassSurfaceDx, grassLitterTransform * grassSurfaceDy).rgb;
    grassLitter *= grassPatchLitterGain;
#ifdef GRASS_PATCH_LEAF_FILL
    if (grassSurfaceLeafFill > 0.0) {
        vec4 grassLeaves = grassLeafFill(grassPatchGround, grassPatchGroundDx, grassPatchGroundDy);
        grassLitter = mix(grassLitter, grassLeaves.rgb, grassLeaves.a * grassSurfaceLeafFill);
    }
#else
    grassLitter += max(grassSurfaceCanopy - grassLitter, vec3(0.0)) * 0.25 * grassSurfaceLeafFill * grassSurfaceLeafHighlight;
#endif
    grassSurfaceColor += grassLitter * (1.0 - grassSurfaceFade);
}
if (grassSurfaceFade > 0.0) {
    grassSurfaceColor += grassSurfaceCanopy * grassSurfaceFade;
}
diffuseColor.rgb *= grassSurfaceColor;
// @section handoff
#ifdef GRASS_PATCH_HANDOFF
if (grassPatchColorFade > 0.0 && grassPatchRay.y < -0.0001 && cameraPosition.y > grassPatchGroundY + 0.005) {
    vec3 grassPatchColor = grassPatchCanopy(grassPatchGround, grassPatchGroundDx, grassPatchGroundDy, grassPatchRay) * grassPatchCanopyColor;
    outgoingLight = mix(outgoingLight, grassPatchColor, grassPatchColorFade);
}
#endif
