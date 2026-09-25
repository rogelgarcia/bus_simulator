// The structural ribbon chooses the side; grazing normals turn smoothly through the view tangent.
#include <normal_fragment_maps>
#ifdef DOUBLE_SIDED
    normal *= faceDirection;
#endif
vec3 grassViewDirection = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
#ifdef USE_ROUGHNESSMAP
    vec3 grassStructuralNormal = grassFacingNormal;
#else
    vec3 grassStructuralNormal = normal;
#endif
float grassFacingCosine = dot(grassStructuralNormal, grassViewDirection);
grassFacingSourceNormal = normal;
grassFacingFrontWeight = smoothstep(-0.10, 0.10, grassFacingCosine);
float grassFacingWeight = 2.0 * grassFacingFrontWeight - 1.0;
vec3 grassViewTangent = grassViewDirection - grassStructuralNormal * grassFacingCosine;
// The tangent keeps the blend nonzero as opposite-side normals exchange over approximately +/-6 degrees.
normal = normalize(normal * grassFacingWeight + grassViewTangent * (1.0 - abs(grassFacingWeight)));
