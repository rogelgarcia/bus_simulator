// AI 597 time evolution of the cascade spectra at the simulation time: h(k, t) = h0 e^{iwt} + conj h0(-k) e^{-iwt} packed for the FFT as
// A = h + i Dx and B = Dz (unit choppiness; Dx = -i kx / k h, Dz = -i kz / k h). Mirror: landscapeOceanEvolvedTexel in LandscapeOceanSpectrum.js.
#include <shaderlib:landscape/ocean_spectrum>
uniform sampler2D uOceanInitial;
uniform float uOceanTime;

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
    int halfTexels = texels / 2;
    vec2 k = vec2(float(texel.x - cascadeIndex * texels - halfTexels), float(texel.y - halfTexels)) * (LANDSCAPE_OCEAN_TWO_PI / cascade.x);
    float magnitude = length(k);
    if (magnitude <= 0.0) { gl_FragColor = vec4(0.0); return; }
    vec4 initial = texelFetch(uOceanInitial, texel, 0);
    float omega = oceanDispersion(magnitude).x, c = cos(omega * uOceanTime), s = sin(omega * uOceanTime);
    float hr = initial.x * c - initial.y * s + initial.z * c + initial.w * s;
    float hi = initial.x * s + initial.y * c - initial.z * s + initial.w * c;
    vec2 unit = k / magnitude;
    gl_FragColor = vec4(hr + unit.x * hr, hi + unit.x * hi, unit.y * hi, -unit.y * hr);
}
