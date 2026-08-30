varying vec3 vSmartMaterialSurface;
varying vec3 vSmartMaterialEmissive;
varying vec2 vSmartMaterialClearcoat;
varying float vSmartMaterialMapWeight;

void smartMaterialGroupsApplyMap(inout vec4 diffuseColor) {
#ifdef USE_MAP
    vec4 sampledDiffuseColor = texture2D(map, vMapUv);
#ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
#endif
    diffuseColor *= mix(vec4(1.0), sampledDiffuseColor, clamp(vSmartMaterialMapWeight, 0.0, 1.0));
#endif
}

float smartMaterialGroupsClearcoat() {
    return clamp(vSmartMaterialClearcoat.x, 0.0, 1.0);
}

float smartMaterialGroupsClearcoatRoughness() {
    return clamp(vSmartMaterialClearcoat.y, 0.0, 1.0);
}
