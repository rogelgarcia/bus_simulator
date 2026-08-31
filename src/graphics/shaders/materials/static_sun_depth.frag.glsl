varying highp vec3 vStaticSunWorldPosition;

uniform highp sampler2DArray staticSunDepthTiles;
uniform highp mat4 staticSunDepthWorldToLight;
uniform highp vec3 staticSunDepthPointDirectionWorld;
uniform highp vec3 staticSunDepthPointDirectionView;
uniform highp vec2 staticSunDepthGridOrigin;
uniform highp vec2 staticSunDepthTileCount;
uniform highp vec2 staticSunDepthDepthRange;
uniform highp vec4 staticSunDepthLayout;
uniform highp vec3 staticSunDepthBiasPolicy;
uniform int staticSunDepthDebugMode;

highp vec2 staticSunDepthDecodedDepth( highp vec2 packedDepth ) {
    highp vec2 bytes = floor( packedDepth * 255.0 + 0.5 );
    highp float quantized = bytes.x * 256.0 + bytes.y;
    if ( quantized >= 65535.0 ) return vec2( 0.0, 0.0 );
    return vec2( mix( staticSunDepthDepthRange.x, staticSunDepthDepthRange.y, quantized / 65534.0 ), 1.0 );
}

highp vec3 staticSunDepthReceiverCoordinates( highp vec3 worldPosition ) {
    return ( staticSunDepthWorldToLight * vec4( worldPosition, 1.0 ) ).xyz;
}

highp vec4 staticSunDepthLookup( highp vec3 worldPosition, highp vec3 receiverNormal ) {
    highp vec3 lightPosition = staticSunDepthReceiverCoordinates( worldPosition );
    highp float invalidDepth = staticSunDepthDepthRange.x - 1.0;
    if ( lightPosition.z < staticSunDepthDepthRange.x || lightPosition.z > staticSunDepthDepthRange.y ) {
        return vec4( 0.0, invalidDepth, -1.0, 0.0 );
    }
    highp float tileWorldSize = staticSunDepthLayout.x;
    highp vec2 tileCoordinate = floor( ( lightPosition.xy - staticSunDepthGridOrigin ) / tileWorldSize );
    highp vec2 inRange = step( vec2( 0.0 ), tileCoordinate )
        * ( vec2( 1.0 ) - step( staticSunDepthTileCount, tileCoordinate ) );
    if ( inRange.x * inRange.y < 0.5 ) return vec4( 0.0, invalidDepth, -1.0, 0.0 );

    highp float interiorResolution = staticSunDepthLayout.y;
    highp float paddedResolution = staticSunDepthLayout.z;
    highp float guardTexels = staticSunDepthLayout.w;
    highp vec2 tileMinimum = staticSunDepthGridOrigin + tileCoordinate * tileWorldSize;
    highp vec2 interiorTexel = clamp(
        floor( ( lightPosition.xy - tileMinimum ) * ( interiorResolution / tileWorldSize ) ),
        vec2( 0.0 ),
        vec2( interiorResolution - 1.0 )
    );
    highp float layer = tileCoordinate.y * staticSunDepthTileCount.x + tileCoordinate.x;
    highp vec3 worldNormal = normalize( inverseTransformDirection( receiverNormal, viewMatrix ) );
    highp float receiverBias = staticSunDepthBiasPolicy.x
        + staticSunDepthBiasPolicy.y * ( 1.0 - clamp( dot( worldNormal, normalize( staticSunDepthPointDirectionWorld ) ), -1.0, 1.0 ) );
    highp float kernelRadius = staticSunDepthBiasPolicy.z;
    highp float visibleSamples = 0.0;
    highp float tapSamples = 0.0;
    highp float occupiedSamples = 0.0;
    highp float reconstructedDepth = invalidDepth;
    highp vec2 globalInteriorSize = staticSunDepthTileCount * interiorResolution;

    for ( int y = -1; y <= 1; y ++ ) {
        for ( int x = -1; x <= 1; x ++ ) {
            if ( kernelRadius < 0.5 && ( x != 0 || y != 0 ) ) continue;
            highp vec2 offset = vec2( float( x ), float( y ) ) * kernelRadius;
            tapSamples += 1.0;
            highp vec2 globalTexel = tileCoordinate * interiorResolution + interiorTexel + offset;
            highp vec2 globalInRange = step( vec2( 0.0 ), globalTexel )
                * ( vec2( 1.0 ) - step( globalInteriorSize, globalTexel ) );
            if ( globalInRange.x * globalInRange.y < 0.5 ) continue;
            highp vec2 uv = ( interiorTexel + vec2( guardTexels + 0.5 ) + offset ) / paddedResolution;
            highp vec2 decoded = staticSunDepthDecodedDepth( texture( staticSunDepthTiles, vec3( uv, layer ) ).rg );
            highp float storedDepth = decoded.x;
            if ( decoded.y < 0.5 ) {
                visibleSamples += 1.0;
            } else {
                occupiedSamples += 1.0;
                reconstructedDepth = reconstructedDepth < staticSunDepthDepthRange.x
                    ? storedDepth
                    : min( reconstructedDepth, storedDepth );
                visibleSamples += step( lightPosition.z - receiverBias, storedDepth );
            }
        }
    }

    highp float visibility = visibleSamples / max( tapSamples, 1.0 );
    highp vec2 edgeDistance = min( interiorTexel, vec2( interiorResolution - 1.0 ) - interiorTexel );
    highp float seam = 1.0 - step( kernelRadius, min( edgeDistance.x, edgeDistance.y ) );
    return vec4( visibility, reconstructedDepth, layer, seam + occupiedSamples * 0.0 );
}

highp float staticSunDepthMaxComponent( highp vec3 value ) {
    return max( value.x, max( value.y, value.z ) );
}

highp float staticSunDepthCacheVisibility = 1.0;
highp float staticSunDepthCurrentVisibility = 1.0;
highp float staticSunDepthMaximumVisibilityDifference = 0.0;
highp vec4 staticSunDepthDebugSample = vec4( 1.0, -1.0, -1.0, 0.0 );

void staticSunDepthApplyDirectional(
    inout IncidentLight directLight,
    highp vec3 unshadowedColor,
    highp vec3 receiverNormal
) {
    highp float directionMatch = step(
        0.9995,
        dot( normalize( directLight.direction ), normalize( staticSunDepthPointDirectionView ) )
    );
    if ( directionMatch < 0.5 ) return;
    highp float denominator = max( staticSunDepthMaxComponent( unshadowedColor ), 0.000001 );
    staticSunDepthCurrentVisibility = clamp( staticSunDepthMaxComponent( directLight.color ) / denominator, 0.0, 1.0 );
    staticSunDepthDebugSample = staticSunDepthLookup( vStaticSunWorldPosition, receiverNormal );
    staticSunDepthCacheVisibility = staticSunDepthDebugSample.x;
    staticSunDepthMaximumVisibilityDifference = max(
        staticSunDepthMaximumVisibilityDifference,
        abs( staticSunDepthCurrentVisibility - staticSunDepthCacheVisibility )
    );
    directLight.color *= staticSunDepthCacheVisibility;
}

highp vec3 staticSunDepthDebugColor( highp vec3 normalColor, highp vec3 receiverNormal ) {
    if ( staticSunDepthDebugMode == 0 ) return normalColor;
    highp vec3 lightPosition = staticSunDepthReceiverCoordinates( vStaticSunWorldPosition );
    highp vec4 sampleValue = staticSunDepthLookup( vStaticSunWorldPosition, receiverNormal );
    if ( staticSunDepthDebugMode == 1 ) return vec3( sampleValue.x );
    if ( staticSunDepthDebugMode == 2 ) return fract( vec3( sampleValue.z * 0.6180339, sampleValue.z * 0.3819660, sampleValue.z * 0.2360680 ) );
    if ( staticSunDepthDebugMode == 3 ) return sampleValue.y < staticSunDepthDepthRange.x ? vec3( 0.0 ) : vec3( ( sampleValue.y - staticSunDepthDepthRange.x ) / ( staticSunDepthDepthRange.y - staticSunDepthDepthRange.x ) );
    if ( staticSunDepthDebugMode == 4 ) {
        highp vec2 receiverGrid = ( lightPosition.xy - staticSunDepthGridOrigin )
            / ( staticSunDepthTileCount * staticSunDepthLayout.x );
        highp float receiverDepth = ( lightPosition.z - staticSunDepthDepthRange.x )
            / ( staticSunDepthDepthRange.y - staticSunDepthDepthRange.x );
        return clamp( vec3( receiverGrid, receiverDepth ), 0.0, 1.0 );
    }
    if ( staticSunDepthDebugMode == 5 ) return sampleValue.z < 0.0 ? vec3( 1.0, 0.0, 1.0 ) : vec3( 0.0, 1.0, 0.0 );
    if ( staticSunDepthDebugMode == 6 ) {
        highp vec3 worldNormal = normalize( inverseTransformDirection( receiverNormal, viewMatrix ) );
        return vec3( clamp( staticSunDepthBiasPolicy.x + staticSunDepthBiasPolicy.y * ( 1.0 - clamp( dot( worldNormal, normalize( staticSunDepthPointDirectionWorld ) ), -1.0, 1.0 ) ), 0.0, 1.0 ) );
    }
    if ( staticSunDepthDebugMode == 7 ) return sampleValue.z < 0.0 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 0.2, 0.0 );
    if ( staticSunDepthDebugMode == 8 ) return vec3( sampleValue.w, 0.0, 1.0 - sampleValue.w );
    if ( staticSunDepthDebugMode == 9 ) return vec3( staticSunDepthMaximumVisibilityDifference );
    return normalColor;
}
