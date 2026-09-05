if (receiverIndirectEnabled != 0 && vReceiverAtlas.w > .5) {
    vec3 replacement = receiverIndirectValue * BRDF_Lambert(material.diffuseColor);
    if (receiverDebugMode == 7) receiverDiffuseDifference += replacement - reflectedLight.indirectDiffuse;
    reflectedLight.indirectDiffuse = replacement;
}
