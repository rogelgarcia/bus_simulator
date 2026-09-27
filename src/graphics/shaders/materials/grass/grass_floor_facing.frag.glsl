// Baked leaf surfaces retain their source normal as the view crosses to the underside.
vec4 grassFloorNormalTexel = texture2D(normalMap, vNormalMapUv);
#ifdef GRASS_FLOOR_CAPTURE_FRAME
    // The shared capture stays in its source frame while the carrier cards bend.
    grassFloorNormalTexel.rgb = (grassFloorCaptureToCard * (grassFloorNormalTexel.rgb * 2.0 - 1.0)) * 0.5 + 0.5;
#endif
#include <normal_fragment_maps>
float grassFloorNormalLength = clamp(length(mapN), 0.0, 1.0);
roughnessFactor = min(1.0, sqrt(roughnessFactor * roughnessFactor + 1.0 - grassFloorNormalLength));
#ifdef GRASS_FLOOR_CONTRIBUTIONS
    grassFloorLeafMask = grassFloorNormalTexel.a;
    grassFloorSoilColor = texelRoughness.rba;
#else
    grassFloorLeafMask = smoothstep(0.015, 0.07, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
    grassFloorSoilColor = diffuseColor.rgb * (1.0 - grassFloorLeafMask);
#endif
diffuseColor.rgb = max(diffuseColor.rgb - grassFloorSoilColor, vec3(0.0)) * grassFloorLeafColorScale + grassFloorSoilColor;
#ifdef DOUBLE_SIDED
    normal *= faceDirection;
#endif
#ifdef GRASS_FLOOR_HEIGHT
    float grassFloorHeight = clamp(diffuseColor.a / max(grassFloorLeafMask, 0.0001), 0.0, 1.0);
    grassFloorCanopyExposure = mix(1.0, mix(0.40, 1.85, smoothstep(0.10, 0.85, grassFloorHeight)), GRASS_FLOOR_CONTRAST);
#endif
vec3 grassFloorViewDirection = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
float grassFloorFacingCosine = dot(normal, grassFloorViewDirection);
grassFacingSourceNormal = normal * max(grassFloorNormalLength, 0.35);
grassFacingFrontWeight = smoothstep(-0.10, 0.10, grassFloorFacingCosine);
float grassFloorFacingWeight = 2.0 * grassFacingFrontWeight - 1.0;
vec3 grassFloorViewTangent = grassFloorViewDirection - normal * grassFloorFacingCosine;
grassFloorViewTangent /= max(length(grassFloorViewTangent), 0.00001);
normal = normalize(normal * grassFloorFacingWeight + grassFloorViewTangent * (1.0 - abs(grassFloorFacingWeight)));
normal = normalize(mix(grassFacingSourceNormal, normal,
    grassFloorLeafMask));
