// A fixed 8×8 screen-door mask: neighboring LODs keep complementary samples.
// Discard before material sampling/lighting; no transparency sorting or frame-varying noise.
if (vGrassTransitionCoverage.x < 1.0 || vGrassTransitionCoverage.y > 0.0) {
    ivec2 grassTransitionPixel = ivec2(gl_FragCoord.xy) & 7;
    int grassTransitionRank = 0;
    for (int bit = 0; bit < 3; bit++) {
        int x = (grassTransitionPixel.x >> bit) & 1;
        int y = (grassTransitionPixel.y >> bit) & 1;
        grassTransitionRank |= ((x ^ y) * 2 + y) << (4 - 2 * bit);
    }
    float grassTransitionSample = (float(grassTransitionRank) + 0.5) / 64.0;
    if (grassTransitionSample >= vGrassTransitionCoverage.x || grassTransitionSample < vGrassTransitionCoverage.y) discard;
}
