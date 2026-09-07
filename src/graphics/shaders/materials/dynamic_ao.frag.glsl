varying float vDynamicAoParticipant;
varying vec3 vDynamicAoWorldPosition;
uniform float dynamicAoEnabled;
uniform float dynamicAoIntensity;
uniform float dynamicAoRadius;
uniform float dynamicAoDebug;
uniform int dynamicAoSamples;
uniform int dynamicAoCount;
uniform sampler2D dynamicAoBounds;
uniform sampler2D dynamicAoDepth;
uniform mat4 dynamicAoProjection;
uniform mat4 dynamicAoProjectionInverse;
uniform mat4 dynamicAoViewInverse;

vec3 dynamicAoViewPoint(vec2 uv, float depth) {
    vec4 p = dynamicAoProjectionInverse * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
}

float dynamicAoWorldContact(vec3 p, vec3 n) {
    float blocked = 0.0;
    for (int i = 0; i < dynamicAoCount; i++) {
        if (abs(vDynamicAoParticipant - float(i + 1)) < 0.25) continue;
        mat4 inv = mat4(texelFetch(dynamicAoBounds, ivec2(0,i),0), texelFetch(dynamicAoBounds,ivec2(1,i),0),
            texelFetch(dynamicAoBounds,ivec2(2,i),0),texelFetch(dynamicAoBounds,ivec2(3,i),0));
        vec4 lower = texelFetch(dynamicAoBounds,ivec2(4,i),0);
        if (lower.w < 0.5) continue;
        vec3 lo = lower.xyz;
        vec3 hi = texelFetch(dynamicAoBounds,ivec2(5,i),0).xyz;
        if (any(lessThanEqual(hi-lo,vec3(0.00001)))) continue;
        vec3 local = (inv * vec4(p,1.0)).xyz;
        vec3 delta = clamp(local,lo,hi) - local;
        mat3 axes = mat3(inverse(inv));
        vec3 worldDelta = axes * delta;
        float d = length(worldDelta);
        if (d < 0.001) { blocked = 1.0; continue; }
        if (d >= dynamicAoRadius) continue;
        vec3 extent = (hi-lo) * 0.5;
        float areaRadius = max(0.05, min(extent.x, min(extent.y, extent.z)));
        vec3 facingPoint = clamp(local + normalize(mat3(inv) * n) * areaRadius, lo, hi);
        vec3 facingDelta = axes * (facingPoint - local);
        float facing = max(0.0, dot(n, normalize(facingDelta)));
        float coverage = areaRadius * areaRadius / (d*d + areaRadius*areaRadius);
        blocked = max(blocked, facing * coverage * (1.0-smoothstep(0.0,dynamicAoRadius,d)));
    }
    return blocked;
}

float dynamicAoSurfaceContact(vec3 p, vec3 n) {
    vec4 clip = dynamicAoProjection * vec4(p,1.0);
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    float footprint = dynamicAoRadius * dynamicAoProjection[1][1] / max(0.1,-p.z) * 0.5;
    float blocked = 0.0;
    for (int i = 0; i < 24; i++) {
        if (i >= dynamicAoSamples) break;
        float phase = float(i) * 2.39996323;
        float distanceFraction = sqrt((float(i)+0.5) / float(dynamicAoSamples));
        vec2 q = uv + vec2(cos(phase)*dynamicAoProjection[0][0]/dynamicAoProjection[1][1],sin(phase)) * footprint * distanceFraction;
        if (any(lessThan(q,vec2(0.0))) || any(greaterThan(q,vec2(1.0)))) continue;
        float depth = texture2D(dynamicAoDepth,q).x;
        if (depth >= 1.0) continue;
        vec3 delta = dynamicAoViewPoint(q,depth) - p;
        float d = length(delta);
        if (d < 0.015 || d >= dynamicAoRadius) continue;
        blocked += max(0.0, dot(n, delta/d)-0.08) * (1.0-smoothstep(0.0,dynamicAoRadius,d));
    }
    return min(1.0, blocked * 3.0 / float(dynamicAoSamples));
}
