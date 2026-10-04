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
uniform vec4 uSoilScale[6];
uniform vec4 uSoilTiling[6];
uniform vec4 uSoilAlbedo[6];
uniform vec4 uSoilRoughness[6];
uniform vec4 uSoilRange[6];
uniform float uSurfaceBlendEnabled;
uniform vec4 uSurfaceBlendSettings;
uniform float uSoilHeightEnabled[6];
uniform float uSoilResolution[6];
uniform float uBlendResolution;
uniform vec3 uSurfaceLevelColors[8];
uniform vec3 uSurfaceSoilColors[6];
uniform float uSurfaceWarpEnabled;
varying vec3 vLandscapeColor;
varying vec3 vLandscapeNormal;
varying vec3 vLandscapeWorld;

#include <shaderlib:landscape/surface_warp>
#include <shaderlib:landscape/material_clumps>

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

SoilSurface soilSurface(int soil, vec2 world, vec2 worldDx, vec2 worldDy, vec3 normal) {
    vec4 scale = uSoilScale[soil], range = uSoilRange[soil], remap = uSoilRoughness[soil];
    vec4 tiling = uSoilTiling[soil];
    float c = cos(range.w), s = sin(range.w);
    mat2 rotation = mat2(c, s, -s, c);
    float footprint = max(length(worldDx), length(worldDy));
    float macroWeight = smoothstep(tiling.z, tiling.w, footprint);
    vec3 albedo, detailNormal;
    vec4 orm;
    float firstPeriod = macroWeight >= 1.0 ? tiling.y : tiling.x;
    soilTextures(soil, rotation * world / firstPeriod, rotation * worldDx / firstPeriod, rotation * worldDy / firstPeriod, albedo, detailNormal, orm);
    if (macroWeight > 0.0 && macroWeight < 1.0) {
        vec3 macroAlbedo, macroNormal;
        vec4 macroOrm;
        soilTextures(soil, rotation * world / tiling.y, rotation * worldDx / tiling.y, rotation * worldDy / tiling.y, macroAlbedo, macroNormal, macroOrm);
        albedo = mix(albedo, macroAlbedo, macroWeight);
        detailNormal = mix(detailNormal, macroNormal, macroWeight);
        orm = mix(orm, macroOrm, macroWeight);
    }
    albedo = correctedAlbedo(albedo, uSoilAlbedo[soil]);
    detailNormal = detailNormal * 2.0 - 1.0;
    detailNormal.xy = transpose(rotation) * detailNormal.xy * scale.y;
    vec3 tangent = normalize(vec3(normal.y, -normal.x, 0.0));
    vec3 north = normalize(cross(tangent, normal));
    vec3 mapped = normalize(tangent * detailNormal.x + north * detailNormal.y + normal * max(0.01, detailNormal.z));
    float roughness = range.y - range.x > 0.00001 ? clamp((orm.g - range.x) / (range.y - range.x), 0.0, 1.0) : orm.g;
    if (remap.w > 0.5) roughness = 1.0 - roughness;
    roughness = mix(remap.x, remap.y, pow(roughness, remap.z)) * range.z;
    float period = mix(tiling.x, tiling.y, macroWeight);
    float heightDetail = 1.0 - smoothstep(uSurfaceBlendSettings.z, uSurfaceBlendSettings.w, max(footprint, period / uSoilResolution[soil]));
    if (soil == uMaterialBlendIndex) {
        float targetDetail = 1.0 - smoothstep(uSurfaceBlendSettings.z, uSurfaceBlendSettings.w, max(footprint, period / uBlendResolution));
        heightDetail = mix(heightDetail, targetDetail, uMaterialBlend);
    }
    return SoilSurface(albedo, mapped, clamp(roughness, 0.05, 1.0), clamp(max(orm.b, scale.w), 0.0, 1.0), clamp(1.0 - (1.0 - orm.r) * scale.z, 0.0, 1.0),
        mix(0.5, orm.a, uSoilHeightEnabled[soil]), heightDetail * uSoilHeightEnabled[soil]);
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
    return uSurfaceLevelColors[clamp(int(uMaskMeta[current].x + 0.5), 0, 7)];
}

vec3 surfaceCoverageColor(Coverage coverage) {
    return uSurfaceSoilColors[0] * coverage.low.x + uSurfaceSoilColors[1] * coverage.low.y + uSurfaceSoilColors[2] * coverage.low.z
        + uSurfaceSoilColors[3] * coverage.high.x + uSurfaceSoilColors[4] * coverage.high.y + uSurfaceSoilColors[5] * coverage.high.z;
}

SoilSurface appearanceSurface(Coverage coverage, vec2 world, vec2 dx, vec2 dy, vec3 normal) {
    SoilSurface a = emptySurface(), b = emptySurface(), c = emptySurface(), d = emptySurface(), e = emptySurface(), f = emptySurface();
    if (coverage.low.x > 0.0) a = soilSurface(0, world, dx, dy, normal);
    if (coverage.low.y > 0.0) b = soilSurface(1, world, dx, dy, normal);
    if (coverage.low.z > 0.0) c = soilSurface(2, world, dx, dy, normal);
    if (coverage.high.x > 0.0) d = soilSurface(3, world, dx, dy, normal);
    if (coverage.high.y > 0.0) e = soilSurface(4, world, dx, dy, normal);
    if (coverage.high.z > 0.0) f = soilSurface(5, world, dx, dy, normal);
    Coverage heights = Coverage(vec3(a.height, b.height, c.height), vec3(d.height, e.height, f.height));
    Coverage details = Coverage(vec3(a.heightDetail, b.heightDetail, c.heightDetail), vec3(d.heightDetail, e.heightDetail, f.heightDetail));
    coverage = clumpedCoverage(coverage, materialClumpRelief(coverage, heights, details, world, max(length(dx), length(dy))));
    float detail = dot(coverage.low, details.low) + dot(coverage.high, details.high);
    coverage = materialHeightCoverage(coverage, heights, detail);
    SoilSurface surface = emptySurface();
    addSurface(surface, a, coverage.low.x); addSurface(surface, b, coverage.low.y); addSurface(surface, c, coverage.low.z);
    addSurface(surface, d, coverage.high.x); addSurface(surface, e, coverage.high.y); addSurface(surface, f, coverage.high.z);
    surface.normal = normalize(surface.normal);
    return surface;
}

vec3 illuminate(SoilSurface surface) {
    const float PI = 3.14159265359;
    vec3 n = surface.normal, l = normalize(vec3(-0.44, 0.87, -0.22)), v = normalize(cameraPosition - vLandscapeWorld), h = normalize(l + v);
    float nl = max(dot(n, l), 0.0), nv = max(dot(n, v), 0.001), nh = max(dot(n, h), 0.0), vh = max(dot(v, h), 0.0);
    float alpha = surface.roughness * surface.roughness, a2 = alpha * alpha;
    float denominator = nh * nh * (a2 - 1.0) + 1.0;
    float distribution = a2 / max(PI * denominator * denominator, 0.00001);
    float k = (surface.roughness + 1.0) * (surface.roughness + 1.0) / 8.0;
    float geometry = nv / (nv * (1.0 - k) + k) * nl / (nl * (1.0 - k) + k);
    vec3 fresnel0 = mix(vec3(0.04), surface.albedo, surface.metalness);
    vec3 fresnel = fresnel0 + (1.0 - fresnel0) * pow(1.0 - vh, 5.0);
    vec3 specular = distribution * geometry * fresnel / max(4.0 * nv * nl, 0.001);
    vec3 diffuse = (1.0 - fresnel) * (1.0 - surface.metalness) * surface.albedo / PI;
    vec3 hemisphere = mix(vec3(0.30, 0.34, 0.25), vec3(0.65, 0.78, 0.83), n.y * 0.5 + 0.5);
    return hemisphere * surface.albedo * surface.ao * 0.68 + (diffuse + specular) * vec3(2.7, 2.6, 2.3) * nl;
}

void main() {
    vec3 normal = normalize(vLandscapeNormal);
    vec2 world = vLandscapeWorld.xz;
    vec2 dx = dFdx(world), dy = dFdy(world);
    vec2 warped = uSurfaceWarpEnabled > 0.5 ? world + landscapeSurfaceWarp(world) : world;
    vec2 warpedDx = dFdx(warped), warpedDy = dFdy(warped);
    vec3 color;
    if (uDiagnostic == 1) {
        float elevation = clamp((vLandscapeWorld.y - uDiagnosticRange.x) / max(0.001, uDiagnosticRange.y - uDiagnosticRange.x), 0.0, 1.0);
        vec3 low = mix(vec3(0.10, 0.27, 0.29), vec3(0.43, 0.54, 0.28), smoothstep(0.0, 0.45, elevation));
        color = mix(low, vec3(0.82, 0.70, 0.49), smoothstep(0.4, 1.0, elevation));
        float contourHeight = vLandscapeWorld.y / 5.0;
        float contourDistance = abs(fract(contourHeight - 0.5) - 0.5);
        float contour = 1.0 - smoothstep(0.0, max(fwidth(contourHeight) * 1.2, 0.0001), contourDistance);
        color = mix(color, vec3(0.07, 0.12, 0.13), contour * 0.82);
    } else if (uDiagnostic == 2) {
        vec3 faceNormal = normalize(cross(dFdx(vLandscapeWorld), dFdy(vLandscapeWorld)));
        float slope = acos(clamp(abs(faceNormal.y), 0.0, 1.0)) * 57.2957795;
        color = mix(vec3(0.16, 0.54, 0.34), vec3(0.91, 0.67, 0.17), smoothstep(0.0, 15.0, slope));
        color = mix(color, vec3(0.81, 0.16, 0.10), smoothstep(15.0, 35.0, slope));
    } else if (uDiagnostic == 3) {
        float depth = max(0.0, uDiagnosticRange.z - vLandscapeWorld.y);
        color = depth > 0.0 ? mix(vec3(0.18, 0.63, 0.72), vec3(0.04, 0.12, 0.33), clamp(depth / 10.0, 0.0, 1.0)) : vec3(0.46, 0.48, 0.37);
    } else if (uAppearanceReady > 0.5) {
        Coverage coverage = hierarchyCoverage(world, dx, dy, warped, warpedDx, warpedDy);
        if (uDiagnostic == 5) color = surfaceCoverageColor(coverage);
        else {
            SoilSurface surface = appearanceSurface(coverage, world, dx, dy, normal);
            surface.albedo = mix(surface.albedo, uTint, uLodColor);
            if (uDiagnostic == 4) surface.albedo = mix(surface.albedo, surfaceLevelColor(world, warped), 0.5);
            color = illuminate(surface);
        }
    } else {
        float diffuse = max(0.0, dot(normal, normalize(vec3(-0.44, 0.87, -0.22))));
        vec3 hemisphere = mix(vec3(0.32, 0.37, 0.28), vec3(0.65, 0.78, 0.83), normal.y * 0.5 + 0.5);
        color = mix(vLandscapeColor, uTint, uLodColor) * (hemisphere * 0.8 + diffuse * vec3(0.95, 0.91, 0.81));
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    if (uDiagnostic == 5 && uAppearanceReady > 0.5) gl_FragColor = vec4(color, 1.0);
}
