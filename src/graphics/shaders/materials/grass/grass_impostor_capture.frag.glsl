// Retain the source's unoriented normal so relighting follows the visible leaf side.
#if GRASS_IMPOSTOR_CAPTURE_CHANNEL == 1
    vec3 grassImpostorNormal = normal;
    #ifdef DOUBLE_SIDED
        grassImpostorNormal *= faceDirection;
    #endif
    grassImpostorNormal *= dot(grassImpostorNormal, vGrassImpostorFacingNormal) < 0.0 ? -1.0 : 1.0;
    grassImpostorNormal = normalize(grassImpostorNormal * mat3(viewMatrix));
    gl_FragColor = vec4(grassImpostorNormal * 0.5 + 0.5, diffuseColor.a);
#elif GRASS_IMPOSTOR_CAPTURE_CHANNEL == 2
    float grassImpostorBlade = smoothstep(0.12, 0.28, vGrassImpostorSourceUv.y);
    float grassImpostorMargin = smoothstep(0.1, 0.8, abs(2.0 * vGrassImpostorSourceUv.x - 1.0));
    float grassImpostorTransmission = mix(0.35, mix(0.50, 0.64, grassImpostorMargin), grassImpostorBlade);
    gl_FragColor = vec4(grassImpostorBlade, roughnessFactor, grassImpostorTransmission, diffuseColor.a);
#else
    gl_FragColor = diffuseColor;
#endif
gl_FragColor.rgb *= gl_FragColor.a;
#if GRASS_IMPOSTOR_CAPTURE_CHANNEL == 2
    gl_FragColor.a *= getShadowMask();
#endif
