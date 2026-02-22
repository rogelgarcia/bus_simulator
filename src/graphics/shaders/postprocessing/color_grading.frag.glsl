precision highp float;
precision highp sampler3D;

uniform sampler2D tDiffuse;
uniform sampler3D tLut;
uniform float intensity;

in vec2 vUv;
out vec4 outColor;

vec3 applyLut(vec3 rgb) {
    vec3 uvw = clamp(rgb, 0.0, 1.0);
    return texture(tLut, uvw).rgb;
}

vec3 linearToSrgb(vec3 c) {
    vec3 clamped = clamp(c, 0.0, 1.0);
    vec3 low = clamped * 12.92;
    vec3 high = 1.055 * pow(clamped, vec3(1.0 / 2.4)) - 0.055;
    vec3 cutoff = step(vec3(0.0031308), clamped);
    return mix(low, high, cutoff);
}

vec3 srgbToLinear(vec3 c) {
    vec3 clamped = clamp(c, 0.0, 1.0);
    vec3 low = clamped / 12.92;
    vec3 high = pow((clamped + 0.055) / 1.055, vec3(2.4));
    vec3 cutoff = step(vec3(0.04045), clamped);
    return mix(low, high, cutoff);
}

void main() {
    vec4 base = texture(tDiffuse, vUv);
    vec3 srcLinear = clamp(base.rgb, 0.0, 1.0);
    vec3 src = linearToSrgb(srcLinear);
    vec3 graded = applyLut(src);
    float k = clamp(intensity, 0.0, 1.0);
    vec3 outSrgb = mix(src, graded, k);
    outColor = vec4(srgbToLinear(outSrgb), base.a);
}
