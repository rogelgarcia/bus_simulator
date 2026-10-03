float litterAo = (texture2D(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0;
float soilAo = (texture2D(litterSoilAo, (litterSoilAoTransform * soilUv).xy).r - 1.0) * litterSoilAoIntensity + 1.0;
float ambientOcclusion = mix(soilAo, litterAo, litterCoverage);
reflectedLight.indirectDiffuse *= ambientOcclusion;
#if defined(USE_ENVMAP) && defined(STANDARD)
    float dotNV = saturate(dot(geometryNormal, geometryViewDir));
    reflectedLight.indirectSpecular *= computeSpecularOcclusion(dotNV, ambientOcclusion, material.roughness);
#endif
