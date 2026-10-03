// Resolve the visible source leaf before mixing its green/dry endpoints.
vec4 grassCardSurface = texture2D(roughnessMap, vRoughnessMapUv);
float grassLeafCode = min(grassCardSurface.r * 4.0, 3.999);
int grassLeafId = int(floor(grassLeafCode));
grassCardBlade = clamp(fract(grassLeafCode) / 0.99, 0.0, 1.0);
grassCardTransmission = grassCardSurface.b;
#ifdef USE_MAP
    vec4 grassGreen = texture2D(map, vMapUv);
    vec3 grassDry = texture2D(grassDryMap, vMapUv).rgb;
    diffuseColor *= vec4(mix(grassGreen.rgb, grassDry, vGrassDryness[grassLeafId]), grassGreen.a);
#endif
