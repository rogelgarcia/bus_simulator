varying vec2 vGrassTransitionCoverage;
#ifdef GRASS_PROJECTED_CANOPY_BLEND
varying vec3 vGrassTransitionCanopyRay;
uniform float grassTransitionBlendStarts[5];
uniform float grassTransitionBlendEnds[5];
#endif
