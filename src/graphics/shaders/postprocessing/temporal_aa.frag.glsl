uniform sampler2D tDiffuse;
uniform sampler2D tHistory;
uniform float uHistoryStrength;
uniform float uClampStrength;
uniform float uSharpenStrength;
uniform vec2 uInvResolution;
varying vec2 vUv;

vec3 sampleTex(sampler2D tex, vec2 uv) {
    return texture2D(tex, uv).rgb;
}

void main() {
    vec4 cur4 = texture2D(tDiffuse, vUv);
    vec3 cur = cur4.rgb;
    vec3 his = sampleTex(tHistory, vUv);

    vec2 dx = vec2(uInvResolution.x, 0.0);
    vec2 dy = vec2(0.0, uInvResolution.y);

    vec3 n0 = sampleTex(tDiffuse, vUv - dx);
    vec3 n1 = sampleTex(tDiffuse, vUv + dx);
    vec3 n2 = sampleTex(tDiffuse, vUv - dy);
    vec3 n3 = sampleTex(tDiffuse, vUv + dy);

    vec3 minC = min(cur, min(min(n0, n1), min(n2, n3)));
    vec3 maxC = max(cur, max(max(n0, n1), max(n2, n3)));

    float clampK = clamp(uClampStrength, 0.0, 1.0);
    float padding = mix(16.0, 0.0, clampK);
    vec3 lo = minC - vec3(padding);
    vec3 hi = maxC + vec3(padding);
    vec3 hisClamped = clamp(his, lo, hi);

    float k = clamp(uHistoryStrength, 0.0, 0.98);
    vec3 blended = mix(cur, hisClamped, k);

    float sharpK = clamp(uSharpenStrength, 0.0, 1.0);
    vec3 blur4 = 0.25 * (n0 + n1 + n2 + n3);
    vec3 detail = cur - blur4;
    vec3 outColor = blended + detail * sharpK;

    gl_FragColor = vec4(outColor, cur4.a);
}
