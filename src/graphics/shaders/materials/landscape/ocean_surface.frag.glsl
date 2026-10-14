// AI 597 ocean surface fragment program (landscape-ocean-surface-v1): the AI577 water optics on the displaced sea. The normal comes from the
// filtered cascade slopes and the specular roughness from the Cox-Munk base plus the slope variance the mip filtering removed (LEAN), so the
// surface keeps its mean reflectance and its sun glint stays stable at every distance; the sky lookup is blurred by the same removed variance
// through the prefiltered map's mips (the pixel sees the mean sky of its facets, as a camera does), and a reflection that dips below the
// horizon sees the sea's own upwelling colour instead of the bright horizon. The terrain below carries the water column; the surface blends
// over it in display space with its split-sum reflectance as alpha (premultiplied): the reflected sky and the sun glint of the wavy facet,
// with this pixel's share of the in-scattered air light. From below, the Snell window and the deep column of the AI577 reference.
// x: base mean square slope (the unresolved Cox-Munk part), y: LEAN weight of the filtered slope variance, z: horizon band of the reflection
// elevation below which the sea reflects itself, w: texels per radian of the prefiltered sky map (its mips blur the removed variance)
uniform vec4 uOceanOptics;
// verification views (0 shaded): 1 normal, 2 reflectance, 3 reflected sky, 4 glint, 5 slope variance, 6 reflection elevation, 7 depth fades,
// 8 shore wave (weight, crest sharpening, bore strength), 9 foam (density, coverage, sand deposit), 10 the swash sheet (the surface shows the foam),
// 11 the seabed read through the surface (D5), 12 the water just below the surface (the seabed through the column plus the column's light),
// 13 the caustic ratio (half), 14 the crest scattering (red the crest factor, green the view toward the sun, blue the scattering)
uniform int uOceanDebug;
varying vec3 vOceanWorld;
varying vec2 vOceanPlane;

#include <shaderlib:landscape/lighting_visibility>
#include <shaderlib:landscape/lighting>
#include <shaderlib:landscape/atmosphere>
#include <shaderlib:landscape/water_optics>
#include <shaderlib:landscape/ocean_sampling>
#include <shaderlib:landscape/ocean_shore>
#include <shaderlib:landscape/ocean_foam>
#include <shaderlib:landscape/ocean_shading>
#include <shaderlib:landscape/ocean_light>

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
        float visibility = landscapeSunVisibility(vOceanWorld, n, sun);
        vec3 glint = oceanGlint(sun, v, n, meanSquareSlope, f0 * f0) * visibility;
        LandscapeHaze haze = landscapeAerialPerspective(origin, vOceanWorld);
        // the reference's display-space blend: the tone-mapped reflected sky (with this pixel's share of the air light) scaled by the reflectance, plus the
        // tone-mapped glint on top; scaling the radiance before the tone curve would brighten dim reflections by the curve's slope
        // the AI 597 D3 foam: a diffuse layer by its coverage (the state raster plus this fragment's breaker front and folding, through the
        // world-space pattern), opaque where it covers
        float foamDensity = uOceanFoamLook.x > 0.5 ? oceanFoamDensity(vOceanPlane, shore.phase, shore.breaking, surface.folding) : 0.0;
        float coverage = uOceanFoamLook.x > 0.5 ? oceanFoamCoverage(foamDensity, oceanFoamPattern(vOceanPlane, length(fwidth(vOceanPlane)))) : 0.0;
        vec3 foamRadiance = oceanFoamRadiance(n, vOceanWorld, sun, landscapeSkyIrradiance(n), visibility);
        vec3 debugSeabed = vec3(0.0), debugBody = vec3(0.0), debugCaustic = vec3(0.0), debugScatter = vec3(0.0);
#ifdef LANDSCAPE_OCEAN_SCENE
        // AI 597 D5: the seabed through the facet by refraction and the water column along that path (ocean_light.glsl), the upwelling radiance
        // crossing the interface (the transmitted share, over n²), the reflected sky and the glitter, in linear light with this pixel's share of
        // the air light; the water is opaque, the foam a Lambertian layer over it
        OceanWaterBody body = oceanWaterBody(vOceanWorld, vOceanPlane, v, n, clamp(foamDensity + shore.breaking, 0.0, 1.0), length(fwidth(vOceanPlane)));
        // the terrain where the reflection meets it (the beach and the bluff in the water along the coast), from the frame
        vec3 smoothNormal = normalize(vec3(-shore.slope.x, 1.0, -shore.slope.y));
        OceanTerrainReflection terrain = oceanTerrainReflection(vOceanWorld, reflect(-v, smoothNormal));
        sky = mix(sky, terrain.radiance, terrain.weight);
        vec3 transmitted = body.radiance * (1.0 - reflectance) / (LANDSCAPE_WATER_IOR * LANDSCAPE_WATER_IOR);
        // light scattered through a thin crest toward the eye: the facet's height above the level with the train's sharpening, the view toward
        // the sun through it, in the local water's own colour (its deep equilibrium), the transmitted share, under the sun's visibility
        OceanShoreWave crestWave = oceanShoreAt(vOceanPlane);
        // the facet's own height (the cascades and the train sampled here, not the ring vertex's coarse cell) with the train's sharpening
        float footprint = length(fwidth(vOceanPlane));
        float crestHeight = oceanDisplacement(vOceanPlane, footprint).y + oceanShoreDisplacement(vOceanPlane, footprint).y;
        float crest = smoothstep(0.15, 0.8, crestHeight + crestWave.amplitude * crestWave.steep);
        float facing = clamp(dot(-v, sun), 0.0, 1.0);
        float scattering = crest * (0.25 + 0.75 * facing * facing) * uOceanLight.w * visibility;
        transmitted += body.deep * scattering * (1.0 - reflectance);
        debugCaustic = vec3(body.caustic * 0.5); debugScatter = vec3(crest, facing, scattering);
        vec3 radiance = (transmitted + sky * reflectance + glint) * haze.transmittance + haze.inscatter;
        radiance = mix(radiance, foamRadiance * haze.transmittance + haze.inscatter, coverage);
        float alpha = 1.0;
        debugSeabed = body.seabed; debugBody = body.radiance;
#else
        // the D1 display-space blend over the terrain's own column (no frame target: the canvas path)
        vec3 radiance = oceanDisplay(sky * haze.transmittance + haze.inscatter) * reflectance + oceanDisplay(glint * haze.transmittance);
        radiance = mix(radiance, oceanDisplay(foamRadiance * haze.transmittance + haze.inscatter), coverage);
        float alpha = mix(reflectance, 1.0, coverage);
#endif
        // AI 597 D4: over the sand the displaced surface fades out within the first metres inland of the still-water line (the swash sheet
        // draws the water that runs up the beach), so a crest never washes over the beach as a water surface
        float shoreDistance = oceanInside(vOceanPlane, uOceanFieldBounds) ? texture(uOceanField, (vOceanPlane - uOceanFieldBounds.xy) * uOceanFieldBounds.zw).y : 1.0;
        float inland = max(-shoreDistance, 0.0);
        float landFade = 1.0 - smoothstep(0.0, 4.0, inland);
        // and on the land side a crest standing above the sea level is the swash sheet's to draw: it never shows over the beach as a sliver
        if (shoreDistance < 0.0) landFade *= 1.0 - smoothstep(0.0, 0.06, vOceanWorld.y - uOceanLevel);
        radiance *= landFade;
        alpha *= landFade;
        // view 10 is the swash sheet's: the rings leave it uncovered
        if (uOceanDebug == 10) discard;
        if (uOceanDebug > 0) {
            vec3 view = uOceanDebug == 1 ? n * 0.5 + 0.5 : uOceanDebug == 2 ? vec3(reflectance) : uOceanDebug == 3 ? oceanDisplay(sky) : uOceanDebug == 4 ? oceanDisplay(glint)
                : uOceanDebug == 5 ? vec3(surface.variance * 20.0) : uOceanDebug == 6 ? vec3(reflection.y * 0.5 + 0.5) : uOceanDebug == 7 ? vec3(oceanAmplitudeFactors(vOceanPlane).xyz)
                : uOceanDebug == 8 ? vec3(oceanShoreAt(vOceanPlane).weight, oceanShoreAt(vOceanPlane).steep, shore.breaking)
                : uOceanDebug == 11 ? oceanDisplay(debugSeabed) : uOceanDebug == 12 ? oceanDisplay(debugBody) : uOceanDebug == 13 ? debugCaustic : uOceanDebug == 14 ? debugScatter : vec3(min(foamDensity, 1.0), coverage, oceanInside(vOceanPlane, uOceanFieldBounds) ? texture(uOceanFoam, (vOceanPlane - uOceanFieldBounds.xy) * uOceanFieldBounds.zw).g : 0.0);
            // the rings draw opaque in a debug view; alpha 0 is the frame pipeline's sentinel (the final pass passes the view through untouched),
            // the radiance views (3, 4, 11, 12) keep alpha 1 so the final pass tone-maps them with the scene (oceanDisplay is the identity under the target)
            bool radianceView = uOceanDebug == 3 || uOceanDebug == 4 || uOceanDebug == 11 || uOceanDebug == 12;
            gl_FragColor = vec4(view, radianceView ? 1.0 : 0.0);
            return;
        }
        gl_FragColor = vec4(radiance, alpha);
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
