varying highp vec4 vReceiverAtlas;
uniform highp sampler2DArray receiverDirectAtlas;
uniform highp sampler2DArray receiverIndirectAtlas;
uniform int receiverDirectEnabled;
uniform int receiverIndirectEnabled;
uniform int receiverDebugMode;
uniform float receiverMaxMip;
vec3 receiverDiffuseDifference = vec3(0.0);

vec3 receiverIrradiance(highp sampler2DArray atlas) {
    vec2 size = vec2(textureSize(atlas, 0).xy);
    vec2 dx = dFdx(vReceiverAtlas.xy) * size;
    vec2 dy = dFdy(vReceiverAtlas.xy) * size;
    float lod = clamp(0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1.0)), 0.0, receiverMaxMip);
    return textureLod(atlas, vReceiverAtlas.xyz, lod).rgb;
}

vec3 receiverDebugColor(vec3 normalColor) {
    if (receiverDebugMode == 0) return normalColor;
    if (vReceiverAtlas.w < 0.5) return vec3(1.0, 0.0, 1.0);
    if (receiverDebugMode == 1) return receiverIrradiance(receiverDirectAtlas);
    if (receiverDebugMode == 2) return receiverIrradiance(receiverIndirectAtlas);
    if (receiverDebugMode == 3) return receiverIrradiance(receiverDirectAtlas) + receiverIrradiance(receiverIndirectAtlas);
    if (receiverDebugMode == 4) return vec3(vReceiverAtlas.xy, 0.0);
    if (receiverDebugMode == 5) return fract((vReceiverAtlas.z + 1.0) * vec3(0.618, 0.382, 0.236));
    if (receiverDebugMode == 6) return vec3(0.0, 1.0, 0.0);
    if (receiverDebugMode == 7) return abs(receiverDiffuseDifference);
    if (receiverDebugMode == 8) {
        vec2 pageSize = receiverIndirectEnabled != 0 ? vec2(textureSize(receiverIndirectAtlas, 0).xy) : vec2(textureSize(receiverDirectAtlas, 0).xy);
        vec2 delta = fwidth(vReceiverAtlas.xy) * pageSize;
        return vec3(clamp(log2(max(max(delta.x, delta.y), 1.0)) / max(receiverMaxMip, 1.0), 0.0, 1.0));
    }
    return normalColor;
}
