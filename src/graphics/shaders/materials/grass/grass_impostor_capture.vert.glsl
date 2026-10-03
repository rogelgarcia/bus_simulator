// Source leaf UVs remain independent of the impostor projection.
#include <uv_vertex>
vGrassImpostorSourceUv = uv;
#ifdef GRASS_IMPOSTOR_HAS_FACING_NORMAL
    vGrassImpostorFacingNormal = normalMatrix * grassFacingNormal;
#else
    vGrassImpostorFacingNormal = normalMatrix * normal;
#endif
