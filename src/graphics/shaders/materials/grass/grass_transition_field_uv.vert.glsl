vec4 grassTransitionWorldPosition = vec4(position, 1.0);
#ifdef USE_INSTANCING
grassTransitionWorldPosition = instanceMatrix * grassTransitionWorldPosition;
#endif
grassTransitionWorldPosition = modelMatrix * grassTransitionWorldPosition;
vec2 grassTransitionUv = (grassTransitionUvMatrix * vec3(grassTransitionWorldPosition.xz, 1.0)).xy;
#define uv grassTransitionUv
#include <uv_vertex>
#undef uv
