varying vec2 vGrassTransitionCoverage;
#ifdef GRASS_PROJECTED_CANOPY_BLEND
varying vec3 vGrassTransitionCanopyRay;
varying float vGrassTransitionGroundY;
uniform float grassTransitionBlendStarts[5];
uniform float grassTransitionBlendEnds[5];
#endif
#ifdef GRASS_CANOPY_COLOR_HANDOFF
#include <shaderlib:grass/baked_canopy.glsl>
varying vec2 vGrassTransitionCellOrigin;
uniform sampler2D grassHandoffMap;
uniform sampler2D grassHandoffAlternate;
uniform vec3 grassHandoffColor;
#endif
