varying highp vec3 vDynamicSunWorldPosition;

uniform highp sampler2D dynamicSunShadowMap;
uniform highp mat4 dynamicSunShadowWorldToClip;
uniform highp vec4 dynamicSunShadowMapSizeBias;
uniform highp float dynamicSunShadowDepthRangeMeters;
uniform highp float dynamicSunAngularTangent;
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
    if (dynamicSunAngularTangent > 0.0 && staticSunDepthDebugMode == 0) {
        highp vec3 rowX = vec3(dynamicSunShadowWorldToClip[0][0],dynamicSunShadowWorldToClip[1][0],dynamicSunShadowWorldToClip[2][0]);
        highp vec3 rowY = vec3(dynamicSunShadowWorldToClip[0][1],dynamicSunShadowWorldToClip[1][1],dynamicSunShadowWorldToClip[2][1]);
        highp vec3 rowZ = vec3(dynamicSunShadowWorldToClip[0][2],dynamicSunShadowWorldToClip[1][2],dynamicSunShadowWorldToClip[2][2]);
        highp vec2 uvPerMeter = vec2(length(rowX),length(rowY)) * 0.5;
        highp vec3 geometricNormal = normalize(cross(dFdx(worldPosition),dFdy(worldPosition)));
        highp vec3 lightNormal = vec3(dot(geometricNormal,normalize(rowX)),dot(geometricNormal,normalize(rowY)),dot(geometricNormal,normalize(rowZ)));
        highp vec2 slope = abs(lightNormal.z)>0.001 ? -lightNormal.xy/lightNormal.z : vec2(0.0);
        highp float searchRadius = comparisonDepth * dynamicSunShadowDepthRangeMeters * dynamicSunAngularTangent;
        highp float separation = 0.0;
        highp float blockers = 0.0;
        for(int i=0;i<8;i++) {
            highp vec2 offset = i == 0 ? vec2(0.0) : staticSunDepthVogelDiskSample(i-1,7,0.0) * searchRadius;
            highp vec2 sampleUv = uv + offset * uvPerMeter;
            if(any(lessThan(sampleUv,vec2(0.0)))||any(greaterThan(sampleUv,vec2(1.0))))continue;
            highp float depth = dynamicSunShadowUnpackDepth(textureLod(dynamicSunShadowMap,sampleUv,0.0));
            highp float receiver = comparisonDepth + dot(offset,slope)/dynamicSunShadowDepthRangeMeters;
            if(depth < receiver) {separation += (receiver-depth)*dynamicSunShadowDepthRangeMeters;blockers += 1.0;}
        }
        if(blockers<0.5)return vec4(1.0,1.0,1.0,receiverDepth);
        highp float radius = separation/blockers*dynamicSunAngularTangent;
        for(int i=0;i<16;i++) {
            highp vec2 offset = staticSunDepthVogelDiskSample(i,16,0.0) * radius;
            highp vec2 sampleUv = uv + offset * uvPerMeter;
            if(any(lessThan(sampleUv,vec2(0.0)))||any(greaterThan(sampleUv,vec2(1.0)))){visibility+=1.0;continue;}
            highp float depth=dynamicSunShadowUnpackDepth(textureLod(dynamicSunShadowMap,sampleUv,0.0));
            minimumDepth=min(minimumDepth,depth);
            visibility+=step(comparisonDepth+dot(offset,slope)/dynamicSunShadowDepthRangeMeters,depth);
        }
        return vec4(visibility/16.0,minimumDepth,1.0,receiverDepth);
    }
    for ( int y = -1; y <= 1; y ++ ) {
        for ( int x = -1; x <= 1; x ++ ) {
            highp vec2 sampleUv = clamp(
                uv + vec2( float( x ), float( y ) ) * texel,
                texel * 0.5,
                vec2( 1.0 ) - texel * 0.5
            );
            highp float casterDepth = dynamicSunShadowUnpackDepth(
                textureLod( dynamicSunShadowMap, sampleUv, 0.0 )
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
