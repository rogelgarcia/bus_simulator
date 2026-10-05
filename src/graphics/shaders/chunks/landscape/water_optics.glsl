// AI577 D5 water optics (landscape-water-optics-v1) of the visual sea-level reference: Fresnel transmission at a flat air-water surface,
// refracted sunlight, and a water column whose radiance relaxes toward the deep-water equilibrium rrs·Ed of Gordon et al. (1988) along the
// exact straight in-water path of a view ray. Visual treatment only: no waves, hydrology or water physics. JavaScript mirrors:
// landscapeWaterFresnel, landscapeWaterRefractedCosine and landscapeWaterColumn in LandscapeLightingModel.js.
struct LandscapeWaterColumn {
    vec3 transmittance;
    vec3 inscatter;
};

// exact unpolarized Fresnel reflectance for light arriving at cosIncidence from the medium of index n1 (total internal reflection gives 1)
float landscapeWaterFresnel(float cosIncidence, float n1, float n2) {
    float cosine = clamp(cosIncidence, 0.0, 1.0), sine2 = (n1 / n2) * (n1 / n2) * (1.0 - cosine * cosine);
    if (sine2 >= 1.0) return 1.0;
    float transmitted = sqrt(1.0 - sine2);
    float s = (n1 * cosine - n2 * transmitted) / (n1 * cosine + n2 * transmitted), p = (n2 * cosine - n1 * transmitted) / (n2 * cosine + n1 * transmitted);
    return 0.5 * (s * s + p * p);
}

// direction toward the sun below a horizontal water surface
vec3 landscapeWaterRefractedSun(vec3 sunDirection) {
    vec3 horizontal = vec3(sunDirection.x, 0.0, sunDirection.z) / LANDSCAPE_WATER_IOR;
    return vec3(horizontal.x, sqrt(max(1.0 - dot(horizontal, horizontal), 0.0)), horizontal.z);
}

float landscapeExponentialIntegral(float rate, float length) {
    float x = rate * length;
    return abs(x) < 1.0e-4 ? length * (1.0 - 0.5 * x) : (1.0 - exp(-x)) / rate;
}

// pathLength: straight in-water view path; descent: depth gained from its start to its end; startDepth: depth where it starts. Tier low
// keeps the deep-water radiance at the path's start as a constant source instead of integrating its decay with depth.
LandscapeWaterColumn landscapeWaterColumn(float pathLength, float descent, float startDepth) {
    vec3 kappa = LANDSCAPE_WATER_ATTENUATION, transmittance = exp(-kappa * pathLength);
    float mu = max(uLandscapeSun.y, 0.0), refracted = max(landscapeWaterRefractedSun(uLandscapeSun.xyz).y, 1.0e-3);
    vec3 sunPlane = uLandscapeSunIrradiance.rgb * mu * (1.0 - landscapeWaterFresnel(mu, 1.0, LANDSCAPE_WATER_IOR));
    vec3 skyPlane = landscapeSkyIrradiance(vec3(0.0, 1.0, 0.0)) * LANDSCAPE_WATER_DIFFUSE_TRANSMISSION;
    vec3 surface = sunPlane + skyPlane;
    vec3 diffuse = kappa * (sunPlane / refracted + skyPlane / LANDSCAPE_WATER_DIFFUSE_COSINE) / max(surface, vec3(1.0e-6));
    vec3 u = LANDSCAPE_WATER_BACKSCATTER / kappa;
    vec3 deep = (LANDSCAPE_WATER_REFLECTANCE_G0 + LANDSCAPE_WATER_REFLECTANCE_G1 * u) * u * surface * exp(-diffuse * startDepth);
#if LANDSCAPE_LIGHTING_TIER == 0
    return LandscapeWaterColumn(transmittance, deep * (1.0 - transmittance));
#else
    vec3 rate = kappa + diffuse * (descent / max(pathLength, 1.0e-4));
    vec3 integral = vec3(landscapeExponentialIntegral(rate.r, pathLength), landscapeExponentialIntegral(rate.g, pathLength), landscapeExponentialIntegral(rate.b, pathLength));
    return LandscapeWaterColumn(transmittance, deep * (kappa + diffuse) * integral);
#endif
}

// split-sum directional albedo of the rough water surface seen along v from above (three.js EnvironmentBRDF with the analytic DFG): the
// fraction of light the surface reflects toward the camera, and the alpha the water material blends with
float landscapeWaterReflectance(vec3 v) {
    float f0 = (LANDSCAPE_WATER_IOR - 1.0) / (LANDSCAPE_WATER_IOR + 1.0);
    vec2 fab = landscapeDfg(max(v.y, 1.0e-4), LANDSCAPE_WATER_ROUGHNESS);
    return f0 * f0 * fab.x + fab.y;
}

// sun glint of the Cox-Munk-rough water surface at point along v (three.js BRDF_GGX, f0 of water). The terrain below adds it before tone
// mapping, divided by the surface transmission so the water material's Fresnel blend restores its radiance: an additive glint blended in
// display space would saturate over bright shallow sand.
vec3 landscapeWaterGlint(vec3 point, vec3 v) {
    vec3 n = vec3(0.0, 1.0, 0.0), sun = uLandscapeSun.xyz;
    float f0 = (LANDSCAPE_WATER_IOR - 1.0) / (LANDSCAPE_WATER_IOR + 1.0);
    vec3 glint = uLandscapeSunIrradiance.rgb * clamp(sun.y, 0.0, 1.0) * landscapeBrdfGgx(sun, v, n, vec3(f0 * f0), LANDSCAPE_WATER_ROUGHNESS);
    return glint * landscapeSunVisibility(point, n, sun) / max(1.0 - landscapeWaterReflectance(v), 1.0e-3);
}

// sun and sky reaching a submerged surface at a depth below the water level: Fresnel-transmitted, refracted and attenuated sunlight, and
// downwelling skylight on the upper half of the surface's hemisphere; the bottom's diffuse light reflected back down by the surface
// (internal reflectance) adds its geometric series, so no separate terrain-reflected light applies below the water
LandscapeLight landscapeUnderwaterLight(vec3 world, vec3 n, vec3 v, float roughness, float depth, vec3 albedo) {
    vec3 sun = uLandscapeSun.xyz, refracted = landscapeWaterRefractedSun(sun), kappa = LANDSCAPE_WATER_ATTENUATION;
    float mu = max(sun.y, 0.0), muWater = max(refracted.y, 1.0e-3);
    vec3 sunIrradiance = uLandscapeSunIrradiance.rgb * (1.0 - landscapeWaterFresnel(mu, 1.0, LANDSCAPE_WATER_IOR)) * (mu / muWater) * exp(-kappa * depth / muWater);
    vec3 downwelling = landscapeSkyIrradiance(vec3(0.0, 1.0, 0.0)) * LANDSCAPE_WATER_DIFFUSE_TRANSMISSION * exp(-kappa * depth / LANDSCAPE_WATER_DIFFUSE_COSINE);
    vec3 recycled = 1.0 / (1.0 - LANDSCAPE_WATER_INTERNAL_REFLECTANCE * albedo * exp(-2.0 * kappa * depth));
    vec3 reflection = landscapeDominantReflection(n, v, roughness);
    return LandscapeLight(refracted, sunIrradiance * recycled * landscapeSunVisibility(world, n, sun), downwelling * recycled * (0.5 + 0.5 * n.y),
        downwelling * (0.5 + 0.5 * reflection.y) * LANDSCAPE_RECIPROCAL_PI, vec3(0.0));
}
