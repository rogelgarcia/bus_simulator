uniform float uIntensity;
uniform float uFalloff;
varying vec2 vUv;

void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = exp(-pow(r, max(0.05, uFalloff)) * 6.0);
    vec3 col = vec3(1.0) * (a * uIntensity);
    gl_FragColor = vec4(col, a);
}
