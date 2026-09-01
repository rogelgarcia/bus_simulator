varying highp vec3 vStaticSunWorldPosition;

uniform highp sampler2DArray staticSunDepthTiles;
uniform highp mat4 staticSunDepthWorldToLight;
uniform highp vec3 staticSunDepthPointDirectionWorld;
uniform highp vec3 staticSunDepthPointDirectionView;
uniform highp vec2 staticSunDepthGridOrigin;
uniform highp vec2 staticSunDepthTileCount;
uniform highp vec2 staticSunDepthDepthRange;
uniform int staticSunDepthEncodingMode;
uniform highp vec4 staticSunDepthLayout;
uniform highp vec4 staticSunDepthBiasPolicy;
uniform highp vec4 staticSunDepthFilterPolicy;
uniform highp vec4 staticSunDepthSourceMapSizeAndExtent;
uniform highp vec2 staticSunDepthSourceMapRightLight;
uniform highp vec2 staticSunDepthSourceMapUpLight;
uniform int staticSunDepthDebugMode;

highp vec2 staticSunDepthDecodedDepth( highp vec4 packedDepth ) {
    if ( staticSunDepthEncodingMode == 1 ) {
        if ( packedDepth.a < 0.5 ) return vec2( 0.0, 0.0 );
        highp vec3 bytes = floor( packedDepth.rgb * 255.0 + 0.5 );
        highp float quantized = bytes.x * 65536.0 + bytes.y * 256.0 + bytes.z;
        return vec2( mix( staticSunDepthDepthRange.x, staticSunDepthDepthRange.y, quantized / 16777215.0 ), 1.0 );
    }
    highp vec2 bytes = floor( packedDepth.rg * 255.0 + 0.5 );
    highp float quantized = bytes.x * 256.0 + bytes.y;
    if ( quantized >= 65535.0 ) return vec2( 0.0, 0.0 );
    return vec2( mix( staticSunDepthDepthRange.x, staticSunDepthDepthRange.y, quantized / 65534.0 ), 1.0 );
}

highp vec3 staticSunDepthReceiverCoordinates( highp vec3 worldPosition ) {
    return ( staticSunDepthWorldToLight * vec4( worldPosition, 1.0 ) ).xyz;
}

highp float staticSunDepthInterleavedGradientNoise( highp vec2 position ) {
    return fract( 52.9829189 * fract(
        dot( position, vec2( 0.06711056, 0.00583715 ) )
    ) );
}

highp vec2 staticSunDepthVogelDiskSample(
    int sampleIndex,
    int samplesCount,
    highp float phi
) {
    const highp float goldenAngle = 2.399963229728653;
    highp float radius = sqrt(
        ( float( sampleIndex ) + 0.5 ) / float( samplesCount )
    );
    highp float theta = float( sampleIndex ) * goldenAngle + phi;
    return vec2( cos( theta ), sin( theta ) ) * radius;
}

highp float staticSunDepthCompareGlobalTexel(
    highp ivec2 globalTexel,
    highp float comparisonDepth,
    inout highp float occupiedSamples,
    inout highp float reconstructedDepth
) {
    highp ivec2 interiorResolution = ivec2( staticSunDepthLayout.xy );
    highp ivec2 tileCount = ivec2( staticSunDepthTileCount );
    highp ivec2 globalSize = tileCount * interiorResolution;
    if ( globalTexel.x < 0 || globalTexel.y < 0
        || globalTexel.x >= globalSize.x || globalTexel.y >= globalSize.y ) {
        return 0.0;
    }
    highp ivec2 tileCoordinate = globalTexel / interiorResolution;
    highp ivec2 localTexel = globalTexel - tileCoordinate * interiorResolution;
    highp ivec2 storedTexel = localTexel + ivec2( staticSunDepthLayout.zz );
    int layer = tileCoordinate.y * tileCount.x + tileCoordinate.x;
    highp vec2 decoded = staticSunDepthDecodedDepth(
        texelFetch( staticSunDepthTiles, ivec3( storedTexel, layer ), 0 )
    );
    if ( decoded.y < 0.5 ) return 1.0;
    occupiedSamples += 1.0;
    reconstructedDepth = reconstructedDepth < staticSunDepthDepthRange.x
        ? decoded.x
        : min( reconstructedDepth, decoded.x );
    return step( comparisonDepth, decoded.x );
}

highp float staticSunDepthLinearCompare(
    highp vec2 globalCoordinate,
    highp float comparisonDepth,
    inout highp float occupiedSamples,
    inout highp float reconstructedDepth
) {
    highp vec2 linearPosition = globalCoordinate - 0.5;
    highp ivec2 base = ivec2( floor( linearPosition ) );
    highp vec2 fraction = fract( linearPosition );
    highp float lowerLeft = staticSunDepthCompareGlobalTexel(
        base,
        comparisonDepth,
        occupiedSamples,
        reconstructedDepth
    );
    highp float lowerRight = staticSunDepthCompareGlobalTexel(
        base + ivec2( 1, 0 ),
        comparisonDepth,
        occupiedSamples,
        reconstructedDepth
    );
    highp float upperLeft = staticSunDepthCompareGlobalTexel(
        base + ivec2( 0, 1 ),
        comparisonDepth,
        occupiedSamples,
        reconstructedDepth
    );
    highp float upperRight = staticSunDepthCompareGlobalTexel(
        base + ivec2( 1, 1 ),
        comparisonDepth,
        occupiedSamples,
        reconstructedDepth
    );
    return mix(
        mix( lowerLeft, lowerRight, fraction.x ),
        mix( upperLeft, upperRight, fraction.x ),
        fraction.y
    );
}

highp vec4 staticSunDepthLookup( highp vec3 worldPosition, highp vec3 receiverNormal ) {
    highp vec3 lightPosition = staticSunDepthReceiverCoordinates( worldPosition );
    highp float invalidDepth = staticSunDepthDepthRange.x - 1.0;
    if ( lightPosition.z < staticSunDepthDepthRange.x || lightPosition.z > staticSunDepthDepthRange.y ) {
        return vec4( 0.0, invalidDepth, -1.0, 0.0 );
    }
    highp vec2 interiorResolution = staticSunDepthLayout.xy;
    highp vec2 tileWorldSize = interiorResolution * staticSunDepthLayout.w;
    highp vec2 tileCoordinate = floor( ( lightPosition.xy - staticSunDepthGridOrigin ) / tileWorldSize );
    highp vec2 inRange = step( vec2( 0.0 ), tileCoordinate )
        * ( vec2( 1.0 ) - step( staticSunDepthTileCount, tileCoordinate ) );
    if ( inRange.x * inRange.y < 0.5 ) return vec4( 0.0, invalidDepth, -1.0, 0.0 );

    highp vec2 tileMinimum = staticSunDepthGridOrigin + tileCoordinate * tileWorldSize;
    highp vec2 interiorTexel = clamp(
        floor( ( lightPosition.xy - tileMinimum ) * ( interiorResolution / tileWorldSize ) ),
        vec2( 0.0 ),
        interiorResolution - 1.0
    );
    highp float layer = tileCoordinate.y * staticSunDepthTileCount.x + tileCoordinate.x;
    highp vec3 worldNormal = normalize( inverseTransformDirection( receiverNormal, viewMatrix ) );
    highp float normalSunDot = clamp(
        dot( worldNormal, normalize( staticSunDepthPointDirectionWorld ) ),
        -1.0,
        1.0
    );
    highp float receiverBias = staticSunDepthBiasPolicy.x;
    if ( staticSunDepthBiasPolicy.w < 0.5 ) {
        receiverBias += staticSunDepthBiasPolicy.y * ( 1.0 - normalSunDot );
    }
    highp float kernelRadius = staticSunDepthFilterPolicy.y;
    highp float visibleSamples = 0.0;
    highp float tapSamples = 0.0;
    highp float occupiedSamples = 0.0;
    highp float reconstructedDepth = invalidDepth;
    highp vec2 globalInteriorSize = staticSunDepthTileCount * interiorResolution;
    highp float texelSizeMeters = staticSunDepthLayout.w;
    highp vec2 globalCoordinate =
        ( lightPosition.xy - staticSunDepthGridOrigin ) / texelSizeMeters;
    highp float comparisonDepth = lightPosition.z - receiverBias;
    highp float seamRadius;

    if ( staticSunDepthFilterPolicy.x > 0.5 ) {
        highp float sourceWorldRadius = staticSunDepthFilterPolicy.y
            * staticSunDepthSourceMapSizeAndExtent.z
            / staticSunDepthSourceMapSizeAndExtent.x;
        highp float phi = staticSunDepthInterleavedGradientNoise( gl_FragCoord.xy ) * PI2;
        for ( int sampleIndex = 0; sampleIndex < 5; sampleIndex ++ ) {
            highp vec2 disk = staticSunDepthVogelDiskSample( sampleIndex, 5, phi );
            highp vec2 lightOffset = sourceWorldRadius * (
                staticSunDepthSourceMapRightLight * disk.x
                + staticSunDepthSourceMapUpLight * disk.y
            );
            visibleSamples += staticSunDepthLinearCompare(
                globalCoordinate + lightOffset / texelSizeMeters,
                comparisonDepth,
                occupiedSamples,
                reconstructedDepth
            );
            tapSamples += 1.0;
        }
        seamRadius = ceil( sourceWorldRadius / texelSizeMeters + 0.5 );
    } else {
        highp ivec2 globalCenter = ivec2(
            tileCoordinate * interiorResolution + interiorTexel
        );
        for ( int y = -1; y <= 1; y ++ ) {
            for ( int x = -1; x <= 1; x ++ ) {
                if ( kernelRadius < 0.5 && ( x != 0 || y != 0 ) ) continue;
                highp ivec2 offset = ivec2( x, y ) * int( kernelRadius );
                visibleSamples += staticSunDepthCompareGlobalTexel(
                    globalCenter + offset,
                    comparisonDepth,
                    occupiedSamples,
                    reconstructedDepth
                );
                tapSamples += 1.0;
            }
        }
        seamRadius = max( kernelRadius, 0.5 );
    }

    highp float visibility = visibleSamples / max( tapSamples, 1.0 );
    highp vec2 edgeDistance = min( interiorTexel, interiorResolution - 1.0 - interiorTexel );
    highp float seam = 1.0 - step( seamRadius, min( edgeDistance.x, edgeDistance.y ) );
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
    // Three r183 binds receiveShadow per rendered object. A material can be
    // shared by receiver and non-receiver meshes, so this gate must stay in
    // the shader rather than being inferred while registering materials.
    if ( ! receiveShadow ) return;
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
    if ( ! receiveShadow ) {
        if ( staticSunDepthDebugMode == 1 ) return vec3( 1.0 );
        if ( staticSunDepthDebugMode == 8 ) return vec3( 0.0, 0.0, 1.0 );
        if ( staticSunDepthDebugMode == 9 ) return vec3( 0.0 );
        return normalColor;
    }
    highp vec3 lightPosition = staticSunDepthReceiverCoordinates( vStaticSunWorldPosition );
    highp vec4 sampleValue = staticSunDepthLookup( vStaticSunWorldPosition, receiverNormal );
    if ( staticSunDepthDebugMode == 1 ) return vec3( sampleValue.x );
    if ( staticSunDepthDebugMode == 2 ) return fract( vec3( sampleValue.z * 0.6180339, sampleValue.z * 0.3819660, sampleValue.z * 0.2360680 ) );
    if ( staticSunDepthDebugMode == 3 ) return sampleValue.y < staticSunDepthDepthRange.x ? vec3( 0.0 ) : vec3( ( sampleValue.y - staticSunDepthDepthRange.x ) / ( staticSunDepthDepthRange.y - staticSunDepthDepthRange.x ) );
    if ( staticSunDepthDebugMode == 4 ) {
        highp vec2 receiverGrid = ( lightPosition.xy - staticSunDepthGridOrigin )
            / (
                staticSunDepthTileCount
                * staticSunDepthLayout.xy
                * staticSunDepthLayout.w
            );
        highp float receiverDepth = ( lightPosition.z - staticSunDepthDepthRange.x )
            / ( staticSunDepthDepthRange.y - staticSunDepthDepthRange.x );
        return clamp( vec3( receiverGrid, receiverDepth ), 0.0, 1.0 );
    }
    if ( staticSunDepthDebugMode == 5 ) return sampleValue.z < 0.0 ? vec3( 1.0, 0.0, 1.0 ) : vec3( 0.0, 1.0, 0.0 );
    if ( staticSunDepthDebugMode == 6 ) {
        highp vec3 worldNormal = normalize( inverseTransformDirection( receiverNormal, viewMatrix ) );
        highp float normalSunDot = clamp(
            dot( worldNormal, normalize( staticSunDepthPointDirectionWorld ) ),
            -1.0,
            1.0
        );
        highp float debugBias = staticSunDepthBiasPolicy.x;
        if ( staticSunDepthBiasPolicy.w > 0.5 ) {
            debugBias += staticSunDepthBiasPolicy.y * normalSunDot;
        } else {
            debugBias += staticSunDepthBiasPolicy.y * ( 1.0 - normalSunDot );
        }
        return vec3( clamp( debugBias, 0.0, 1.0 ) );
    }
    if ( staticSunDepthDebugMode == 7 ) return sampleValue.z < 0.0 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 0.2, 0.0 );
    if ( staticSunDepthDebugMode == 8 ) return vec3( sampleValue.w, 0.0, 1.0 - sampleValue.w );
    if ( staticSunDepthDebugMode == 9 ) return vec3( staticSunDepthMaximumVisibilityDifference );
    return normalColor;
}
