uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uGround;
uniform float uSkyCurve;
uniform float uSkyExposure;
uniform float uDitherStrength;
uniform float uHazeEnabled;
uniform float uHazeIntensity;
uniform float uHazeThickness;
uniform float uHazeCurve;
uniform vec3 uHazeTint;
uniform float uHazeTintStrength;
uniform float uGlareEnabled;
uniform float uGlareIntensity;
uniform float uGlareSigma2;
uniform float uGlarePower;
uniform float uDiscEnabled;
uniform float uDiscIntensity;
uniform float uDiscSigma2;
uniform float uDiscCoreIntensity;
uniform float uDiscCoreSigma2;
uniform vec3 uSunDir;
uniform float uSunIntensity;
uniform float uDebugMode;
uniform float uShowSunRing;
uniform float uSunRingRadius;
uniform float uSunRingThickness;
varying vec3 vDir;

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    float y = vDir.y;
    float t = clamp(y, 0.0, 1.0);
    t = pow(t, max(0.001, uSkyCurve));
    vec3 base = mix(uHorizon, uZenith, t);
    float groundMix = smoothstep(0.0, 0.18, -y);
    base = mix(base, uGround, groundMix);

    vec3 dir = normalize(vDir);
    vec3 sunD = normalize(uSunDir);
    float sunDot = clamp(dot(dir, sunD), 0.0, 1.0);
    float theta2 = max(0.0, 2.0 * (1.0 - sunDot));

    float haze = 0.0;
    if (uHazeEnabled > 0.5) {
        float hz = exp(-pow(t / max(1e-4, uHazeThickness), max(0.01, uHazeCurve)));
        haze = hz * uHazeIntensity;
    }
    vec3 hazeCol = mix(vec3(1.0), uHazeTint, clamp(uHazeTintStrength, 0.0, 1.0));

    float glare = 0.0;
    if (uGlareEnabled > 0.5) {
        float sigma2 = max(1e-8, uGlareSigma2);
        float g = exp(-theta2 / (2.0 * sigma2));
        glare = pow(g, max(0.01, uGlarePower)) * uGlareIntensity * uSunIntensity;
    }

    float disc = 0.0;
    if (uDiscEnabled > 0.5) {
        float sigma2 = max(1e-8, uDiscSigma2);
        float soft = exp(-theta2 / (2.0 * sigma2)) * uDiscIntensity;
        float coreSigma2 = max(1e-8, uDiscCoreSigma2);
        float core = exp(-theta2 / (2.0 * coreSigma2)) * uDiscCoreIntensity;
        disc = (soft + core) * uSunIntensity;
    }

    vec3 col = base;

    float mode = uDebugMode;
    if (mode > 0.5 && mode < 1.5) {
        col = base;
    } else if (mode > 1.5 && mode < 2.5) {
        col = vec3(glare);
    } else if (mode > 2.5) {
        col = vec3(disc);
    } else {
        col = mix(col, hazeCol, clamp(haze, 0.0, 1.0));
        col *= (1.0 + glare);
        col += vec3(1.0) * disc;
    }

    col *= uSkyExposure;

    float n = hash21(gl_FragCoord.xy);
    col += vec3((n - 0.5) * (uDitherStrength / 512.0));

    if (uShowSunRing > 0.5) {
        float theta = sqrt(max(theta2, 0.0));
        float r = max(1e-6, uSunRingRadius);
        float w = max(1e-6, uSunRingThickness);
        float ring = 1.0 - smoothstep(0.0, w, abs(theta - r));
        col = mix(col, vec3(1.0, 0.0, 1.0), ring);
    }

    gl_FragColor = vec4(col, 1.0);
}
