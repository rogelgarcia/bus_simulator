#if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
    #ifdef PHONG
        float busReflectionCosine = saturate(dot(geometryNormal, geometryViewDir));
        float busReflectionFresnel = busReflectionProfile.y + (1.0 - busReflectionProfile.y)
            * pow(1.0 - busReflectionCosine, 5.0);
        reflectedLight.indirectSpecular += getIBLRadiance(geometryViewDir, geometryNormal, busReflectionProfile.x)
            * busReflectionFresnel * busReflectionProfile.z * material.specularStrength;
    #else
        reflectedLight.indirectSpecular *= 1.0 + busReflectionProfile.w;
    #endif
#endif
