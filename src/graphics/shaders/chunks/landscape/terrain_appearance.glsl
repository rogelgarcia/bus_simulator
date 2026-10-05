// AI577 D5 terrain-driven natural appearance (landscape-terrain-appearance-v1), mirroring LandscapeTerrainAppearance.js. Include through the
// shaderlib directive for landscape/terrain_appearance after landscape/terrain_fields (field sampler, stale cells, the root page in mask slot 0)
// and landscape/lighting (uLandscapeSun.w sea level, uLandscapeResponse.w switch). The landscape-scale appearance layer (catena moisture index,
// deposition, coastal reach, rock-exposure modulation; derived in the appearance worker from the root field page, heights and land cover with
// planning-graded terrain excluded) is the last layer of the terrain-field array, sampled while uTerrainFieldsState.z holds the fields (bit 0)
// and the layer (bit 1). Parameters are compile-time defines of landscapeTerrainAppearanceDefines(); each soil's terrain role rides in
// uSoilScale.x (development in [0, 1] scaling rock exposure and the catena terms, negative for the exposed-rock substrate); uPlanningCover
// (planning-only land-cover bitmask) serves the dressing diagnostics. With the switch off every function returns its neutral value exactly: since
// AI577 D6 the switch is compile-time (LANDSCAPE_TERRAIN_APPEARANCE, defined while it is on) and uLandscapeResponse.w still gates the rock factor.
uniform uvec4 uPlanningCover;

struct LandscapeTerrainAppearance {
    vec2 macro;      // tone and chroma added to the landscape-scale field before the unchanged per-material responses
    float exposure;  // share of each susceptible soil's coverage revealed as rock
    float reach;     // height above sea level wetted by the sea here (meters)
    float moisture;  // catena moisture index of the layer (inspection)
    float weight;    // availability x land x footprint fade of the broad terms (inspection)
};

// cubic B-spline weights of the two bilinear taps per axis and their offsets from the left sample (Sigg & Hadwiger 2005)
void landscapeBSplineTaps(float f, out vec2 weights, out vec2 offsets) {
    float f2 = f * f, f3 = f2 * f, g = 1.0 - f;
    float w0 = g * g * g / 6.0, w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0, w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0, w3 = f3 / 6.0;
    weights = vec2(w0 + w1, w2 + w3);
    offsets = vec2(-1.0 + w1 / (w0 + w1), 1.0 + w3 / (w2 + w3));
}

// C2 cubic B-spline of the landscape-scale appearance layer (root grid, last array layer) from four hardware-bilinear taps
vec4 landscapeAppearanceLayer(vec2 world) {
    vec4 bounds = uMaskBounds[0];
    vec2 intervals = uMaskDimensions - 1.0;
    vec2 grid = clamp(vec2((world.x - bounds.x) / (bounds.y - bounds.x), (bounds.w - world.y) / (bounds.w - bounds.z)) * intervals, vec2(0.0), intervals);
    vec2 base = floor(grid), wx, ox, wy, oy;
    landscapeBSplineTaps(grid.x - base.x, wx, ox);
    landscapeBSplineTaps(grid.y - base.y, wy, oy);
    ivec3 size = textureSize(uTerrainFields, 0);
    vec2 origin = base + uCoverageSettings.w + 0.5;
    float layer = float(size.z - 1);
    vec4 value = vec4(0.0);
    for (int tap = 0; tap < 4; tap++) {
        int i = tap - (tap / 2) * 2, j = tap / 2;
        vec2 uv = (origin + vec2(i == 0 ? ox.x : ox.y, j == 0 ? oy.x : oy.y)) / vec2(size.xy);
        value += (i == 0 ? wx.x : wx.y) * (j == 0 ? wy.x : wy.y) * textureLod(uTerrainFields, vec3(uv, layer), 0.0);
    }
    return value;
}

bool landscapePlanningCoverId(int cover) {
    uint word = cover < 32 ? uPlanningCover.x : cover < 64 ? uPlanningCover.y : cover < 96 ? uPlanningCover.z : uPlanningCover.w;
    return cover < 128 && ((word >> uint(cover - (cover / 32) * 32)) & 1u) == 1u;
}

// 1 away from stale 8 x 8 cells, rising from 0 at a stale cell's border over the fade distance on the fresh side
float landscapeTerrainFreshness(vec2 world) {
    float fresh = 1.0;
    if ((uTerrainFieldsState.x | uTerrainFieldsState.y) != 0u) {
        vec4 root = uMaskBounds[0];
        vec2 cell = vec2(root.y - root.x, root.w - root.z) / LANDSCAPE_TERRAIN_FIELD_STALE_GRID, p = vec2(world.x - root.x, root.w - world.y);
        ivec2 home = ivec2(clamp(floor(p / cell), vec2(0.0), vec2(LANDSCAPE_TERRAIN_FIELD_STALE_GRID - 1.0)));
        float nearest = 1.0e9;
        for (int neighbor = 0; neighbor < 9; neighbor++) {
            ivec2 c = home + ivec2(neighbor - (neighbor / 3) * 3 - 1, neighbor / 3 - 1);
            if (c.x < 0 || c.y < 0 || c.x > 7 || c.y > 7) continue;
            int bit = c.y * 8 + c.x;
            uint word = bit < 32 ? uTerrainFieldsState.x : uTerrainFieldsState.y;
            if (((word >> uint(bit - (bit / 32) * 32)) & 1u) == 0u) continue;
            vec2 low = vec2(c) * cell, high = low + cell;
            nearest = min(nearest, length(max(max(low - p, p - high), vec2(0.0))));
        }
        fresh = smoothstep(0.0, LANDSCAPE_TERRAIN_FRESH_FADE_METERS, nearest);
    }
    return fresh;
}

// Stockdon et al. (2006) R2 runup of the light swell at a beach slope (degrees, capped)
float landscapeRunupHeight(float slopeDegrees) {
    float beta = tan(radians(min(slopeDegrees, LANDSCAPE_TERRAIN_SWELL.z)));
    return 1.1 * (0.35 * beta * LANDSCAPE_TERRAIN_SWELL.y + 0.5 * sqrt(LANDSCAPE_TERRAIN_SWELL.x * (0.563 * beta * beta + 0.004)));
}

// the terrain-driven inputs of one fragment from the appearance layer and its own height and slope; without the layer the coastal reach falls
// back to the runup at the fragment's slope and every broad term stays neutral. AI577 D6: the switch is a compile-time define and the body runs
// unconditionally while it is on. With the diagnostics compiled out of the default program, the former D5 loop of uniform trip count (and an if)
// measured +3 to +5 ms GPU at the inland views d5-hollow-inland, d5-forest-inland and d5-plateau on the RTX 3060, while the unconditional body
// measured 0.3-1.4 ms cheaper than the D5 program there, with identical output (tests/artifacts/screens/landscape/ai577/d6/performance)
LandscapeTerrainAppearance landscapeTerrainAppearance(vec3 position, vec3 normal, float footprint) {
    LandscapeTerrainAppearance result = LandscapeTerrainAppearance(vec2(0.0), 0.0, 0.0, 0.0, 0.0);
#ifdef LANDSCAPE_TERRAIN_APPEARANCE
    {
        float height = position.y - uLandscapeSun.w, slope = degrees(acos(clamp(normal.y, -1.0, 1.0)));
        float availability = 0.0;
        vec4 layer = vec4(0.5, 0.0, 0.0, 0.0);
        if ((uTerrainFieldsState.z & 3u) == 3u) {
            layer = landscapeAppearanceLayer(position.xz);
            availability = landscapeTerrainFieldProgress(0) * landscapeTerrainFreshness(position.xz);
        }
        float spacing = (uMaskBounds[0].y - uMaskBounds[0].x) / (uMaskDimensions.x - 1.0);
        float fade = 1.0 - smoothstep(LANDSCAPE_TERRAIN_FOOTPRINT_FADE.x, LANDSCAPE_TERRAIN_FOOTPRINT_FADE.y, footprint / spacing);
        float weight = availability * smoothstep(LANDSCAPE_TERRAIN_LAND_FADE.x, LANDSCAPE_TERRAIN_LAND_FADE.y, height);
        result.moisture = layer.r * 2.0 - 1.0;
        result.weight = weight * fade;
        result.macro = result.weight * vec2(LANDSCAPE_TERRAIN_RESPONSE.x * result.moisture + LANDSCAPE_TERRAIN_RESPONSE.y * layer.g,
            LANDSCAPE_TERRAIN_RESPONSE.z * result.moisture + LANDSCAPE_TERRAIN_RESPONSE.w * layer.g);
        result.exposure = weight * LANDSCAPE_TERRAIN_ROCK_EXPOSURE.z * smoothstep(LANDSCAPE_TERRAIN_ROCK_EXPOSURE.x, LANDSCAPE_TERRAIN_ROCK_EXPOSURE.y, slope) * layer.a;
        result.reach = mix(landscapeRunupHeight(slope) + LANDSCAPE_TERRAIN_COASTAL.x, layer.b * LANDSCAPE_TERRAIN_COASTAL.y, availability);
    }
#endif
    return result;
}

// rock albedo factor: weathering rinds and lichen on stable gentle outcrops, darker where the catena keeps them moist (moisture: the weighted
// moisture index), and the splash biofilm just above the sea
vec3 landscapeRockFactor(vec3 normal, float height, float reach, float moisture) {
    vec3 factor = vec3(1.0);
    if (uLandscapeResponse.w > 0.5) {
        float slope = degrees(acos(clamp(normal.y, -1.0, 1.0)));
        float weathered = 1.0 - smoothstep(LANDSCAPE_TERRAIN_WEATHERING.x, LANDSCAPE_TERRAIN_WEATHERING.y, slope);
        factor = exp2(LANDSCAPE_TERRAIN_WEATHERING.z * weathered * (1.0 + LANDSCAPE_TERRAIN_WEATHERING.w * clamp(moisture, 0.0, 1.0)))
            * mix(vec3(1.0), LANDSCAPE_TERRAIN_WEATHERED_TINT, weathered);
        float top = max(LANDSCAPE_TERRAIN_BIOFILM.x * reach, 0.01);
        float biofilm = smoothstep(LANDSCAPE_TERRAIN_BIOFILM_FADE.x, LANDSCAPE_TERRAIN_BIOFILM_FADE.y, height) * (1.0 - smoothstep(0.75 * top, top, height))
            * smoothstep(LANDSCAPE_TERRAIN_BIOFILM_FADE.z, LANDSCAPE_TERRAIN_BIOFILM_FADE.w, reach);
        factor = mix(factor, LANDSCAPE_TERRAIN_BIOFILM_TINT * LANDSCAPE_TERRAIN_BIOFILM.y, LANDSCAPE_TERRAIN_BIOFILM.z * biofilm);
    }
    return factor;
}

// moisture (darkening) and water film (gloss) at a height above sea level under a reach
vec2 landscapeCoastalWetting(float height, float reach) {
    if (!(reach > 0.0 && height < reach)) return vec2(0.0);
    return vec2(1.0 - smoothstep(LANDSCAPE_TERRAIN_WETTING.x * reach, reach, height), 1.0 - smoothstep(LANDSCAPE_TERRAIN_WETTING.y * reach, LANDSCAPE_TERRAIN_WETTING.z * reach, height));
}

struct LandscapeWetSurface {
    vec3 albedo;
    vec3 normal;
    float roughness;
    vec3 response;
};

// the wetted surface of the dry radiance path: Lekner-Dorf film darkening with the water optics' interface constants, a smooth specular film
// over the lower swash zone and the natural-ground response of a smooth wet surface; unwetted fragments keep every input exactly
LandscapeWetSurface landscapeCoastalWetSurface(vec3 albedo, vec3 n, vec3 geometricNormal, float roughness, vec3 response, float height, float reach) {
    LandscapeWetSurface surface = LandscapeWetSurface(albedo, n, roughness, response);
    vec2 wetting = landscapeCoastalWetting(height, reach);
    if (wetting.x > 0.0) {
        vec3 wet = albedo * LANDSCAPE_TERRAIN_WET_SURFACE.w / (1.0 - LANDSCAPE_WATER_INTERNAL_REFLECTANCE * albedo);
        surface.albedo = mix(albedo, wet, pow(wetting.x, LANDSCAPE_TERRAIN_WETTING.w));
        surface.normal = normalize(mix(n, geometricNormal, LANDSCAPE_TERRAIN_WET_SURFACE.y * wetting.y));
        surface.roughness = mix(roughness, LANDSCAPE_TERRAIN_WET_SURFACE.x, wetting.y);
        surface.response = vec3(mix(response.x, LANDSCAPE_TERRAIN_WET_SURFACE.z, wetting.x), mix(response.y, 0.0, wetting.y), mix(response.z, 0.0, wetting.x));
    }
    return surface;
}
