float dynamicAoFactor = 1.0;
if (dynamicAoEnabled > 0.5 && vDynamicAoParticipant >= 0.0
    && all(greaterThanEqual(vDynamicAoWorldPosition,dynamicAoReachMin))
    && all(lessThanEqual(vDynamicAoWorldPosition,dynamicAoReachMax))) {
    vec3 dynamicAoWorldNormal = normalize(mat3(dynamicAoViewInverse) * normal);
    float dynamicAoBlocked = max(dynamicAoWorldContact(vDynamicAoWorldPosition, dynamicAoWorldNormal),
        dynamicAoSurfaceContact(-vViewPosition));
    // Sun visibility already controls direct lighting. Occluding indirect light
    // must not change that contribution or switch off when the sun appears.
    dynamicAoFactor = 1.0 - clamp(dynamicAoBlocked * dynamicAoIntensity, 0.0, 0.9);
    reflectedLight.indirectDiffuse *= dynamicAoFactor;
    reflectedLight.indirectSpecular *= dynamicAoFactor;
}
