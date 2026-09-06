varying highp vec4 vReceiverAtlas;
uniform highp sampler2DArray receiverDirectAtlas;
uniform highp sampler2DArray receiverIndirectAtlas;
uniform vec4 receiverDirectScale[RECEIVER_DIRECT_LAYERS];
uniform vec4 receiverDirectBias[RECEIVER_DIRECT_LAYERS];
uniform vec4 receiverIndirectScale[RECEIVER_INDIRECT_LAYERS];
uniform vec4 receiverIndirectBias[RECEIVER_INDIRECT_LAYERS];
uniform int receiverDirectEnabled;
uniform int receiverIndirectEnabled;
uniform int receiverDebugMode;
uniform float receiverMaxMip;
uniform float receiverLightingBlend;
vec3 receiverDiffuseDifference = vec3(0.0);
vec3 receiverIndirectValue = vec3(0.0);
vec3 receiverDirectValue = vec3(0.0);
mat3 receiverFrame = mat3(1.0);
float receiverLod = 0.0;

void receiverPrepare(vec3 shadingNormal) {
    if (vReceiverAtlas.w < .5) return;
    vec2 dx = dFdx(vReceiverAtlas.xy), dy = dFdy(vReceiverAtlas.xy);
    vec2 size = vec2(textureSize(receiverIndirectAtlas, 0).xy);
    if (receiverIndirectEnabled == 0) size = vec2(textureSize(receiverDirectAtlas, 0).xy);
    receiverLod = clamp(.5 * log2(max(max(dot(dx * size, dx * size), dot(dy * size, dy * size)), 1.0)), 0.0, receiverMaxMip);
    #if !defined(RECEIVER_FLAT_NORMAL) && !defined(RECEIVER_SHARED_SUN)
    vec3 px = dFdx(-vViewPosition), py = dFdy(-vViewPosition);
    float orientation = sign(dx.x * dy.y - dx.y * dy.x);
    vec3 right = normalize(px * dy.y - py * dx.y) * orientation;
    vec3 up = normalize(py * dx.x - px * dy.x) * orientation;
    receiverFrame = mat3(right, up, normalize(cross(right, up)));
    #endif
    int page = int(floor(vReceiverAtlas.z + .5));
    if (receiverIndirectEnabled != 0) {
        #ifdef RECEIVER_DIRECTIONAL
        #ifdef RECEIVER_FLAT_NORMAL
        vec4 n = vec4(1.0, 0.0, 0.0, 1.0);
        #else
        vec4 n = vec4(1.0, dot(shadingNormal, right), dot(shadingNormal, up), dot(shadingNormal, receiverFrame[2]));
        #endif
        int layer = page * 3;
        vec4 r = textureLod(receiverIndirectAtlas, vec3(vReceiverAtlas.xy, float(layer)), receiverLod) * receiverIndirectScale[layer] + receiverIndirectBias[layer];
        #ifdef RECEIVER_FLAT_FIRST
        receiverIndirectValue = r.rgb;
        if (abs(n.y) + abs(n.z) + abs(n.w - 1.0) > .00001) {
            vec4 x = textureLod(receiverIndirectAtlas, vec3(vReceiverAtlas.xy, float(layer + 1)), receiverLod) * receiverIndirectScale[layer + 1] + receiverIndirectBias[layer + 1];
            vec4 y = textureLod(receiverIndirectAtlas, vec3(vReceiverAtlas.xy, float(layer + 2)), receiverLod) * receiverIndirectScale[layer + 2] + receiverIndirectBias[layer + 2];
            receiverIndirectValue += x.rgb * n.y + y.rgb * n.z + vec3(r.a, x.a, y.a) * (n.w - 1.0);
        }
        receiverIndirectValue = max(receiverIndirectValue, vec3(0.0));
        #else
        vec4 g = textureLod(receiverIndirectAtlas, vec3(vReceiverAtlas.xy, float(layer + 1)), receiverLod) * receiverIndirectScale[layer + 1] + receiverIndirectBias[layer + 1];
        vec4 b = textureLod(receiverIndirectAtlas, vec3(vReceiverAtlas.xy, float(layer + 2)), receiverLod) * receiverIndirectScale[layer + 2] + receiverIndirectBias[layer + 2];
        receiverIndirectValue = max(vec3(dot(r, n), dot(g, n), dot(b, n)), vec3(0.0));
        #endif
        #else
        receiverIndirectValue = (textureLod(receiverIndirectAtlas, vReceiverAtlas.xyz, receiverLod) * receiverIndirectScale[page] + receiverIndirectBias[page]).rgb;
        #endif
    }
    #ifndef RECEIVER_SHARED_SUN
    if (receiverDirectEnabled != 0) receiverDirectValue = (textureLod(receiverDirectAtlas, vReceiverAtlas.xyz, receiverLod) * receiverDirectScale[page] + receiverDirectBias[page]).rgb;
    #endif
}

vec3 receiverDebugColor(vec3 color) {
    if (receiverDebugMode == 0) return color;
    if (vReceiverAtlas.w < .5) return vec3(1.0, 0.0, 1.0);
    if (receiverDebugMode == 1) return receiverDirectValue;
    if (receiverDebugMode == 2) return receiverIndirectValue;
    if (receiverDebugMode == 3) return receiverIndirectValue + receiverDirectValue;
    if (receiverDebugMode == 4) return vec3(vReceiverAtlas.xy, 0.0);
    if (receiverDebugMode == 5) return fract((vReceiverAtlas.z + 1.0) * vec3(.618, .382, .236));
    if (receiverDebugMode == 6) return vec3(0.0, 1.0, 0.0);
    if (receiverDebugMode == 7) return abs(receiverDiffuseDifference);
    return vec3(receiverLod / max(receiverMaxMip, 1.0));
}
