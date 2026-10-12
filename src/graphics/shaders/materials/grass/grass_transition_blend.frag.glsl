// The previous coverage fade remains available for comparison. The default
// dissolve bypasses opacity fading and exchanges fully shaded pixels instead.
vec2 grassTransitionCoverage = vGrassTransitionCoverage;
#ifdef GRASS_PROJECTED_CANOPY_BLEND
// Use one point on the view ray for both heights. Interpolated vertex fade weights
// differ between thin blades and large canopy triangles and expose the dark floor.
float grassCanopyRange = length(vGrassTransitionCanopyRay.xz) * abs(cameraPosition.y - vGrassTransitionGroundY - 0.07) / max(abs(vGrassTransitionCanopyRay.y), 0.001);
float grassCanopyFade = smoothstep(grassTransitionBlendStarts[4], grassTransitionBlendEnds[4], grassCanopyRange);
    #if GRASS_TRANSITION_BLEND_LEVEL == 4
    grassTransitionCoverage.y = grassCanopyFade;
    #else
    grassTransitionCoverage.x = grassCanopyFade;
    #endif
#endif
#ifdef GRASS_CANOPY_COLOR_HANDOFF
// Keep the nearest opaque blade and morph its color to the canopy. No changing
// pixel mask, transparent leaf sorting or double coverage in the final handoff.
if (grassCanopyFade >= 1.0) discard;
grassTransitionCoverage.y = 0.0;
#endif
#ifdef GRASS_CANOPY_SURFACE_HANDOFF
diffuseColor.a *= grassCanopyFade;
if (diffuseColor.a <= 0.0) discard;
grassTransitionCoverage.x = 1.0;
#endif
bool grassUseSampleCoverage = false;
#ifdef GRASS_TRANSITION_SAMPLE_COVERAGE
    #if GRASS_TRANSITION_SAMPLE_COVERAGE == 2
        grassUseSampleCoverage = grassTransitionCoverage.x == 1.0;
    #elif GRASS_TRANSITION_SAMPLE_COVERAGE == 3
        grassUseSampleCoverage = true;
    #else
        grassUseSampleCoverage = grassTransitionCoverage.y == 0.0;
    #endif
#endif
#ifdef GRASS_TRANSITION_DISSOLVE
grassUseSampleCoverage = false;
#endif
if (grassUseSampleCoverage) {
    // A concave ramp retains coverage where the two leaf populations do not overlap.
    // Depth-writing, unsorted samples are an approximation, not an exact alpha blend.
    #ifdef GRASS_TRANSITION_ALPHA
        diffuseColor.a *= max(0.0, grassTransitionCoverage.x - grassTransitionCoverage.y);
    #else
        diffuseColor.a *= sqrt(max(0.0, grassTransitionCoverage.x - grassTransitionCoverage.y));
    #endif
    if (diffuseColor.a <= 0.0) discard;
} else if (grassTransitionCoverage.x < 1.0 || grassTransitionCoverage.y > 0.0) {
    #ifdef GRASS_TRANSITION_DISSOLVE
    // Complementary one-pixel coverage preserves opaque leaf color and avoids
    // the repeating eight-pixel grid. Both levels share the same static threshold.
    float grassTransitionSample = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
    #else
    ivec2 grassTransitionPixel = ivec2(gl_FragCoord.xy) & 7;
    int grassTransitionRank = 0;
    for (int bit = 0; bit < 3; bit++) {
        int x = (grassTransitionPixel.x >> bit) & 1;
        int y = (grassTransitionPixel.y >> bit) & 1;
        grassTransitionRank |= ((x ^ y) * 2 + y) << (4 - 2 * bit);
    }
    float grassTransitionSample = (float(grassTransitionRank) + 0.5) / 64.0;
    #endif
    if (grassTransitionSample >= grassTransitionCoverage.x || grassTransitionSample < grassTransitionCoverage.y) discard;
}
