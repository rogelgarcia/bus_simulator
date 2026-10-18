// AI 597 D3 foam on the drawn sea surface: the coverage of a fragment from the foam density (the state raster plus the instantaneous breaker
// front and folding of the fragment itself) broken up by a world-space procedural pattern (value noise at three physical scales plus a fine
// bubble scale that fades with the pixel footprint: no texture, no tiling, the same pattern on every device), and the foam's radiance as a
// diffuse layer lit by the sun (with the terrain's sun visibility) and the sky. The composition is the caller's: foam replaces the water's
// radiance by its coverage and raises the fragment's alpha to opaque.
uniform sampler2D uOceanFoam;
// x 1 while the foam state draws else 0, y coverage threshold, z coverage softness, w albedo
uniform vec4 uOceanFoamLook;
// x..z the pattern wavelengths (m, coarse to fine), w the bubble wavelength (m)
uniform vec4 uOceanFoamPattern;
// x folding (1 - Jacobian) where whitecaps start, y the span to full
uniform vec2 uOceanFoamFold;

// the foam density of a plane position from the state raster (0 outside the extent) plus the fragment's own instantaneous breaker front (the
// train's phase and bore strength) and folding
float oceanFoamDensity(vec2 xz, float phase, float bore, float folding) {
    float density = 0.0;
    if (uOceanFoamLook.x > 0.5 && oceanInside(xz, uOceanFieldBounds)) density = texture(uOceanFoam, (xz - uOceanFieldBounds.xy) * uOceanFieldBounds.zw).r;
    float front = pow(max(cos(phase + 0.6), 0.0), 6.0);
    density += 0.9 * bore * front;
    density += 0.6 * smoothstep(uOceanFoamFold.x, uOceanFoamFold.x + uOceanFoamFold.y, 1.0 - folding);
    return min(density, 1.5);
}

// the procedural pattern of a plane position in 0..1: a smooth value-noise sum for the patches and a ridged (lace) octave for the veins between
// them, plus the bubble scale that fades out once the footprint cannot resolve it
float oceanFoamPattern(vec2 xz, float footprint) {
    float smooth_ = 0.6 * oceanValueNoise(xz / uOceanFoamPattern.x + vec2(7.1, 3.3)) + 0.4 * oceanValueNoise(xz / uOceanFoamPattern.y + vec2(1.7, 9.2));
    float lace = 1.0 - 2.0 * abs(oceanValueNoise(xz / uOceanFoamPattern.y + vec2(5.3, 0.7)) - 0.5);
    float veins = 1.0 - 2.0 * abs(oceanValueNoise(xz / uOceanFoamPattern.z + vec2(4.4, 6.8)) - 0.5);
    float pattern = 0.4 * smooth_ + 0.35 * lace + 0.25 * veins;
    float bubbles = oceanValueNoise(xz / uOceanFoamPattern.w + vec2(2.9, 8.1));
    float resolved = 1.0 - smoothstep(0.25 * uOceanFoamPattern.w, uOceanFoamPattern.w, footprint);
    return mix(pattern, 0.7 * pattern + 0.3 * bubbles, resolved);
}

// the foam coverage of a fragment: the density against the pattern through the threshold and softness (a dense patch still shows the lace)
float oceanFoamCoverage(float density, float pattern) {
    float edge = uOceanFoamLook.y + (1.0 - pattern) * 0.9;
    return smoothstep(edge, edge + uOceanFoamLook.z, density);
}

// the radiance of the foam layer (linear): a Lambertian albedo under the sun irradiance (with the visibility) and the sky irradiance
vec3 oceanFoamRadiance(vec3 n, vec3 world, vec3 sun, vec3 skyIrradiance, float visibility) {
    vec3 irradiance = uLandscapeSunIrradiance.rgb * max(dot(n, sun), 0.0) * visibility + skyIrradiance;
    return uOceanFoamLook.w * LANDSCAPE_RECIPROCAL_PI * irradiance;
}
