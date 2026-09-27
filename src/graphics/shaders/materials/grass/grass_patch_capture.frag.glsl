// Preserve cutout coverage and source-facing normals in top and side PBR captures.
#if GRASS_PATCH_BAKE_CHANNEL == 1
    vec3 grassCaptureNormal = normal;
    #ifdef DOUBLE_SIDED
        grassCaptureNormal *= faceDirection;
    #endif
    #ifdef GRASS_PATCH_BAKE_FLOOR
        vec3 grassCaptureWorld = normalize(grassCaptureNormal * mat3(viewMatrix));
        grassCaptureNormal = vec3(grassCaptureWorld.x, -grassCaptureWorld.z, grassCaptureWorld.y);
    #endif
    gl_FragColor = vec4(normalize(grassCaptureNormal) * 0.5 + 0.5, diffuseColor.a);
#elif GRASS_PATCH_BAKE_CHANNEL == 4
    gl_FragColor = vec4(vec3(getShadowMask()), diffuseColor.a);
#elif GRASS_PATCH_BAKE_CHANNEL == 3
    float grassCaptureHeight = (cameraPosition - vViewPosition * mat3(viewMatrix)).y;
    gl_FragColor = vec4(vec3(clamp(grassCaptureHeight / GRASS_PATCH_HEIGHT, 0.0, 1.0)), diffuseColor.a);
#elif GRASS_PATCH_BAKE_CHANNEL == 2
    gl_FragColor = vec4(vec3(roughnessFactor), diffuseColor.a);
#else
    gl_FragColor = diffuseColor;
#endif
