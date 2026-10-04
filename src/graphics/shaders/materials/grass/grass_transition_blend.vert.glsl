vec4 grassTransitionCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
float grassTransitionRange = length(grassTransitionCenter.xz - cameraPosition.xz);
vGrassTransitionCoverage = vec2(1.0, 0.0);
#if GRASS_TRANSITION_BLEND_LEVEL > 0
vGrassTransitionCoverage.x = smoothstep(grassTransitionBlendStarts[GRASS_TRANSITION_BLEND_LEVEL - 1],
    grassTransitionBlendEnds[GRASS_TRANSITION_BLEND_LEVEL - 1], grassTransitionRange);
#endif
#if GRASS_TRANSITION_BLEND_LEVEL < 4
vGrassTransitionCoverage.y = smoothstep(grassTransitionBlendStarts[GRASS_TRANSITION_BLEND_LEVEL],
    grassTransitionBlendEnds[GRASS_TRANSITION_BLEND_LEVEL], grassTransitionRange);
#endif
