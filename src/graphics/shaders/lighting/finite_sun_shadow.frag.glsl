// Directional PCSS: orthographic world distances, not the perspective area-light formula.
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 && !defined( SHADOWMAP_TYPE_PCF ) && !defined( SHADOWMAP_TYPE_VSM )
uniform vec4 uFiniteSunGeometry; // inverse frustum width/height, depth range, tan(angular radius)

vec2 finiteSunDisk( int index, int count ) {
    float radius = sqrt( ( float( index ) + 0.5 ) / float( count ) );
    float angle = float( index ) * 2.399963229728653;
    return radius * vec2( cos( angle ), sin( angle ) );
}

vec2 finiteSunReceiverGradient( vec3 coordinate ) {
    vec3 dx = dFdx( coordinate );
    vec3 dy = dFdy( coordinate );
    float determinant = dx.x * dy.y - dx.y * dy.x;
    if ( abs( determinant ) < 1e-12 ) return vec2( 0.0 );
    return vec2( dx.z * dy.y - dy.z * dx.y, dy.z * dx.x - dx.z * dy.x ) / determinant;
}

float getFiniteSunShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity,
    float shadowBias, float shadowRadius, vec4 shadowCoord ) {
    vec3 coordinate = shadowCoord.xyz / shadowCoord.w;
    // Derivatives must execute before non-uniform control flow. Compensating the
    // receiver plane also prevents a sloping receiver from counting as a blocker.
    vec2 gradient = finiteSunReceiverGradient( coordinate );
    coordinate.z += shadowBias;
    if ( any( lessThan( coordinate, vec3( 0.0 ) ) ) || any( greaterThan( coordinate, vec3( 1.0 ) ) ) ) return 1.0;
    if ( uFiniteSunGeometry.w == 0.0 ) {
        return mix( 1.0, step( coordinate.z, texture2D( shadowMap, coordinate.xy ).r ), shadowIntensity );
    }

    // The shadow near plane bounds the maximum possible blocker separation.
    vec2 searchRadius = coordinate.z * uFiniteSunGeometry.z * uFiniteSunGeometry.w * uFiniteSunGeometry.xy;
    float separationSum = 0.0;
    float blockers = 0.0;
    // A half texel slope bound excludes self intersections caused by sampling
    // discrete depths. The user light bias remains the ordinary native bias.
    float planeBias = dot( abs( gradient ), 0.5 / shadowMapSize ) + 1e-6;
    for ( int i = 0; i < 32; i ++ ) {
        vec2 offset = finiteSunDisk( i, 32 ) * searchRadius;
        vec2 uv = coordinate.xy + offset;
        if ( any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ) continue;
        float receiverDepth = coordinate.z + dot( gradient, offset );
        float separation = receiverDepth - texture2D( shadowMap, uv ).r;
        if ( separation > planeBias ) {
            separationSum += separation;
            blockers += 1.0;
        }
    }
    if ( blockers == 0.0 ) return 1.0;
    vec2 filterRadius = ( separationSum / blockers ) * uFiniteSunGeometry.z * uFiniteSunGeometry.w * uFiniteSunGeometry.xy;
    float visibility = 0.0;
    for ( int i = 0; i < 64; i ++ ) {
        vec2 offset = finiteSunDisk( i, 64 ) * filterRadius;
        vec2 uv = coordinate.xy + offset;
        if ( any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ) {
            visibility += 1.0;
        } else {
            float receiverDepth = coordinate.z + dot( gradient, offset ) - planeBias;
            visibility += step( receiverDepth, texture2D( shadowMap, uv ).r );
        }
    }
    return mix( 1.0, visibility / 64.0, shadowIntensity );
}
#endif
