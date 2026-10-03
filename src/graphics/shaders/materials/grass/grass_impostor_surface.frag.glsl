vec4 grassImpostorSurfaceSample = textureGrad(grassImpostorSurface, grassImpostorUv, grassImpostorDx, grassImpostorDy);
vec3 grassImpostorSurfaceData = grassImpostorSurfaceSample.rgb / max(grassImpostorColor.a, 0.0001);
float grassImpostorSourceVisibility = clamp(grassImpostorSurfaceSample.a / max(grassImpostorColor.a, 0.0001), 0.0, 1.0);
grassCardBlade = grassImpostorSurfaceData.r;
grassCardTransmission = grassImpostorSurfaceData.b;
float roughnessFactor = clamp(grassImpostorSurfaceData.g, 0.04, 1.0);
