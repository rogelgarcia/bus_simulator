// AI 598 D1 landscape-surface-model v1 (contract and JavaScript mirror: src/app/landscape/surface/, sampleLandscapeSurface; runtime: LandscapeSurfaceModel.js,
// createLandscapeSurfaceSampler). Include through the shaderlib directive for landscape/surface_model after landscape/terrain_fields (the field array,
// the native slots and uTerrainFieldsState) and landscape/terrain_appearance (the appearance terms); it includes landscape/geology for the decode. The
// geology rides in the terrain-field array as three layers per native slot after the four field layers (uTerrainFieldsState.w = 7): two geology field
// layers decoded after the array's linear filtering through the same slot walk as landscapeTerrainFieldsAt, and one packed categorical layer whose RGBA
// bytes are the depositType, lithology, drainage and coastalZone labels, read with texelFetch at the four aligned samples around the position and
// turned into one-hot fractions (bilinear on the one-hot vectors), so every class weight is a continuous function of position; the lithology label
// unwraps to the stratum hardness. Bit 2 of uTerrainFieldsState.z says the geology is bound, bit 3 that the root-grid override layer (pins nearest,
// scales bilinear) is resident before the appearance layer, bit 4 that the model is on (off: the field and geology inputs stay neutral and every
// output is the soil default, the A/B of the model). The model's rule tables, catalog sizes, input layout and neutrals are compile-time constants of
// landscapeSurfaceModelDefines(recipe); the chunk declares no uniform and no sampler. Single-exit functions; loops over the tables.
#include <shaderlib:landscape/geology>
#ifndef LANDSCAPE_TERRAIN_FIELDS
#error surface_model.glsl requires landscape/terrain_fields
#endif
#ifndef LANDSCAPE_SURFACE_RULE_COUNT
#error surface_model.glsl requires the landscapeSurfaceModelDefines tables
#endif
#define LANDSCAPE_SURFACE_MODEL 1

const uint LANDSCAPE_SURFACE_FLAG_GEOLOGY = 4u;
const uint LANDSCAPE_SURFACE_FLAG_OVERRIDES = 8u;
const uint LANDSCAPE_SURFACE_FLAG_MODEL = 16u;
const int LANDSCAPE_SURFACE_GEOLOGY_LAYER = 4;
const int LANDSCAPE_SURFACE_CATEGORICAL_LAYER = 6;
const float LANDSCAPE_SURFACE_OVERRIDE_SCALE_UNIT = 127.0;
const float LANDSCAPE_SURFACE_OVERRIDE_OFFSET_ZERO = 128.0;
const float LANDSCAPE_SURFACE_REACH_FRACTION_LIMIT = 10.0;

const ivec2 landscapeSurfaceSoilRules[LANDSCAPE_SURFACE_SOIL_COUNT] = ivec2[LANDSCAPE_SURFACE_SOIL_COUNT](LANDSCAPE_SURFACE_SOIL_RULE_LIST);
const ivec2 landscapeSurfaceSoilDefaults[LANDSCAPE_SURFACE_SOIL_COUNT] = ivec2[LANDSCAPE_SURFACE_SOIL_COUNT](LANDSCAPE_SURFACE_SOIL_DEFAULT_LIST);
const vec2 landscapeSurfaceSoilLevels[LANDSCAPE_SURFACE_SOIL_COUNT] = vec2[LANDSCAPE_SURFACE_SOIL_COUNT](LANDSCAPE_SURFACE_SOIL_LEVEL_LIST);
const ivec4 landscapeSurfaceRules[LANDSCAPE_SURFACE_RULE_COUNT] = ivec4[LANDSCAPE_SURFACE_RULE_COUNT](LANDSCAPE_SURFACE_RULE_LIST);
const float landscapeSurfaceBases[LANDSCAPE_SURFACE_RULE_COUNT] = float[LANDSCAPE_SURFACE_RULE_COUNT](LANDSCAPE_SURFACE_BASE_LIST);
const vec4 landscapeSurfaceTerms[LANDSCAPE_SURFACE_TERM_COUNT] = vec4[LANDSCAPE_SURFACE_TERM_COUNT](LANDSCAPE_SURFACE_TERM_LIST);
const float landscapeSurfaceNeutrals[LANDSCAPE_SURFACE_INPUT_COUNT] = float[LANDSCAPE_SURFACE_INPUT_COUNT](LANDSCAPE_SURFACE_NEUTRAL_LIST);

// the input vector and the class accumulators of the fragment being evaluated (globals: no array copies through parameters)
float landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_COUNT];
float landscapeSurfaceSubstrate[LANDSCAPE_SURFACE_SUBSTRATE_COUNT];
float landscapeSurfaceCover[LANDSCAPE_SURFACE_COVER_COUNT];
float landscapeSurfaceSoilSubstrate[LANDSCAPE_SURFACE_SUBSTRATE_COUNT];
float landscapeSurfaceSoilCover[LANDSCAPE_SURFACE_COVER_COUNT];

struct LandscapeSurfaceModel {
    vec4 substrateA;     // substrate class weights 0-3 (catalog order; the eleven sum to 1)
    vec4 substrateB;     // 4-7
    vec4 substrateC;     // 8-10, w unused
    vec4 coverA;         // cover class weights 0-3 (the nine sum to 1)
    vec4 coverB;         // 4-7
    vec4 coverC;         // 8, yzw unused
    float coverFraction; // share of the pixel the cover occupies before interleaving
    float wetness;
    float disturbance;
    float availability;  // share of the bound sources (fields, geology) at the fragment
};

// smoothstep whose edges may descend: 0 at edge0, 1 at edge1
float landscapeSurfaceRamp(float edge0, float edge1, float value) {
    float t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

// stratum hardness of a lithology label: index = L - 1 for L <= 128, L - 256 otherwise; pattern slot ((index mod 4) + 4) mod 4 (via index + 256 so the
// modulo never sees a negative operand); label 0 is unstratified
float landscapeStratumHardness(int label) {
    float hardness = 0.5;
    if (label > 0) {
        int shifted = (label <= 128 ? label - 1 : label - 256) + 256, slot = shifted - (shifted / 4) * 4;
        hardness = slot == 0 ? LANDSCAPE_SURFACE_HARDNESS.x : slot == 1 ? LANDSCAPE_SURFACE_HARDNESS.y : slot == 2 ? LANDSCAPE_SURFACE_HARDNESS.z : LANDSCAPE_SURFACE_HARDNESS.w;
    }
    return hardness;
}

// hardware-bilinear encoded geology field layers of one slot's page at texel centers (the field taps, layers 4 and 5)
void landscapeSurfaceGeologyLayers(int slot, vec2 world, out vec4 g0, out vec4 g1) {
    vec4 bounds = uMaskBounds[slot];
    vec2 intervals = uMaskDimensions - 1.0;
    vec2 grid = clamp(vec2((world.x - bounds.x) / (bounds.y - bounds.x), (bounds.w - world.y) / (bounds.w - bounds.z)) * intervals, vec2(0.0), intervals);
    vec2 uv = (grid + uCoverageSettings.w + 0.5) / vec2(textureSize(uTerrainFields, 0).xy);
    float layer = float(slot * int(uTerrainFieldsState.w) + LANDSCAPE_SURFACE_GEOLOGY_LAYER);
    g0 = textureLod(uTerrainFields, vec3(uv, layer), 0.0);
    g1 = textureLod(uTerrainFields, vec3(uv, layer + 1.0), 0.0);
}

// one-hot fractions and hardness of the four aligned categorical samples around the position in one slot's page, added to the inputs with a share
void landscapeSurfaceCategorical(int slot, vec2 world, float share) {
    vec4 bounds = uMaskBounds[slot];
    vec2 intervals = uMaskDimensions - 1.0;
    vec2 grid = clamp(vec2((world.x - bounds.x) / (bounds.y - bounds.x), (bounds.w - world.y) / (bounds.w - bounds.z)) * intervals, vec2(0.0), intervals);
    ivec2 cell = min(ivec2(floor(grid)), ivec2(intervals) - 1);
    vec2 fraction = grid - vec2(cell);
    int layer = slot * int(uTerrainFieldsState.w) + LANDSCAPE_SURFACE_CATEGORICAL_LAYER, halo = int(uCoverageSettings.w);
    for (int corner = 0; corner < 4; corner++) {
        ivec2 offset = ivec2(corner - (corner / 2) * 2, corner / 2);
        float weight = share * (offset.x == 0 ? 1.0 - fraction.x : fraction.x) * (offset.y == 0 ? 1.0 - fraction.y : fraction.y);
        ivec4 labels = ivec4(floor(texelFetch(uTerrainFields, ivec3(cell + offset + halo, layer), 0) * 255.0 + 0.5));
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_DEPOSIT + clamp(labels.x, 0, LANDSCAPE_SURFACE_DEPOSIT_COUNT - 1)] += weight;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_DRAINAGE + clamp(labels.z, 0, LANDSCAPE_SURFACE_DRAINAGE_COUNT - 1)] += weight;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_ZONE + clamp(labels.w, 0, LANDSCAPE_SURFACE_ZONE_COUNT - 1)] += weight;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_HARDNESS] += weight * landscapeStratumHardness(labels.y);
    }
}

// the geology inputs of the fragment through the slot walk of landscapeTerrainFieldsAt (finest active native slot, resident ancestors by arrival
// progress and footprint): decoded field channels, one-hot fractions, hardness; returns the geology availability (0 leaves every input neutral)
float landscapeSurfaceGeology(vec2 world, vec2 dx, vec2 dy) {
    float availability = 0.0;
    for (int i = 0; i < LANDSCAPE_SURFACE_DEPOSIT_COUNT; i++) landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_DEPOSIT + i] = 0.0;
    for (int i = 0; i < LANDSCAPE_SURFACE_DRAINAGE_COUNT; i++) landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_DRAINAGE + i] = 0.0;
    for (int i = 0; i < LANDSCAPE_SURFACE_ZONE_COUNT; i++) landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_ZONE + i] = 0.0;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_HARDNESS] = 0.0;
    int slot = landscapeTerrainFieldSlot(world);
    vec4 g0 = vec4(0.0), g1 = vec4(0.0);
    if (slot >= 0 && !landscapeTerrainFieldStale(world)) {
        float remaining = 1.0;
        for (int depth = 0; depth < LANDSCAPE_COVERAGE_SLOTS; depth++) {
            vec4 bounds = uMaskBounds[slot];
            int parent = int(uMaskMeta[slot].z);
            float spacing = max(bounds.y - bounds.x, bounds.w - bounds.z) / (uMaskDimensions.x - 1.0);
            float extent = max(abs(dx.x) + abs(dy.x), abs(dx.y) + abs(dy.y)) / spacing;
            float coarser = parent == slot ? 0.0 : smoothstep(LANDSCAPE_TERRAIN_FIELD_COARSER_START, LANDSCAPE_TERRAIN_FIELD_COARSER_END, extent);
            float weight = landscapeTerrainFieldProgress(slot) * (1.0 - coarser);
            if (weight > 0.0) {
                float share = weight * remaining;
                vec4 l0, l1;
                landscapeSurfaceGeologyLayers(slot, world, l0, l1);
                g0 += l0 * share; g1 += l1 * share;
                landscapeSurfaceCategorical(slot, world, share);
            }
            remaining *= 1.0 - weight;
            if (remaining <= 0.0 || parent == slot) break;
            slot = parent;
        }
        availability = 1.0 - remaining;
    }
    if (availability > 0.0) {
        LandscapeGeology geology = landscapeGeologyDecode(g0 / availability, g1 / availability);
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_GEOLOGY] = geology.bedrockOffset;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_GEOLOGY + 1] = geology.regolith;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_GEOLOGY + 2] = geology.depositThickness;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_GEOLOGY + 3] = geology.wear;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_GEOLOGY + 4] = geology.deposition;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_GEOLOGY + 5] = geology.flow;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_GEOLOGY + 6] = geology.waveExposure;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_GEOLOGY + 7] = geology.faceMask;
        for (int i = 0; i < LANDSCAPE_SURFACE_DEPOSIT_COUNT; i++) landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_DEPOSIT + i] /= availability;
        for (int i = 0; i < LANDSCAPE_SURFACE_DRAINAGE_COUNT; i++) landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_DRAINAGE + i] /= availability;
        for (int i = 0; i < LANDSCAPE_SURFACE_ZONE_COUNT; i++) landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_ZONE + i] /= availability;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_HARDNESS] /= availability;
    } else {
        for (int i = 0; i < LANDSCAPE_SURFACE_DEPOSIT_COUNT; i++) landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_DEPOSIT + i] = landscapeSurfaceNeutrals[LANDSCAPE_SURFACE_INPUT_DEPOSIT + i];
        for (int i = 0; i < LANDSCAPE_SURFACE_DRAINAGE_COUNT; i++) landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_DRAINAGE + i] = landscapeSurfaceNeutrals[LANDSCAPE_SURFACE_INPUT_DRAINAGE + i];
        for (int i = 0; i < LANDSCAPE_SURFACE_ZONE_COUNT; i++) landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_ZONE + i] = landscapeSurfaceNeutrals[LANDSCAPE_SURFACE_INPUT_ZONE + i];
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_HARDNESS] = landscapeSurfaceNeutrals[LANDSCAPE_SURFACE_INPUT_HARDNESS];
    }
    return availability;
}

// the root-grid override layer (the layer before the appearance layer, which stays last): pins from the nearest aligned sample, scales bilinear at texel centers
void landscapeSurfaceOverrideLayer(vec2 world, out vec2 pins, out vec2 scales) {
    vec4 bounds = uMaskBounds[0];
    vec2 intervals = uMaskDimensions - 1.0;
    vec2 grid = clamp(vec2((world.x - bounds.x) / (bounds.y - bounds.x), (bounds.w - world.y) / (bounds.w - bounds.z)) * intervals, vec2(0.0), intervals);
    ivec3 size = textureSize(uTerrainFields, 0);
    int layer = size.z - 2, halo = int(uCoverageSettings.w);
    vec4 nearest = texelFetch(uTerrainFields, ivec3(ivec2(floor(grid + 0.5)) + halo, layer), 0);
    vec4 filtered = textureLod(uTerrainFields, vec3((grid + float(halo) + 0.5) / vec2(size.xy), float(layer)), 0.0);
    pins = floor(nearest.rg * 255.0 + 0.5);
    scales = filtered.ba * 255.0;
}

float landscapeSurfaceSubstrateWeight(LandscapeSurfaceModel model, int index) {
    return index < 4 ? model.substrateA[index] : index < 8 ? model.substrateB[index - 4] : model.substrateC[index - 8];
}

float landscapeSurfaceCoverWeight(LandscapeSurfaceModel model, int index) {
    return index < 4 ? model.coverA[index] : index < 8 ? model.coverB[index - 4] : model.coverC[index - 8];
}

// the surface of one fragment: soil weights (the display coverage, low xyz = catalog soils 0-2, high xyz = 3-5), the planning share, the decoded terrain
// fields, the world position with its screen derivatives (the geology taps), the fragment's slope (degrees) and height above sea level, the appearance
// terms (catena moisture, coastal reach) and the disturbance. Unbound sources keep their neutral inputs; the output fades from each soil's default
// classes by the field availability and an override pins or scales it last.
LandscapeSurfaceModel landscapeSurfaceModel(vec3 soilLow, vec3 soilHigh, float planningShare, LandscapeTerrainFields fields, vec2 world, vec2 dx, vec2 dy, float slopeDegrees, float heightAboveSea,
    LandscapeTerrainAppearance appearance, float disturbance) {
    for (int i = 0; i < LANDSCAPE_SURFACE_INPUT_COUNT; i++) landscapeSurfaceInputs[i] = landscapeSurfaceNeutrals[i];
    float total = dot(soilLow, vec3(1.0)) + dot(soilHigh, vec3(1.0)), scale = total > 0.0 ? 1.0 / total : 0.0;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_SOIL] = soilLow.x * scale;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_SOIL + 1] = soilLow.y * scale;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_SOIL + 2] = soilLow.z * scale;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_SOIL + 3] = soilHigh.x * scale;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_SOIL + 4] = soilHigh.y * scale;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_SOIL + 5] = soilHigh.z * scale;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_PLANNING] = planningShare;
    float fieldsAvailability = (uTerrainFieldsState.z & LANDSCAPE_SURFACE_FLAG_MODEL) != 0u ? fields.availability : 0.0;
    if (fieldsAvailability > 0.0) {
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_FIELDS] = fields.wetness;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_FIELDS + 1] = fields.flow;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_FIELDS + 2] = fields.deposition;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_FIELDS + 3] = fields.rockExposure;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_FIELDS + 4] = fields.skyView;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_FIELDS + 5] = fields.shoreDistance;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_FIELDS + 6] = fields.convexity;
        landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_FIELDS + 7] = fields.slopeDegrees;
    }
    float geologyAvailability = 0.0;
    if ((uTerrainFieldsState.z & LANDSCAPE_SURFACE_FLAG_GEOLOGY) != 0u) geologyAvailability = landscapeSurfaceGeology(world, dx, dy);
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_SLOPE] = slopeDegrees;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_HEIGHT] = heightAboveSea;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_MOISTURE] = appearance.moisture;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_REACH] = appearance.reach;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_REACH_FRACTION] = clamp(heightAboveSea / max(appearance.reach, 0.01), -LANDSCAPE_SURFACE_REACH_FRACTION_LIMIT, LANDSCAPE_SURFACE_REACH_FRACTION_LIMIT);
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_DISTURBANCE] = disturbance;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_FIELDS_AVAILABILITY] = fieldsAvailability;
    landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_AVAILABILITY] = 0.5 * (fieldsAvailability + geologyAvailability);
    for (int i = 0; i < LANDSCAPE_SURFACE_SUBSTRATE_COUNT; i++) landscapeSurfaceSubstrate[i] = 0.0;
    for (int i = 0; i < LANDSCAPE_SURFACE_COVER_COUNT; i++) landscapeSurfaceCover[i] = 0.0;
    float coverFraction = 0.0, wetness = 0.0, fade = fieldsAvailability;
    for (int soil = 0; soil < LANDSCAPE_SURFACE_SOIL_COUNT; soil++) {
        float weight = landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_SOIL + soil];
        if (weight <= 0.0) continue;
        for (int i = 0; i < LANDSCAPE_SURFACE_SUBSTRATE_COUNT; i++) landscapeSurfaceSoilSubstrate[i] = 0.0;
        for (int i = 0; i < LANDSCAPE_SURFACE_COVER_COUNT; i++) landscapeSurfaceSoilCover[i] = 0.0;
        float fraction = 0.0, wet = 0.0;
        ivec2 range = landscapeSurfaceSoilRules[soil];
        for (int rule = range.x; rule < range.x + range.y; rule++) {
            ivec4 record = landscapeSurfaceRules[rule];
            float value = landscapeSurfaceBases[rule];
            for (int term = record.z; term < record.z + record.w; term++) {
                vec4 t = landscapeSurfaceTerms[term];
                value *= 1.0 - t.w + t.w * landscapeSurfaceRamp(t.y, t.z, landscapeSurfaceInputs[int(t.x)]);
            }
            if (record.y < LANDSCAPE_SURFACE_TARGET_COVER) landscapeSurfaceSoilSubstrate[record.y] += value;
            else if (record.y < LANDSCAPE_SURFACE_TARGET_FRACTION) landscapeSurfaceSoilCover[record.y - LANDSCAPE_SURFACE_TARGET_COVER] += value;
            else if (record.y == LANDSCAPE_SURFACE_TARGET_FRACTION) fraction += value;
            else if (record.y == LANDSCAPE_SURFACE_TARGET_WETNESS) wet = max(wet, value);
        }
        float substrateTotal = 0.0, coverTotal = 0.0;
        for (int i = 0; i < LANDSCAPE_SURFACE_SUBSTRATE_COUNT; i++) substrateTotal += landscapeSurfaceSoilSubstrate[i];
        for (int i = 0; i < LANDSCAPE_SURFACE_COVER_COUNT; i++) coverTotal += landscapeSurfaceSoilCover[i];
        ivec2 defaults = landscapeSurfaceSoilDefaults[soil];
        vec2 levels = landscapeSurfaceSoilLevels[soil];
        for (int i = 0; i < LANDSCAPE_SURFACE_SUBSTRATE_COUNT; i++) {
            float fallback = i == defaults.x ? 1.0 : 0.0;
            landscapeSurfaceSubstrate[i] += weight * (fade * (substrateTotal > 0.0 ? landscapeSurfaceSoilSubstrate[i] / substrateTotal : fallback) + (1.0 - fade) * fallback);
        }
        for (int i = 0; i < LANDSCAPE_SURFACE_COVER_COUNT; i++) {
            float fallback = i == defaults.y ? 1.0 : 0.0;
            landscapeSurfaceCover[i] += weight * (fade * (coverTotal > 0.0 ? landscapeSurfaceSoilCover[i] / coverTotal : fallback) + (1.0 - fade) * fallback);
        }
        coverFraction += weight * (fade * clamp(fraction, 0.0, 1.0) + (1.0 - fade) * levels.x);
        wetness += weight * (fade * clamp(wet, 0.0, 1.0) + (1.0 - fade) * levels.y);
    }
    if ((uTerrainFieldsState.z & LANDSCAPE_SURFACE_FLAG_OVERRIDES) != 0u) {
        vec2 pins, scales;
        landscapeSurfaceOverrideLayer(world, pins, scales);
        int substratePin = int(pins.x), coverPin = int(pins.y);
        if (substratePin < LANDSCAPE_SURFACE_SUBSTRATE_COUNT) for (int i = 0; i < LANDSCAPE_SURFACE_SUBSTRATE_COUNT; i++) landscapeSurfaceSubstrate[i] = i == substratePin ? 1.0 : 0.0;
        if (coverPin < LANDSCAPE_SURFACE_COVER_COUNT) for (int i = 0; i < LANDSCAPE_SURFACE_COVER_COUNT; i++) landscapeSurfaceCover[i] = i == coverPin ? 1.0 : 0.0;
        coverFraction = clamp(coverFraction * scales.x / LANDSCAPE_SURFACE_OVERRIDE_SCALE_UNIT, 0.0, 1.0);
        wetness = clamp(wetness + (scales.y - LANDSCAPE_SURFACE_OVERRIDE_OFFSET_ZERO) / LANDSCAPE_SURFACE_OVERRIDE_SCALE_UNIT, 0.0, 1.0);
    }
    return LandscapeSurfaceModel(vec4(landscapeSurfaceSubstrate[0], landscapeSurfaceSubstrate[1], landscapeSurfaceSubstrate[2], landscapeSurfaceSubstrate[3]),
        vec4(landscapeSurfaceSubstrate[4], landscapeSurfaceSubstrate[5], landscapeSurfaceSubstrate[6], landscapeSurfaceSubstrate[7]),
        vec4(landscapeSurfaceSubstrate[8], landscapeSurfaceSubstrate[9], landscapeSurfaceSubstrate[10], 0.0),
        vec4(landscapeSurfaceCover[0], landscapeSurfaceCover[1], landscapeSurfaceCover[2], landscapeSurfaceCover[3]),
        vec4(landscapeSurfaceCover[4], landscapeSurfaceCover[5], landscapeSurfaceCover[6], landscapeSurfaceCover[7]),
        vec4(landscapeSurfaceCover[8], 0.0, 0.0, 0.0),
        coverFraction, wetness, disturbance, landscapeSurfaceInputs[LANDSCAPE_SURFACE_INPUT_AVAILABILITY]);
}

#ifdef LANDSCAPE_SURFACE_SUBSTRATE_COLOR_LIST
// the review palettes of the inspection views (LandscapeTerrainDiagnostics): one display colour per class, mixed by the class weights
const vec3 landscapeSurfaceSubstrateColors[LANDSCAPE_SURFACE_SUBSTRATE_COUNT] = vec3[LANDSCAPE_SURFACE_SUBSTRATE_COUNT](LANDSCAPE_SURFACE_SUBSTRATE_COLOR_LIST);
const vec3 landscapeSurfaceCoverColors[LANDSCAPE_SURFACE_COVER_COUNT] = vec3[LANDSCAPE_SURFACE_COVER_COUNT](LANDSCAPE_SURFACE_COVER_COLOR_LIST);

vec3 landscapeSurfaceSubstrateColor(LandscapeSurfaceModel model) {
    vec3 color = vec3(0.0);
    for (int i = 0; i < LANDSCAPE_SURFACE_SUBSTRATE_COUNT; i++) color += landscapeSurfaceSubstrateWeight(model, i) * landscapeSurfaceSubstrateColors[i];
    return color;
}

vec3 landscapeSurfaceCoverColor(LandscapeSurfaceModel model) {
    vec3 color = vec3(0.0);
    for (int i = 0; i < LANDSCAPE_SURFACE_COVER_COUNT; i++) color += landscapeSurfaceCoverWeight(model, i) * landscapeSurfaceCoverColors[i];
    return color;
}
#endif
