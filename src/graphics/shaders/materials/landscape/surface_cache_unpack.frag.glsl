// AI577 D6 surface cache unpack: copies one generated page from the packed float scratch into one atlas format per draw. Level 0 copies its texel
// (target 0: albedo and AO into the sRGB atlas, whose attachment re-encodes the exact decoded value; 1: normal, roughness and micro-paired
// coverage). Level 1 and the response atlas average the 2x2 level-0 texels they cover: albedo in linear space, the hemi-octahedral normals as
// vectors whose shortening widens the roughness (von Mises-Fisher fit, added to the squared GGX alpha like specular anti-aliasing), the rest
// linearly (target 2: response and coastal reach).
// One output per program keeps ANGLE's D3D11 backend from compiling multiple-target pixel executables at the first draw.
precision highp float;
uniform highp sampler2D uSurfaceCacheScratch;
uniform int uSurfaceCacheTarget;
uniform int uSurfaceCacheLevel;
flat in vec4 vSurfaceCacheOrigins;

// widening of the squared alpha by the normal variance is capped like specular anti-aliasing kernels
#define LANDSCAPE_SURFACE_CACHE_VARIANCE_CAP 0.18

vec3 landscapeSurfaceCacheUnpack(float value) {
    float high = floor(value / 65536.0), rest = value - high * 65536.0, middle = floor(rest / 256.0);
    return vec3(rest - middle * 256.0, middle, high) / 255.0;
}

vec3 landscapeSurfaceCacheLinear(vec3 srgb) {
    return mix(srgb / 12.92, pow((srgb + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), srgb));
}

vec3 landscapeSurfaceCacheNormal(vec2 octahedral) {
    vec2 e = octahedral * 2.0 - 1.0, t = vec2(e.x + e.y, e.x - e.y) * 0.5;
    return normalize(vec3(t, 1.0 - abs(t.x) - abs(t.y)));
}

void main() {
    ivec2 target = ivec2(floor(gl_FragCoord.xy)) - ivec2(vSurfaceCacheOrigins.zw), origin = ivec2(vSurfaceCacheOrigins.xy);
    if (uSurfaceCacheLevel == 0) {
        vec4 packed = texelFetch(uSurfaceCacheScratch, origin + target, 0);
        vec3 normal = landscapeSurfaceCacheUnpack(packed.y), detail = landscapeSurfaceCacheUnpack(packed.z);
        if (uSurfaceCacheTarget == 0) gl_FragColor = vec4(landscapeSurfaceCacheLinear(landscapeSurfaceCacheUnpack(packed.x)), normal.x);
        else gl_FragColor = vec4(normal.yz, detail.xy);
        return;
    }
    vec3 albedo = vec3(0.0), normal = vec3(0.0), response = vec3(0.0);
    float ao = 0.0, alpha2 = 0.0, micro = 0.0, reach = 0.0;
    for (int i = 0; i < 4; i++) {
        vec4 packed = texelFetch(uSurfaceCacheScratch, origin + 2 * target + ivec2(i & 1, i >> 1), 0);
        vec3 surface = landscapeSurfaceCacheUnpack(packed.y), detail = landscapeSurfaceCacheUnpack(packed.z);
        albedo += landscapeSurfaceCacheLinear(landscapeSurfaceCacheUnpack(packed.x));
        ao += surface.x;
        normal += landscapeSurfaceCacheNormal(surface.yz);
        float alpha = detail.x * detail.x;
        alpha2 += alpha * alpha;
        micro += detail.y;
        reach += detail.z;
        response += landscapeSurfaceCacheUnpack(packed.w);
    }
    if (uSurfaceCacheTarget == 0) { gl_FragColor = vec4(albedo * 0.25, ao * 0.25); return; }
    if (uSurfaceCacheTarget == 2) { gl_FragColor = vec4(response * 0.25, reach * 0.25); return; }
    float mean = clamp(length(normal) * 0.25, 1.0e-4, 1.0);
    float variance = (1.0 - mean * mean) / (3.0 * mean - mean * mean * mean);
    float roughness = sqrt(sqrt(min(1.0, alpha2 * 0.25 + min(2.0 * variance, LANDSCAPE_SURFACE_CACHE_VARIANCE_CAP))));
    vec3 n = normalize(normal);
    vec2 p = n.xy / (abs(n.x) + abs(n.y) + max(n.z, 0.0));
    gl_FragColor = vec4(vec2(p.x + p.y, p.x - p.y) * 0.5 + 0.5, roughness, micro * 0.25);
}
