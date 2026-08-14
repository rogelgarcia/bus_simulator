uniform sampler2D tDiffuse;
uniform sampler2D uGtaoMap;
uniform sampler2D uAoExclusionMask;
uniform float uUseAoExclusionMask;
uniform float uIntensity;
varying vec2 vUv;

void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    float ao = texture2D(uGtaoMap, vUv).r;
    float exclusion = step(0.001, texture2D(uAoExclusionMask, vUv).r) * uUseAoExclusionMask;
    float k = clamp(uIntensity, 0.0, 2.0);
    float factor = clamp(1.0 - k * (1.0 - ao), 0.0, 1.0);
    factor = mix(factor, 1.0, exclusion);
    gl_FragColor = vec4(base.rgb * factor, base.a);
}
