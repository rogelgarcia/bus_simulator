// Seeded source colors already reside in the albedo capture.
vec4 grassCardSurface = texture2D(roughnessMap, vRoughnessMapUv);
grassCardBlade = grassCardSurface.r;
grassCardTransmission = grassCardSurface.b;
#include <map_fragment>
