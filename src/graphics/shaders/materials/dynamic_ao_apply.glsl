float dynamicAoFactor = 1.0;
if (dynamicAoEnabled > 0.5 && vDynamicAoParticipant >= 0.0) {
    vec3 dynamicAoWorldNormal = normalize(mat3(dynamicAoViewInverse) * normal);
    float dynamicAoBlocked = max(dynamicAoWorldContact(vDynamicAoWorldPosition, dynamicAoWorldNormal),
        dynamicAoSurfaceContact(-vViewPosition));
    // Artistic policy: direct-lit surfaces keep the accepted direct+ambient result.
    // Fade the supplementary ambient term out when direct diffuse dominates.
    float directEnergy = dot(reflectedLight.directDiffuse, vec3(0.2126,0.7152,0.0722));
    float ambientEnergy = dot(reflectedLight.indirectDiffuse, vec3(0.2126,0.7152,0.0722));
    float ambientWeight = 1.0-smoothstep(0.1,0.5,directEnergy/max(ambientEnergy,0.0001));
    dynamicAoFactor = 1.0 - clamp(dynamicAoBlocked * dynamicAoIntensity * ambientWeight, 0.0, 0.9);
    reflectedLight.indirectDiffuse *= dynamicAoFactor;
    reflectedLight.indirectSpecular *= dynamicAoFactor;
}
