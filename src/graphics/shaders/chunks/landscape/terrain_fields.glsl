// AI577 D5 landscape-terrain-fields v1 sampling for the terrain program (contract and JavaScript mirror: src/app/landscape/LandscapeTerrainFields.js,
// sampleLandscapeTerrainFieldSlots and the decode/visibility helpers; runtime: LandscapeTerrainFieldPages). terrain.frag.glsl includes it before the
// lighting chunks; LANDSCAPE_TERRAIN_FIELDS tells lighting_visibility.glsl to bind its hooks to the fields (landscape-terrain-visibility-v1).
// The including program must already declare LANDSCAPE_COVERAGE_SLOTS and the mask slot uniforms uMaskBounds, uMaskMeta, uMaskSlotRanges,
// uMaskDimensions and uCoverageSettings (halo in w). This chunk adds exactly one sampler (uTerrainFields, the program's sixteenth) and one uvec4.
// Field page layers of native mask slot s are array layers s * 4 + k; uMaskMeta[s].w = 1 + 0.25 * arrival progress on native slots.
#ifndef LANDSCAPE_COVERAGE_SLOTS
#error terrain_fields.glsl requires LANDSCAPE_COVERAGE_SLOTS and the terrain mask slot uniforms
#endif
#define LANDSCAPE_TERRAIN_FIELDS 1
uniform sampler2DArray uTerrainFields;
// x, y: stale 8 x 8 cells over the landscape (bit row * 8 + column, row 0 north); z: bit 0 = fields active; w: layers per page (4)
uniform uvec4 uTerrainFieldsState;

const float LANDSCAPE_TERRAIN_FIELD_SHORE_METERS = 256.0;
const float LANDSCAPE_TERRAIN_FIELD_SLOPE_DEGREES = 90.0;
const float LANDSCAPE_TERRAIN_FIELD_SOLAR_RADIUS = 0.004625122517784973;
const float LANDSCAPE_TERRAIN_FIELD_COARSER_START = 1.0;
const float LANDSCAPE_TERRAIN_FIELD_COARSER_END = 2.0;
const float LANDSCAPE_TERRAIN_FIELD_PROGRESS_SCALE = 0.25;
const float LANDSCAPE_TERRAIN_FIELD_STALE_GRID = 8.0;
const float LANDSCAPE_TERRAIN_FIELD_PI = 3.141592653589793;

struct LandscapeTerrainFields {
    float availability;  // weight of baked fields; 1 - availability belongs to the analytic fallback (geometric slope, no flow or horizon)
    float wetness;       // normalized topographic wetness index, 1 below sea level
    float flow;          // normalized log specific catchment area, faded over flats
    float deposition;    // sediment deposition proxy
    float rockExposure;  // restrained rock exposure
    float skyView;       // cosine-weighted visible sky of the facet above the terrain horizon and the horizontal (open slope: (1 + cos S) / 2)
    float shoreDistance; // signed horizontal meters to the sea-level shoreline, land positive, clamped to +/-256
    float convexity;     // multi-scale convexity in [-1, 1], ridges positive
    float slopeDegrees;
    vec4 horizonSineA;   // sin(horizon elevation) toward azimuths 0, 45, 90, 135 degrees (counterclockwise from +X east toward +Z north)
    vec4 horizonSineB;   // azimuths 180, 225, 270, 315 degrees
};

LandscapeTerrainFields landscapeTerrainFieldsNone() {
    return LandscapeTerrainFields(0.0, 0.0, 0.0, 0.0, 0.0, 1.0, LANDSCAPE_TERRAIN_FIELD_SHORE_METERS, 0.0, 0.0, vec4(0.0), vec4(0.0));
}

// arrival progress of the field page bound to a native slot (fine and empty slots carry none)
float landscapeTerrainFieldProgress(int slot) {
    float meta = uMaskMeta[slot].w;
    return meta > 0.5 && meta <= 1.5 ? clamp((meta - 1.0) / LANDSCAPE_TERRAIN_FIELD_PROGRESS_SCALE, 0.0, 1.0) : 0.0;
}

// slot 0 always holds the landscape root, so its bounds address the 8 x 8 stale cells
bool landscapeTerrainFieldStale(vec2 world) {
    vec4 root = uMaskBounds[0];
    int column = int(clamp(floor((world.x - root.x) / (root.y - root.x) * LANDSCAPE_TERRAIN_FIELD_STALE_GRID), 0.0, LANDSCAPE_TERRAIN_FIELD_STALE_GRID - 1.0));
    int row = int(clamp(floor((root.w - world.y) / (root.w - root.z) * LANDSCAPE_TERRAIN_FIELD_STALE_GRID), 0.0, LANDSCAPE_TERRAIN_FIELD_STALE_GRID - 1.0));
    int bit = row * 8 + column;
    uint word = bit < 32 ? uTerrainFieldsState.x : uTerrainFieldsState.y;
    return ((word >> uint(bit - (bit / 32) * 32)) & 1u) == 1u;
}

// finest active native mask slot containing the position (the same search as maskAt for native slots)
int landscapeTerrainFieldSlot(vec2 world) {
    int slot = -1;
    float level = -1.0;
    int end = int(uMaskSlotRanges.x);
    for (int i = 0; i < LANDSCAPE_COVERAGE_SLOTS; i++) {
        if (i >= end) break;
        vec4 meta = uMaskMeta[i], bounds = uMaskBounds[i];
        if (meta.w > 0.5 && meta.w <= 1.5 && meta.x > level && world.x >= bounds.x && world.x <= bounds.y && world.y >= bounds.z && world.y <= bounds.w) {
            slot = i;
            level = meta.x;
        }
    }
    return slot;
}

// hardware-bilinear encoded layers of one slot's page at texel centers (sample + halo)
void landscapeTerrainFieldLayers(int slot, vec2 world, out vec4 l0, out vec4 l1, out vec4 l2, out vec4 l3) {
    vec4 bounds = uMaskBounds[slot];
    vec2 intervals = uMaskDimensions - 1.0;
    vec2 grid = clamp(vec2((world.x - bounds.x) / (bounds.y - bounds.x), (bounds.w - world.y) / (bounds.w - bounds.z)) * intervals, vec2(0.0), intervals);
    vec2 uv = (grid + uCoverageSettings.w + 0.5) / vec2(textureSize(uTerrainFields, 0).xy);
    float layer = float(slot * int(uTerrainFieldsState.w));
    l0 = textureLod(uTerrainFields, vec3(uv, layer), 0.0);
    l1 = textureLod(uTerrainFields, vec3(uv, layer + 1.0), 0.0);
    l2 = textureLod(uTerrainFields, vec3(uv, layer + 2.0), 0.0);
    l3 = textureLod(uTerrainFields, vec3(uv, layer + 3.0), 0.0);
}

// decode after filtering, exactly as decodeLandscapeTerrainFields
LandscapeTerrainFields landscapeTerrainFieldsDecode(vec4 l0, vec4 l1, vec4 l2, vec4 l3, float availability) {
    float shore = l1.g * 2.0 - 1.0;
    return LandscapeTerrainFields(availability, l0.r, l0.g, l0.b, l0.a, l1.r, sign(shore) * shore * shore * LANDSCAPE_TERRAIN_FIELD_SHORE_METERS,
        l1.b * 2.0 - 1.0, l1.a * LANDSCAPE_TERRAIN_FIELD_SLOPE_DEGREES, l2 * l2, l3 * l3);
}

// Fields at a world X/Z position with its screen derivatives (take them in uniform control flow): from the finest active native slot,
// resident ancestors contribute arrival progress times (1 - coarser), where coarser rises over one to two page sample spacings of footprint.
// Stale cells and inactive fields return availability 0. One exit: Direct3D's compiler flags the early returns of a looping function as a
// potentially uninitialized result (X4000) once the terrain program calls it.
LandscapeTerrainFields landscapeTerrainFieldsAt(vec2 world, vec2 dx, vec2 dy) {
    LandscapeTerrainFields result = landscapeTerrainFieldsNone();
    int slot = (uTerrainFieldsState.z & 1u) == 0u ? -1 : landscapeTerrainFieldSlot(world);
    if (slot >= 0 && !landscapeTerrainFieldStale(world)) {
        vec4 a0 = vec4(0.0), a1 = vec4(0.0), a2 = vec4(0.0), a3 = vec4(0.0);
        float remaining = 1.0;
        for (int depth = 0; depth < LANDSCAPE_COVERAGE_SLOTS; depth++) {
            vec4 bounds = uMaskBounds[slot];
            int parent = int(uMaskMeta[slot].z);
            float spacing = max(bounds.y - bounds.x, bounds.w - bounds.z) / (uMaskDimensions.x - 1.0);
            float extent = max(abs(dx.x) + abs(dy.x), abs(dx.y) + abs(dy.y)) / spacing;
            float coarser = parent == slot ? 0.0 : smoothstep(LANDSCAPE_TERRAIN_FIELD_COARSER_START, LANDSCAPE_TERRAIN_FIELD_COARSER_END, extent);
            float weight = landscapeTerrainFieldProgress(slot) * (1.0 - coarser);
            if (weight > 0.0) {
                vec4 l0, l1, l2, l3;
                landscapeTerrainFieldLayers(slot, world, l0, l1, l2, l3);
                float share = weight * remaining;
                a0 += l0 * share; a1 += l1 * share; a2 += l2 * share; a3 += l3 * share;
            }
            remaining *= 1.0 - weight;
            if (remaining <= 0.0 || parent == slot) break;
            slot = parent;
        }
        float availability = 1.0 - remaining;
        if (availability > 0.0) result = landscapeTerrainFieldsDecode(a0 / availability, a1 / availability, a2 / availability, a3 / availability, availability);
    }
    return result;
}

// isotropic variant for callers without screen derivatives (for example the lighting visibility hooks): footprint in world meters per pixel
LandscapeTerrainFields landscapeTerrainFieldsAtFootprint(vec2 world, float footprintMeters) {
    return landscapeTerrainFieldsAt(world, vec2(footprintMeters, 0.0), vec2(0.0));
}

float landscapeTerrainHorizonSineAt(LandscapeTerrainFields fields, int index) {
    vec4 values = index < 4 ? fields.horizonSineA : fields.horizonSineB;
    int component = index - (index / 4) * 4;
    return component == 0 ? values.x : component == 1 ? values.y : component == 2 ? values.z : values.w;
}

// linear interpolation of the stored horizon sines at an azimuth (radians, counterclockwise from +X toward +Z)
float landscapeTerrainHorizonSine(LandscapeTerrainFields fields, float azimuth) {
    float turns = mod(azimuth / (LANDSCAPE_TERRAIN_FIELD_PI * 0.25), 8.0);
    int index = min(int(floor(turns)), 7);
    float fraction = turns - float(index);
    return mix(landscapeTerrainHorizonSineAt(fields, index), landscapeTerrainHorizonSineAt(fields, index == 7 ? 0 : index + 1), fraction);
}

// visible fraction of the solar disc (radius 0.265 degrees) above a horizon line: circular segment area
float landscapeSolarDiscVisibility(float sunElevation, float horizonElevation) {
    float d = clamp((sunElevation - horizonElevation) / LANDSCAPE_TERRAIN_FIELD_SOLAR_RADIUS, -1.0, 1.0);
    return 0.5 + (d * sqrt(1.0 - d * d) + asin(d)) / LANDSCAPE_TERRAIN_FIELD_PI;
}

// terrain-horizon sun visibility toward a world direction (+Y up, +Z north); missing fields count as unoccluded
float landscapeTerrainFieldsSunVisibility(LandscapeTerrainFields fields, vec3 sunDirection) {
    if (fields.availability <= 0.0) return 1.0;
    vec3 direction = normalize(sunDirection);
    float azimuth = length(direction.xz) > 1.0e-6 ? atan(direction.z, direction.x) : 0.0;
    float horizon = asin(clamp(landscapeTerrainHorizonSine(fields, azimuth), 0.0, 1.0));
    return mix(1.0, landscapeSolarDiscVisibility(asin(clamp(direction.y, -1.0, 1.0)), horizon), fields.availability);
}

// terrain sky occlusion relative to the unobstructed facet (1 on open ground and on open slopes); multiply a normal-oriented sky irradiance
float landscapeTerrainFieldsSkyVisibility(LandscapeTerrainFields fields, vec3 normal) {
    return mix(1.0, clamp(fields.skyView / max(0.5 + 0.5 * normal.y, 1.0e-3), 0.0, 1.0), fields.availability);
}
