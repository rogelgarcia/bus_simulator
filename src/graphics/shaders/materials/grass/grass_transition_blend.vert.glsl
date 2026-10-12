// Evaluate the decoded, expanded surface rather than the whole one-metre cell.
// This also works on cards that overlap a neighbouring selection cell.
vec4 grassTransitionCenter = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
float grassTransitionRange = length(grassTransitionCenter.xz - cameraPosition.xz);
#ifdef GRASS_PROJECTED_CANOPY_BLEND
vGrassTransitionCanopyRay = grassTransitionCenter.xyz - cameraPosition;
vGrassTransitionGroundY = modelMatrix[3].y;
#endif
#ifdef GRASS_CANOPY_COLOR_HANDOFF
vGrassTransitionCellOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
#endif
vGrassTransitionCoverage = vec2(1.0, 0.0);
#if GRASS_TRANSITION_BLEND_LEVEL > 0
vGrassTransitionCoverage.x = smoothstep(grassTransitionBlendStarts[GRASS_TRANSITION_BLEND_LEVEL - 1],
    grassTransitionBlendEnds[GRASS_TRANSITION_BLEND_LEVEL - 1], grassTransitionRange);
#endif
#if GRASS_TRANSITION_BLEND_LEVEL < 5
vGrassTransitionCoverage.y = smoothstep(grassTransitionBlendStarts[GRASS_TRANSITION_BLEND_LEVEL],
    grassTransitionBlendEnds[GRASS_TRANSITION_BLEND_LEVEL], grassTransitionRange);
#endif
#ifdef GRASS_TRANSITION_STAGGERED
// Exchange individual cards over staggered, short windows. Their stable world
// roots keep most silhouettes opaque instead of thinning every layer together.
float grassCardBlendDistance = length(grassCardCenter.xz - cameraPosition.xz);
float grassCardBlendProgress = smoothstep(grassTransitionBlendStarts[3], grassTransitionBlendEnds[3], grassCardBlendDistance);
float grassCardBlendRank = 0.09 + 0.82 * grassCellPhase.y;
float grassCardBlendWeight = smoothstep(grassCardBlendRank - 0.09, grassCardBlendRank + 0.09, grassCardBlendProgress);
    #if GRASS_TRANSITION_BLEND_LEVEL == 3
        vGrassTransitionCoverage.y = grassCardBlendWeight;
    #else
        vGrassTransitionCoverage.x = grassCardBlendWeight;
    #endif
#endif
