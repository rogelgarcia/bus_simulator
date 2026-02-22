uniform float uIntensity;
uniform float uRayCount;
uniform float uRayLength;
uniform float uLengthJitter;
uniform float uBaseWidthRad;
uniform float uTipWidthRad;
uniform float uSoftnessRad;
uniform float uCoreGlow;
uniform float uOuterGlow;
uniform float uRotationRad;
uniform float uSeed;
uniform vec3 uColor;

varying vec2 vUv;

float hash11(float x) {
    return fract(sin(x * 127.1 + uSeed * 311.7) * 43758.5453123);
}

void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float r01 = clamp(r, 0.0, 1.0);

    float circleFade = 1.0 - smoothstep(1.0, 1.08, r);

    float ang = atan(p.y, p.x) + uRotationRad;
    if (ang < 0.0) ang += 6.28318530718;

    float n = max(3.0, floor(uRayCount + 0.5));
    float cell = 6.28318530718 / n;
    float idx = floor(ang / cell);
    float center = (idx + 0.5) * cell;

    float dAng = abs(ang - center);
    dAng = min(dAng, 6.28318530718 - dAng);

    float rnd = hash11(idx + 1.0);
    float len = max(0.02, uRayLength * mix(1.0 - uLengthJitter, 1.0 + uLengthJitter, rnd));

    float t = smoothstep(0.0, max(1e-3, len), r01);
    float width = mix(uBaseWidthRad, uTipWidthRad, t);

    float rayMask = 1.0 - smoothstep(width, width + uSoftnessRad, dAng);
    float radialMask = 1.0 - smoothstep(len, len + 0.06, r01);

    float baseBoost = pow(max(0.0, 1.0 - r01 / max(1e-3, len)), 0.25);
    float tipFade = 1.0 - smoothstep(len * 0.75, len, r01);
    float rays = rayMask * radialMask * baseBoost * tipFade;

    float core = exp(-r01 * r01 * 18.0) * uCoreGlow;
    float halo = exp(-r01 * r01 * 2.8) * uOuterGlow;

    float a = (rays + core + halo) * uIntensity * circleFade;
    vec3 col = uColor * a;
    gl_FragColor = vec4(col, a);
}
