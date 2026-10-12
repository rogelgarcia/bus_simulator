// @section pars
varying vec2 vGrassBoundaryWorld;
// @section apply
vec4 grassBoundaryPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
grassBoundaryPosition = batchingMatrix * grassBoundaryPosition;
#endif
#ifdef USE_INSTANCING
grassBoundaryPosition = instanceMatrix * grassBoundaryPosition;
#endif
vGrassBoundaryWorld = (modelMatrix * grassBoundaryPosition).xz;
