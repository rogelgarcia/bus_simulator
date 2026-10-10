// Shared band limits evaluated on the rendered surface inside cached support.
uniform float grassTransitionBlendStarts[5];
uniform float grassTransitionBlendEnds[5];
varying vec2 vGrassTransitionCoverage;
#ifdef GRASS_PROJECTED_CANOPY_BLEND
varying vec3 vGrassTransitionCanopyRay;
#endif
