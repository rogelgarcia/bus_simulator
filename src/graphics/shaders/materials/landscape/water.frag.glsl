// AI577 D5 visual sea-level surface (landscape-water-surface-v1): a flat Cox-Munk-rough interface (n = LANDSCAPE_WATER_IOR) reflecting the
// calibrated environment under the game's lighting, with the aerial perspective of its air path. The terrain below already holds the water
// column, the n² radiance change and the sun glint of submerged fragments, so the surface blends over it in display space with its
// split-sum reflectance as alpha (premultiplied): the reflected sky, with this pixel's share of the in-scattered air light.
#ifdef LANDSCAPE_WATER_REFLECTION
// the calibrated sky prefiltered at the water's GGX roughness (LandscapeSkyReflection.js): equirectangular in the environment (game) frame,
// first row at the nadir, u wraps; the rotation turns landscape directions into that frame
uniform sampler2D uLandscapeSkyReflection;
uniform mat3 uLandscapeSkyReflectionRotation;
#endif
varying vec3 vWaterWorld;

#include <shaderlib:landscape/lighting_visibility>
#include <shaderlib:landscape/lighting>
#include <shaderlib:landscape/atmosphere>
#include <shaderlib:landscape/water_optics>

// sky radiance arriving from a landscape direction, prefiltered at the water's GGX roughness, or the cosine-weighted sky harmonics when the
// calibrated environment is unavailable
vec3 waterSkyRadiance(vec3 direction) {
#ifdef LANDSCAPE_WATER_REFLECTION
    vec3 game = uLandscapeSkyReflectionRotation * direction;
    vec2 uv = vec2(atan(game.z, game.x) * (0.5 * LANDSCAPE_RECIPROCAL_PI) + 0.5, asin(clamp(game.y, -1.0, 1.0)) * LANDSCAPE_RECIPROCAL_PI + 0.5);
    return textureLod(uLandscapeSkyReflection, uv, 0.0).rgb;
#else
    return landscapeSkyIrradiance(direction) * LANDSCAPE_RECIPROCAL_PI;
#endif
}

vec3 waterDisplay(vec3 radiance) {
#ifdef TONE_MAPPING
    radiance = toneMapping(radiance);
#endif
    return linearToOutputTexel(vec4(radiance, 1.0)).rgb;
}

void main() {
    vec3 origin, v;
    float distance;
    landscapeViewRay(vWaterWorld, origin, v, distance);
    float level = vWaterWorld.y, roughness = LANDSCAPE_WATER_ROUGHNESS;
    if (origin.y >= level) {
        float reflectance = landscapeWaterReflectance(v);
        vec3 sky = waterSkyRadiance(landscapeDominantReflection(vec3(0.0, 1.0, 0.0), v, roughness));
        LandscapeHaze haze = landscapeAerialPerspective(origin, vWaterWorld);
        gl_FragColor = vec4(waterDisplay(sky * haze.transmittance + haze.inscatter) * reflectance, reflectance);
    } else {
        // from below: the Snell window transmits the sky (radiance gains n²), total internal reflection outside it returns the deep column
        float cosine = clamp(-v.y, 0.0, 1.0), internal = landscapeWaterFresnel(cosine, LANDSCAPE_WATER_IOR, 1.0);
        vec3 refracted = refract(-v, vec3(0.0, -1.0, 0.0), LANDSCAPE_WATER_IOR);
        vec3 transmitted = internal < 1.0 ? waterSkyRadiance(normalize(refracted)) * (1.0 - internal) * LANDSCAPE_WATER_IOR * LANDSCAPE_WATER_IOR : vec3(0.0);
        vec3 upwelling = landscapeWaterColumn(1.0e4, 1.0e4, 0.0).inscatter;
        float startDepth = level - origin.y;
        LandscapeWaterColumn column = landscapeWaterColumn(distance, -startDepth, startDepth);
        gl_FragColor = vec4(waterDisplay((transmitted + internal * upwelling) * column.transmittance + column.inscatter), 1.0);
    }
}
