// World-anchored stochastic hex tiling of landscape material lattices, mirroring LandscapeMaterialSampling.js (landscape-hex-tiling-v1).
// Include through the shaderlib directive for landscape/stochastic_tiling after landscape/surface_warp, whose integer hash it reuses.
// Values come from landscapeMaterialSamplingUniforms(seed, soils):
//   LANDSCAPE_MATERIAL_SAMPLING  compile-time mode: 0 single lattice sample, 1 hex linear, 2 hex contrast, 3 hex variance
//   uSoilStochastic[soil]        vec4(lattice cells per texture period, rotation range in radians, V offset spread, contrast exponent);
//                                zero cells keep one unrotated lattice sample at runtime
//   uSoilStochasticSalts[2]      ivec4 near-lattice uint32 salts of soils 0-3 and 4-5, stored as two's-complement integers
//   uStochasticSettings          vec4(contrast falloff, weight cutoff, variance-preserving exponent, samples per lattice = 3)
// landscapeHexLattice(uv, salt, cells, exponent) locates the grid triangle containing uv and its normalized barycentric^exponent
// pre-weights; landscapeHexVertex gives one vertex's sample coordinate (rotated about the vertex center plus a hashed offset,
// wrapped to one period) and rotation.
#ifndef LANDSCAPE_MATERIAL_SAMPLING
#error LANDSCAPE_MATERIAL_SAMPLING must be defined by LandscapeShaderLoader
#endif
#define LANDSCAPE_HEX_SLOPE_LIMIT 128.0

uniform vec4 uSoilStochastic[6];
uniform ivec4 uSoilStochasticSalts[2];
uniform vec4 uStochasticSettings;

struct LandscapeHexLattice {
    vec2 rotation;
    ivec2 cell;
    bool upper;
    float inverseCells;
    vec3 weights;
};

uint landscapeStochasticSalt(int soil, bool macroLattice) {
    ivec4 salts = uSoilStochasticSalts[soil / 4];
    int lane = soil - soil / 4 * 4;
    uint salt = uint(lane == 0 ? salts.x : lane == 1 ? salts.y : lane == 2 ? salts.z : salts.w);
    return macroLattice ? landscapeWarpMix(salt ^ 0x6a09e667u) : salt;
}

LandscapeHexLattice landscapeHexLattice(vec2 uv, uint salt, float cells, float exponent) {
    float angle = float(landscapeWarpMix(salt ^ 0x3c6ef372u) & 0xffffu) / 65536.0 * 1.0471975512;
    LandscapeHexLattice lattice;
    lattice.rotation = vec2(cos(angle), sin(angle));
    vec2 p = vec2(lattice.rotation.x * uv.x - lattice.rotation.y * uv.y, lattice.rotation.y * uv.x + lattice.rotation.x * uv.y) * cells;
    vec2 q = vec2(p.x - p.y * 0.57735026919, p.y * 1.15470053838);
    vec2 base = floor(q), f = q - base;
    lattice.cell = ivec2(base);
    lattice.upper = f.x + f.y > 1.0;
    lattice.inverseCells = 1.0 / cells;
    vec3 barycentric = lattice.upper ? vec3(f.x + f.y - 1.0, 1.0 - f.x, 1.0 - f.y) : vec3(1.0 - f.x - f.y, f.x, f.y);
    vec3 sharpened = pow(max(barycentric, vec3(0.0)), vec3(exponent));
    lattice.weights = sharpened / (sharpened.x + sharpened.y + sharpened.z);
    return lattice;
}

ivec2 landscapeHexVertexId(LandscapeHexLattice lattice, int k) {
    if (lattice.upper) return lattice.cell + (k == 0 ? ivec2(1, 1) : k == 1 ? ivec2(0, 1) : ivec2(1, 0));
    return lattice.cell + (k == 0 ? ivec2(0, 0) : k == 1 ? ivec2(1, 0) : ivec2(0, 1));
}

void landscapeHexVertex(LandscapeHexLattice lattice, int k, uint salt, vec2 uv, float rotationRange, float spreadV, out vec2 sampleUv, out vec2 rotation) {
    ivec2 vertex = landscapeHexVertexId(lattice, k);
    uint h = landscapeWarpMix((uint(vertex.x) * 0x27d4eb2du) ^ (uint(vertex.y) * 0x165667b1u) ^ salt);
    uint g = landscapeWarpMix(h ^ 0x9e3779b9u);
    float angle = (float(g & 0xffffu) / 65535.0 * 2.0 - 1.0) * rotationRange;
    rotation = vec2(cos(angle), sin(angle));
    vec2 point = vec2(float(vertex.x) + 0.5 * float(vertex.y), 0.86602540378 * float(vertex.y));
    vec2 center = vec2(lattice.rotation.x * point.x + lattice.rotation.y * point.y, lattice.rotation.x * point.y - lattice.rotation.y * point.x) * lattice.inverseCells;
    vec2 local = uv - center;
    sampleUv = vec2(rotation.x * local.x - rotation.y * local.y, rotation.y * local.x + rotation.x * local.y)
        + fract(center + vec2(float(h & 0xffffu), float(h >> 16u) * spreadV) / 65536.0);
}

// largest final weight each sample could reach after the contrast scaling; smaller ones are skipped and the next cutoff fades them in
vec3 landscapeHexWeightBounds(vec3 weights) {
#if LANDSCAPE_MATERIAL_SAMPLING == 2
    float keep = 1.0 - uStochasticSettings.x;
    return weights / (weights + keep * (vec3(weights.y + weights.z, weights.x + weights.z, weights.x + weights.y)));
#else
    return weights;
#endif
}

// tangent-space normal of a rotated sample as a limited slope in the unrotated texture frame
vec2 landscapeHexSlope(vec3 normal, vec2 rotation) {
    float depth = max(abs(normal.z), max(abs(normal.x), abs(normal.y)) / LANDSCAPE_HEX_SLOPE_LIMIT);
    vec2 slope = normal.xy / depth;
    return vec2(rotation.x * slope.x + rotation.y * slope.y, rotation.x * slope.y - rotation.y * slope.x);
}
