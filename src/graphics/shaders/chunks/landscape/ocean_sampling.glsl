// AI 597 sampling of the animated ocean's cascades and bathymetry fields (landscape-ocean-v1), shared by the surface vertex and fragment programs.
// Cascade c (compile-time count LANDSCAPE_OCEAN_CASCADES) is a periodic patch: its displacement texture (Dx, h, Dz) and its derivatives texture
// (slope x, slope z, Jacobian, squared slope) wrap at the patch length. Each cascade's amplitude fades with the local depth below the depth where
// its longest wavelength shoals (the AI 597 D2 shore wave carries the swell cascade's energy from there to the shoreline; the beach and the far
// coast never see the open sea's amplitude) read from the extent field inside the landscape bounds and from the surround field beyond them while a
// surround is active; outside both there is no sea. The swell cascade carries a world-space envelope (wave groups) so its patch never repeats exactly.
uniform vec4 uOceanCascadeInfo[LANDSCAPE_OCEAN_CASCADES]; // 1 / patch length, texel meters, depth fade zero (m), depth fade full (m)
uniform sampler2D uOceanDisplacement0;
uniform sampler2D uOceanDerivatives0;
#if LANDSCAPE_OCEAN_CASCADES > 1
uniform sampler2D uOceanDisplacement1;
uniform sampler2D uOceanDerivatives1;
#endif
#if LANDSCAPE_OCEAN_CASCADES > 2
uniform sampler2D uOceanDisplacement2;
uniform sampler2D uOceanDerivatives2;
#endif
#if LANDSCAPE_OCEAN_CASCADES > 3
uniform sampler2D uOceanDisplacement3;
uniform sampler2D uOceanDerivatives3;
#endif
// extent field: x depth below sea level (m, negative over land), y shore distance, z shore wave height, w shore exposure (ocean_shore);
// bounds: min x, min z, 1 / width, 1 / height; the far field carries the depth only
uniform sampler2D uOceanField;
uniform vec4 uOceanFieldBounds;
uniform sampler2D uOceanFarField;
uniform vec4 uOceanFarFieldBounds;
uniform float uOceanFarFieldActive;
// envelope amplitude, 1 / envelope wavelength
uniform vec2 uOceanEnvelope;

bool oceanInside(vec2 xz, vec4 bounds) {
    vec2 uv = (xz - bounds.xy) * bounds.zw;
    return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
}

// 1 where sea data exists (the extent, or the surround while active), else 0
float oceanCoverage(vec2 xz) {
    if (oceanInside(xz, uOceanFieldBounds)) return 1.0;
    return uOceanFarFieldActive > 0.5 && oceanInside(xz, uOceanFarFieldBounds) ? 1.0 : 0.0;
}

// depth below sea level at a plane position (m; negative over land, -1 where no data covers the point)
float oceanDepth(vec2 xz) {
    float depth = -1.0;
    if (oceanInside(xz, uOceanFieldBounds)) depth = texture(uOceanField, (xz - uOceanFieldBounds.xy) * uOceanFieldBounds.zw).x;
    else if (uOceanFarFieldActive > 0.5 && oceanInside(xz, uOceanFarFieldBounds)) depth = texture(uOceanFarField, (xz - uOceanFarFieldBounds.xy) * uOceanFarFieldBounds.zw).x;
    return depth;
}

float oceanLatticeHash(vec2 cell) {
    uvec2 u = uvec2(ivec2(cell) + ivec2(0x40000));
    uint h = (u.x * 0x9E3779B1u) ^ ((u.y + 0x7F4A7C15u) * 0x85EBCA77u);
    h = (h ^ (h >> 15u)) * 0x2C1B3C6Du;
    h = (h ^ (h >> 12u)) * 0x297A2D39u;
    return float(h ^ (h >> 15u)) / 4294967296.0;
}

float oceanValueNoise(vec2 p) {
    vec2 cell = floor(p), f = p - cell, t = f * f * (3.0 - 2.0 * f);
    float a = oceanLatticeHash(cell), b = oceanLatticeHash(cell + vec2(1.0, 0.0)), c = oceanLatticeHash(cell + vec2(0.0, 1.0)), d = oceanLatticeHash(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}

// the swell envelope: 1 +- amplitude of two value-noise octaves at the envelope wavelength
float oceanEnvelope(vec2 xz) {
    vec2 p = xz * uOceanEnvelope.y;
    float noise = 0.65 * oceanValueNoise(p) + 0.35 * oceanValueNoise(p * 2.0 + vec2(17.3, 41.7));
    return 1.0 + uOceanEnvelope.x * (2.0 * noise - 1.0);
}

// per-cascade amplitude factors at a plane position (x cascade 0 with the envelope, y..w the finer cascades), each cascade's own depth fade
vec4 oceanAmplitudeFactors(vec2 xz) {
    float depth = oceanDepth(xz);
    vec4 factors = vec4(smoothstep(uOceanCascadeInfo[0].z, uOceanCascadeInfo[0].w, depth) * oceanEnvelope(xz), 0.0, 0.0, 0.0);
#if LANDSCAPE_OCEAN_CASCADES > 1
    factors.y = smoothstep(uOceanCascadeInfo[1].z, uOceanCascadeInfo[1].w, depth);
#endif
#if LANDSCAPE_OCEAN_CASCADES > 2
    factors.z = smoothstep(uOceanCascadeInfo[2].z, uOceanCascadeInfo[2].w, depth);
#endif
#if LANDSCAPE_OCEAN_CASCADES > 3
    factors.w = smoothstep(uOceanCascadeInfo[3].z, uOceanCascadeInfo[3].w, depth);
#endif
    return factors;
}

vec3 oceanDisplacementSample(int cascade, vec2 xz, float cell) {
    vec4 info = uOceanCascadeInfo[0];
    vec3 value = vec3(0.0);
    float lod = max(log2(cell / info.y), 0.0);
    if (cascade == 0) value = textureLod(uOceanDisplacement0, xz * info.x, lod).xyz;
#if LANDSCAPE_OCEAN_CASCADES > 1
    if (cascade == 1) { info = uOceanCascadeInfo[1]; lod = max(log2(cell / info.y), 0.0); value = textureLod(uOceanDisplacement1, xz * info.x, lod).xyz; }
#endif
#if LANDSCAPE_OCEAN_CASCADES > 2
    if (cascade == 2) { info = uOceanCascadeInfo[2]; lod = max(log2(cell / info.y), 0.0); value = textureLod(uOceanDisplacement2, xz * info.x, lod).xyz; }
#endif
#if LANDSCAPE_OCEAN_CASCADES > 3
    if (cascade == 3) { info = uOceanCascadeInfo[3]; lod = max(log2(cell / info.y), 0.0); value = textureLod(uOceanDisplacement3, xz * info.x, lod).xyz; }
#endif
    return value;
}

// the displacement (Dx, h, Dz) of a plane position sampled for a vertex grid of the given cell (each cascade at the mip its texel density needs)
vec3 oceanDisplacement(vec2 xz, float cell) {
    vec4 factors = oceanAmplitudeFactors(xz);
    vec3 displacement = oceanDisplacementSample(0, xz, cell) * factors.x;
#if LANDSCAPE_OCEAN_CASCADES > 1
    displacement += oceanDisplacementSample(1, xz, cell) * factors.y;
#endif
#if LANDSCAPE_OCEAN_CASCADES > 2
    displacement += oceanDisplacementSample(2, xz, cell) * factors.z;
#endif
#if LANDSCAPE_OCEAN_CASCADES > 3
    displacement += oceanDisplacementSample(3, xz, cell) * factors.w;
#endif
    return displacement;
}

struct OceanSurfaceSample {
    vec2 slope;      // sum of the filtered cascade slopes
    float variance;  // filtered-out slope variance (LEAN), summed over cascades
    float folding;   // minimum cascade Jacobian (below 1 the horizontal displacement folds)
};

void oceanAccumulate(inout OceanSurfaceSample result, vec4 derivatives, float factor) {
    vec2 slope = derivatives.xy * factor;
    result.slope += slope;
    result.variance += max(derivatives.w * factor * factor - dot(slope, slope), 0.0);
    result.folding = min(result.folding, 1.0 - (1.0 - derivatives.z) * factor);
}

// the filtered surface derivatives at a fragment's plane position (automatic mip selection from the screen-space footprint)
OceanSurfaceSample oceanSurfaceAt(vec2 xz) {
    vec4 factors = oceanAmplitudeFactors(xz);
    OceanSurfaceSample result = OceanSurfaceSample(vec2(0.0), 0.0, 1.0);
    oceanAccumulate(result, texture(uOceanDerivatives0, xz * uOceanCascadeInfo[0].x), factors.x);
#if LANDSCAPE_OCEAN_CASCADES > 1
    oceanAccumulate(result, texture(uOceanDerivatives1, xz * uOceanCascadeInfo[1].x), factors.y);
#endif
#if LANDSCAPE_OCEAN_CASCADES > 2
    oceanAccumulate(result, texture(uOceanDerivatives2, xz * uOceanCascadeInfo[2].x), factors.z);
#endif
#if LANDSCAPE_OCEAN_CASCADES > 3
    oceanAccumulate(result, texture(uOceanDerivatives3, xz * uOceanCascadeInfo[3].x), factors.w);
#endif
    return result;
}
