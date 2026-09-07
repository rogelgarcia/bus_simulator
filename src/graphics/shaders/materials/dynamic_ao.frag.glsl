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

// Vector form factor of a polygon edge: integrates cosine-weighted sky coverage.
vec3 dynamicAoEdge(vec3 a, vec3 b) {
    vec3 edge = cross(a,b);
    float lengthEdge = length(edge);
    return lengthEdge < 0.000001 ? vec3(0.0) : edge * (atan(lengthEdge, dot(a,b)) / lengthEdge);
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
        vec3 local = (inv * vec4(p,1.0)).xyz;
        vec3 up = normalize(axes[1]);
        // The cheap underside term is for supporting surfaces, never a wall-volume halo.
        float groundFacing = smoothstep(0.5, 0.95, dot(n,up));
        float clearance = (lower.y-local.y) * length(axes[1]);
        if (groundFacing == 0.0 || clearance < -0.01 || clearance > dynamicAoRadius) continue;
        local.y = min(local.y, lower.y-0.005);
        vec3 lo = lower.xyz, hi = upper.xyz;
        vec2 outside = max(max(lo.xz-local.xz,local.xz-hi.xz),vec2(0.0));
        float lateral = length(vec2(outside.x*length(axes[0]),outside.y*length(axes[2])));
        if (lateral >= dynamicAoRadius) continue;
        vec3 a = axes * (vec3(lo.x,lo.y,lo.z)-local);
        vec3 b = axes * (vec3(hi.x,lo.y,lo.z)-local);
        vec3 c = axes * (vec3(hi.x,lo.y,hi.z)-local);
        vec3 d = axes * (vec3(lo.x,lo.y,hi.z)-local);
        float coverage = abs(dot(n, dynamicAoEdge(a,b)+dynamicAoEdge(b,c)+dynamicAoEdge(c,d)+dynamicAoEdge(d,a))) / 6.28318530718;
        float fade = (1.0-smoothstep(0.0,dynamicAoRadius,lateral)) * (1.0-smoothstep(0.0,dynamicAoRadius,clearance));
        blocked = max(blocked, clamp(coverage,0.0,1.0)*fade*groundFacing);
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
