varying float vDynamicAoParticipant;
varying vec3 vDynamicAoWorldPosition;
uniform float dynamicAoEnabled;
uniform float dynamicAoIntensity;
uniform float dynamicAoRadius;
uniform float dynamicAoDebug;
uniform int dynamicAoCount;
uniform sampler2D dynamicAoBounds;
uniform sampler2D dynamicAoMap;
uniform sampler2D dynamicAoStaticMap;
uniform float dynamicAoGeneric;
uniform mat4 dynamicAoProjection;
uniform mat4 dynamicAoViewInverse;
uniform vec3 dynamicAoReachMin;
uniform vec3 dynamicAoReachMax;

// Vector form factor of a polygon edge: integrates cosine-weighted sky coverage.
vec3 dynamicAoEdge(vec3 a, vec3 b) {
    vec3 edge = cross(a,b);
    float lengthEdge = length(edge);
    return lengthEdge < 0.000001 ? vec3(0.0) : edge * (atan(lengthEdge, dot(a,b)) / lengthEdge);
}

// Clip a visible box face to the receiver hemisphere before integrating it.
// An unclipped absolute solid angle creates reversed contact on walls.
float dynamicAoQuad(vec3 a, vec3 b, vec3 c, vec3 d, vec3 n) {
    vec4 heights = vec4(dot(n,a),dot(n,b),dot(n,c),dot(n,d));
    if (max(max(heights.x,heights.y),max(heights.z,heights.w)) <= 0.0) return 0.0;
    vec3 integral;
    if (min(min(heights.x,heights.y),min(heights.z,heights.w)) >= 0.0) {
        integral = dynamicAoEdge(a,b)+dynamicAoEdge(b,c)+dynamicAoEdge(c,d)+dynamicAoEdge(d,a);
    } else {
        vec3 corners[4] = vec3[4](a,b,c,d);
        vec3 clipped[5];
        int count = 0;
        for (int j = 0; j < 4; j++) {
            vec3 start = corners[j], end = corners[(j+1)%4];
            float hs = dot(n,start), he = dot(n,end);
            if (hs > 0.0) clipped[count++] = start;
            if ((hs > 0.0) != (he > 0.0)) clipped[count++] = mix(start,end,hs/(hs-he));
        }
        integral = vec3(0.0);
        for (int j = 0; j < count; j++) integral += dynamicAoEdge(clipped[j],clipped[(j+1)%count]);
    }
    return abs(dot(n,integral)) / 6.28318530718;
}

float dynamicAoWorldContact(vec3 p, vec3 n) {
    float blocked = 0.0;
    for (int i = 0; i < dynamicAoCount; i++) {
        if (abs(vDynamicAoParticipant - float(i + 1)) < 0.25) continue;
        vec4 lower = texelFetch(dynamicAoBounds,ivec2(4,i),0);
        vec4 upper = texelFetch(dynamicAoBounds,ivec2(5,i),0);
        if (lower.w < 0.5 || upper.w < 0.5) continue;
        mat4 inv = mat4(texelFetch(dynamicAoBounds, ivec2(0,i),0), texelFetch(dynamicAoBounds,ivec2(1,i),0),
            texelFetch(dynamicAoBounds,ivec2(2,i),0),texelFetch(dynamicAoBounds,ivec2(3,i),0));
        mat3 axes = mat3(texelFetch(dynamicAoBounds,ivec2(6,i),0).xyz,
            texelFetch(dynamicAoBounds,ivec2(7,i),0).xyz,texelFetch(dynamicAoBounds,ivec2(8,i),0).xyz);
        vec3 local = (inv * vec4(p+n*0.001,1.0)).xyz;
        vec3 lo = lower.xyz, hi = upper.xyz;
        float distanceToBox = length(axes * (clamp(local,lo,hi)-local));
        if (distanceToBox >= dynamicAoRadius) continue;
        float coverage = 0.0;
        // A convex box has at most three visible faces. Their angular regions
        // do not overlap, so ground/wall contact joins without a painted bridge.
        if (local.x < lo.x || local.x > hi.x) {
            float x = clamp(local.x,lo.x,hi.x);
            coverage += dynamicAoQuad(axes*(vec3(x,lo.y,lo.z)-local),axes*(vec3(x,hi.y,lo.z)-local),
                axes*(vec3(x,hi.y,hi.z)-local),axes*(vec3(x,lo.y,hi.z)-local),n);
        }
        if (local.y < lo.y || local.y > hi.y) {
            float y = clamp(local.y,lo.y,hi.y);
            coverage += dynamicAoQuad(axes*(vec3(lo.x,y,lo.z)-local),axes*(vec3(hi.x,y,lo.z)-local),
                axes*(vec3(hi.x,y,hi.z)-local),axes*(vec3(lo.x,y,hi.z)-local),n);
        }
        if (local.z < lo.z || local.z > hi.z) {
            float z = clamp(local.z,lo.z,hi.z);
            coverage += dynamicAoQuad(axes*(vec3(lo.x,lo.y,z)-local),axes*(vec3(hi.x,lo.y,z)-local),
                axes*(vec3(hi.x,hi.y,z)-local),axes*(vec3(lo.x,hi.y,z)-local),n);
        }
        if (distanceToBox < 0.00001) coverage = 1.0;
        // Finite-range AO approximation, not a full indirect-light transport solve.
        float fade = 1.0-smoothstep(0.0,dynamicAoRadius,distanceToBox);
        blocked = max(blocked, clamp(coverage,0.0,1.0)*fade);
    }
    return blocked;
}

float dynamicAoSurfaceContact(vec3 p) {
    vec4 clip = dynamicAoProjection * vec4(p,1.0);
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    float visibility = texture2D(dynamicAoMap,uv).r;
    if (vDynamicAoParticipant > 0.5) return clamp(1.0-visibility,0.0,1.0);
    if (dynamicAoGeneric < 0.5) return 0.0;
    // Static-to-static occlusion is already represented by the bake.
    float staticVisibility = texture2D(dynamicAoStaticMap,uv).r;
    return clamp(1.0-visibility/max(staticVisibility,0.01),0.0,1.0);
}
