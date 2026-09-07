float dynamicAoFactor = 1.0;
if (dynamicAoEnabled > 0.5 && vDynamicAoParticipant >= 0.0) {
    vec3 dynamicAoWorldNormal = normalize(mat3(dynamicAoViewInverse) * normal);
    float dynamicAoBlocked = dynamicAoWorldContact(vDynamicAoWorldPosition, dynamicAoWorldNormal);
    if (vDynamicAoParticipant > 0.5) {
        dynamicAoBlocked = max(dynamicAoBlocked, dynamicAoSurfaceContact(-vViewPosition, normal));
    }
    dynamicAoFactor = 1.0 - clamp(dynamicAoBlocked * dynamicAoIntensity, 0.0, 0.9);
    reflectedLight.indirectDiffuse *= dynamicAoFactor;
    reflectedLight.indirectSpecular *= dynamicAoFactor;
}
