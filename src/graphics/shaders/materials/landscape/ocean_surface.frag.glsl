// AI 597 ocean surface fragment program (landscape-ocean-surface-v1): the AI577 water optics on the displaced sea. The normal comes from the
// filtered cascade slopes and the specular roughness from the Cox-Munk base plus the slope variance the mip filtering removed (LEAN), so the
// surface keeps its mean reflectance and its sun glint stays stable at every distance; the sky lookup is blurred by the same removed variance
// through the prefiltered map's mips (the pixel sees the mean sky of its facets, as a camera does), and a reflection that dips below the
// horizon sees the sea's own upwelling colour instead of the bright horizon. The terrain below carries the water column; the surface blends
// over it in display space with its split-sum reflectance as alpha (premultiplied): the reflected sky and the sun glint of the wavy facet,
// with this pixel's share of the in-scattered air light. From below, the Snell window and the deep column of the AI577 reference.
#ifdef LANDSCAPE_WATER_REFLECTION
uniform sampler2D uLandscapeSkyReflection;
uniform mat3 uLandscapeSkyReflectionRotation;
#endif
// x: base mean square slope (the unresolved Cox-Munk part), y: LEAN weight of the filtered slope variance, z: horizon band of the reflection
// elevation below which the sea reflects itself, w: texels per radian of the prefiltered sky map (its mips blur the removed variance)
uniform vec4 uOceanOptics;
// verification views (0 shaded): 1 normal, 2 reflectance, 3 reflected sky, 4 glint, 5 slope variance, 6 reflection elevation, 7 depth fades,
// 8 shore wave (weight, crest sharpening, bore strength)
uniform int uOceanDebug;
varying vec3 vOceanWorld;
varying vec2 vOceanPlane;

#include <shaderlib:landscape/lighting_visibility>
#include <shaderlib:landscape/lighting>
#include <shaderlib:landscape/atmosphere>
#include <shaderlib:landscape/water_optics>
#include <shaderlib:landscape/ocean_sampling>
#include <shaderlib:landscape/ocean_shore>

// sky radiance along a direction, blurred by the mip of the angular spread beyond the map's own GGX lobe
vec3 oceanSkyRadiance(vec3 direction, float lod) {
#ifdef LANDSCAPE_WATER_REFLECTION
    vec3 game = uLandscapeSkyReflectionRotation * direction;
    vec2 uv = vec2(atan(game.z, game.x) * (0.5 * LANDSCAPE_RECIPROCAL_PI) + 0.5, asin(clamp(game.y, -1.0, 1.0)) * LANDSCAPE_RECIPROCAL_PI + 0.5);
    return textureLod(uLandscapeSkyReflection, uv, lod).rgb;
#else
    return landscapeSkyIrradiance(direction) * LANDSCAPE_RECIPROCAL_PI;
#endif
}

// Cox-Munk sun glitter of a facet: the slopes are Gaussian (Beckmann facet distribution with alpha^2 = the mean square slope), Schlick Fresnel
// and Smith-Beckmann masking (Walter et al. 2007), times the sun's cosine; unlike GGX its tail vanishes away from the mirror direction, so the
// glitter stays where the sea reflects the sun instead of veiling the whole sea when the camera looks toward the sun
float oceanBeckmannShadowing(float cosine, float alpha) {
    float a = cosine / (alpha * sqrt(max(1.0 - cosine * cosine, 1.0e-8)));
    return a < 1.6 ? (3.535 * a + 2.181 * a * a) / (1.0 + 2.276 * a + 2.577 * a * a) : 1.0;
}

vec3 oceanGlint(vec3 sun, vec3 v, vec3 n, float meanSquareSlope, float f0) {
    vec3 h = normalize(sun + v);
    float nh = max(dot(n, h), 1.0e-4), nl = max(dot(n, sun), 0.0), nv = max(dot(n, v), 1.0e-3), vh = max(dot(v, h), 0.0);
    float alpha2 = max(meanSquareSlope, 1.0e-5), alpha = sqrt(alpha2), tan2 = (1.0 - nh * nh) / (nh * nh);
    float d = exp(-tan2 / alpha2) / (LANDSCAPE_PI * alpha2 * nh * nh * nh * nh);
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
    float masking = oceanBeckmannShadowing(nl, alpha) * oceanBeckmannShadowing(nv, alpha);
    return uLandscapeSunIrradiance.rgb * d * fresnel * masking / (4.0 * nv);
}

vec3 oceanDisplay(vec3 radiance) {
#ifdef TONE_MAPPING
    radiance = toneMapping(radiance);
#endif
    return linearToOutputTexel(vec4(radiance, 1.0)).rgb;
}

void main() {
    if (oceanCoverage(vOceanPlane) <= 0.0) discard;
    vec3 origin, v;
    float distance;
    landscapeViewRay(vOceanWorld, origin, v, distance);
    OceanSurfaceSample surface = oceanSurfaceAt(vOceanPlane);
    // the AI 597 D2 shore wave tilts the facet with the cascades (its slope is analytic, so its own band limit follows the pixel footprint and
    // the unresolved part joins the LEAN roughness)
    OceanShoreSlope shore = oceanShoreSlopeAt(vOceanPlane, length(fwidth(vOceanPlane)));
    surface.slope += shore.slope;
    surface.variance += shore.variance;
    vec3 n = normalize(vec3(-surface.slope.x, 1.0, -surface.slope.y));
    // a facet tilted away from a grazing view still faces the eye above the water (the crest in front would hide it; it never shows the sea's
    // underside): bend the normal toward the view ray up to a small cosine instead of switching to the underwater branch
    float facing = dot(n, v);
    if (origin.y >= vOceanWorld.y - 0.02 && facing < 0.05) n = normalize(n + v * (0.05 - facing));
    float meanSquareSlope = uOceanOptics.x + uOceanOptics.y * surface.variance;
    float roughness = sqrt(sqrt(meanSquareSlope));
    float f0 = (LANDSCAPE_WATER_IOR - 1.0) / (LANDSCAPE_WATER_IOR + 1.0);
    if (origin.y >= vOceanWorld.y - 0.02) {
        float cosine = max(dot(n, v), 1.0e-3);
        vec2 fab = landscapeDfg(cosine, roughness);
        float reflectance = f0 * f0 * fab.x + fab.y;
        vec3 reflection = landscapeDominantReflection(n, v, roughness);
        // the map is prefiltered at the water's Cox-Munk lobe (the unresolved base); the slope variance the mips removed spreads the reflection
        // direction by twice the slope deviation, so the lookup averages that many map texels (a mip level per doubling)
        float spread = 2.0 * sqrt(uOceanOptics.y * surface.variance);
        float lod = log2(max(2.0 * spread * uOceanOptics.w, 1.0));
        vec3 above = oceanSkyRadiance(normalize(vec3(reflection.x, max(reflection.y, 0.0), reflection.z)), lod);
        vec3 upwelling = landscapeWaterColumn(1.0e4, 1.0e4, 0.0).inscatter;
        vec3 sky = mix(upwelling, above, smoothstep(-uOceanOptics.z, 0.25 * uOceanOptics.z, reflection.y));
        vec3 sun = uLandscapeSun.xyz;
        vec3 glint = oceanGlint(sun, v, n, meanSquareSlope, f0 * f0) * landscapeSunVisibility(vOceanWorld, n, sun);
        LandscapeHaze haze = landscapeAerialPerspective(origin, vOceanWorld);
        // the reference's display-space blend: the tone-mapped reflected sky (with this pixel's share of the air light) scaled by the reflectance, plus the
        // tone-mapped glint on top; scaling the radiance before the tone curve would brighten dim reflections by the curve's slope
        vec3 radiance = oceanDisplay(sky * haze.transmittance + haze.inscatter) * reflectance + oceanDisplay(glint * haze.transmittance);
        if (uOceanDebug > 0) {
            vec3 view = uOceanDebug == 1 ? n * 0.5 + 0.5 : uOceanDebug == 2 ? vec3(reflectance) : uOceanDebug == 3 ? oceanDisplay(sky) : uOceanDebug == 4 ? oceanDisplay(glint)
                : uOceanDebug == 5 ? vec3(surface.variance * 20.0) : uOceanDebug == 6 ? vec3(reflection.y * 0.5 + 0.5) : uOceanDebug == 7 ? vec3(oceanAmplitudeFactors(vOceanPlane).xyz)
                : vec3(oceanShoreAt(vOceanPlane).weight, oceanShoreAt(vOceanPlane).steep, shore.breaking);
            gl_FragColor = vec4(view, 1.0);
            return;
        }
        gl_FragColor = vec4(radiance, reflectance);
    } else {
        vec3 down = -n;
        float cosine = clamp(dot(down, v), 0.0, 1.0), internal = landscapeWaterFresnel(cosine, LANDSCAPE_WATER_IOR, 1.0);
        vec3 refracted = refract(-v, down, LANDSCAPE_WATER_IOR);
        vec3 transmitted = internal < 1.0 ? oceanSkyRadiance(normalize(refracted), 0.0) * (1.0 - internal) * LANDSCAPE_WATER_IOR * LANDSCAPE_WATER_IOR : vec3(0.0);
        vec3 upwelling = landscapeWaterColumn(1.0e4, 1.0e4, 0.0).inscatter;
        float startDepth = max(uLandscapeSunIrradiance.w - origin.y, 0.0);
        LandscapeWaterColumn column = landscapeWaterColumn(distance, -startDepth, startDepth);
        gl_FragColor = vec4(oceanDisplay((transmitted + internal * upwelling) * column.transmittance + column.inscatter), 1.0);
    }
}
