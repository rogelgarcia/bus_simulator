// Atlas texel aspect must not attenuate the captured leaf curvature.
tbn[0] = normalize(tbn[0]);
tbn[1] = normalize(tbn[1]);
#include <normal_fragment_maps>
#ifdef DOUBLE_SIDED
    normal *= faceDirection;
#endif
// Orient the source normal smoothly through grazing views instead of flipping the flat card.
vec3 grassCardView = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
float grassCardCosine = dot(normal, grassCardView);
float grassCardFacing = 2.0 * smoothstep(-0.08, 0.08, grassCardCosine) - 1.0;
vec3 grassCardTangent = grassCardView - normal * grassCardCosine;
normal = normalize(normal * grassCardFacing + grassCardTangent * (1.0 - abs(grassCardFacing)));
