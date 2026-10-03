#include <uv_vertex>
vec2 grassPlateUv = grassPlateUvRect.xy + uv * grassPlateUvRect.zw;
#ifdef USE_MAP
    vMapUv = grassPlateUv;
#endif
#ifdef USE_NORMALMAP
    vNormalMapUv = grassPlateUv;
#endif
#ifdef USE_ROUGHNESSMAP
    vRoughnessMapUv = grassPlateUv;
#endif
