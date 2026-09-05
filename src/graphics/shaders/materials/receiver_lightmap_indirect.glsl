if (receiverIndirectEnabled != 0 && vReceiverAtlas.w > 0.5) {
    vec3 replacement = receiverIrradiance(receiverIndirectAtlas) * BRDF_Lambert(material.diffuseColor);
    receiverDiffuseDifference += replacement - reflectedLight.indirectDiffuse;
    reflectedLight.indirectDiffuse = replacement;
}
