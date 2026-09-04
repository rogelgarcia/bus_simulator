varying highp vec3 vStaticSunWorldPosition;
varying highp vec3 vDynamicSunWorldPosition;
uniform highp vec4 staticSunDepthBiasPolicy;

void staticSunDepthTransferWorldPosition(
    highp vec3 transformedPosition,
    highp vec3 transformedNormal
) {
    highp vec4 worldPosition = vec4( transformedPosition, 1.0 );
    #ifdef USE_BATCHING
        worldPosition = getBatchingMatrix( batchId ) * worldPosition;
    #endif
    #ifdef USE_INSTANCING
        worldPosition = instanceMatrix * worldPosition;
    #endif
    highp vec3 receiverWorldPosition = ( modelMatrix * worldPosition ).xyz;
    vDynamicSunWorldPosition = receiverWorldPosition;
    if ( staticSunDepthBiasPolicy.w > 0.5 ) {
        highp vec3 geometricWorldNormal = normalize(
            inverseTransformDirection( transformedNormal, viewMatrix )
        );
        receiverWorldPosition += geometricWorldNormal * staticSunDepthBiasPolicy.y;
    }
    vStaticSunWorldPosition = receiverWorldPosition;
}
