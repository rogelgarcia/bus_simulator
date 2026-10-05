#ifndef LANDSCAPE_COVERAGE_SLOTS
#error LANDSCAPE_COVERAGE_SLOTS must be defined by LandscapeShaderLoader
#endif
precision highp sampler2DArray;
uniform vec3 uTint;
uniform float uLodColor;
uniform int uDiagnostic;
uniform vec3 uDiagnosticRange;
uniform float uAppearanceReady;
uniform sampler2DArray uMaskPages;
uniform vec2 uMaskDimensions;
uniform vec4 uCoverageSettings;
uniform vec4 uCoverageFilter;
uniform float uCoveragePositiveClamp;
uniform float uContourDistanceRange;
uniform vec4 uMaskBounds[LANDSCAPE_COVERAGE_SLOTS];
uniform vec4 uMaskMeta[LANDSCAPE_COVERAGE_SLOTS];
uniform vec4 uMaskNeighbors0[LANDSCAPE_COVERAGE_SLOTS];
uniform vec4 uMaskNeighbors1[LANDSCAPE_COVERAGE_SLOTS];
uniform vec3 uMaskSlotRanges;
uniform sampler2D uSoilBase0;
uniform sampler2DArray uSoilSurface0;
uniform sampler2D uSoilBase1;
uniform sampler2DArray uSoilSurface1;
uniform sampler2D uSoilBase2;
uniform sampler2DArray uSoilSurface2;
uniform sampler2D uSoilBase3;
uniform sampler2DArray uSoilSurface3;
uniform sampler2D uSoilBase4;
uniform sampler2DArray uSoilSurface4;
uniform sampler2D uSoilBase5;
uniform sampler2DArray uSoilSurface5;
uniform sampler2D uBlendBase;
uniform sampler2DArray uBlendSurface;
uniform int uMaterialBlendIndex;
uniform float uMaterialBlend;
// per soil: uSoilScale vec4(AI577 D5 terrain role: soil development in [0, 1] scaling rock exposure and the catena, or negative for the exposed-rock substrate, normal
// strength, AO intensity, metalness), uSoilTiling vec4(physical period m, paired micro period m or 0, micro normal strength, micro luminance scale),
// uSoilState vec4(relief declared, resident tier resolution, micro relief strength, opposition amplitude) and (AI577 D5c) uSoilResponse
// vec4(EON diffuse roughness, natural specular shadowing weight, page mean normal slope X, Y in its texture frame); zero response is the
// D5b Lambert/GGX shading and zero slope keeps the page's normals
uniform vec4 uSoilScale[6];
uniform vec4 uSoilTiling[6];
uniform vec4 uSoilAlbedo[6];
uniform vec4 uSoilRoughness[6];
uniform vec4 uSoilRange[6];
uniform float uSurfaceBlendEnabled;
uniform vec4 uSurfaceBlendSettings;
uniform vec4 uSoilState[6];
uniform vec4 uSoilResponse[6];
uniform float uBlendResolution;
uniform vec3 uSurfaceSoilColors[6];
// surface-level diagnostic tints are compile-time constants (LandscapeTerrainDiagnostics), so they occupy no uniform vectors
#ifndef LANDSCAPE_SURFACE_LEVEL_COLOR_LIST
#error LANDSCAPE_SURFACE_LEVEL_COLOR_LIST must be defined by LandscapeShaderLoader
#endif
const vec3 landscapeSurfaceLevelColors[8] = vec3[8](LANDSCAPE_SURFACE_LEVEL_COLOR_LIST);
uniform float uSurfaceWarpEnabled;
varying vec3 vLandscapeColor;
varying vec3 vLandscapeNormal;
varying vec3 vLandscapeWorld;

#include <shaderlib:landscape/surface_warp>
#include <shaderlib:landscape/material_clumps>
#include <shaderlib:landscape/stochastic_tiling>
#include <shaderlib:landscape/macro_variation>
#include <shaderlib:landscape/surface_layers>
#include <shaderlib:landscape/terrain_fields>
#include <shaderlib:landscape/lighting_visibility>
#include <shaderlib:landscape/lighting>
#include <shaderlib:landscape/atmosphere>
#include <shaderlib:landscape/water_optics>
#include <shaderlib:landscape/terrain_appearance>
#include <shaderlib:landscape/dressing_inputs>

struct SoilSurface {
    vec3 albedo;
    vec3 normal;
    float roughness;
    float metalness;
    float ao;
    float height;
    float heightDetail;
};

SoilSurface emptySurface() {
    return SoilSurface(vec3(0.0), vec3(0.0), 0.0, 0.0, 0.0, 0.5, 0.0);
}

bool detailSlot(int slot) {
    return uMaskMeta[slot].w > 1.5;
}

int maskAt(vec2 world, bool detail) {
    int slot = detail ? -1 : 0;
    float level = -1.0;
    int first = detail ? int(uMaskSlotRanges.y) : 0;
    int end = int(detail ? uMaskSlotRanges.z : uMaskSlotRanges.x);
    int layers = textureSize(uMaskPages, 0).z;
    for (int i = 0; i < LANDSCAPE_COVERAGE_SLOTS; i++) {
        if (i >= layers) break;
        int index = first + i;
        if (index >= end || index >= layers) break;
        vec4 bounds = uMaskBounds[index];
        if (uMaskMeta[index].w > 0.5 && detailSlot(index) == detail && uMaskMeta[index].x > level && world.x >= bounds.x && world.x <= bounds.y && world.y >= bounds.z && world.y <= bounds.w) {
            slot = index;
            level = uMaskMeta[index].x;
        }
    }
    return slot;
}

int coarserSlot(int slot, int nativeStart) {
    int parent = int(uMaskMeta[slot].z);
    return detailSlot(slot) && !detailSlot(parent) ? nativeStart : parent;
}

int displaySoil(int slot, ivec2 sampleIndex) {
    float encodedSoil = floor(texelFetch(uMaskPages, ivec3(sampleIndex + ivec2(int(uCoverageSettings.w)), slot), 0).r * 255.0 + 0.5);
    return int(floor(encodedSoil / 16.0));
}

void soilTextures(int soil, vec2 uv, vec2 dx, vec2 dy, out vec3 albedo, out vec3 detailNormal, out vec4 orm) {
    if (soil == 0) {
        albedo = textureGrad(uSoilBase0, uv, dx, dy).rgb;
        detailNormal = textureGrad(uSoilSurface0, vec3(uv, 0.0), dx, dy).rgb;
        orm = textureGrad(uSoilSurface0, vec3(uv, 1.0), dx, dy);
    } else if (soil == 1) {
        albedo = textureGrad(uSoilBase1, uv, dx, dy).rgb;
        detailNormal = textureGrad(uSoilSurface1, vec3(uv, 0.0), dx, dy).rgb;
        orm = textureGrad(uSoilSurface1, vec3(uv, 1.0), dx, dy);
    } else if (soil == 2) {
        albedo = textureGrad(uSoilBase2, uv, dx, dy).rgb;
        detailNormal = textureGrad(uSoilSurface2, vec3(uv, 0.0), dx, dy).rgb;
        orm = textureGrad(uSoilSurface2, vec3(uv, 1.0), dx, dy);
    } else if (soil == 3) {
        albedo = textureGrad(uSoilBase3, uv, dx, dy).rgb;
        detailNormal = textureGrad(uSoilSurface3, vec3(uv, 0.0), dx, dy).rgb;
        orm = textureGrad(uSoilSurface3, vec3(uv, 1.0), dx, dy);
    } else if (soil == 4) {
        albedo = textureGrad(uSoilBase4, uv, dx, dy).rgb;
        detailNormal = textureGrad(uSoilSurface4, vec3(uv, 0.0), dx, dy).rgb;
        orm = textureGrad(uSoilSurface4, vec3(uv, 1.0), dx, dy);
    } else {
        albedo = textureGrad(uSoilBase5, uv, dx, dy).rgb;
        detailNormal = textureGrad(uSoilSurface5, vec3(uv, 0.0), dx, dy).rgb;
        orm = textureGrad(uSoilSurface5, vec3(uv, 1.0), dx, dy);
    }
    if (soil == uMaterialBlendIndex) {
        albedo = mix(albedo, textureGrad(uBlendBase, uv, dx, dy).rgb, uMaterialBlend);
        detailNormal = mix(detailNormal, textureGrad(uBlendSurface, vec3(uv, 0.0), dx, dy).rgb, uMaterialBlend);
        orm = mix(orm, textureGrad(uBlendSurface, vec3(uv, 1.0), dx, dy), uMaterialBlend);
    }
}

// the paired micro-detail layer of a soil's surface array, following an arriving tier
vec4 soilMicroTexture(int soil, vec2 uv, vec2 dx, vec2 dy) {
    vec3 coordinate = vec3(uv, 2.0);
    vec4 value;
    if (soil == 0) value = textureGrad(uSoilSurface0, coordinate, dx, dy);
    else if (soil == 1) value = textureGrad(uSoilSurface1, coordinate, dx, dy);
    else if (soil == 2) value = textureGrad(uSoilSurface2, coordinate, dx, dy);
    else if (soil == 3) value = textureGrad(uSoilSurface3, coordinate, dx, dy);
    else if (soil == 4) value = textureGrad(uSoilSurface4, coordinate, dx, dy);
    else value = textureGrad(uSoilSurface5, coordinate, dx, dy);
    if (soil == uMaterialBlendIndex) value = mix(value, textureGrad(uBlendSurface, coordinate, dx, dy), uMaterialBlend);
    return value;
}

struct LatticeSample {
    vec3 albedo;
    vec2 slope;
    vec4 orm;
    float normalLength;
};

// detail normal XY, clamped to the unit disc as decodeLandscapeAppearanceMicroTexel does
vec3 microNormal(vec4 texel) {
    vec2 xy = texel.rg * 2.0 - 1.0;
    xy *= min(1.0, inversesqrt(max(dot(xy, xy), 1.0e-8)));
    return vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
}

// one texel of a lattice: base color, encoded normal and ORM, or for the paired micro layer the luminance code (as albedo), the detail
// normal and the relative height (as ORM alpha)
void latticeTexel(int soil, bool micro, vec2 uv, vec2 dx, vec2 dy, out vec3 albedo, out vec3 encodedNormal, out vec4 orm) {
    if (micro) {
        vec4 texel = soilMicroTexture(soil, uv, dx, dy);
        albedo = vec3(texel.a);
        encodedNormal = microNormal(texel) * 0.5 + 0.5;
        orm = vec4(0.0, 0.0, 0.0, texel.b);
    } else soilTextures(soil, uv, dx, dy, albedo, encodedNormal, orm);
}

#if LANDSCAPE_MATERIAL_SAMPLING == 0
LatticeSample soilLattice(int soil, bool micro, vec2 uv, vec2 dx, vec2 dy, uint salt, vec2 meanSlope) {
    LatticeSample result;
    vec3 encodedNormal;
    latticeTexel(soil, micro, uv, dx, dy, result.albedo, encodedNormal, result.orm);
    vec3 normal = encodedNormal * 2.0 - 1.0;
    result.slope = micro ? landscapeHexSlope(normal, vec2(1.0, 0.0), vec2(0.0)) : normal.xy / max(0.01, normal.z) - meanSlope;
    result.normalLength = length(normal);
    return result;
}
#else
// exact material means from the one-texel mip, following an arriving tier
void soilMeans(int soil, out vec3 albedo, out vec4 orm) {
    const float coarsest = 16.0;
    if (soil == 0) { albedo = textureLod(uSoilBase0, vec2(0.5), coarsest).rgb; orm = textureLod(uSoilSurface0, vec3(0.5, 0.5, 1.0), coarsest); }
    else if (soil == 1) { albedo = textureLod(uSoilBase1, vec2(0.5), coarsest).rgb; orm = textureLod(uSoilSurface1, vec3(0.5, 0.5, 1.0), coarsest); }
    else if (soil == 2) { albedo = textureLod(uSoilBase2, vec2(0.5), coarsest).rgb; orm = textureLod(uSoilSurface2, vec3(0.5, 0.5, 1.0), coarsest); }
    else if (soil == 3) { albedo = textureLod(uSoilBase3, vec2(0.5), coarsest).rgb; orm = textureLod(uSoilSurface3, vec3(0.5, 0.5, 1.0), coarsest); }
    else if (soil == 4) { albedo = textureLod(uSoilBase4, vec2(0.5), coarsest).rgb; orm = textureLod(uSoilSurface4, vec3(0.5, 0.5, 1.0), coarsest); }
    else { albedo = textureLod(uSoilBase5, vec2(0.5), coarsest).rgb; orm = textureLod(uSoilSurface5, vec3(0.5, 0.5, 1.0), coarsest); }
    if (soil == uMaterialBlendIndex) {
        albedo = mix(albedo, textureLod(uBlendBase, vec2(0.5), coarsest).rgb, uMaterialBlend);
        orm = mix(orm, textureLod(uBlendSurface, vec3(0.5, 0.5, 1.0), coarsest), uMaterialBlend);
    }
}

// one world-anchored lattice: the rotated, offset samples of its grid triangle share one weight set for every surface channel; the
// paired micro layer runs through the same body with its own lattice parameters and its neutral mean 0.5; soils without stochastic
// parameters take a single unrotated sample through the same loop. meanSlope removes the page's mean normal lean before each sample's
// inverse rotation, so rotated patches keep one mean orientation (zero for the mean-neutral micro layer)
LatticeSample soilLattice(int soil, bool micro, vec2 uv, vec2 dx, vec2 dy, uint salt, vec2 meanSlope) {
    vec4 stochastic = uSoilStochastic[soil];
    bool hex = stochastic.x > 0.0;
    if (micro && hex) stochastic = uMicroSampling;
#if LANDSCAPE_MATERIAL_SAMPLING == 1
    float exponent = 1.0;
#elif LANDSCAPE_MATERIAL_SAMPLING == 2
    float exponent = stochastic.w;
#else
    float exponent = uStochasticSettings.z;
#endif
    LandscapeHexLattice lattice = landscapeHexLattice(uv, salt, hex ? stochastic.x : 1.0, exponent);
    vec3 bounds = landscapeHexWeightBounds(lattice.weights);
#if LANDSCAPE_MATERIAL_SAMPLING == 3
    vec3 meanAlbedo = vec3(0.5);
    vec4 meanOrm = vec4(0.0, 0.0, 0.0, 0.5);
    if (!micro) soilMeans(soil, meanAlbedo, meanOrm);
#else
    vec3 meanAlbedo = vec3(0.0);
    vec4 meanOrm = vec4(0.0);
#endif
    float signal = micro ? 1.0 : uSoilState[soil].x;
    vec3 albedo = vec3(0.0);
    vec2 slope = vec2(0.0);
    vec4 orm = vec4(0.0);
    float total = 0.0, squares = 0.0, normalLength = 0.0;
    // the sample count is a uniform (always three) so FXC compiles one loop body instead of unrolling it per soil
    int samples = hex ? min(int(uStochasticSettings.w), 3) : 1;
    for (int k = 0; k < samples; k++) {
        float weight = !hex ? 1.0 : k == 0 ? lattice.weights.x : k == 1 ? lattice.weights.y : lattice.weights.z;
        float bound = !hex ? 1.0 : k == 0 ? bounds.x : k == 1 ? bounds.y : bounds.z;
        if (bound < uStochasticSettings.y) continue;
        weight *= smoothstep(uStochasticSettings.y, 2.0 * uStochasticSettings.y, bound);
        vec2 sampleUv = uv, rotation = vec2(1.0, 0.0);
        if (hex) landscapeHexVertex(lattice, k, salt, uv, stochastic.y, stochastic.z, sampleUv, rotation);
        mat2 turn = mat2(rotation.x, rotation.y, -rotation.y, rotation.x);
        vec3 sampleAlbedo, encodedNormal;
        vec4 sampleOrm;
        latticeTexel(soil, micro, sampleUv, turn * dx, turn * dy, sampleAlbedo, encodedNormal, sampleOrm);
#if LANDSCAPE_MATERIAL_SAMPLING == 2
        weight *= 1.0 - uStochasticSettings.x + uStochasticSettings.x * mix(dot(sampleAlbedo, vec3(0.2126, 0.7152, 0.0722)), sampleOrm.a, signal);
#endif
        vec3 decoded = encodedNormal * 2.0 - 1.0;
        albedo += weight * (sampleAlbedo - meanAlbedo);
        orm += weight * (sampleOrm - meanOrm);
        slope += weight * landscapeHexSlope(decoded, rotation, meanSlope);
        normalLength += weight * length(decoded);
        total += weight;
        squares += weight * weight;
    }
    LatticeSample result;
#if LANDSCAPE_MATERIAL_SAMPLING == 3
    float gain = inversesqrt(squares);
    result.albedo = clamp(meanAlbedo + albedo * gain, 0.0, 1.0);
    result.orm = clamp(meanOrm + orm * gain, 0.0, 1.0);
    slope *= gain;
#else
    result.albedo = albedo / total;
    result.orm = orm / total;
    slope /= total;
#endif
    vec3 normal = normalize(vec3(slope, 1.0));
    result.slope = micro ? slope : normal.xy / max(0.01, normal.z);
    result.normalLength = normalLength / total;
    return result;
}
#endif

// a soil's mean base color from its one-texel mip, following an arriving tier
vec3 soilMeanAlbedo(int soil) {
    const float coarsest = 16.0;
    vec3 albedo;
    if (soil == 0) albedo = textureLod(uSoilBase0, vec2(0.5), coarsest).rgb;
    else if (soil == 1) albedo = textureLod(uSoilBase1, vec2(0.5), coarsest).rgb;
    else if (soil == 2) albedo = textureLod(uSoilBase2, vec2(0.5), coarsest).rgb;
    else if (soil == 3) albedo = textureLod(uSoilBase3, vec2(0.5), coarsest).rgb;
    else if (soil == 4) albedo = textureLod(uSoilBase4, vec2(0.5), coarsest).rgb;
    else albedo = textureLod(uSoilBase5, vec2(0.5), coarsest).rgb;
    if (soil == uMaterialBlendIndex) albedo = mix(albedo, textureLod(uBlendBase, vec2(0.5), coarsest).rgb, uMaterialBlend);
    return albedo;
}

vec3 correctedAlbedo(vec3 color, vec4 correction) {
    const vec3 axis = vec3(0.57735026919);
    float cosine = cos(correction.y), sine = sin(correction.y);
    color = color * cosine + cross(axis, color) * sine + axis * dot(axis, color) * (1.0 - cosine);
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luminance), color, 1.0 + correction.z);
    vec3 tint = vec3(0.5 + 0.5 * cos(correction.y), 0.5 + 0.5 * cos(correction.y - 2.0943951), 0.5 + 0.5 * cos(correction.y + 2.0943951));
    color = mix(color, color * tint * 2.0, correction.w);
    return max(vec3(0.0), color * correction.x);
}

// the material mean albedo that stands for the surrounding terrain of terrain-reflected light: one-texel mip, correction, macro variation
vec3 soilGroundAlbedo(int soil, vec2 macroField) {
    return landscapeMacroAlbedo(soil, macroField, correctedAlbedo(soilMeanAlbedo(soil), uSoilAlbedo[soil]));
}

// AI577 D5: the landscape-scale field of one soil; the soil expresses the terrain-driven catena terms by its terrain role (developed soils fully,
// mobile sand half, the seabed and the exposed-rock substrate not at all)
vec2 soilMacroField(int soil, vec2 field, vec2 catena) {
    return field + max(uSoilScale[soil].x, 0.0) * catena;
}

// natural-ground response of a soil: EON roughness, specular shadowing weight, opposition amplitude
vec3 soilResponse(int soil) {
    return vec3(uSoilResponse[soil].xy, uSoilState[soil].w);
}

// one soil at its physical period: each active projection evaluates the base lattice and, while it is resolved, the paired micro
// lattice through one loop body; slopes become perturbations of the geometric normal (the top projection keeps its established tangent
// frame, side projections use surface gradients), then landscape-scale variation and mip-filtered roughness apply
SoilSurface soilSurface(int soil, vec3 position, vec3 positionDx, vec3 positionDy, vec3 normal, vec3 projection, vec2 macroField, float footprint, float detailFootprint) {
    vec4 scale = uSoilScale[soil], range = uSoilRange[soil], remap = uSoilRoughness[soil], tiling = uSoilTiling[soil], state = uSoilState[soil];
    float c = cos(range.w), s = sin(range.w);
    mat2 rotation = mat2(c, s, -s, c);
    float micro = 0.0;
    if (tiling.y > 0.0) {
        micro = landscapeMicroFade(tiling.y, detailFootprint, state.y);
        if (soil == uMaterialBlendIndex) micro = mix(micro, landscapeMicroFade(tiling.y, detailFootprint, uBlendResolution), uMaterialBlend);
    }
    vec3 tangent = normalize(vec3(normal.y, -normal.x, 0.0));
    vec3 north = normalize(cross(tangent, normal));
    uint salt = landscapeStochasticSalt(soil);
    vec3 albedo = vec3(0.0), perturbation = vec3(0.0);
    vec4 orm = vec4(0.0);
    float normalLength = 0.0, luminance = 0.0, microHeight = 0.0;
    // gentle ground evaluates the top projection only; the evaluation count stays a runtime value so one lattice body is compiled
    int layers = micro > 0.0 ? 2 : 1, evaluations = (projection.y > 0.0 || projection.z > 0.0 ? 3 : 1) * layers;
    for (int evaluation = 0; evaluation < evaluations; evaluation++) {
        int p = evaluation / layers;
        bool microLayer = evaluation - p * layers == 1;
        float weight = p == 0 ? projection.x : p == 1 ? projection.y : projection.z;
        if (weight <= 0.0) continue;
        vec3 axisU, axisV;
        landscapeProjectionAxes(p, normal, axisU, axisV);
        float period = microLayer ? tiling.y : tiling.x;
        vec2 coords = vec2(dot(position, axisU), dot(position, axisV));
        vec2 coordsDx = rotation * vec2(dot(positionDx, axisU), dot(positionDx, axisV)), coordsDy = rotation * vec2(dot(positionDy, axisU), dot(positionDy, axisV));
        uint projectionSalt = landscapeProjectionSalt(salt, p);
        LatticeSample lattice = soilLattice(soil, microLayer, rotation * coords / period, coordsDx / period, coordsDy / period, microLayer ? landscapeMicroSalt(projectionSalt) : projectionSalt,
            microLayer ? vec2(0.0) : uSoilResponse[soil].zw);
        vec2 slope = transpose(rotation) * lattice.slope * scale.y * (microLayer ? tiling.z * micro : 1.0);
        vec3 direction = p == 0 ? tangent * slope.x + north * slope.y : axisU * slope.x + axisV * slope.y;
        if (p > 0) direction -= normal * dot(normal, direction);
        perturbation += weight * direction;
        if (microLayer) {
            microHeight += weight * (lattice.orm.a - 0.5) * state.z * micro;
            luminance += weight * (lattice.albedo.r * 2.0 - 1.0) * tiling.w * micro;
        } else {
            albedo += weight * lattice.albedo;
            orm += weight * lattice.orm;
            normalLength += weight * lattice.normalLength;
        }
    }
    vec3 color = landscapeMacroAlbedo(soil, macroField, correctedAlbedo(albedo, uSoilAlbedo[soil]) * (1.0 + luminance));
    vec3 mapped = normalize(normal + perturbation);
    float roughness = range.y - range.x > 0.00001 ? clamp((orm.g - range.x) / (range.y - range.x), 0.0, 1.0) : orm.g;
    if (remap.w > 0.5) roughness = 1.0 - roughness;
    roughness = mix(remap.x, remap.y, pow(roughness, remap.z)) * range.z;
    roughness = landscapeFilteredRoughness(landscapeMacroRoughness(soil, macroField, roughness), normalLength, scale.y);
    float heightDetail = 1.0 - smoothstep(uSurfaceBlendSettings.z, uSurfaceBlendSettings.w, max(footprint, tiling.x / state.y));
    if (soil == uMaterialBlendIndex) {
        float targetDetail = 1.0 - smoothstep(uSurfaceBlendSettings.z, uSurfaceBlendSettings.w, max(footprint, tiling.x / uBlendResolution));
        heightDetail = mix(heightDetail, targetDetail, uMaterialBlend);
    }
    return SoilSurface(color, mapped, clamp(roughness, 0.05, 1.0), clamp(max(orm.b, scale.w), 0.0, 1.0), clamp(1.0 - (1.0 - orm.r) * scale.z, 0.0, 1.0),
        mix(0.5, clamp(orm.a + microHeight, 0.0, 1.0), state.x), heightDetail * state.x);
}

struct Coverage {
    vec3 low;
    vec3 high;
};

Coverage emptyCoverage() {
    return Coverage(vec3(0.0), vec3(0.0));
}

Coverage mixCoverage(Coverage a, Coverage b, float weight) {
    return Coverage(mix(a.low, b.low, weight), mix(a.high, b.high, weight));
}

float coverageWeight(Coverage value, int index) {
    if (index == 0) return value.low.x;
    if (index == 1) return value.low.y;
    if (index == 2) return value.low.z;
    if (index == 3) return value.high.x;
    if (index == 4) return value.high.y;
    return value.high.z;
}

Coverage coverageIdentity(int soil) {
    return Coverage(vec3(equal(ivec3(0, 1, 2), ivec3(soil))), vec3(equal(ivec3(3, 4, 5), ivec3(soil))));
}

float coverageTotal(Coverage value) {
    return dot(value.low + value.high, vec3(1.0));
}

vec2 cardinalKernel(float value) {
    float x = abs(value), direction = sign(value);
    if (x < 1.0) return vec2(1.0 - 2.5 * x * x + 1.5 * x * x * x, direction * (-5.0 * x + 4.5 * x * x));
    if (x < 2.0) return vec2(2.0 - 4.0 * x + 2.5 * x * x - 0.5 * x * x * x, direction * (-4.0 + 5.0 * x - 1.5 * x * x));
    return vec2(0.0);
}

float coverageSpline(float value) {
    float x = abs(value);
    if (x < 1.0) return 2.0 / 3.0 - x * x + 0.5 * x * x * x;
    if (x < 2.0) return pow(2.0 - x, 3.0) / 6.0;
    return 0.0;
}

float coverageSplineIntegral(float value) {
    float x = abs(value), result;
    if (x >= 2.0) result = 0.5;
    else if (x >= 1.0) result = 0.5 - pow(2.0 - x, 4.0) / 24.0;
    else result = 2.0 * x / 3.0 - x * x * x / 3.0 + x * x * x * x / 8.0;
    return 0.5 + sign(value) * result;
}

float integratedCoverageSpline(float value, float halfWidth) {
    if (halfWidth < 0.01) return coverageSpline(value);
    return max(0.0, (coverageSplineIntegral(value + halfWidth) - coverageSplineIntegral(value - halfWidth)) / (2.0 * halfWidth));
}

float coverageRampIntegral(float value) {
    if (value <= 0.0) return 0.0;
    if (value >= 1.0) return value - 0.5;
    return value * value * value - 0.5 * value * value * value * value;
}

float coverageRampDoubleIntegral(float value) {
    if (value <= 0.0) return 0.0;
    if (value >= 1.0) return 0.5 * value * value - 0.5 * value + 0.15;
    float fourth = value * value * value * value;
    return fourth / 4.0 - fourth * value / 10.0;
}

float coverageRampAverage(float center, vec2 projected) {
    float a = max(projected.x, projected.y), b = min(projected.x, projected.y), halfWidth = (a + b) * 0.5;
    if (center + halfWidth <= 0.0) return 0.0;
    if (center - halfWidth >= 1.0) return 1.0;
    if (a < uCoverageFilter.w) return smoothstep(0.0, 1.0, center);
    if (b < uCoverageFilter.w || b < a * 0.01) return clamp((coverageRampIntegral(center + a * 0.5) - coverageRampIntegral(center - a * 0.5)) / a, 0.0, 1.0);
    return clamp((coverageRampDoubleIntegral(center + halfWidth) - coverageRampDoubleIntegral(center + (a - b) * 0.5)
        - coverageRampDoubleIntegral(center + (b - a) * 0.5) + coverageRampDoubleIntegral(center - halfWidth)) / (a * b), 0.0, 1.0);
}

Coverage fittedContourCoverage(int slot, vec2 grid, vec2 spacing, vec2 dx, vec2 dy, Coverage base) {
    ivec2 cell = min(ivec2(floor(grid)), ivec2(uMaskDimensions) - 2);
    vec2 fraction = grid - vec2(cell);
    ivec2 origin = cell + ivec2(int(uCoverageSettings.w));
    ivec4 first = ivec4(floor(texelFetch(uMaskPages, ivec3(origin, slot), 0) * 255.0 + 0.5));
    ivec4 second = ivec4(floor(texelFetch(uMaskPages, ivec3(origin + ivec2(1, 0), slot), 0) * 255.0 + 0.5));
    ivec4 third = ivec4(floor(texelFetch(uMaskPages, ivec3(origin + ivec2(0, 1), slot), 0) * 255.0 + 0.5));
    ivec4 fourth = ivec4(floor(texelFetch(uMaskPages, ivec3(origin + ivec2(1, 1), slot), 0) * 255.0 + 0.5));
    ivec4 pairs = ivec4(first.w, second.w, third.w, fourth.w) / 16;
    Coverage result = base;
    if (!all(equal(pairs, ivec4(15)))) {
    vec4 distances = (vec4(first.z + (first.w % 16) * 256, second.z + (second.w % 16) * 256,
        third.z + (third.w % 16) * 256, fourth.z + (fourth.w % 16) * 256) / 4095.0 * 2.0 - 1.0) * uContourDistanceRange * max(spacing.x, spacing.y);
    vec4 weights = vec4((1.0 - fraction.x) * (1.0 - fraction.y), fraction.x * (1.0 - fraction.y), (1.0 - fraction.x) * fraction.y, fraction.x * fraction.y);
    vec4 gradientX = vec4(fraction.y - 1.0, 1.0 - fraction.y, -fraction.y, fraction.y) / spacing.x;
    vec4 gradientZ = vec4(1.0 - fraction.x, fraction.x, fraction.x - 1.0, -fraction.x) / spacing.y;
    Coverage fitted = emptyCoverage();
    float confidenceTotal = 0.0;
    for (int pair = 0; pair < 15; pair++) {
        vec4 selected = vec4(equal(pairs, ivec4(pair)));
        float confidence = dot(selected, weights);
        if (confidence <= 0.0) continue;
        float distance = dot(selected * weights, distances) / confidence;
        vec2 gradient = vec2(dot(selected * gradientX, distances) - distance * dot(selected, gradientX),
            dot(selected * gradientZ, distances) - distance * dot(selected, gradientZ)) / confidence;
        float high = coverageRampAverage(0.5 + distance / uCoverageSettings.x, abs(vec2(dot(gradient, dx), dot(gradient, dy))) / uCoverageSettings.x);
        int lowSoil = pair < 5 ? 0 : pair < 9 ? 1 : pair < 12 ? 2 : pair < 14 ? 3 : 4;
        int start = lowSoil == 0 ? 0 : lowSoil == 1 ? 5 : lowSoil == 2 ? 9 : lowSoil == 3 ? 12 : 14;
        int highSoil = pair - start + lowSoil + 1;
        Coverage response = mixCoverage(coverageIdentity(lowSoil), coverageIdentity(highSoil), high);
        fitted.low += response.low * confidence; fitted.high += response.high * confidence;
        confidenceTotal += confidence;
    }
    result = Coverage(base.low * (1.0 - confidenceTotal) + fitted.low, base.high * (1.0 - confidenceTotal) + fitted.high);
    }
    return result;
}

Coverage maskCoverage(int slot, vec2 world, vec2 dx, vec2 dy) {
    vec4 bounds = uMaskBounds[slot];
    vec2 spacing = vec2(bounds.y - bounds.x, bounds.w - bounds.z) / (uMaskDimensions - 1.0);
    vec2 grid = clamp(vec2(world.x - bounds.x, bounds.w - world.y) / spacing, vec2(0.0), uMaskDimensions - 1.0);
    ivec2 cell = ivec2(floor(grid));
    ivec4 anchor = ivec4(floor(texelFetch(uMaskPages, ivec3(cell + ivec2(int(uCoverageSettings.w)), slot), 0) * 255.0 + 0.5));
    Coverage near = coverageIdentity(anchor.x / 16);
    if (anchor.z != 1 || anchor.w != 240) {
    vec2 extent = (abs(dx) + abs(dy)) / spacing;
    float minification = smoothstep(uCoverageSettings.y, uCoverageSettings.z, max(extent.x, extent.y));
    vec2 halfWidth = min(vec2(1.0), extent * 0.5);
    Coverage raw = Coverage(vec3(0.0), vec3(0.0));
    Coverage filtered = Coverage(vec3(0.0), vec3(0.0));
    near = Coverage(vec3(0.0), vec3(0.0));
    Coverage gradientX = Coverage(vec3(0.0), vec3(0.0));
    Coverage gradientZ = Coverage(vec3(0.0), vec3(0.0));
    int uniformSoil = -1;
    bool uniformSupport = true;
    for (int row = -2; row <= 3; row++) {
        float offsetZ = grid.y - float(cell.y + row);
        vec2 kz = cardinalKernel(offsetZ);
        float fz = minification > 0.0 ? integratedCoverageSpline(offsetZ, halfWidth.y) : 0.0;
        for (int column = -2; column <= 3; column++) {
            float offsetX = grid.x - float(cell.x + column);
            vec2 kx = cardinalKernel(offsetX);
            float fx = minification > 0.0 ? integratedCoverageSpline(offsetX, halfWidth.x) : 0.0;
            if (kx.x * kz.x == 0.0 && fx * fz == 0.0 && kx.y * kz.x == 0.0 && kx.x * kz.y == 0.0) continue;
            int soil = displaySoil(slot, cell + ivec2(column, row));
            if (uniformSoil < 0) uniformSoil = soil;
            else if (soil != uniformSoil) uniformSupport = false;
            Coverage identity = coverageIdentity(soil);
            raw.low += identity.low * kx.x * kz.x; raw.high += identity.high * kx.x * kz.x;
            gradientX.low += identity.low * kx.y * kz.x / spacing.x; gradientX.high += identity.high * kx.y * kz.x / spacing.x;
            gradientZ.low -= identity.low * kx.x * kz.y / spacing.y; gradientZ.high -= identity.high * kx.x * kz.y / spacing.y;
            filtered.low += identity.low * fx * fz; filtered.high += identity.high * fx * fz;
        }
    }
    if (uniformSupport) near = coverageIdentity(uniformSoil);
    else {
    vec3 lowFraction = clamp(raw.low / uCoveragePositiveClamp, 0.0, 1.0), highFraction = clamp(raw.high / uCoveragePositiveClamp, 0.0, 1.0);
    raw.low = max(raw.low, vec3(0.0)) * lowFraction * (2.0 - lowFraction);
    raw.high = max(raw.high, vec3(0.0)) * highFraction * (2.0 - highFraction);
    gradientX.low *= 4.0 * lowFraction - 3.0 * lowFraction * lowFraction;
    gradientZ.low *= 4.0 * lowFraction - 3.0 * lowFraction * lowFraction;
    gradientX.high *= 4.0 * highFraction - 3.0 * highFraction * highFraction;
    gradientZ.high *= 4.0 * highFraction - 3.0 * highFraction * highFraction;
    float total = coverageTotal(raw), totalX = coverageTotal(gradientX), totalZ = coverageTotal(gradientZ);
    gradientX.low = (gradientX.low * total - raw.low * totalX) / (total * total);
    gradientX.high = (gradientX.high * total - raw.high * totalX) / (total * total);
    gradientZ.low = (gradientZ.low * total - raw.low * totalZ) / (total * total);
    gradientZ.high = (gradientZ.high * total - raw.high * totalZ) / (total * total);
    raw.low /= total; raw.high /= total;
    float gradientScale = 0.00001;
    vec2 maximumProjection = vec2(0.0);
    for (int i = 0; i < 6; i++) for (int j = 0; j < i; j++) {
        vec2 difference = vec2(coverageWeight(gradientX, i) - coverageWeight(gradientX, j), coverageWeight(gradientZ, i) - coverageWeight(gradientZ, j));
        gradientScale = max(gradientScale, length(difference));
        maximumProjection = max(maximumProjection, abs(vec2(dot(difference, dx), dot(difference, dy))));
    }
    vec2 projected = maximumProjection / (gradientScale * uCoverageSettings.x);
    for (int i = 0; i < 6; i++) {
        float competitor = 0.0;
        for (int j = 0; j < 6; j++) if (j != i) competitor = max(competitor, coverageWeight(raw, j));
        float weight = coverageWeight(raw, i), margin = (weight - competitor) / gradientScale;
        Coverage identity = coverageIdentity(i);
        float contribution = weight * coverageRampAverage(0.5 + margin / uCoverageSettings.x, projected);
        near.low += identity.low * contribution; near.high += identity.high * contribution;
    }
    float nearTotal = coverageTotal(near);
    near.low /= nearTotal; near.high /= nearTotal;
    }
    // contour ramps of wide generated transitions reach cells whose label support is already uniform
    if (minification < 1.0) near = fittedContourCoverage(slot, grid, spacing, dx, dy, near);
    if (minification > 0.0) {
        float filteredTotal = coverageTotal(filtered);
        filtered.low /= filteredTotal; filtered.high /= filteredTotal;
        near = mixCoverage(near, filtered, minification);
    }
    }
    return near;
}

Coverage frameCoverage(int slot, vec2 world, vec2 dx, vec2 dy, vec2 warped, vec2 warpedDx, vec2 warpedDy) {
    bool detail = detailSlot(slot);
    return maskCoverage(slot, detail ? world : warped, detail ? dx : warpedDx, detail ? dy : warpedDy);
}

Coverage filteredMaskCoverage(int slot, int nativeStart, vec2 world, vec2 dx, vec2 dy, vec2 warped, vec2 warpedDx, vec2 warpedDy) {
    int current = slot;
    int next = slot;
    float coarser = 0.0;
    for (int depth = 0; depth < LANDSCAPE_COVERAGE_SLOTS; depth++) {
        vec4 bounds = uMaskBounds[current];
        vec2 spacing = vec2(bounds.y - bounds.x, bounds.w - bounds.z) / (uMaskDimensions - 1.0);
        bool detail = detailSlot(current);
        vec2 extent = (abs(detail ? dx : warpedDx) + abs(detail ? dy : warpedDy)) / spacing;
        next = coarserSlot(current, nativeStart);
        coarser = next == current ? 0.0 : smoothstep(uCoverageFilter.x, uCoverageFilter.y, max(extent.x, extent.y));
        if (coarser < 1.0) break;
        current = next;
    }
    Coverage result = frameCoverage(current, world, dx, dy, warped, warpedDx, warpedDy);
    if (coarser > 0.0) result = mixCoverage(result, frameCoverage(next, world, dx, dy, warped, warpedDx, warpedDy), coarser);
    return result;
}

float coverageNeighborProgress(int slot, int index) {
    float result = uMaskNeighbors1[slot].w;
    if (index == 0) result = uMaskNeighbors0[slot].x;
    else if (index == 1) result = uMaskNeighbors0[slot].y;
    else if (index == 2) result = uMaskNeighbors0[slot].z;
    else if (index == 3) result = uMaskNeighbors0[slot].w;
    else if (index == 4) result = uMaskNeighbors1[slot].x;
    else if (index == 5) result = uMaskNeighbors1[slot].y;
    else if (index == 6) result = uMaskNeighbors1[slot].z;
    return result;
}

float coverageAvailability(int slot, vec2 world) {
    int parent = int(uMaskMeta[slot].z);
    if (slot == parent) return 1.0;
    vec4 bounds = uMaskBounds[slot];
    vec4 parentBounds = uMaskBounds[parent];
    vec2 size = vec2(bounds.y - bounds.x, bounds.w - bounds.z);
    vec2 parentSpacing = vec2(parentBounds.y - parentBounds.x, parentBounds.w - parentBounds.z) / (uMaskDimensions - 1.0);
    float band = min(min(size.x, size.y), 2.0 * max(parentSpacing.x, parentSpacing.y));
    float result = uMaskMeta[slot].y;
    int index = 0;
    for (int row = -1; row <= 1; row++) for (int column = -1; column <= 1; column++) {
        if (row == 0 && column == 0) continue;
        vec2 offset = vec2(float(column) * size.x, -float(row) * size.y);
        vec2 low = vec2(bounds.x, bounds.z) + offset, high = vec2(bounds.y, bounds.w) + offset;
        float distance = length(max(max(low - world, world - high), vec2(0.0)));
        if (distance < band) {
            float progress = coverageNeighborProgress(slot, index);
            result = min(result, mix(progress, 1.0, smoothstep(0.0, band, distance)));
        }
        index++;
    }
    return result;
}

// floored log-space relief (clump plus texture relief) of every present material in a transition; interiors and
// disabled soils keep zero relief
Coverage materialClumpRelief(Coverage coverage, Coverage heights, Coverage details, vec2 world, float footprint) {
    Coverage relief = emptyCoverage();
    float maximumWeight = max(max(max(coverage.low.x, coverage.low.y), coverage.low.z), max(max(coverage.high.x, coverage.high.y), coverage.high.z));
    if (uSurfaceBlendEnabled < 0.5 || uClumpSettings.w < 0.5 || maximumWeight >= coverageTotal(coverage)) return relief;
    for (int soil = 0; soil < 6; soil++) {
        vec4 clump = uSoilClumps[soil];
        if (coverageWeight(coverage, soil) <= 0.0 || clump.y <= 0.0) continue;
        float clumpDetail;
        float value = uClumpSettings.x * clump.y * landscapeMaterialClump(soil, world, footprint, clumpDetail);
        float textureDetail = coverageWeight(details, soil);
        value = max(0.0, uClumpConfidence.z * max(clumpDetail, textureDetail) + value + clump.z * textureDetail * (coverageWeight(heights, soil) - 0.5));
        Coverage identity = coverageIdentity(soil);
        relief.low += identity.low * value; relief.high += identity.high * value;
    }
    return relief;
}

// each material's relief acts only on its confident coverage, so reconstruction tails can lose weight but never gain it
Coverage clumpedCoverage(Coverage coverage, Coverage relief) {
    if (all(equal(relief.low, vec3(0.0))) && all(equal(relief.high, vec3(0.0)))) return coverage;
    vec3 lowExponent = smoothstep(vec3(uClumpConfidence.x), vec3(uClumpConfidence.y), coverage.low) * relief.low;
    vec3 highExponent = smoothstep(vec3(uClumpConfidence.x), vec3(uClumpConfidence.y), coverage.high) * relief.high;
    float maximum = max(max(max(lowExponent.x, lowExponent.y), lowExponent.z), max(max(highExponent.x, highExponent.y), highExponent.z));
    Coverage weighted = Coverage(coverage.low * exp(lowExponent - maximum), coverage.high * exp(highExponent - maximum));
    float total = coverageTotal(weighted);
    return Coverage(weighted.low / total, weighted.high / total);
}

Coverage materialHeightCoverage(Coverage coverage, Coverage heights, float detail) {
    if (uSurfaceBlendEnabled < 0.5) return coverage;
    Coverage scores = Coverage(coverage.low * (1.0 + uSurfaceBlendSettings.x * (2.0 * heights.low - 1.0)),
        coverage.high * (1.0 + uSurfaceBlendSettings.x * (2.0 * heights.high - 1.0)));
    Coverage scoreDx = Coverage(dFdx(scores.low), dFdx(scores.high));
    Coverage scoreDy = Coverage(dFdy(scores.low), dFdy(scores.high));
    float maximumWeight = max(max(max(coverage.low.x, coverage.low.y), coverage.low.z), max(max(coverage.high.x, coverage.high.y), coverage.high.z));
    if (detail <= 0.0 || maximumWeight >= coverageTotal(coverage)) return coverage;
    float maximum = max(max(max(scores.low.x, scores.low.y), scores.low.z), max(max(scores.high.x, scores.high.y), scores.high.z));
    vec2 projected = vec2(0.0);
    for (int i = 0; i < 6; i++) for (int j = 0; j < i; j++) {
        projected = max(projected, abs(vec2(coverageWeight(scoreDx, i) - coverageWeight(scoreDx, j), coverageWeight(scoreDy, i) - coverageWeight(scoreDy, j))));
    }
    projected /= uSurfaceBlendSettings.y;
    Coverage result = emptyCoverage();
    for (int i = 0; i < 6; i++) {
        float weight = coverageWeight(coverage, i) * coverageRampAverage(1.0 + (coverageWeight(scores, i) - maximum) / uSurfaceBlendSettings.y, projected);
        Coverage identity = coverageIdentity(i);
        result.low += identity.low * weight; result.high += identity.high * weight;
    }
    float total = coverageTotal(result);
    result.low /= total; result.high /= total;
    return mixCoverage(coverage, result, detail);
}

// the soil slot holding the exposed-rock substrate (negative terrain role), or -1
int landscapeRockSoil() {
    int rock = -1;
    for (int soil = 0; soil < 6; soil++) if (uSoilScale[soil].x < 0.0) rock = soil;
    return rock;
}

// AI577 D5 rock exposure: every susceptible soil cedes its role times the exposure of its coverage to the exposed-rock soil before the clumps and
// the height competition, which then reveal rock relief through the soil; coverage stays normalized and absent soils stay absent
Coverage landscapeRevealRock(Coverage coverage, float exposure) {
    int rock = landscapeRockSoil();
    if (exposure <= 0.0 || rock < 0) return coverage;
    vec3 lowShare = clamp(vec3(uSoilScale[0].x, uSoilScale[1].x, uSoilScale[2].x), 0.0, 1.0) * exposure;
    vec3 highShare = clamp(vec3(uSoilScale[3].x, uSoilScale[4].x, uSoilScale[5].x), 0.0, 1.0) * exposure;
    Coverage identity = coverageIdentity(rock);
    float moved = dot(coverage.low, lowShare) + dot(coverage.high, highShare);
    return Coverage(coverage.low * (1.0 - lowShare) + identity.low * moved, coverage.high * (1.0 - highShare) + identity.high * moved);
}

void addSurface(inout SoilSurface result, SoilSurface part, float weight) {
    result.albedo += part.albedo * weight;
    result.normal += part.normal * weight;
    result.roughness += part.roughness * weight;
    result.metalness += part.metalness * weight;
    result.ao += part.ao * weight;
}

// generated fine pages carry the warp in their samples: walk them at the unwarped position, then hand the remaining
// weight to the native hierarchy evaluated entirely at the warped position
Coverage hierarchyCoverage(vec2 world, vec2 dx, vec2 dy, vec2 warped, vec2 warpedDx, vec2 warpedDy) {
    int nativeStart = maskAt(warped, false);
    int current = maskAt(world, true);
    if (current < 0) current = nativeStart;
    Coverage coverage = emptyCoverage();
    float remaining = 1.0;
    for (int depth = 0; depth < LANDSCAPE_COVERAGE_SLOTS; depth++) {
        float activation = coverageAvailability(current, detailSlot(current) ? world : warped);
        if (activation > 0.0) {
            Coverage part = filteredMaskCoverage(current, nativeStart, world, dx, dy, warped, warpedDx, warpedDy);
            coverage.low += part.low * remaining * activation;
            coverage.high += part.high * remaining * activation;
        }
        remaining *= 1.0 - activation;
        if (remaining <= 0.0) break;
        current = coarserSlot(current, nativeStart);
    }
    return coverage;
}

vec3 surfaceLevelColor(vec2 world, vec2 warped) {
    int nativeStart = maskAt(warped, false);
    int current = maskAt(world, true);
    if (current < 0) current = nativeStart;
    for (int depth = 0; depth < LANDSCAPE_COVERAGE_SLOTS; depth++) {
        int parent = coarserSlot(current, nativeStart);
        if (parent == current || coverageAvailability(current, detailSlot(current) ? world : warped) > 0.0) break;
        current = parent;
    }
    return landscapeSurfaceLevelColors[clamp(int(uMaskMeta[current].x + 0.5), 0, 7)];
}

vec3 surfaceCoverageColor(Coverage coverage) {
    return uSurfaceSoilColors[0] * coverage.low.x + uSurfaceSoilColors[1] * coverage.low.y + uSurfaceSoilColors[2] * coverage.low.z
        + uSurfaceSoilColors[3] * coverage.high.x + uSurfaceSoilColors[4] * coverage.high.y + uSurfaceSoilColors[5] * coverage.high.z;
}

// footprints: the planar major axis drives the established relief fades, the anisotropic mip footprint fades micro detail and the 3D major
// axis low-passes the landscape-scale field; projection weights and the field are shared by every soil of the fragment. AI577 D5c: the
// natural-ground response and the material mean albedo that stands for the surrounding terrain of terrain-reflected light (one-texel mip,
// corrected, macro variation applied) are accumulated once from the final weights instead of riding in the six live soil surfaces, which
// measured 0.4-2 ms cheaper on the RTX 3060 (register pressure). AI577 D5 terrain-driven appearance (landscape-terrain-appearance-v1): the terrain
// inputs join the landscape-scale field and reveal rock before the soil lattices, so only the coastal reach stays live through them; the rock
// weathering and splash biofilm factor is evaluated once and applied to the exposed-rock soil and its share of the ground albedo
SoilSurface appearanceSurface(Coverage coverage, vec2 world, vec2 dx, vec2 dy, vec3 normal, vec3 positionDx, vec3 positionDy, out vec3 groundAlbedo, out vec3 response, out float reach) {
    float footprint = max(length(dx), length(dy));
    float major = max(length(positionDx), length(positionDy)), detailFootprint = max(0.25 * major, min(length(positionDx), length(positionDy)));
    vec3 projection = landscapeProjectionWeights(normal);
    LandscapeTerrainAppearance terrain = landscapeTerrainAppearance(vLandscapeWorld, normal, major);
    vec2 macroField = landscapeMacroField(world, major), catena = terrain.macro;
    coverage = landscapeRevealRock(coverage, terrain.exposure);
    reach = terrain.reach;
    vec3 position = vLandscapeWorld;
    SoilSurface a = emptySurface(), b = emptySurface(), c = emptySurface(), d = emptySurface(), e = emptySurface(), f = emptySurface();
    if (coverage.low.x > 0.0) a = soilSurface(0, position, positionDx, positionDy, normal, projection, soilMacroField(0, macroField, catena), footprint, detailFootprint);
    if (coverage.low.y > 0.0) b = soilSurface(1, position, positionDx, positionDy, normal, projection, soilMacroField(1, macroField, catena), footprint, detailFootprint);
    if (coverage.low.z > 0.0) c = soilSurface(2, position, positionDx, positionDy, normal, projection, soilMacroField(2, macroField, catena), footprint, detailFootprint);
    if (coverage.high.x > 0.0) d = soilSurface(3, position, positionDx, positionDy, normal, projection, soilMacroField(3, macroField, catena), footprint, detailFootprint);
    if (coverage.high.y > 0.0) e = soilSurface(4, position, positionDx, positionDy, normal, projection, soilMacroField(4, macroField, catena), footprint, detailFootprint);
    if (coverage.high.z > 0.0) f = soilSurface(5, position, positionDx, positionDy, normal, projection, soilMacroField(5, macroField, catena), footprint, detailFootprint);
    vec3 rockFactor = landscapeRockFactor(normal, position.y - uLandscapeSun.w, reach, terrain.moisture * terrain.weight);
    int rock = landscapeRockSoil();
    a.albedo *= rock == 0 ? rockFactor : vec3(1.0); b.albedo *= rock == 1 ? rockFactor : vec3(1.0); c.albedo *= rock == 2 ? rockFactor : vec3(1.0);
    d.albedo *= rock == 3 ? rockFactor : vec3(1.0); e.albedo *= rock == 4 ? rockFactor : vec3(1.0); f.albedo *= rock == 5 ? rockFactor : vec3(1.0);
    Coverage heights = Coverage(vec3(a.height, b.height, c.height), vec3(d.height, e.height, f.height));
    Coverage details = Coverage(vec3(a.heightDetail, b.heightDetail, c.heightDetail), vec3(d.heightDetail, e.heightDetail, f.heightDetail));
    coverage = clumpedCoverage(coverage, materialClumpRelief(coverage, heights, details, world, footprint));
    float detail = dot(coverage.low, details.low) + dot(coverage.high, details.high);
    coverage = materialHeightCoverage(coverage, heights, detail);
    SoilSurface surface = emptySurface();
    addSurface(surface, a, coverage.low.x); addSurface(surface, b, coverage.low.y); addSurface(surface, c, coverage.low.z);
    addSurface(surface, d, coverage.high.x); addSurface(surface, e, coverage.high.y); addSurface(surface, f, coverage.high.z);
    surface.normal = normalize(surface.normal);
    // constant soil indices let the compiler resolve each soil's sampler; a loop over the soil index measured 1.4-2.5 ms slower
    groundAlbedo = vec3(0.0);
    if (coverage.low.x > 0.0) groundAlbedo += coverage.low.x * soilGroundAlbedo(0, soilMacroField(0, macroField, catena)) * (rock == 0 ? rockFactor : vec3(1.0));
    if (coverage.low.y > 0.0) groundAlbedo += coverage.low.y * soilGroundAlbedo(1, soilMacroField(1, macroField, catena)) * (rock == 1 ? rockFactor : vec3(1.0));
    if (coverage.low.z > 0.0) groundAlbedo += coverage.low.z * soilGroundAlbedo(2, soilMacroField(2, macroField, catena)) * (rock == 2 ? rockFactor : vec3(1.0));
    if (coverage.high.x > 0.0) groundAlbedo += coverage.high.x * soilGroundAlbedo(3, soilMacroField(3, macroField, catena)) * (rock == 3 ? rockFactor : vec3(1.0));
    if (coverage.high.y > 0.0) groundAlbedo += coverage.high.y * soilGroundAlbedo(4, soilMacroField(4, macroField, catena)) * (rock == 4 ? rockFactor : vec3(1.0));
    if (coverage.high.z > 0.0) groundAlbedo += coverage.high.z * soilGroundAlbedo(5, soilMacroField(5, macroField, catena)) * (rock == 5 ? rockFactor : vec3(1.0));
    response = coverage.low.x * soilResponse(0) + coverage.low.y * soilResponse(1) + coverage.low.z * soilResponse(2)
        + coverage.high.x * soilResponse(3) + coverage.high.y * soilResponse(4) + coverage.high.z * soilResponse(5);
    return surface;
}

// AI577 D5 terrain radiance before tone mapping, lit like the game. Dry fragments take the calibrated sun and sky and then the aerial
// perspective of their view path. Submerged fragments (below the optical water level) take Fresnel-transmitted, refracted and attenuated
// light and the water column of their exact in-water view path, leave the water (radiance over n², the surface's Fresnel blend belongs to
// the water material), gain the surface's sun glint and take the aerial perspective of the air path above it. A one-pixel blend keeps the
// waterline antialiased. AI577 D5c: the natural-ground response (gated by uLandscapeResponse.x) shapes both paths; dry fragments also receive
// terrain-reflected light of their material mean albedo (groundAlbedo); terrainVisibility evaluated the terrain-field hooks just before.
// AI577 D5: dry fragments below the coastal reach are wetted by the sea (landscape-terrain-appearance-v1; the submerged path's water column already
// carries the water-film optics, so it keeps the dry inputs)
vec3 terrainRadiance(vec3 albedo, vec3 n, vec3 geometricNormal, float roughness, float metalness, float ao, vec3 response, vec3 groundAlbedo, float reach) {
    vec3 world = vLandscapeWorld, origin, v;
    float distance;
    landscapeViewRay(world, origin, v, distance);
    float skyVisibility = landscapeSkyVisibility(world, n);
    float level = uLandscapeSunIrradiance.w, depth = level - world.y, band = max(fwidth(world.y), 1.0e-4);
    float submerged = smoothstep(-band, band, depth);
    vec3 radiance = vec3(0.0);
    if (submerged < 1.0) {
        LandscapeWetSurface wet = landscapeCoastalWetSurface(albedo, n, geometricNormal, roughness, response, world.y - uLandscapeSun.w, reach);
        vec3 dry = landscapeReflectedRadiance(wet.albedo, wet.normal, v, wet.roughness, metalness, ao, skyVisibility, wet.response * uLandscapeResponse.x,
            landscapeAirLight(world, wet.normal, v, wet.roughness, geometricNormal, groundAlbedo));
        LandscapeHaze haze = landscapeAerialPerspective(origin, world);
        radiance = (dry * haze.transmittance + haze.inscatter) * (1.0 - submerged);
    }
    if (submerged > 0.0) {
        float waterDepth = max(depth, 0.0), startDepth = max(level - origin.y, 0.0);
        float pathLength = origin.y > level ? distance * waterDepth / max(origin.y - world.y, 1.0e-4) : distance;
        vec3 wet = landscapeReflectedRadiance(albedo, n, v, roughness, metalness, ao, skyVisibility, response * uLandscapeResponse.x, landscapeUnderwaterLight(world, n, v, roughness, waterDepth, albedo));
        LandscapeWaterColumn column = landscapeWaterColumn(pathLength, waterDepth - startDepth, startDepth);
        wet = wet * column.transmittance + column.inscatter;
        if (origin.y > level) {
            vec3 surface = world + v * pathLength;
            LandscapeHaze haze = landscapeAerialPerspective(origin, surface);
            wet = (wet / (LANDSCAPE_WATER_IOR * LANDSCAPE_WATER_IOR) + landscapeWaterGlint(surface, v)) * haze.transmittance + haze.inscatter;
        }
        radiance += wet * submerged;
    }
    return radiance;
}

// terrain shadows, terrain sky occlusion and the occluders of terrain-reflected light, once per lit fragment. Callers stay in uniform control
// flow (main branches on uniforms only) and call it after the appearance: evaluated at the top of main, its live results measured 1.1-1.8 ms
// slower on the RTX 3060 (register pressure through the soil lattices)
void terrainVisibility(vec2 world, vec2 dx, vec2 dy, vec3 geometricNormal) {
#if LANDSCAPE_LIGHTING_TIER > 0
    landscapeEvaluateTerrainVisibility(world, dx, dy, geometricNormal);
#endif
}

// unlit diagnostic palettes keep their established display: the exposure they were designed under replaces the scene exposure
vec3 diagnosticDisplay(vec3 color) {
#ifdef TONE_MAPPING
    return color * (1.2 / toneMappingExposure);
#else
    return color;
#endif
}

// AI577 D5 inspection, unlit display colors written after tone mapping like the coverage weights; planning-only cover (nearest native texel) is
// shaded slate. terrain-appearance (6): gray neutral, blue moist and orange dry catena moisture times its weight, cyan coastal wetting, red rock
// exposure. Natural dressing inputs (landscape-dressing-inputs v1 of the display soil weights, the planning cover and the fine terrain fields of
// the fragment; tier low has neutral fields): composite (7) and single outputs as gray values, grass (8), shrubs (9), trees (10), rock scatter (11)
// and beach debris (12). uSurfaceSoilColors[soil].x holds each soil's dressing host class while a dressing diagnostic is selected.
vec3 terrainInputDiagnostic(Coverage coverage, vec2 world, vec2 dx, vec2 dy, vec3 normal, vec3 positionDx, vec3 positionDy) {
    vec3 color;
    int slot = maskAt(world, false);
    float planning = 0.0;
    if (slot >= 0) {
        vec4 bounds = uMaskBounds[slot];
        vec2 grid = clamp(vec2((world.x - bounds.x) / (bounds.y - bounds.x), (bounds.w - world.y) / (bounds.w - bounds.z)) * (uMaskDimensions - 1.0), vec2(0.0), uMaskDimensions - 1.0);
        int cover = int(texelFetch(uMaskPages, ivec3(ivec2(floor(grid + 0.5)) + ivec2(int(uCoverageSettings.w)), slot), 0).g * 255.0 + 0.5);
        planning = landscapePlanningCoverId(cover) ? 1.0 : 0.0;
    }
    if (uDiagnostic == 6) {
        LandscapeTerrainAppearance terrain = landscapeTerrainAppearance(vLandscapeWorld, normal, max(length(positionDx), length(positionDy)));
        vec2 wetting = landscapeCoastalWetting(vLandscapeWorld.y - uLandscapeSun.w, terrain.reach);
        float moisture = terrain.moisture * terrain.weight;
        color = mix(vec3(0.5), moisture > 0.0 ? vec3(0.13, 0.33, 0.78) : vec3(0.86, 0.55, 0.16), min(1.0, abs(moisture)));
        color = mix(color, vec3(0.2, 0.85, 0.9), wetting.x);
        color = mix(mix(color, vec3(0.85, 0.12, 0.1), min(1.0, 2.0 * terrain.exposure)), vec3(0.2, 0.2, 0.26), 0.35 * planning);
    } else {
        vec4 classes = vec4(0.0);
        for (int soil = 0; soil < 6; soil++) classes += coverageWeight(coverage, soil) * vec4(equal(ivec4(int(uSurfaceSoilColors[soil].x + 0.5)), ivec4(1, 2, 3, 4)));
        classes /= max(coverageTotal(coverage), 1.0e-6);
#if LANDSCAPE_LIGHTING_TIER > 0
        LandscapeTerrainFields fields = landscapeTerrainFieldsAt(world, dx, dy);
#else
        LandscapeTerrainFields fields = landscapeTerrainFieldsNone();
#endif
        LandscapeDressing dressing = landscapeDressingInputs(classes, planning, fields.availability > 0.0 ? fields.wetness : 0.5, fields.rockExposure, fields.skyView, fields.shoreDistance, fields.slopeDegrees);
        if (uDiagnostic == 7) {
            float total = dressing.grass + dressing.shrub + dressing.tree + dressing.rock + dressing.debris;
            vec3 mixed = (dressing.grass * vec3(0.5, 0.82, 0.3) + dressing.shrub * vec3(0.86, 0.66, 0.24) + dressing.tree * vec3(0.08, 0.42, 0.2)
                + dressing.rock * vec3(0.62, 0.66, 0.76) + dressing.debris * vec3(0.95, 0.45, 0.78)) / max(total, 1.0e-4);
            color = mix(mix(vec3(0.36), mixed, min(1.0, total)), vec3(0.2, 0.2, 0.26), 0.85 * planning);
        } else color = vec3(uDiagnostic == 8 ? dressing.grass : uDiagnostic == 9 ? dressing.shrub : uDiagnostic == 10 ? dressing.tree : uDiagnostic == 11 ? dressing.rock
            : uDiagnostic == 12 ? dressing.debris : 0.0);
    }
    return color;
}

void main() {
    vec3 normal = normalize(vLandscapeNormal);
    vec2 world = vLandscapeWorld.xz;
    vec2 dx = dFdx(world), dy = dFdy(world);
    vec3 positionDx = dFdx(vLandscapeWorld), positionDy = dFdy(vLandscapeWorld);
    vec2 warped = uSurfaceWarpEnabled > 0.5 ? world + landscapeSurfaceWarp(world) : world;
    vec2 warpedDx = dFdx(warped), warpedDy = dFdy(warped);
    vec3 color = vec3(0.0);
    if (uDiagnostic == 1) {
        float elevation = clamp((vLandscapeWorld.y - uDiagnosticRange.x) / max(0.001, uDiagnosticRange.y - uDiagnosticRange.x), 0.0, 1.0);
        vec3 low = mix(vec3(0.10, 0.27, 0.29), vec3(0.43, 0.54, 0.28), smoothstep(0.0, 0.45, elevation));
        color = mix(low, vec3(0.82, 0.70, 0.49), smoothstep(0.4, 1.0, elevation));
        float contourHeight = vLandscapeWorld.y / 5.0;
        float contourDistance = abs(fract(contourHeight - 0.5) - 0.5);
        float contour = 1.0 - smoothstep(0.0, max(fwidth(contourHeight) * 1.2, 0.0001), contourDistance);
        color = diagnosticDisplay(mix(color, vec3(0.07, 0.12, 0.13), contour * 0.82));
    } else if (uDiagnostic == 2) {
        vec3 faceNormal = normalize(cross(positionDx, positionDy));
        float slope = acos(clamp(abs(faceNormal.y), 0.0, 1.0)) * 57.2957795;
        color = mix(vec3(0.16, 0.54, 0.34), vec3(0.91, 0.67, 0.17), smoothstep(0.0, 15.0, slope));
        color = diagnosticDisplay(mix(color, vec3(0.81, 0.16, 0.10), smoothstep(15.0, 35.0, slope)));
    } else if (uDiagnostic == 3) {
        float depth = max(0.0, uDiagnosticRange.z - vLandscapeWorld.y);
        color = diagnosticDisplay(depth > 0.0 ? mix(vec3(0.18, 0.63, 0.72), vec3(0.04, 0.12, 0.33), clamp(depth / 10.0, 0.0, 1.0)) : vec3(0.46, 0.48, 0.37));
    } else {
        // the vertex-color fallback until the appearance is ready; both share one lighting call site (AI577 D5: halves the inlined lighting code)
        vec3 albedo = mix(vLandscapeColor, uTint, uLodColor), surfaceNormal = normal, response = vec3(0.0), groundAlbedo = albedo;
        float roughness = 0.9, metalness = 0.0, ao = 1.0, reach = 0.0;
        if (uAppearanceReady > 0.5) {
            Coverage coverage = hierarchyCoverage(world, dx, dy, warped, warpedDx, warpedDy);
            if (uDiagnostic == 5) color = surfaceCoverageColor(coverage);
            else if (uDiagnostic >= 6) color = terrainInputDiagnostic(coverage, world, dx, dy, normal, positionDx, positionDy);
            else {
                SoilSurface surface = appearanceSurface(coverage, world, dx, dy, normal, positionDx, positionDy, groundAlbedo, response, reach);
                albedo = mix(surface.albedo, uTint, uLodColor);
                if (uDiagnostic == 4) albedo = mix(albedo, surfaceLevelColor(world, warped), 0.5);
                surfaceNormal = surface.normal; roughness = surface.roughness; metalness = surface.metalness; ao = surface.ao;
            }
        }
        if (uAppearanceReady < 0.5 || uDiagnostic < 5) {
            terrainVisibility(world, dx, dy, normal);
            color = terrainRadiance(albedo, surfaceNormal, normal, roughness, metalness, ao, response, groundAlbedo, reach);
        }
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    if (uDiagnostic >= 5 && uAppearanceReady > 0.5) gl_FragColor = vec4(color, 1.0);
}
