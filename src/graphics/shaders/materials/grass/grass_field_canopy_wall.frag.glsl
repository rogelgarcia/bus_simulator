// The side capture already contains geometric overlap. At grazing angles the
// full two-metre column is visible; looking down only reveals its front rows.
uniform vec3 grassWallGroundColor;
uniform vec3 grassWallLitterBlend;
uniform float grassWallSelfShadowStrength;
uniform vec2 grassWallBaseTint;
#ifdef GRASS_CANOPY_WALL_LITTER
uniform sampler2D grassWallLitterMap;
uniform vec3 grassWallLitterColor;
uniform float grassWallLitterUvScale;
uniform float grassWallLitterHeight;
varying vec2 vGrassWallLocalXZ;
varying vec2 vGrassWallLocalFacing;
#endif
uniform sampler2D grassWallVisibility;
uniform sampler2D grassCanopyShadowVisibility;
uniform vec4 grassCanopyShadowBounds;
uniform int grassCanopyShadowPass;
varying vec2 vGrassWallWorldXZ;
varying vec2 vGrassWallUv;
varying vec2 vGrassWallFacing;
varying float vGrassWallHeight;
float grassWallLitterWeight;
float grassWallCaptureOffset;
vec2 grassWallDx;
vec2 grassWallDy;
float grassWallCapturedVisibility = 1.0;
vec4 grassWallSample(sampler2D map, vec2 uv) {
    return textureGrad(map, uv + vec2(0.0, grassWallCaptureOffset), grassWallDx, grassWallDy);
}
// Keep overlapping grass on the bevel and real litter in every uncovered texel.
void grassWallSurface(inout vec3 color, inout float leafMask, inout vec3 soil, inout float roughness) {
    float heightWeight = smoothstep(0.0, 1.0, vGrassWallHeight);
    leafMask *= 1.0 - grassWallLitterWeight;
    color *= (1.0 - grassWallLitterWeight) * mix(grassWallBaseTint.x, 1.0, heightWeight);
    vec3 background = grassWallGroundColor;
    #ifdef GRASS_CANOPY_WALL_LITTER
    // Unfold the vertical rise into the ground texture. At the top this meets
    // the canopy bake's centered phase; below it avoids stretched flat stripes.
    vec2 litterPosition = vGrassWallLocalXZ + normalize(vGrassWallLocalFacing) * grassWallLitterHeight * (1.0 - vGrassWallHeight);
    vec2 litterUv = litterPosition * vec2(1.0, -1.0) * grassWallLitterUvScale;
    background = texture2D(grassWallLitterMap, litterUv).rgb * grassWallLitterColor;
    #endif
    soil = background * (1.0 - leafMask) * mix(grassWallBaseTint.y, 1.0, heightWeight);
    color += soil;
    roughness = 1.0;
}
#ifdef SHADOWMAP_TYPE_PCF
float grassWallShadow(sampler2DShadow shadowMap, vec2 mapSize, float intensity, float bias, float radius, vec4 coordinate) {
    if (grassCanopyShadowPass == 1) {
        vec3 p = coordinate.xyz / coordinate.w; p.z += bias;
        if (any(lessThan(p.xy, vec2(0.0))) || any(greaterThan(p.xy, vec2(1.0))) || p.z > 1.0) return 1.0;
        grassWallCapturedVisibility = mix(1.0, texture(shadowMap, p), intensity);
        return grassWallCapturedVisibility;
    }
    vec2 uv = (vec2(vGrassWallWorldXZ.x, -vGrassWallWorldXZ.y) - vec2(grassCanopyShadowBounds.x, -grassCanopyShadowBounds.y)) * grassCanopyShadowBounds.zw;
    float scene = textureGrad(grassCanopyShadowVisibility, uv, dFdx(uv) * 2.0, dFdy(uv) * 2.0).r;
    // Keep external shadows fully effective, but the thin perimeter should not
    // inherit the full darkness of the two-metre capture column.
    float self = mix(1.0, grassWallSample(grassWallVisibility, vGrassWallUv).r, grassWallSelfShadowStrength);
    return scene * mix(self, 1.0, grassWallLitterWeight);
}
#else
#define grassWallShadow getShadow
#endif
#define main grassWallShade
