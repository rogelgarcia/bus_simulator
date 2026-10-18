// AI 597 D5 light through the water (landscape-ocean-v1): the seabed seen through the displaced surface by refraction, the AI577 water column
// along the refracted path with the water type of the place, the caustics the facets focus on the shallow seabed, and the deep colour the
// crests scatter, composed by the surface in linear light (the frame renders to the linear frame target). The seabed is the opaque frame the
// terrain drew lit under water without its column (the terrain hands the column to the sea while the animated surface draws): the eye ray
// refracts at the facet, runs to the seabed level (the still-water depth of the field plus the facet's own height above the level), and the
// frame is read at that point's projection; where the refracted point projects outside the frame or over land, the straight sample behind
// the fragment (the seabed the eye ray hit) stands in. The column is Gordon's (water_optics.glsl) with its constants replaced by the local
// water: the AI577 clear coastal water near the shore, the oceanic water (less chlorophyll and CDOM absorption of blue, molecular
// backscatter) blended in with the still-water depth, and the stirred surf water (sand in suspension: more backscatter, more absorption)
// blended in with the breaking and the foam. Caustics are the irradiance ratio of the refracted sun's mapping through the surface,
// x -> x + d (1 - 1/n) grad h, so 1 / |1 + d (1 - 1/n) laplacian(h)| from the finite differences of the two finest cascades' slopes at the
// surface point the sun ray crossed above the seabed point; they fade with depth (the sun's disc blurs them) and the texture mips average
// them out of the far pixels. They scale the sun's share of the seabed's light (sun against downwelling sky at that depth).
#ifdef LANDSCAPE_OCEAN_SCENE
uniform sampler2D uOceanScene;      // the opaque frame (linear): the seabed as lit under water, the swash sheet over the sand
uniform mat4 uOceanViewProjection;  // the frame camera's view-projection, for the refracted point's frame position
#endif
uniform float uOceanLevel;          // sea level
// x oceanic blend start (still-water depth, m), y oceanic blend full (m), z surf turbidity weight of the stirring, w terrain reflection (1 on)
uniform vec4 uOceanWater;
uniform vec3 uOceanOceanicAttenuation;  // kappa of the oceanic water (m^-1)
uniform vec3 uOceanOceanicBackscatter;  // bb of the oceanic water (m^-1)
uniform vec3 uOceanSurfAttenuation;     // kappa of the stirred surf water
uniform vec3 uOceanSurfBackscatter;     // bb of the stirred surf water
// x caustic contrast, y caustic fade start depth (m), z caustic fade end depth (m), w crest scattering strength
uniform vec4 uOceanLight;

struct OceanWaterType {
    vec3 attenuation;
    vec3 backscatter;
};

struct OceanWaterBody {
    vec3 radiance;    // the water just below the surface along the refracted eye ray (seabed through the column plus the column's own light)
    vec3 seabed;      // the seabed radiance read from the frame
    vec3 deep;        // the deep-water equilibrium radiance of the local water type (its own colour)
    float pathLength; // the in-water path to the seabed (m)
    float depth;      // the seabed below the facet (m)
    float caustic;    // the caustic irradiance ratio applied to the seabed (1 none)
    float refracted;  // 1 where the refracted sample was used, 0 for the straight one
};

// the local water: coastal near the shore, oceanic with the still-water depth, stirred by the surf
OceanWaterType oceanWaterTypeAt(float stillDepth, float stirring) {
    float oceanic = smoothstep(uOceanWater.x, uOceanWater.y, stillDepth);
    float surf = clamp(stirring * uOceanWater.z, 0.0, 1.0);
    vec3 attenuation = mix(mix(LANDSCAPE_WATER_ATTENUATION, uOceanOceanicAttenuation, oceanic), uOceanSurfAttenuation, surf);
    vec3 backscatter = mix(mix(LANDSCAPE_WATER_BACKSCATTER, uOceanOceanicBackscatter, oceanic), uOceanSurfBackscatter, surf);
    return OceanWaterType(attenuation, backscatter);
}

// the AI577 column (water_optics.glsl landscapeWaterColumn) with the local water in place of its constants
LandscapeWaterColumn oceanWaterColumn(float pathLength, float descent, float startDepth, OceanWaterType water) {
    vec3 kappa = water.attenuation, transmittance = exp(-kappa * pathLength);
    float mu = max(uLandscapeSun.y, 0.0), refracted = max(landscapeWaterRefractedSun(uLandscapeSun.xyz).y, 1.0e-3);
    vec3 sunPlane = uLandscapeSunIrradiance.rgb * mu * (1.0 - landscapeWaterFresnel(mu, 1.0, LANDSCAPE_WATER_IOR));
    vec3 skyPlane = landscapeSkyIrradiance(vec3(0.0, 1.0, 0.0)) * LANDSCAPE_WATER_DIFFUSE_TRANSMISSION;
    vec3 surface = sunPlane + skyPlane;
    vec3 diffuse = kappa * (sunPlane / refracted + skyPlane / LANDSCAPE_WATER_DIFFUSE_COSINE) / max(surface, vec3(1.0e-6));
    vec3 u = water.backscatter / kappa;
    vec3 deep = (LANDSCAPE_WATER_REFLECTANCE_G0 + LANDSCAPE_WATER_REFLECTANCE_G1 * u) * u * surface * exp(-diffuse * startDepth);
#if LANDSCAPE_LIGHTING_TIER == 0
    return LandscapeWaterColumn(transmittance, deep * (1.0 - transmittance));
#else
    vec3 rate = kappa + diffuse * (descent / max(pathLength, 1.0e-4));
    vec3 integral = vec3(landscapeExponentialIntegral(rate.r, pathLength), landscapeExponentialIntegral(rate.g, pathLength), landscapeExponentialIntegral(rate.b, pathLength));
    return LandscapeWaterColumn(transmittance, deep * (kappa + diffuse) * integral);
#endif
}

// the Laplacian of one cascade's height at a plane position from the finite differences of its slope texture (the mips average the far pixels)
float oceanCascadeLaplacian(sampler2D derivatives, vec4 info, vec2 xz) {
    float texel = 1.0 / float(textureSize(derivatives, 0).x);
    float step = texel / info.x;
    vec2 uv = xz * info.x;
    float dx = (texture(derivatives, uv + vec2(texel, 0.0)).x - texture(derivatives, uv - vec2(texel, 0.0)).x) / (2.0 * step);
    float dy = (texture(derivatives, uv + vec2(0.0, texel)).y - texture(derivatives, uv - vec2(0.0, texel)).y) / (2.0 * step);
    return dx + dy;
}

// the caustic irradiance ratio at a seabed point: the refracted sun's mapping through the two finest cascades at the surface point above it
// footprint: the pixel's size on the plane (m); past a few centimetres per pixel the cells are smaller than the pixel and fade out
float oceanCausticsAt(vec3 seabedPoint, float depth, vec3 toSun, float footprint) {
    vec2 entry = seabedPoint.xz + toSun.xz * (depth / max(toSun.y, 0.2));
    vec4 factors = oceanAmplitudeFactors(entry);
    float laplacian = 0.0;
#if LANDSCAPE_OCEAN_CASCADES > 3
    laplacian += oceanCascadeLaplacian(uOceanDerivatives3, uOceanCascadeInfo[3], entry) * factors.w;
    laplacian += oceanCascadeLaplacian(uOceanDerivatives2, uOceanCascadeInfo[2], entry) * factors.z;
#elif LANDSCAPE_OCEAN_CASCADES > 2
    laplacian += oceanCascadeLaplacian(uOceanDerivatives2, uOceanCascadeInfo[2], entry) * factors.z;
    laplacian += oceanCascadeLaplacian(uOceanDerivatives1, uOceanCascadeInfo[1], entry) * factors.y;
#elif LANDSCAPE_OCEAN_CASCADES > 1
    laplacian += oceanCascadeLaplacian(uOceanDerivatives1, uOceanCascadeInfo[1], entry) * factors.y;
    laplacian += oceanCascadeLaplacian(uOceanDerivatives0, uOceanCascadeInfo[0], entry) * factors.x;
#else
    laplacian += oceanCascadeLaplacian(uOceanDerivatives0, uOceanCascadeInfo[0], entry) * factors.x;
#endif
    float focusing = 1.0 + (1.0 - 1.0 / LANDSCAPE_WATER_IOR) * depth * laplacian;
    float ratio = 1.0 / max(abs(focusing), 0.25);
    float fade = (1.0 - smoothstep(uOceanLight.y, uOceanLight.z, depth)) * (1.0 - smoothstep(0.03, 0.10, footprint)) * uOceanLight.x;
    return mix(1.0, clamp(ratio, 0.5, 2.0), fade);
}

#ifdef LANDSCAPE_OCEAN_SCENE
struct OceanTerrainReflection {
    vec3 radiance;  // the frame's colour where the mirrored ray met the terrain
    float weight;   // 1 where the terrain is in the reflection and the frame shows it, fading at the frame's edges, 0 for the sky
};

// the terrain in the reflection: the facet's mirrored ray marched in growing steps over the extent's height raster (the field's land heights)
// until it meets land or leaves the extent; where it lands on terrain the frame shows, the frame's colour stands in for the sky. Bounded to
// reflections that stay low (the measurement reflection_hits.mjs: a planar mirror meets terrain in under 2 % of the sea at every review
// pose but the water-level view along the coast, 13 %, rising to a third with the facet slopes), so a reflection that climbs leaves early.
// reflection: the mirrored direction of the smooth surface (the train's slope without the cascades' ripples, so the terrain band in the
// water is coherent instead of flickering with every facet); the weight softens with the ray's clearance over the terrain it passes
OceanTerrainReflection oceanTerrainReflection(vec3 world, vec3 reflection) {
    OceanTerrainReflection result = OceanTerrainReflection(vec3(0.0), 0.0);
    if (uOceanWater.w < 0.5 || reflection.y <= 0.0 || reflection.y > 0.35) return result;
    float step = 4.0, clearance = 1.0e9;
    vec3 point = world, hit = world;
    bool landed = false;
    for (int i = 0; i < 16; i++) {
        point += reflection * step;
        step *= 1.35;
        if (!oceanInside(point.xz, uOceanFieldBounds) || point.y > 80.0) break;
        float land = -oceanDepth(point.xz);
        if (land <= 0.0) continue;
        if (point.y <= land) { landed = true; hit = point; clearance = 0.0; break; }
        if (point.y - land < clearance) { clearance = point.y - land; hit = vec3(point.x, land, point.z); }
    }
    float weight = landed ? 1.0 : 1.0 - smoothstep(0.0, 3.0, clearance);
    if (weight <= 0.0) return result;
    vec4 clip = uOceanViewProjection * vec4(hit, 1.0);
    if (clip.w <= 0.0) return result;
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return result;
    vec2 edge = smoothstep(0.0, 0.08, uv) * smoothstep(0.0, 0.08, 1.0 - uv);
    result.radiance = texture(uOceanScene, uv).rgb;
    result.weight = weight * edge.x * edge.y;
    return result;
}

OceanWaterBody oceanWaterBody(vec3 world, vec2 plane, vec3 v, vec3 n, float stirring, float footprint) {
    float stillDepth = oceanDepth(plane);
    float depth = max(stillDepth + (world.y - uOceanLevel), 0.02);
    vec3 ray = refract(-v, n, 1.0 / LANDSCAPE_WATER_IOR);
    if (dot(ray, ray) < 0.5) ray = -n;
    float pathLength = depth / max(-ray.y, 0.05);
    vec3 point = world + ray * pathLength;
    vec4 clip = uOceanViewProjection * vec4(point, 1.0);
    vec2 size = vec2(textureSize(uOceanScene, 0));
    vec2 straight = gl_FragCoord.xy / size;
    vec2 refracted = clip.xy / max(clip.w, 1.0e-4) * 0.5 + 0.5;
    bool valid = clip.w > 0.0 && all(greaterThanEqual(refracted, vec2(0.0))) && all(lessThanEqual(refracted, vec2(1.0))) && oceanDepth(point.xz) > 0.0;
    vec3 seabed = texture(uOceanScene, valid ? refracted : straight).rgb;
    OceanWaterType water = oceanWaterTypeAt(max(stillDepth, 0.0), stirring);
    // the caustics scale the sun's share of the seabed's light (the sun against the downwelling sky at that depth)
    vec3 toSun = landscapeWaterRefractedSun(uLandscapeSun.xyz);
    float caustic = oceanCausticsAt(point, depth, toSun, footprint);
    float mu = max(uLandscapeSun.y, 0.0), muWater = max(toSun.y, 1.0e-3);
    vec3 sunAtDepth = uLandscapeSunIrradiance.rgb * (1.0 - landscapeWaterFresnel(mu, 1.0, LANDSCAPE_WATER_IOR)) * (mu / muWater) * exp(-water.attenuation * depth / muWater);
    vec3 skyAtDepth = landscapeSkyIrradiance(vec3(0.0, 1.0, 0.0)) * LANDSCAPE_WATER_DIFFUSE_TRANSMISSION * exp(-water.attenuation * depth / LANDSCAPE_WATER_DIFFUSE_COSINE);
    const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
    float sunShare = dot(sunAtDepth, luma) / max(dot(sunAtDepth + skyAtDepth, luma), 1.0e-6);
    seabed *= mix(1.0, caustic, sunShare);
    LandscapeWaterColumn column = oceanWaterColumn(pathLength, depth, 0.0, water);
    vec3 deep = oceanWaterColumn(1.0e4, 1.0e4, 0.0, water).inscatter;
    return OceanWaterBody(seabed * column.transmittance + column.inscatter, seabed, deep, pathLength, depth, caustic, valid ? 1.0 : 0.0);
}
#endif
