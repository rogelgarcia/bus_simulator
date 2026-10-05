// AI577 D5 aerial perspective (landscape-aerial-perspective-v1): single scattering of the calibrated sky, a model-albedo ground and the sun by
// Rayleigh and Mie exponential layers (constants of the calibrated sky profile), in closed form along straight paths and before tone mapping.
// The per-channel calibration in uLandscapeSky makes an infinitely long horizontal path converge to the HDR's own horizon radiance.
// JavaScript mirror: landscapeAerialPerspective in LandscapeLightingModel.js.
struct LandscapeHaze {
    vec3 transmittance;
    vec3 inscatter;
};

// density-weighted length of a straight path through an exponential layer, altitudes above the sea level
float landscapeOpticalLength(float altitude0, float altitude1, float distance, float scaleHeight) {
    float x = (altitude1 - altitude0) / scaleHeight;
    float shape = abs(x) < 1.0e-3 ? 1.0 - 0.5 * x + x * x / 6.0 : (1.0 - exp(-x)) / x;
    return distance * exp(-altitude0 / scaleHeight) * shape;
}

// isotropic source: mean sky radiance plus a lower hemisphere of model-albedo ground lit by the sun and the sky
vec3 landscapeHazeIsotropicSource() {
    vec3 horizontal = uLandscapeSunIrradiance.rgb * max(uLandscapeSun.y, 0.0) + landscapeSkyIrradiance(vec3(0.0, 1.0, 0.0));
    return landscapeSkyAverageRadiance() + 0.5 * LANDSCAPE_GROUND_ALBEDO * LANDSCAPE_RECIPROCAL_PI * horizontal;
}

// calibrated source radiance of a path whose Rayleigh and Mie layers contribute these extinction depths (tier high convolves the sky with each
// layer's phase function instead of its isotropic average)
vec3 landscapeHazeSource(vec3 direction, vec3 rayleigh, float mie) {
    float mu = dot(direction, uLandscapeSun.xyz), g = LANDSCAPE_MIE_ANISOTROPY;
    float rayleighPhase = 0.05968310365946075 * (1.0 + mu * mu);
    float miePhase = (1.0 - g * g) / (4.0 * LANDSCAPE_PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    vec3 isotropic = landscapeHazeIsotropicSource(), sun = uLandscapeSunIrradiance.rgb;
#if LANDSCAPE_LIGHTING_TIER > 1
    vec3 average = landscapeSkyAverageRadiance();
    vec3 rayleighSky = landscapeSkyRadianceBands(direction, vec3(1.0, 0.0, 0.1)) - average + isotropic;
    vec3 mieSky = landscapeSkyRadianceBands(direction, vec3(1.0, g, g * g)) - average + isotropic;
#else
    vec3 rayleighSky = isotropic, mieSky = isotropic;
#endif
    vec3 calibration = vec3(uLandscapeSky[2].w, uLandscapeSky[5].w, uLandscapeSky[8].w);
    return calibration * (rayleigh * (rayleighSky + rayleighPhase * sun) + mie * (LANDSCAPE_MIE_SCATTERING / LANDSCAPE_MIE_EXTINCTION) * (mieSky + miePhase * sun))
        / max(rayleigh + mie, vec3(1.0e-12));
}

// the radiance an optically infinite path converges to along a direction (sea-level layer ratio): at the horizon it is the HDR's horizon
vec3 landscapeHazeLimit(vec3 direction) {
    return landscapeHazeSource(direction, LANDSCAPE_RAYLEIGH_SCATTERING, LANDSCAPE_MIE_EXTINCTION);
}

LandscapeHaze landscapeAerialPerspective(vec3 origin, vec3 target) {
#if LANDSCAPE_LIGHTING_TIER == 0
    return LandscapeHaze(vec3(1.0), vec3(0.0));
#else
    vec3 ray = target - origin;
    float distance = length(ray);
    vec3 direction = ray / max(distance, 1.0e-4);
    float altitude0 = origin.y - uLandscapeSun.w, altitude1 = target.y - uLandscapeSun.w;
    vec3 rayleigh = LANDSCAPE_RAYLEIGH_SCATTERING * landscapeOpticalLength(altitude0, altitude1, distance, LANDSCAPE_RAYLEIGH_SCALE_HEIGHT);
    float mie = LANDSCAPE_MIE_EXTINCTION * landscapeOpticalLength(altitude0, altitude1, distance, LANDSCAPE_MIE_SCALE_HEIGHT);
    vec3 transmittance = exp(-(rayleigh + mie));
    return LandscapeHaze(transmittance, landscapeHazeSource(direction, rayleigh, mie) * (1.0 - transmittance));
#endif
}
