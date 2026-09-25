// Reuse the existing roughness sample for a stable structural facing normal.
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
    vec4 grassSurfaceData = texture2D(roughnessMap, vRoughnessMapUv);
    roughnessFactor *= grassSurfaceData.g;
    vec2 grassFacingOct = grassSurfaceData.rb * 2.0 - 1.0;
    vec3 grassFacingNormal = vec3(grassFacingOct, 1.0 - abs(grassFacingOct.x) - abs(grassFacingOct.y));
    float grassFacingFold = clamp(-grassFacingNormal.z, 0.0, 1.0);
    grassFacingNormal.xy += mix(vec2(grassFacingFold), vec2(-grassFacingFold), step(vec2(0.0), grassFacingNormal.xy));
    grassFacingNormal = normalize(normalMatrix * grassFacingNormal);
#endif
