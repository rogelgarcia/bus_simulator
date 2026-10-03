// Defer surface-property sampling until after transparent texels have been rejected.
vec4 grassCardSurface = texture2D(roughnessMap, vRoughnessMapUv);
grassCardBlade = grassCardSurface.r;
grassCardTransmission = grassCardSurface.b;
float roughnessFactor = roughness * grassCardSurface.g;
