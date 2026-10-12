// AI 597 initial spectrum of every cascade (landscape-ocean-v1): texel (c N + m, n) of the atlas holds h0(k) and conj h0(-k) of cascade c at
// k = 2 pi (m - N/2, n - N/2) / L, with |h0|^2 = E(k) dk^2 / 2 and Gaussian phases from the texel hash, band-limited to (kMin, kMax]; the
// Nyquist row and column and k = 0 are zero. Mirror: landscapeOceanInitialTexel in LandscapeOceanSpectrum.js.
#include <shaderlib:landscape/ocean_spectrum>

float oceanAmplitude(vec2 index, vec4 cascade) {
    float halfTexels = uOceanTexels * 0.5;
    if (index.x == -halfTexels || index.y == -halfTexels || (index.x == 0.0 && index.y == 0.0)) return 0.0;
    float dk = LANDSCAPE_OCEAN_TWO_PI / cascade.x;
    vec2 k = index * dk;
    float magnitude = length(k);
    if (!(magnitude > cascade.y && magnitude <= cascade.z)) return 0.0;
    return sqrt(oceanSpectrum(k) * dk * dk * 0.5);
}

void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    int texels = int(uOceanTexels), cascadeIndex = texel.x / texels;
    vec4 cascade = uOceanCascade[0];
#if LANDSCAPE_OCEAN_CASCADES > 1
    if (cascadeIndex == 1) cascade = uOceanCascade[1];
#endif
#if LANDSCAPE_OCEAN_CASCADES > 2
    if (cascadeIndex == 2) cascade = uOceanCascade[2];
#endif
#if LANDSCAPE_OCEAN_CASCADES > 3
    if (cascadeIndex == 3) cascade = uOceanCascade[3];
#endif
    int m = texel.x - cascadeIndex * texels, n = texel.y, halfTexels = texels / 2;
    vec2 index = vec2(float(m - halfTexels), float(n - halfTexels));
    uint seed = uint(cascade.w);
    float a = oceanAmplitude(index, cascade), b = oceanAmplitude(-index, cascade);
    vec2 g = oceanGaussian(uint(m), uint(n), seed), h = oceanGaussian(uint(2 * halfTexels - m), uint(2 * halfTexels - n), seed);
    const float scale = 0.7071067811865476;
    gl_FragColor = vec4(scale * g.x * a, scale * g.y * a, scale * h.x * b, -scale * h.y * b);
}
