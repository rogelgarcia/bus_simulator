if (lightingDiagnosticOutput == 1) outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
if (lightingDiagnosticOutput == 2) outgoingLight = diffuseColor.rgb;
if (lightingDiagnosticOutput == 6) outgoingLight = reflectedLight.indirectDiffuse;
if (lightingDiagnosticOutput == 7) outgoingLight = reflectedLight.directDiffuse;
if (lightingDiagnosticOutput == 8) outgoingLight = reflectedLight.directSpecular;
if (lightingDiagnosticOutput == 9) outgoingLight = reflectedLight.indirectSpecular;
if (lightingDiagnosticOutput == 10) outgoingLight = inverseTransformDirection(normal, viewMatrix) * .5 + .5;
if (lightingDiagnosticOutput == 11) {
    #ifdef STANDARD
    outgoingLight = vec3(material.roughness);
    #else
    outgoingLight = vec3(-1.0);
    #endif
}
if (lightingDiagnosticOutput == 12) {
    outgoingLight = vec3(1.0);
    #ifdef USE_AOMAP
    #ifdef USE_MATVAR
    outgoingLight = vec3((mvMatVarSampleTexture2D(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0);
    #else
    outgoingLight = vec3((texture2D(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0);
    #endif
    #endif
}
if (lightingDiagnosticOutput >= 3 && lightingDiagnosticOutput <= 5) {
    outgoingLight = vec3(-1.0);
    #ifdef RECEIVER_INDIRECT_LAYERS
    if (vReceiverAtlas.w > .5 && receiverIndirectEnabled != 0) {
        if (lightingDiagnosticOutput == 3) outgoingLight = vReceiverAtlas.xyz;
        if (lightingDiagnosticOutput == 4) outgoingLight = receiverIndirectValue;
        if (lightingDiagnosticOutput == 5) outgoingLight = vec3(receiverLod);
    }
    #endif
}
#include <opaque_fragment>
