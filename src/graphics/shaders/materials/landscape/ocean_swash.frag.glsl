// AI 597 D4 swash sheet fragment program (landscape-ocean-swash-v1): the wet beach over the dry sand the terrain drew. Under the moving water
// sheet the fragment is a thin film: the reflected sky by its Fresnel reflectance and the sun glitter of a wet surface; on wet sand the
// Lekner-Dorf darkening of the AI577 D5 calibrated wet surface (through the sand's representative albedo) with the glossy film of saturated
// sand; the foam at the sheet's front and the foam the backwash left (its lifetime from the sheet's own cycles, scaled by the shoreline's
// supply in the D3 state) as the D3 Lambertian layer; the wrack line as a faint band. The sheet is blended premultiplied over the terrain, composed in
// linear light over the sand's representative radiance: the alpha carries the display ratio of the wet sand under the reflection (the sand
// shows through by its wet ratio), the colour the display increment of the reflection, the glitter and the foam over it, since the terrain's
// pixel is display-encoded. Dry, unfilmed sand is discarded so the terrain keeps its own pixels.
// debug views: 10 swash (wetness, film, front foam)
uniform vec4 uOceanOptics;
uniform int uOceanDebug;
varying vec3 vOceanWorld;
varying vec2 vOceanPlane;
varying float vOceanHeight;

#include <shaderlib:landscape/lighting_visibility>
#include <shaderlib:landscape/lighting>
#include <shaderlib:landscape/atmosphere>
#include <shaderlib:landscape/water_optics>
#include <shaderlib:landscape/ocean_sampling>
#include <shaderlib:landscape/ocean_shore>
#include <shaderlib:landscape/ocean_foam>
#include <shaderlib:landscape/ocean_shading>
#include <shaderlib:landscape/ocean_swash>

void main() {
    if (!oceanInside(vOceanPlane, uOceanFieldBounds)) discard;
    OceanSwash swash = oceanSwashAt(vOceanPlane, vOceanHeight);
    vec2 uv = (vOceanPlane - uOceanFieldBounds.xy) * uOceanFieldBounds.zw;
    float supply = uOceanFoamLook.x > 0.5 ? texture(uOceanFoam, uv).g : 0.0;
    float deposit = supply * swash.deposit;
    if (swash.wetness <= 0.002 && swash.film <= 0.002 && deposit <= 0.01 && swash.wrack <= 0.002) discard;
    vec3 origin, v;
    float distance;
    landscapeViewRay(vOceanWorld, origin, v, distance);
    // the film's ripples: the finest cascade's slopes at the sheet's share (a flowing sheet carries the surface's capillary ripples, not its
    // swell), so the sun breaks into glitter on it instead of one smooth lobe; the ripples' unresolved variance joins the sheet's slope
    // variance; saturated sand without a film keeps the flat normal and its calibrated roughness
#if LANDSCAPE_OCEAN_CASCADES > 3
    vec4 ripple = texture(uOceanDerivatives3, vOceanPlane * uOceanCascadeInfo[3].x);
#elif LANDSCAPE_OCEAN_CASCADES > 2
    vec4 ripple = texture(uOceanDerivatives2, vOceanPlane * uOceanCascadeInfo[2].x);
#elif LANDSCAPE_OCEAN_CASCADES > 1
    vec4 ripple = texture(uOceanDerivatives1, vOceanPlane * uOceanCascadeInfo[1].x);
#else
    vec4 ripple = texture(uOceanDerivatives0, vOceanPlane * uOceanCascadeInfo[0].x);
#endif
    float rippleShare = uOceanSwashFoam.w * swash.film;
    vec2 rippleSlope = ripple.xy * rippleShare;
    float rippleVariance = max(ripple.w * rippleShare * rippleShare - dot(rippleSlope, rippleSlope), 0.0);
    vec3 n = normalize(vec3(-rippleSlope.x, 1.0, -rippleSlope.y));
    vec3 sun = uLandscapeSun.xyz;
    float visibility = landscapeSunVisibility(vOceanWorld, n, sun);
    LandscapeHaze haze = landscapeAerialPerspective(origin, vOceanWorld);
    // the sand darkens by the calibrated wet ratio (the terrain's Lekner-Dorf film over a representative sand albedo), the wrack line a little more
    float wetRatio = LANDSCAPE_TERRAIN_WET_SURFACE.w / (1.0 - LANDSCAPE_WATER_INTERNAL_REFLECTANCE * LANDSCAPE_OCEAN_SWASH_SAND_ALBEDO);
    float dark = mix(1.0, wetRatio, pow(swash.wetness, LANDSCAPE_TERRAIN_WETTING.w)) * (1.0 - 0.25 * swash.wrack);
    // the glossy film: the water sheet itself, or the film of saturated sand (the lower part of the wetting band)
    float gloss = max(swash.film, smoothstep(0.55, 1.0, swash.wetness) * 0.6);
    float cosine = max(dot(n, v), 1.0e-3), f0 = (LANDSCAPE_WATER_IOR - 1.0) / (LANDSCAPE_WATER_IOR + 1.0);
    float fresnel = (f0 * f0 + (1.0 - f0 * f0) * pow(1.0 - cosine, 5.0)) * gloss;
    vec3 reflection = reflect(-v, n);
    vec3 sky = oceanSkyRadiance(normalize(vec3(reflection.x, max(reflection.y, 0.02), reflection.z)), 0.0);
    // the water sheet is nearly a mirror (a calm-water slope variance); saturated sand keeps the calibrated wet roughness
    float slopes = mix(LANDSCAPE_TERRAIN_WET_SURFACE.x * LANDSCAPE_TERRAIN_WET_SURFACE.x, uOceanSwashFoam.z + rippleVariance, swash.film);
    vec3 glint = oceanGlint(sun, v, n, slopes, f0 * f0) * visibility * gloss;
    // the composition in linear light over the sand's representative radiance, carried to the terrain's display-encoded pixel as a display
    // ratio (the wet sand under the reflection, the alpha) and a display increment (what the reflection and the glitter add over it, the
    // colour): exact for sand at the representative albedo, the display slope there for the rest; the pixel keeps its own air light
    vec3 sandLinear = LANDSCAPE_OCEAN_SWASH_SAND_ALBEDO * LANDSCAPE_RECIPROCAL_PI * (uLandscapeSunIrradiance.rgb * max(dot(n, sun), 0.0) * visibility + landscapeSkyIrradiance(n));
    vec3 base = sandLinear * dark * (1.0 - fresnel);
    vec3 lit = base + (sky * fresnel + glint) * haze.transmittance;
    const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
    vec3 baseDisplay = oceanDisplay(base);
    float ratio = dot(baseDisplay, luma) / max(dot(oceanDisplay(sandLinear), luma), 1.0e-4);
    vec3 radiance = max(oceanDisplay(lit) - baseDisplay, vec3(0.0));
    float alpha = 1.0 - ratio;
    // the foam at the front of the sheet, the foam it carries and the foam the backwash left, through the D3 pattern
    float density = 1.2 * swash.front + supply * swash.sheetFoam + deposit;
    float coverage = uOceanFoamLook.x > 0.5 ? oceanFoamCoverage(density, oceanFoamPattern(vOceanPlane, length(fwidth(vOceanPlane)))) : 0.0;
    vec3 foamRadiance = oceanFoamRadiance(n, vOceanWorld, sun, landscapeSkyIrradiance(n), visibility);
    radiance = mix(radiance, oceanDisplay(foamRadiance * haze.transmittance + haze.inscatter), coverage);
    alpha = mix(alpha, 1.0, coverage);
    // alpha 0 is the frame pipeline's sentinel: the final pass passes the view through untouched (the sheet draws opaque in a debug view)
    if (uOceanDebug == 10) { gl_FragColor = vec4(swash.wetness, swash.film, swash.front, 0.0); return; }
    if (uOceanDebug > 0) discard;
    gl_FragColor = vec4(radiance, alpha);
}
