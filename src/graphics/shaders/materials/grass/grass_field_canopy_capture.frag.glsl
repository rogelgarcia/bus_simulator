#if GRASS_FIELD_CANOPY_CHANNEL == 3
    gl_FragColor = vec4(vec3(getShadowMask()), 1.0);
#elif GRASS_FIELD_CANOPY_CHANNEL == 1
    vec3 canopyNormal = normal;
    vec3 canopyWorld = normalize(canopyNormal * mat3(viewMatrix));
    gl_FragColor = vec4(vec3(canopyWorld.x, -canopyWorld.z, canopyWorld.y) * 0.5 + 0.5, GRASS_FIELD_CANOPY_LEAF);
#elif GRASS_FIELD_CANOPY_CHANNEL == 2
    vec3 canopySoil = diffuseColor.rgb * (1.0 - GRASS_FIELD_CANOPY_LEAF);
    gl_FragColor = vec4(canopySoil.r, roughnessFactor, canopySoil.g, canopySoil.b);
#else
    float canopyHeight = (cameraPosition - vViewPosition * mat3(viewMatrix)).y;
    gl_FragColor = vec4(diffuseColor.rgb, clamp(canopyHeight / GRASS_FIELD_CANOPY_SOURCE_HEIGHT, 0.0, 1.0));
#endif
