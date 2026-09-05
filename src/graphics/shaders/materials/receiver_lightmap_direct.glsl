{
    vec3 receiverPreviousDirect = reflectedLight.directDiffuse;
    RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    #ifdef RECEIVER_ATLAS_HYBRID_SUN
    if (receiverDirectEnabled != 0 && vReceiverAtlas.w > 0.5 && staticSunDepthEnabled != 0
        && dot(normalize(directLight.direction), normalize(staticSunDepthPointDirectionView)) > 0.9995) {
        vec3 replacement = receiverIrradiance(receiverDirectAtlas) * BRDF_Lambert(material.diffuseColor) * dynamicSunShadowVisibility;
        receiverDiffuseDifference += receiverPreviousDirect + replacement - reflectedLight.directDiffuse;
        reflectedLight.directDiffuse = receiverPreviousDirect + replacement;
    }
    #endif
}
