// AI 597 spectral wave model of the animated ocean (landscape-ocean-v1), shared by the initial-spectrum and time-evolution passes. JavaScript
// mirrors: LandscapeOceanSpectrum.js (landscapeOceanDispersion, landscapeOceanJonswap, landscapeOceanTma, landscapeOceanSpreading,
// landscapeOceanWaveSpectrum, landscapeOceanHash, landscapeOceanGaussian). Finite-depth dispersion w^2 = g k tanh(k h); JONSWAP (Hasselmann et al.
// 1973) under the TMA factor (Bouws et al. 1985) with Mitsuyasu cos^2s spreading (Longuet-Higgins normalization through a Lanczos ln Gamma);
// E(k) = S(w) D(theta) (dw / dk) / k. The per-cascade uniforms are vec4(patch length, kMin, kMax, seed).
#define LANDSCAPE_OCEAN_G 9.80665
#define LANDSCAPE_OCEAN_TWO_PI 6.283185307179586
uniform float uOceanTexels;
uniform float uOceanDepth;
// alpha, peak angular frequency, gamma, peak spread; the heading is the travel direction angle atan(z, x)
uniform vec4 uOceanWindShape;
uniform float uOceanWindHeading;
uniform vec4 uOceanSwellShape;
uniform float uOceanSwellHeading;
uniform vec4 uOceanCascade[LANDSCAPE_OCEAN_CASCADES];

float oceanLogGamma(float x) {
    float z = x - 1.0;
    float sum = 0.99999999999980993 + 676.5203681218851 / (z + 1.0) - 1259.1392167224028 / (z + 2.0) + 771.32342877765313 / (z + 3.0) - 176.61502916214059 / (z + 4.0)
        + 12.507343278686905 / (z + 5.0) - 0.13857109526572012 / (z + 6.0) + 9.9843695780195716e-6 / (z + 7.0) + 1.5056327351493116e-7 / (z + 8.0);
    float t = z + 7.5;
    return 0.9189385332046727 + (z + 0.5) * log(t) - t + log(sum);
}

// angular frequency and group velocity of wavenumber k over the representative depth
vec2 oceanDispersion(float k) {
    float kh = k * uOceanDepth, th = tanh(kh), omega = sqrt(LANDSCAPE_OCEAN_G * k * th);
    return vec2(omega, LANDSCAPE_OCEAN_G * (th + kh * (1.0 - th * th)) / (2.0 * omega));
}

float oceanJonswap(float omega, vec4 shape) {
    float omegaPeak = shape.y, sigma = omega <= omegaPeak ? 0.07 : 0.09;
    float r = exp(-(omega - omegaPeak) * (omega - omegaPeak) / (2.0 * sigma * sigma * omegaPeak * omegaPeak));
    return shape.x * LANDSCAPE_OCEAN_G * LANDSCAPE_OCEAN_G / pow(omega, 5.0) * exp(-1.25 * pow(omegaPeak / omega, 4.0)) * pow(shape.z, r);
}

float oceanTma(float omega) {
    float wh = omega * sqrt(uOceanDepth / LANDSCAPE_OCEAN_G);
    return wh <= 1.0 ? 0.5 * wh * wh : wh < 2.0 ? 1.0 - 0.5 * (2.0 - wh) * (2.0 - wh) : 1.0;
}

float oceanSpreading(float theta, float omega, vec4 shape, float heading) {
    float ratio = max(omega, 1.0e-6) / shape.y, s = clamp(shape.w * (ratio <= 1.0 ? pow(ratio, 5.0) : pow(ratio, -2.5)), 0.1, 60.0);
    float normalization = exp(oceanLogGamma(s + 1.0) - oceanLogGamma(s + 0.5)) / (2.0 * 1.7724538509055159);
    return normalization * pow(0.5 * (1.0 + cos(theta - heading)), s);
}

// wave-vector spectral density of the wind sea plus the swell
float oceanSpectrum(vec2 k) {
    float magnitude = length(k);
    if (magnitude <= 0.0) return 0.0;
    vec2 dispersion = oceanDispersion(magnitude);
    float omega = dispersion.x, theta = atan(k.y, k.x);
    float wind = oceanJonswap(omega, uOceanWindShape) * oceanSpreading(theta, omega, uOceanWindShape, uOceanWindHeading);
    float swell = oceanJonswap(omega, uOceanSwellShape) * oceanSpreading(theta, omega, uOceanSwellShape, uOceanSwellHeading);
    return (wind + swell) * oceanTma(omega) * dispersion.y / magnitude;
}

uint oceanHash(uint x, uint y, uint seed) {
    uint h = (x * 0x9E3779B1u) ^ ((y + 0x7F4A7C15u) * 0x85EBCA77u) ^ ((seed + 0x165667B1u) * 0xC2B2AE3Du);
    h = (h ^ (h >> 15u)) * 0x2C1B3C6Du;
    h = (h ^ (h >> 12u)) * 0x297A2D39u;
    return h ^ (h >> 15u);
}

// a standard Gaussian pair of a texel (Box-Muller over two hashes)
vec2 oceanGaussian(uint x, uint y, uint seed) {
    float u1 = (float(oceanHash(x, y, seed)) + 0.5) / 4294967296.0, u2 = (float(oceanHash(x, y, seed + 0x51ED27u)) + 0.5) / 4294967296.0;
    float radius = sqrt(-2.0 * log(u1)), angle = LANDSCAPE_OCEAN_TWO_PI * u2;
    return radius * vec2(cos(angle), sin(angle));
}
