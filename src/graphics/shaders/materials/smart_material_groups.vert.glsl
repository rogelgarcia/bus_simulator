attribute vec3 smartMaterialSurface;
attribute vec3 smartMaterialEmissive;
attribute vec2 smartMaterialClearcoat;
attribute float smartMaterialMapWeight;

varying vec3 vSmartMaterialSurface;
varying vec3 vSmartMaterialEmissive;
varying vec2 vSmartMaterialClearcoat;
varying float vSmartMaterialMapWeight;

void smartMaterialGroupsTransfer() {
    vSmartMaterialSurface = smartMaterialSurface;
    vSmartMaterialEmissive = smartMaterialEmissive;
    vSmartMaterialClearcoat = smartMaterialClearcoat;
    vSmartMaterialMapWeight = smartMaterialMapWeight;
}
