{
    bool replaceSun = false;
    float receiverSunFactor = 1.0;
    #ifdef RECEIVER_ATLAS_HYBRID_SUN
    replaceSun = receiverDirectEnabled != 0 && vReceiverAtlas.w > .5 && staticSunDepthEnabled != 0
        && dot(normalize(directLight.direction), normalize(staticSunDepthPointDirectionView)) > .9995;
    #if defined(RECEIVER_DIRECTIONAL) && !defined(RECEIVER_FLAT_NORMAL)
    float receiverGeometricCosine = dot(receiverFrame[2], directLight.direction);
    replaceSun = replaceSun && receiverGeometricCosine > .05;
    receiverSunFactor = max(dot(geometryNormal, directLight.direction), 0.0) / max(receiverGeometricCosine, .05);
    #endif
    #endif
    vec3 previousDiffuse = reflectedLight.directDiffuse;
    if (replaceSun && receiverDebugMode != 7 && receiverLightingBlend >= 1.0) {
        PhysicalMaterial specularMaterial = material;
        specularMaterial.diffuseContribution = vec3(0.0);
        RE_Direct(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, specularMaterial, reflectedLight);
    } else {
        RE_Direct(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    }
    #ifdef RECEIVER_ATLAS_HYBRID_SUN
    if (replaceSun) {
        vec3 replacement = receiverDirectValue * receiverSunFactor * BRDF_Lambert(material.diffuseColor) * dynamicSunShadowVisibility;
        if (receiverDebugMode == 7) receiverDiffuseDifference += previousDiffuse + replacement - reflectedLight.directDiffuse;
        reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, previousDiffuse + replacement, receiverLightingBlend);
    }
    #endif
}
