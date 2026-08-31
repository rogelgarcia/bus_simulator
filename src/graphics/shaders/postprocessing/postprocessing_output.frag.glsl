uniform sampler2D tDiffuse;
uniform highp sampler3D tLut;
uniform float uColorGradingIntensity;
uniform float uLutSize;
uniform float uEnableColorGrading;
uniform float uEnableToneMapping;
uniform float uEnableOutputColorSpace;
varying vec2 vUv;

vec3 linearToSrgb(vec3 value) {
    vec3 low = value * 12.92;
    vec3 high = 1.055 * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(high, low, lessThanEqual(value, vec3(0.0031308)));
}

vec3 srgbToLinear(vec3 value) {
    vec3 low = value / 12.92;
    vec3 high = pow((max(value, vec3(0.0)) + 0.055) / 1.055, vec3(2.4));
    return mix(high, low, lessThanEqual(value, vec3(0.04045)));
}

vec3 sampleDisplayLut(vec3 displaySrgb) {
    float size = max(uLutSize, 2.0);
    vec3 texelCenterUv = (clamp(displaySrgb, 0.0, 1.0) * (size - 1.0) + 0.5) / size;
    return texture(tLut, texelCenterUv).rgb;
}

void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
    if (uEnableToneMapping > 0.5) {
        #include <tonemapping_fragment>
    }
    if (uEnableToneMapping > 0.5 && uEnableColorGrading > 0.5) {
        vec3 displaySrgb = linearToSrgb(max(gl_FragColor.rgb, vec3(0.0)));
        vec3 gradedSrgb = sampleDisplayLut(displaySrgb);
        gl_FragColor.rgb = srgbToLinear(mix(displaySrgb, gradedSrgb, uColorGradingIntensity));
    }
    if (uEnableOutputColorSpace > 0.5) {
        #include <colorspace_fragment>
    }
}
