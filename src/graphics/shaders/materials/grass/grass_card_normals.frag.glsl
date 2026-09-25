// Flat proxies retain source orientation; source-profile cards follow the blade's actual front/back surface.
#include <normal_fragment_maps>
#if defined(DOUBLE_SIDED) && !defined(GRASS_CARD_SOURCE_FACING)
    normal *= faceDirection;
#endif
