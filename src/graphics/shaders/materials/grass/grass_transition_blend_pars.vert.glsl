// Shared band limits evaluated on the rendered surface inside cached support.
uniform float grassTransitionBlendStarts[5];
uniform float grassTransitionBlendEnds[5];
varying vec2 vGrassTransitionCoverage;
#ifdef GRASS_PROJECTED_CANOPY_BLEND
varying vec3 vGrassTransitionCanopyRay;
#endif
#ifdef GRASS_CANOPY_COLOR_HANDOFF
varying vec2 vGrassTransitionCellOrigin;
#endif
