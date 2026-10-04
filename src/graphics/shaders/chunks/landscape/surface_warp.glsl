// Shared world-anchored landscape surface warp, mirroring createLandscapeSurfaceWarp (landscape-gradient-noise-v1).
// Include through the shaderlib directive for landscape/surface_warp. Values come from landscapeSurfaceWarpUniforms(recipe, seed):
//   LANDSCAPE_SURFACE_WARP_OCTAVES   octave count define (default 4)
//   LANDSCAPE_SURFACE_WARP_QUINTIC   defined when the recipe warp shaping is quintic-odd
//   uLandscapeWarpWaves[k]   vec4(1 / wavelength, amplitude, cos, sin) of octave k, shared by both components
//   uLandscapeWarpOffsets[k] vec4(x offset u, x offset v, z offset u, z offset v) lattice offsets of octave k
//   uLandscapeWarpSalts[k]   ivec2(x salt, z salt), uint32 hash salts stored as two's-complement integers
// landscapeSurfaceWarp(worldXZ) returns the meters added to landscape X/Z before coverage lookups.
#ifndef LANDSCAPE_SURFACE_WARP_OCTAVES
#define LANDSCAPE_SURFACE_WARP_OCTAVES 4
#endif

uniform vec4 uLandscapeWarpWaves[LANDSCAPE_SURFACE_WARP_OCTAVES];
uniform vec4 uLandscapeWarpOffsets[LANDSCAPE_SURFACE_WARP_OCTAVES];
uniform ivec2 uLandscapeWarpSalts[LANDSCAPE_SURFACE_WARP_OCTAVES];

const vec2 LANDSCAPE_WARP_GRADIENTS[16] = vec2[16](
    vec2(1.0, 0.0), vec2(0.9238795325112867, 0.3826834323650898), vec2(0.7071067811865476, 0.7071067811865476), vec2(0.3826834323650898, 0.9238795325112867),
    vec2(0.0, 1.0), vec2(-0.3826834323650898, 0.9238795325112867), vec2(-0.7071067811865476, 0.7071067811865476), vec2(-0.9238795325112867, 0.3826834323650898),
    vec2(-1.0, 0.0), vec2(-0.9238795325112867, -0.3826834323650898), vec2(-0.7071067811865476, -0.7071067811865476), vec2(-0.3826834323650898, -0.9238795325112867),
    vec2(0.0, -1.0), vec2(0.3826834323650898, -0.9238795325112867), vec2(0.7071067811865476, -0.7071067811865476), vec2(0.9238795325112867, -0.3826834323650898));

uint landscapeWarpMix(uint value) {
    uint h = (value ^ (value >> 16u)) * 0x85ebca6bu;
    h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
    return h ^ (h >> 16u);
}

float landscapeWarpCorner(int i, int j, uint salt, float dx, float dz) {
    uint direction = landscapeWarpMix((uint(i) * 0x27d4eb2du) ^ (uint(j) * 0x165667b1u) ^ salt) >> 28u;
    vec2 gradient = LANDSCAPE_WARP_GRADIENTS[int(direction)];
    return gradient.x * dx + gradient.y * dz;
}

float landscapeWarpLattice(vec2 lattice, uint salt) {
    vec2 cell = floor(lattice);
    ivec2 index = ivec2(cell);
    vec2 f = lattice - cell;
    vec2 s = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = landscapeWarpCorner(index.x, index.y, salt, f.x, f.y);
    float b = landscapeWarpCorner(index.x + 1, index.y, salt, f.x - 1.0, f.y);
    float c = landscapeWarpCorner(index.x, index.y + 1, salt, f.x, f.y - 1.0);
    float d = landscapeWarpCorner(index.x + 1, index.y + 1, salt, f.x - 1.0, f.y - 1.0);
    float top = a + (b - a) * s.x;
    return (top + (c + (d - c) * s.x - top) * s.y) * 1.4142135;
}

float landscapeWarpShape(float n) {
#ifdef LANDSCAPE_SURFACE_WARP_QUINTIC
    return n * (15.0 - 10.0 * n * n + 3.0 * n * n * n * n) * 0.125;
#else
    return n;
#endif
}

vec2 landscapeSurfaceWarp(vec2 worldXZ) {
    vec2 warp = vec2(0.0);
    for (int k = 0; k < LANDSCAPE_SURFACE_WARP_OCTAVES; k++) {
        vec4 wave = uLandscapeWarpWaves[k];
        vec4 offset = uLandscapeWarpOffsets[k];
        ivec2 salt = uLandscapeWarpSalts[k];
        vec2 lattice = vec2(wave.z * worldXZ.x - wave.w * worldXZ.y, wave.w * worldXZ.x + wave.z * worldXZ.y) * wave.x;
        float warpX = landscapeWarpShape(landscapeWarpLattice(lattice + offset.xy, uint(salt.x)));
        float warpZ = landscapeWarpShape(landscapeWarpLattice(lattice + offset.zw, uint(salt.y)));
        warp += wave.y * vec2(warpX, warpZ);
    }
    return warp;
}
