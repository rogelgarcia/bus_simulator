// All source blades are baked in their patch's object frame.
#include <normal_fragment_maps>
#ifdef DOUBLE_SIDED
    normal *= faceDirection;
#endif
normal = normalize(normal * mat3(viewMatrix));
