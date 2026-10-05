// AI577 D5 game-consistent landscape illumination (landscape-game-lighting-v1): the game's resolved calibrated sun, its calibrated sky as
// irradiance harmonics, and the three.js r183 MeshStandardMaterial Physical BRDF with the analytic split-sum DFG instead of its lookup texture.
// AI577 D5c replaces the Lambertian diffuse and unshadowed GGX of natural ground with the material response of LandscapeMaterialResponse.js
// (EON rough diffuse, normalized Hapke opposition, natural-surface specular shadowing), adds terrain-reflected light and binds the terrain-field
// visibility hooks; a zero response and disabled switches reproduce the D5b shading exactly.
// uLandscapeSky packs per channel (R rows 0-2, G rows 3-5, B rows 6-8) the irradiance coefficients of the polynomial basis
// (1, x, y, z | xz, zy, 3y^2-1, xy | x^2-z^2, P4(y), P6(y)) in landscape space (y up); each channel's last w is its aerial perspective calibration.
uniform vec4 uLandscapeSky[9];
// xyz: unit direction toward the sun in landscape space; w: sea level, the reference altitude of the atmosphere
uniform vec4 uLandscapeSun;
// rgb: sun normal irradiance; w: optical water level (the sea level while the water reference is shown, far below any terrain when hidden)
uniform vec4 uLandscapeSunIrradiance;
// switches, 1 enabled or 0 for the D5b model: x material response, y terrain-reflected light, z terrain-field visibility, w terrain-driven appearance
uniform vec4 uLandscapeResponse;

#define LANDSCAPE_PI 3.141592653589793
#define LANDSCAPE_RECIPROCAL_PI 0.3183098861837907

// band sums of one channel at a unit direction: x band 0, y band 1, z band 2, w the zonal bands 4 and 6 (irradiance units)
vec4 landscapeSkyChannel(vec4 c0, vec4 c1, vec4 c2, vec3 n) {
    float y2 = n.y * n.y;
    float band2 = dot(c1, vec4(n.x * n.z, n.z * n.y, 3.0 * y2 - 1.0, n.x * n.y)) + c2.x * (n.x * n.x - n.z * n.z);
    float zonal = c2.y * ((35.0 * y2 - 30.0) * y2 + 3.0) + c2.z * (((231.0 * y2 - 315.0) * y2 + 105.0) * y2 - 5.0);
    return vec4(c0.x, dot(c0.yzw, n), band2, zonal);
}

// sky irradiance on a surface facing n
vec3 landscapeSkyIrradiance(vec3 n) {
    const vec4 one = vec4(1.0);
    return max(vec3(dot(landscapeSkyChannel(uLandscapeSky[0], uLandscapeSky[1], uLandscapeSky[2], n), one),
        dot(landscapeSkyChannel(uLandscapeSky[3], uLandscapeSky[4], uLandscapeSky[5], n), one),
        dot(landscapeSkyChannel(uLandscapeSky[6], uLandscapeSky[7], uLandscapeSky[8], n), one)), vec3(0.0));
}

// sky radiance convolved with a phase function whose normalized zonal coefficients for bands 0-2 are weights
vec3 landscapeSkyRadianceBands(vec3 direction, vec3 weights) {
    vec3 scale = weights / vec3(LANDSCAPE_PI, 2.0 * LANDSCAPE_PI / 3.0, 0.25 * LANDSCAPE_PI);
    return vec3(dot(landscapeSkyChannel(uLandscapeSky[0], uLandscapeSky[1], uLandscapeSky[2], direction).xyz, scale),
        dot(landscapeSkyChannel(uLandscapeSky[3], uLandscapeSky[4], uLandscapeSky[5], direction).xyz, scale),
        dot(landscapeSkyChannel(uLandscapeSky[6], uLandscapeSky[7], uLandscapeSky[8], direction).xyz, scale));
}

vec3 landscapeSkyAverageRadiance() {
    return vec3(uLandscapeSky[0].x, uLandscapeSky[3].x, uLandscapeSky[6].x) * LANDSCAPE_RECIPROCAL_PI;
}

// view ray of a fragment: perspective cameras from cameraPosition, orthographic cameras along the camera axis from the camera plane
void landscapeViewRay(vec3 world, out vec3 origin, out vec3 toCamera, out float distance) {
    if (isOrthographic) {
        toCamera = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
        distance = max(dot(cameraPosition - world, toCamera), 0.0);
        origin = world + toCamera * distance;
    } else {
        vec3 ray = cameraPosition - world;
        distance = length(ray);
        toCamera = ray / max(distance, 1.0e-4);
        origin = cameraPosition;
    }
}

// Karis' analytic fit of the split-sum environment BRDF (the three.js DFGApprox the dfgLUT replaced)
vec2 landscapeDfg(float dotNV, float roughness) {
    const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
    const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
    vec4 r = roughness * c0 + c1;
    float a004 = min(r.x * r.x, exp2(-9.28 * dotNV)) * r.x + r.y;
    return vec2(-1.04, 1.04) * a004 + r.zw;
}

vec3 landscapeFresnelSchlick(vec3 f0, float dotVH) {
    float fresnel = exp2((-5.55473 * dotVH - 6.98316) * dotVH);
    return f0 * (1.0 - fresnel) + fresnel;
}

// three.js BRDF_GGX: Schlick Fresnel, height-correlated Smith visibility and the GGX distribution (alpha = roughness^2, f90 = 1)
vec3 landscapeBrdfGgx(vec3 l, vec3 v, vec3 n, vec3 f0, float roughness) {
    float alpha = roughness * roughness, a2 = alpha * alpha;
    vec3 h = normalize(l + v);
    float dotNL = clamp(dot(n, l), 0.0, 1.0), dotNV = clamp(dot(n, v), 0.0, 1.0), dotNH = clamp(dot(n, h), 0.0, 1.0), dotVH = clamp(dot(v, h), 0.0, 1.0);
    float gv = dotNL * sqrt(a2 + (1.0 - a2) * dotNV * dotNV), gl = dotNV * sqrt(a2 + (1.0 - a2) * dotNL * dotNL);
    float visibility = 0.5 / max(gv + gl, 1.0e-6), denominator = dotNH * dotNH * (a2 - 1.0) + 1.0;
    return landscapeFresnelSchlick(f0, dotVH) * (visibility * LANDSCAPE_RECIPROCAL_PI * a2 / (denominator * denominator));
}

// three.js BRDF_GGX_Multiscatter (Fdez-Aguera energy compensation from the view and light directional albedos)
vec3 landscapeBrdfGgxMultiscatter(vec3 l, vec3 v, vec3 n, vec3 f0, float roughness) {
    vec2 dfgV = landscapeDfg(clamp(dot(n, v), 0.0, 1.0), roughness), dfgL = landscapeDfg(clamp(dot(n, l), 0.0, 1.0), roughness);
    vec3 fssEssV = f0 * dfgV.x + dfgV.y, fssEssL = f0 * dfgL.x + dfgL.y;
    float emsV = 1.0 - dfgV.x - dfgV.y, emsL = 1.0 - dfgL.x - dfgL.y;
    vec3 favg = f0 + (1.0 - f0) * 0.047619;
    vec3 fms = fssEssV * fssEssL * favg / (1.0 - emsV * emsL * favg + 1.0e-6);
    return landscapeBrdfGgx(l, v, n, f0, roughness) + fms * emsV * emsL;
}

// natural-ground material response (landscape-material-response-v1; JavaScript mirrors in LandscapeMaterialResponse.js). A response is
// vec3(EON diffuse roughness, natural specular shadowing weight, opposition amplitude); zero is the D5b Lambertian diffuse and unshadowed GGX.
// polynomial fit of the Fujii Oren-Nayar directional albedo (EON, Portsmouth et al. 2025)
float landscapeFonAlbedo(float mu, float r) {
    float m = 1.0 - mu;
    return (1.0 + r * m * (0.0571085289 + m * (0.491881867 + m * (-0.332181442 + m * 0.0714429953)))) / (1.0 + LANDSCAPE_FON_C1 * r);
}

// Hapke shadow-hiding opposition at the phase angle between light and view, normalized by its nadir-view hemispherical mean
float landscapeOppositionFactor(float cosPhase, float amplitude) {
    float c = clamp(cosPhase, -1.0, 1.0), halfTangent = sqrt(max(1.0 - c, 0.0) / max(1.0 + c, 1.0e-6));
    return (1.0 + amplitude / (1.0 + halfTangent / LANDSCAPE_OPPOSITION_WIDTH)) / (1.0 + amplitude * LANDSCAPE_OPPOSITION_MEAN);
}

// empirical exp(-tan γ) shadowing of specular reflection by natural surfaces (Maignan et al. 2009), γ the incidence angle on the facet
float landscapeNaturalSpecularShadowing(float cosIncidence, float weight) {
    float c = max(cosIncidence, 1.0e-4);
    return 1.0 + (exp(-sqrt(max(1.0 - c * c, 0.0)) / c) - 1.0) * weight;
}

// EON rough diffuse BRDF: Fujii Oren-Nayar single scattering (with the opposition factor) plus the energy-preserving multiple scattering lobe
vec3 landscapeEonBrdf(vec3 rho, float r, float opposition, vec3 l, vec3 v, vec3 n) {
    float muI = clamp(dot(n, l), 0.0, 1.0), muO = clamp(dot(n, v), 0.0, 1.0), s = dot(l, v) - muI * muO;
    float sOverT = s > 0.0 ? s / max(max(muI, muO), 1.0e-6) : s, af = 1.0 / (1.0 + LANDSCAPE_FON_C1 * r);
    float single = af * (1.0 + r * sOverT) * landscapeOppositionFactor(dot(l, v), opposition);
    float mean = af * (1.0 + LANDSCAPE_FON_C2 * r);
    float lobe = max(1.0e-7, 1.0 - landscapeFonAlbedo(muO, r)) * max(1.0e-7, 1.0 - landscapeFonAlbedo(muI, r)) / max(1.0e-7, 1.0 - mean);
    return (rho * single + rho * rho * mean / (1.0 - rho * (1.0 - mean)) * lobe) * LANDSCAPE_RECIPROCAL_PI;
}

// EON directional albedo under uniform illumination (the ambient diffuse response)
vec3 landscapeEonAlbedo(vec3 rho, float r, float muO) {
    float e = landscapeFonAlbedo(clamp(muO, 0.0, 1.0), r), mean = (1.0 + LANDSCAPE_FON_C2 * r) / (1.0 + LANDSCAPE_FON_C1 * r);
    return rho * e + rho * rho * mean / (1.0 - rho * (1.0 - mean)) * (1.0 - e);
}

// occluders of terrain-reflected light (landscape-terrain-bounce-v1; mirror landscapeTerrainOccluderLight in LandscapeMaterialResponse.js): in each
// stored horizon azimuth the terrain up to the horizon elevation h faces back toward the facet at slope h, lit by the sun on that orientation
// and by the sky of its tilt; azimuths weigh by the cosine-weighted solid angle of their hidden band [0, h] seen from a facet with normal n.
// sun receives the mean sun cosine and sky the mean sky view (horizontal ground, 1, without occluders); returns the summed weight
float landscapeTerrainOccluderLight(vec3 n, vec4 horizonA, vec4 horizonB, out float sun, out float sky) {
    const vec4 cosines = vec4(1.0, 0.7071067811865476, 0.0, -0.7071067811865476), sines = vec4(0.0, 0.7071067811865476, 1.0, 0.7071067811865476);
    vec3 s = uLandscapeSun.xyz;
    vec4 sineA = clamp(horizonA, 0.0, 1.0), sineB = clamp(horizonB, 0.0, 1.0);
    vec4 cosineA = sqrt(1.0 - sineA * sineA), cosineB = sqrt(1.0 - sineB * sineB);
    vec4 facet = n.x * cosines + n.z * sines, toward = s.x * cosines + s.z * sines;
    // the azimuths 180..315 negate the horizontal projections of the first four
    vec4 weightA = max(vec4(0.0), facet * (0.5 * asin(sineA) + 0.5 * sineA * cosineA) + n.y * 0.5 * sineA * sineA);
    vec4 weightB = max(vec4(0.0), -facet * (0.5 * asin(sineB) + 0.5 * sineB * cosineB) + n.y * 0.5 * sineB * sineB);
    float total = dot(weightA, vec4(1.0)) + dot(weightB, vec4(1.0));
    sun = max(s.y, 0.0);
    sky = 1.0;
    if (total > 1.0e-6) {
        sun = (dot(weightA, max(vec4(0.0), cosineA * s.y - sineA * toward)) + dot(weightB, max(vec4(0.0), cosineB * s.y + sineB * toward))) / total;
        sky = (dot(weightA, 0.5 + 0.5 * cosineA) + dot(weightB, 0.5 + 0.5 * cosineB)) / total;
    }
    return total;
}

// terrain-reflected irradiance on a facet (mirror landscapeTerrainBounce), the ground albedo included: open ground below the horizontal at the
// horizontal sun-and-sky irradiance and, where terrain hides the sky ((1 - V)(1 + n_y) / 2), the occluders of the fragment
vec3 landscapeTerrainBounce(vec3 n, vec3 groundAlbedo, float skyVisibility, vec3 skyUp) {
    vec3 sunIrradiance = uLandscapeSunIrradiance.rgb;
    float horizontalSun = max(uLandscapeSun.y, 0.0), occluderSun, occluderSky;
    float occluded = landscapeTerrainOccluders(occluderSun, occluderSky) ? (1.0 - skyVisibility) * (0.5 + 0.5 * n.y) : 0.0;
    return groundAlbedo * ((0.5 - 0.5 * n.y) * (sunIrradiance * horizontalSun + skyUp) + occluded * (sunIrradiance * occluderSun + skyUp * occluderSky));
}

#ifdef LANDSCAPE_TERRAIN_FIELDS
// landscape-terrain-visibility-v1: evaluates the terrain fields once per fragment in uniform control flow (screen derivatives of the world
// position and of the sun margin). The sun margin against the azimuth-interpolated horizon is widened by half its screen-space change so terrain
// shadow edges stay antialiased; the sky view is divided by the open-slope term of the field's own slope; the occluders of terrain-reflected
// light are weighed for the geometric normal. A disabled switch, stale or absent fields keep the hooks neutral.
void landscapeEvaluateTerrainVisibility(vec2 world, vec2 dx, vec2 dy, vec3 geometricNormal) {
    LandscapeTerrainFields fields = landscapeTerrainFieldsAt(world, dx, dy);
    float weight = fields.availability * uLandscapeResponse.z;
    vec3 sun = uLandscapeSun.xyz;
    float azimuth = length(sun.xz) > 1.0e-6 ? atan(sun.z, sun.x) : 0.0;
    float margin = asin(clamp(sun.y, -1.0, 1.0)) - asin(clamp(landscapeTerrainHorizonSine(fields, azimuth), 0.0, 1.0));
    float d = clamp(margin / max(LANDSCAPE_TERRAIN_FIELD_SOLAR_RADIUS, 0.5 * fwidth(margin)), -1.0, 1.0);
    landscapeFragmentSunVisibility = mix(1.0, 0.5 + (d * sqrt(1.0 - d * d) + asin(d)) / LANDSCAPE_PI, weight);
    float openSlope = 0.5 + 0.5 * cos(radians(fields.slopeDegrees));
    landscapeFragmentSkyVisibility = mix(1.0, clamp(fields.skyView / max(openSlope, 1.0e-3), 0.0, 1.0), weight);
    landscapeFragmentFieldWeight = weight;
    landscapeTerrainOccluderLight(geometricNormal, fields.horizonSineA, fields.horizonSineB, landscapeFragmentOccluderSun, landscapeFragmentOccluderSky);
}
#endif

// lights reaching a surface: the sun (direction toward it and its irradiance, visibility included), the sky (irradiance for diffuse,
// cosine-filtered radiance along the dominant reflection for specular, open ground included) and the terrain-reflected diffuse irradiance
struct LandscapeLight {
    vec3 sunDirection;
    vec3 sunIrradiance;
    vec3 skyIrradiance;
    vec3 skyRadiance;
    vec3 groundIrradiance;
};

// three.js dominant reflection direction of getIBLRadiance
vec3 landscapeDominantReflection(vec3 n, vec3 v, float roughness) {
    float r2 = roughness * roughness;
    return normalize(mix(reflect(-v, n), n, r2 * r2));
}

// reflected radiance of an opaque surface (three.js RE_Direct_Physical + RE_IndirectSpecular_Physical with the natural-ground response): the
// material ambient occlusion ao and the terrain sky visibility scale ambient diffuse sky light and, through Lagarde's specular occlusion, ambient
// specular light; terrain-reflected light takes the material occlusion only
vec3 landscapeReflectedRadiance(vec3 albedo, vec3 n, vec3 v, float roughness, float metalness, float ao, float skyVisibility, vec3 response, LandscapeLight light) {
    vec3 diffuseColor = albedo * (1.0 - metalness), f0 = mix(vec3(0.04), albedo, metalness), l = light.sunDirection;
    float dotNL = clamp(dot(n, l), 0.0, 1.0), dotNV = clamp(dot(n, v), 0.0, 1.0);
    float shadowing = landscapeNaturalSpecularShadowing(clamp(dot(v, normalize(l + v)), 0.0, 1.0), response.y);
    vec3 direct = light.sunIrradiance * dotNL * (landscapeBrdfGgxMultiscatter(l, v, n, f0, roughness) * shadowing + landscapeEonBrdf(diffuseColor, response.x, response.z, l, v, n));
    vec2 fab = landscapeDfg(dotNV, roughness);
    vec3 single = f0 * fab.x + fab.y;
    float ems = 1.0 - fab.x - fab.y, occlusion = ao * skyVisibility;
    vec3 favg = f0 + (1.0 - f0) * 0.047619;
    vec3 multi = single * favg / (1.0 - ems * favg) * ems;
    float specularOcclusion = clamp(pow(dotNV + occlusion, exp2(-16.0 * roughness - 1.0)) - 1.0 + occlusion, 0.0, 1.0) * landscapeNaturalSpecularShadowing(dotNV, response.y);
    vec3 cosineIrradiance = light.skyIrradiance * LANDSCAPE_RECIPROCAL_PI;
    vec3 ambient = (light.skyRadiance * single + multi * cosineIrradiance) * specularOcclusion
        + landscapeEonAlbedo(diffuseColor, response.x, dotNV) * (1.0 - single - multi) * (cosineIrradiance * occlusion + light.groundIrradiance * (ao * LANDSCAPE_RECIPROCAL_PI));
    return direct + ambient;
}

// sun, sky and terrain-reflected light above the water; groundAlbedo is the surface's material mean albedo standing for the terrain around it
LandscapeLight landscapeAirLight(vec3 world, vec3 n, vec3 v, float roughness, vec3 geometricNormal, vec3 groundAlbedo) {
    vec3 sun = uLandscapeSun.xyz;
    vec3 reflection = landscapeDominantReflection(n, v, roughness);
    vec3 skyRadiance = landscapeSkyIrradiance(reflection) * LANDSCAPE_RECIPROCAL_PI;
#if LANDSCAPE_LIGHTING_TIER > 1
    // horizon occlusion: normal-mapped reflections cannot see sky below the geometric surface
    float horizon = clamp(1.0 + 1.3 * dot(reflect(-v, n), geometricNormal), 0.0, 1.0);
    skyRadiance *= horizon * horizon;
#endif
    vec3 groundIrradiance = vec3(0.0);
    if (uLandscapeResponse.y > 0.5) {
        vec3 skyUp = landscapeSkyIrradiance(vec3(0.0, 1.0, 0.0));
        groundIrradiance = landscapeTerrainBounce(n, groundAlbedo, landscapeSkyVisibility(world, n), skyUp);
        skyRadiance += groundAlbedo * (uLandscapeSunIrradiance.rgb * max(sun.y, 0.0) + skyUp) * ((0.5 - 0.5 * reflection.y) * LANDSCAPE_RECIPROCAL_PI);
    }
    return LandscapeLight(sun, uLandscapeSunIrradiance.rgb * landscapeSunVisibility(world, n, sun), landscapeSkyIrradiance(n), skyRadiance, groundIrradiance);
}
