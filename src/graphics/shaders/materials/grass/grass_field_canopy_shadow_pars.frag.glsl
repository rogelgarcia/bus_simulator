#if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
varying vec4 vGrassCanopyShadowY;
varying float vGrassCanopyWorldY;
varying vec2 vGrassCanopyWorldXZ;
varying vec2 vGrassCanopyTileUv;
uniform sampler2D grassCanopyShadowVisibility;
uniform sampler2D grassCanopyTileVisibility;
uniform vec4 grassCanopyShadowBounds;
uniform int grassCanopyShadowPass;
float grassCanopyCapturedVisibility = 1.0;
vec4 grassCanopyShadowCoord(vec4 coordinate, float capturedHeight) {
    float sourceHeight = capturedHeight * GRASS_FIELD_CANOPY_SOURCE_HEIGHT;
    return coordinate + vGrassCanopyShadowY * (sourceHeight - vGrassCanopyWorldY);
}
#ifdef SHADOWMAP_TYPE_PCF
float grassCanopyShadow(sampler2DShadow shadowMap, vec2 mapSize, float intensity, float bias, float radius, vec4 coordinate) {
#ifdef GRASS_CANOPY_BAKED_SHADOW_ONLY
    // Runtime scenes without external occluders need only the periodic self-shadow capture.
    return grassFieldCanopySample(grassCanopyTileVisibility, grassCanopyVisibilityB, vGrassCanopyTileUv).r;
#else
    if (grassCanopyShadowPass == 2) {
        vec2 uv = vec2(vGrassCanopyWorldXZ.x - grassCanopyShadowBounds.x, grassCanopyShadowBounds.y - vGrassCanopyWorldXZ.y) * grassCanopyShadowBounds.zw;
        float sceneVisibility = textureGrad(grassCanopyShadowVisibility, uv, dFdx(uv) * 2.0, dFdy(uv) * 2.0).r;
        float tileVisibility = grassFieldCanopySample(grassCanopyTileVisibility, grassCanopyVisibilityB, vGrassCanopyTileUv).r;
        return sceneVisibility * tileVisibility;
    }
    vec3 p = coordinate.xyz / coordinate.w; p.z += bias;
    if (any(lessThan(p.xy, vec2(0.0))) || any(greaterThan(p.xy, vec2(1.0))) || p.z > 1.0) return 1.0;
    vec2 dx = dFdx(p.xy) * 2.0, dy = dFdy(p.xy) * 2.0; float visibility = 0.0;
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) visibility += texture(shadowMap, vec3(p.xy + dx * ((float(x) + 0.5) / 4.0 - 0.5) + dy * ((float(y) + 0.5) / 4.0 - 0.5), p.z));
    grassCanopyCapturedVisibility = mix(1.0, visibility / 16.0, intensity);
    return grassCanopyCapturedVisibility;
#endif
}
#else
#define grassCanopyShadow getShadow
#endif
#endif
