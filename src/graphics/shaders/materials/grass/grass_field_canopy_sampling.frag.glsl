uniform sampler2D grassCanopyAlbedoB;
uniform sampler2D grassCanopyNormalB;
uniform sampler2D grassCanopyRoughnessB;
uniform sampler2D grassCanopyVisibilityB;
uniform vec3 grassCanopyDistance;
float grassCanopySampleScale = 1.0;
vec2 grassCanopyUvDx;
vec2 grassCanopyUvDy;

// Both bakes share their boundary content. Select the variation before sampling
// every material channel, with gradients independent of the alternating cells.
vec4 grassFieldCanopySample(sampler2D sourceMap, sampler2D alternateMap, vec2 uv) {
    vec2 scaledUv = (uv - 0.5) / grassCanopySampleScale + 0.5;
    vec2 dx = grassCanopyUvDx / grassCanopySampleScale;
    vec2 dy = grassCanopyUvDy / grassCanopySampleScale;
    #ifdef GRASS_FIELD_CANOPY_PAIR
        vec2 tile = floor(scaledUv);
        if (mod(tile.x + tile.y, 2.0) >= 1.0) return textureGrad(alternateMap, scaledUv, dx, dy);
    #endif
    return textureGrad(sourceMap, scaledUv, dx, dy);
}

// The distance wrapper invokes the complete material once for each fixed scale.
#define main grassFieldCanopyShade
