// Slope-adaptive planar projection, micro-detail fades and normal mip filtering of landscape materials, mirroring LandscapeSurfaceLayers.js
// (landscape-slope-projection-v1, landscape-normal-mip-vmf-v1) and LandscapeMicroDetail.js (landscape-micro-detail-v1).
// Include through the shaderlib directive for landscape/surface_layers after landscape/stochastic_tiling, whose hash and weight cutoff it reuses.
// Values come from landscapeSurfaceLayerUniforms(options):
//   uSurfaceLayers  vec4(projection sharpness or 0 for the top projection only, normal filtering strength, micro fade start and end in
//                   micro periods per pixel)
//   uMicroSampling  vec4(lattice cells per micro period, rotation range in radians, V offset spread, contrast exponent)
// landscapeProjectionWeights(normal) gives normalized (top, side X, side Z) weights; landscapeProjectionAxes gives a projection's world
// U and V directions; landscapeProjectionSalt and landscapeMicroSalt derive lattice salts from a soil's top-projection salt.
#define LANDSCAPE_NORMAL_LENGTH_DEAD_ZONE 0.01

uniform vec4 uSurfaceLayers;
uniform vec4 uMicroSampling;

// side projections start above the stochastic weight cutoff and fade in over the next one, so gentle ground keeps the top projection exactly
vec3 landscapeProjectionWeights(vec3 normal) {
    if (uSurfaceLayers.x <= 0.0) return vec3(1.0, 0.0, 0.0);
    vec3 raw = pow(abs(normal), vec3(uSurfaceLayers.x));
    vec3 weights = raw / (raw.x + raw.y + raw.z);
    float cutoff = uStochasticSettings.y;
    float sideX = weights.x * smoothstep(cutoff, 2.0 * cutoff, weights.x), sideZ = weights.z * smoothstep(cutoff, 2.0 * cutoff, weights.z);
    return vec3(weights.y, sideX, sideZ) / (weights.y + sideX + sideZ);
}

// world directions of increasing U and V; side projections use the horizontal sign that is not mirrored when seen from outside
void landscapeProjectionAxes(int projection, vec3 normal, out vec3 axisU, out vec3 axisV) {
    axisU = projection == 0 ? vec3(1.0, 0.0, 0.0) : projection == 1 ? vec3(0.0, 0.0, normal.x >= 0.0 ? -1.0 : 1.0) : vec3(normal.z >= 0.0 ? 1.0 : -1.0, 0.0, 0.0);
    axisV = projection == 0 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
}

uint landscapeProjectionSalt(uint salt, int projection) {
    return projection == 0 ? salt : landscapeWarpMix(salt ^ (projection == 1 ? 0x9b05688cu : 0x1f83d9abu));
}

uint landscapeMicroSalt(uint salt) {
    return landscapeWarpMix(salt ^ 0x510e527fu);
}

// micro detail fades by the larger of the projected footprint and the resident micro texel, relative to its period
float landscapeMicroFade(float microPeriod, float footprint, float resolution) {
    return 1.0 - smoothstep(microPeriod * uSurfaceLayers.z, microPeriod * uSurfaceLayers.w, max(footprint, microPeriod / resolution));
}

// GGX alpha squared widened by the von Mises-Fisher spread of the mean mip-filtered normal length (Toksvig-style)
float landscapeFilteredRoughness(float roughness, float meanLength, float normalStrength) {
    if (uSurfaceLayers.y <= 0.0) return roughness;
    float l = min(1.0, meanLength + LANDSCAPE_NORMAL_LENGTH_DEAD_ZONE);
    float spread = 2.0 * (1.0 - l * l) / max(3.0 * l - l * l * l, 0.0001) * normalStrength * normalStrength * uSurfaceLayers.y;
    float alpha = roughness * roughness;
    return sqrt(sqrt(alpha * alpha + spread));
}
