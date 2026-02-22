uniform float uIntensity;
uniform float uSoftness;
varying vec2 vUv;

void main() {
    vec2 p = (vUv - vec2(0.5)) * 2.0;
    float r = length(p);
    float softness = clamp(uSoftness, 0.02, 1.0);
    float inner = max(0.0, 1.0 - softness);
    float a = 1.0 - smoothstep(inner, 1.0, r);
    float alpha = clamp(uIntensity, 0.0, 2.0) * a;
    if (alpha <= 0.0001) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
}
