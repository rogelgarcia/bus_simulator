varying highp vec3 vStaticSunWorldPosition;

void staticSunDepthTransferWorldPosition( highp vec3 transformedPosition ) {
    highp vec4 worldPosition = vec4( transformedPosition, 1.0 );
    #ifdef USE_BATCHING
        worldPosition = getBatchingMatrix( batchId ) * worldPosition;
    #endif
    #ifdef USE_INSTANCING
        worldPosition = instanceMatrix * worldPosition;
    #endif
    vStaticSunWorldPosition = ( modelMatrix * worldPosition ).xyz;
}
