if (lightingDiagnosticOutput == 1) outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
if (lightingDiagnosticOutput == 2) outgoingLight = diffuseColor.rgb;
if (lightingDiagnosticOutput == 6) outgoingLight = reflectedLight.indirectDiffuse;
if (lightingDiagnosticOutput == 7) outgoingLight = reflectedLight.directDiffuse;
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
