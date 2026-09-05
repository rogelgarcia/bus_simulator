if (receiverIndirectEnabled == 0 || vReceiverAtlas.w < .5 || receiverDebugMode == 7) {
    RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
}
