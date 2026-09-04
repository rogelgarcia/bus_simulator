varying highp vec3 vDynamicSunWorldPosition;

uniform highp sampler2D dynamicSunShadowMap;
uniform highp mat4 dynamicSunShadowWorldToClip;
uniform highp vec4 dynamicSunShadowMapSizeBias;
uniform highp float dynamicSunShadowDepthRangeMeters;
uniform highp vec3 dynamicSunShadowPointDirectionWorld;
uniform int dynamicSunShadowEnabled;

highp float dynamicSunShadowUnpackDepth( highp vec4 packedDepth ) {
    // Three r183's post-r167 RGBADepthPacking stores the most-significant
    // byte in red. Keep this identical to ThreeRgbaDepthPacking.mjs.
    const highp vec4 unpackFactors = vec4(
        255.0 / 256.0,
        255.0 / 65536.0,
        255.0 / 16777216.0,
        1.0 / 16777216.0
    );
    return min( 1.0, dot( packedDepth, unpackFactors ) );
}

highp vec4 dynamicSunShadowLookup(
    highp vec3 worldPosition,
    highp vec3 receiverNormal
) {
    if ( dynamicSunShadowEnabled == 0 ) return vec4( 1.0, 1.0, 0.0, 0.0 );
    highp vec4 clip = dynamicSunShadowWorldToClip * vec4( worldPosition, 1.0 );
    if ( abs( clip.w ) < 0.000001 ) return vec4( 1.0, 1.0, 0.0, 0.0 );
    highp vec3 projected = clip.xyz / clip.w;
    highp vec2 uv = projected.xy * 0.5 + 0.5;
    highp float receiverDepth = projected.z * 0.5 + 0.5;
    highp vec2 inside = step( vec2( 0.0 ), uv )
        * ( vec2( 1.0 ) - step( vec2( 1.0 ), uv ) );
    if ( inside.x * inside.y < 0.5 || receiverDepth < 0.0 || receiverDepth > 1.0 ) {
        return vec4( 1.0, 1.0, 0.0, receiverDepth );
    }

    highp vec3 worldNormal = normalize(
        inverseTransformDirection( receiverNormal, viewMatrix )
    );
    highp float normalSunDot = clamp(
        dot( worldNormal, normalize( dynamicSunShadowPointDirectionWorld ) ),
        -1.0,
        1.0
    );
    highp float biasMeters = dynamicSunShadowMapSizeBias.z
        + dynamicSunShadowMapSizeBias.w * ( 1.0 - normalSunDot );
    highp float comparisonDepth = receiverDepth
        - biasMeters / max( dynamicSunShadowDepthRangeMeters, 0.000001 );
    highp vec2 texel = 1.0 / dynamicSunShadowMapSizeBias.xy;
    highp float visibility = 0.0;
    highp float minimumDepth = 1.0;
    for ( int y = -1; y <= 1; y ++ ) {
        for ( int x = -1; x <= 1; x ++ ) {
            highp vec2 sampleUv = clamp(
                uv + vec2( float( x ), float( y ) ) * texel,
                texel * 0.5,
                vec2( 1.0 ) - texel * 0.5
            );
            highp float casterDepth = dynamicSunShadowUnpackDepth(
                texture2D( dynamicSunShadowMap, sampleUv )
            );
            minimumDepth = min( minimumDepth, casterDepth );
            visibility += step( comparisonDepth, casterDepth );
        }
    }
    return vec4( visibility / 9.0, minimumDepth, 1.0, receiverDepth );
}

highp float dynamicSunShadowVisibility = 1.0;
highp vec4 dynamicSunShadowDebugSample = vec4( 1.0, 1.0, 0.0, 0.0 );

void dynamicSunShadowApplyDirectional(
    inout IncidentLight directLight,
    highp vec3 receiverNormal
) {
    if ( dynamicSunShadowEnabled == 0 || ! receiveShadow ) return;
    dynamicSunShadowDebugSample = dynamicSunShadowLookup(
        vDynamicSunWorldPosition,
        receiverNormal
    );
    dynamicSunShadowVisibility = dynamicSunShadowDebugSample.x;
    // Static and dynamic visibility represent independent caster sets for the
    // same sun, so their physically explicit composition is multiplication.
    directLight.color *= dynamicSunShadowVisibility;
}

highp vec3 dynamicSunShadowDebugColor(
    highp vec3 normalColor,
    highp vec3 receiverNormal,
    highp float staticVisibility,
    highp float currentVisibility
) {
    if ( ! receiveShadow ) return normalColor;
    highp vec4 sampleValue = dynamicSunShadowLookup(
        vDynamicSunWorldPosition,
        receiverNormal
    );
    if ( staticSunDepthDebugMode == 12 ) return vec3( sampleValue.x );
    if ( staticSunDepthDebugMode == 13 ) return vec3( sampleValue.y );
    if ( staticSunDepthDebugMode == 14 ) {
        highp vec4 clip = dynamicSunShadowWorldToClip
            * vec4( vDynamicSunWorldPosition, 1.0 );
        highp vec2 uv = clip.xy / max( abs( clip.w ), 0.000001 ) * 0.5 + 0.5;
        return sampleValue.z < 0.5
            ? vec3( 1.0, 0.0, 0.0 )
            : vec3( clamp( uv, 0.0, 1.0 ), 0.0 );
    }
    if ( staticSunDepthDebugMode == 15 ) {
        highp vec3 worldNormal = normalize(
            inverseTransformDirection( receiverNormal, viewMatrix )
        );
        highp float normalSunDot = clamp(
            dot( worldNormal, normalize( dynamicSunShadowPointDirectionWorld ) ),
            -1.0,
            1.0
        );
        highp float biasMeters = dynamicSunShadowMapSizeBias.z
            + dynamicSunShadowMapSizeBias.w * ( 1.0 - normalSunDot );
        return vec3( clamp( biasMeters, 0.0, 1.0 ) );
    }
    if ( staticSunDepthDebugMode == 16 ) {
        return vec3(
            staticVisibility,
            sampleValue.x,
            staticVisibility * sampleValue.x
        );
    }
    if ( staticSunDepthDebugMode == 17 ) {
        highp float hybridVisibility = staticVisibility * sampleValue.x;
        return vec3(
            max( hybridVisibility - currentVisibility, 0.0 ),
            abs( hybridVisibility - currentVisibility ),
            max( currentVisibility - hybridVisibility, 0.0 )
        );
    }
    return normalColor;
}
