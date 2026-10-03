precision highp sampler2DArray;
uniform vec3 uTint;
uniform float uLodColor;
uniform int uDiagnostic;
uniform vec3 uDiagnosticRange;
uniform float uAppearanceReady;
uniform sampler2DArray uMaskPages;
uniform vec2 uMaskDimensions;
uniform vec4 uMaskBounds[17];
uniform vec4 uMaskMeta[17];
uniform sampler2D uSoilBase0;
uniform sampler2DArray uSoilSurface0;
uniform sampler2D uSoilBase1;
uniform sampler2DArray uSoilSurface1;
uniform sampler2D uSoilBase2;
uniform sampler2DArray uSoilSurface2;
uniform sampler2D uSoilBase3;
uniform sampler2DArray uSoilSurface3;
uniform sampler2D uSoilBase4;
uniform sampler2DArray uSoilSurface4;
uniform sampler2D uSoilBase5;
uniform sampler2DArray uSoilSurface5;
uniform sampler2D uBlendBase;
uniform sampler2DArray uBlendSurface;
uniform int uMaterialBlendIndex;
uniform float uMaterialBlend;
uniform vec4 uSoilScale[6];
uniform vec4 uSoilAlbedo[6];
uniform vec4 uSoilRoughness[6];
uniform vec4 uSoilRange[6];
varying vec3 vLandscapeColor;
varying vec3 vLandscapeNormal;
varying vec3 vLandscapeWorld;

struct SoilSurface {
    vec3 albedo;
    vec3 normal;
    float roughness;
    float metalness;
    float ao;
};

SoilSurface mixSurface(SoilSurface a, SoilSurface b, float weight) {
    return SoilSurface(mix(a.albedo, b.albedo, weight), normalize(mix(a.normal, b.normal, weight)), mix(a.roughness, b.roughness, weight), mix(a.metalness, b.metalness, weight), mix(a.ao, b.ao, weight));
}

int maskAt(vec2 world) {
    int slot = 0;
    float level = -1.0;
    for (int i = 0; i < 17; i++) {
        vec4 bounds = uMaskBounds[i];
        if (uMaskMeta[i].w > 0.5 && uMaskMeta[i].x > level && world.x >= bounds.x && world.x <= bounds.y && world.y >= bounds.z && world.y <= bounds.w) {
            slot = i;
            level = uMaskMeta[i].x;
        }
    }
    return slot;
}

vec2 maskIds(int slot, vec2 world) {
    vec4 bounds = uMaskBounds[slot];
    vec2 uv = vec2((world.x - bounds.x) / (bounds.y - bounds.x), (bounds.w - world.y) / (bounds.w - bounds.z));
    uv = (clamp(uv, 0.0, 1.0) * (uMaskDimensions - 1.0) + 0.5) / uMaskDimensions;
    return floor(texture(uMaskPages, vec3(uv, float(slot))).rg * 255.0 + 0.5);
}

void soilTextures(int soil, vec2 uv, vec2 dx, vec2 dy, out vec3 albedo, out vec3 detailNormal, out vec3 orm) {
    if (soil == 0) {
        albedo = textureGrad(uSoilBase0, uv, dx, dy).rgb;
        detailNormal = textureGrad(uSoilSurface0, vec3(uv, 0.0), dx, dy).rgb;
        orm = textureGrad(uSoilSurface0, vec3(uv, 1.0), dx, dy).rgb;
    } else if (soil == 1) {
        albedo = textureGrad(uSoilBase1, uv, dx, dy).rgb;
        detailNormal = textureGrad(uSoilSurface1, vec3(uv, 0.0), dx, dy).rgb;
        orm = textureGrad(uSoilSurface1, vec3(uv, 1.0), dx, dy).rgb;
    } else if (soil == 2) {
        albedo = textureGrad(uSoilBase2, uv, dx, dy).rgb;
        detailNormal = textureGrad(uSoilSurface2, vec3(uv, 0.0), dx, dy).rgb;
        orm = textureGrad(uSoilSurface2, vec3(uv, 1.0), dx, dy).rgb;
    } else if (soil == 3) {
        albedo = textureGrad(uSoilBase3, uv, dx, dy).rgb;
        detailNormal = textureGrad(uSoilSurface3, vec3(uv, 0.0), dx, dy).rgb;
        orm = textureGrad(uSoilSurface3, vec3(uv, 1.0), dx, dy).rgb;
    } else if (soil == 4) {
        albedo = textureGrad(uSoilBase4, uv, dx, dy).rgb;
        detailNormal = textureGrad(uSoilSurface4, vec3(uv, 0.0), dx, dy).rgb;
        orm = textureGrad(uSoilSurface4, vec3(uv, 1.0), dx, dy).rgb;
    } else {
        albedo = textureGrad(uSoilBase5, uv, dx, dy).rgb;
        detailNormal = textureGrad(uSoilSurface5, vec3(uv, 0.0), dx, dy).rgb;
        orm = textureGrad(uSoilSurface5, vec3(uv, 1.0), dx, dy).rgb;
    }
    if (soil == uMaterialBlendIndex) {
        albedo = mix(albedo, textureGrad(uBlendBase, uv, dx, dy).rgb, uMaterialBlend);
        detailNormal = mix(detailNormal, textureGrad(uBlendSurface, vec3(uv, 0.0), dx, dy).rgb, uMaterialBlend);
        orm = mix(orm, textureGrad(uBlendSurface, vec3(uv, 1.0), dx, dy).rgb, uMaterialBlend);
    }
}

vec3 correctedAlbedo(vec3 color, vec4 correction) {
    const vec3 axis = vec3(0.57735026919);
    float cosine = cos(correction.y), sine = sin(correction.y);
    color = color * cosine + cross(axis, color) * sine + axis * dot(axis, color) * (1.0 - cosine);
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luminance), color, 1.0 + correction.z);
    vec3 tint = vec3(0.5 + 0.5 * cos(correction.y), 0.5 + 0.5 * cos(correction.y - 2.0943951), 0.5 + 0.5 * cos(correction.y + 2.0943951));
    color = mix(color, color * tint * 2.0, correction.w);
    return max(vec3(0.0), color * correction.x);
}

SoilSurface maskSurface(int slot, vec2 world, vec2 worldDx, vec2 worldDy, vec3 normal) {
    vec2 ids = maskIds(slot, world);
    int soil = int(ids.x);
    vec4 scale = uSoilScale[soil], range = uSoilRange[soil], remap = uSoilRoughness[soil];
    float c = cos(range.w), s = sin(range.w);
    mat2 rotation = mat2(c, s, -s, c);
    vec3 albedo, detailNormal, orm;
    soilTextures(soil, rotation * world / scale.x, rotation * worldDx / scale.x, rotation * worldDy / scale.x, albedo, detailNormal, orm);
    albedo = correctedAlbedo(albedo, uSoilAlbedo[soil]);
    if (soil == 0 && ids.y >= 5.0) {
        vec3 planning = ids.y < 5.5 ? vec3(0.37, 0.39, 0.38) : ids.y < 6.5 ? vec3(0.11, 0.14, 0.15) : vec3(0.19, 0.23, 0.23);
        albedo = mix(albedo, planning, 0.65);
    }
    detailNormal = detailNormal * 2.0 - 1.0;
    detailNormal.xy = transpose(rotation) * detailNormal.xy * scale.y;
    vec3 tangent = normalize(vec3(normal.y, -normal.x, 0.0));
    vec3 north = normalize(cross(tangent, normal));
    vec3 mapped = normalize(tangent * detailNormal.x + north * detailNormal.y + normal * max(0.01, detailNormal.z));
    float roughness = range.y - range.x > 0.00001 ? clamp((orm.g - range.x) / (range.y - range.x), 0.0, 1.0) : orm.g;
    if (remap.w > 0.5) roughness = 1.0 - roughness;
    roughness = mix(remap.x, remap.y, pow(roughness, remap.z)) * range.z;
    return SoilSurface(albedo, mapped, clamp(roughness, 0.05, 1.0), clamp(max(orm.b, scale.w), 0.0, 1.0), clamp(1.0 - (1.0 - orm.r) * scale.z, 0.0, 1.0));
}

SoilSurface transitioningMask(int slot, vec2 world, vec2 dx, vec2 dy, vec3 normal) {
    SoilSurface surface = maskSurface(slot, world, dx, dy, normal);
    if (uMaskMeta[slot].y < 1.0) surface = mixSurface(maskSurface(int(uMaskMeta[slot].z), world, dx, dy, normal), surface, uMaskMeta[slot].y);
    return surface;
}

SoilSurface appearanceSurface(vec2 world, vec2 dx, vec2 dy, vec3 normal) {
    int slot = maskAt(world);
    SoilSurface surface = transitioningMask(slot, world, dx, dy, normal);
    vec4 bounds = uMaskBounds[slot];
    vec4 distances = vec4(world.x - bounds.x, bounds.y - world.x, world.y - bounds.z, bounds.w - world.y);
    float width = 2.0 * (bounds.y - bounds.x) / (uMaskDimensions.x - 1.0);
    for (int edge = 0; edge < 4; edge++) {
        if (distances[edge] >= width) continue;
        vec2 across = world;
        if (edge == 0) across.x = bounds.x - 0.01;
        else if (edge == 1) across.x = bounds.y + 0.01;
        else if (edge == 2) across.y = bounds.z - 0.01;
        else across.y = bounds.w + 0.01;
        int neighbor = maskAt(across);
        float neighborLevel = uMaskMeta[neighbor].x;
        if (neighborLevel < uMaskMeta[slot].x) {
            int ancestor = slot;
            for (int depth = 0; depth < 4; depth++) if (uMaskMeta[ancestor].x > neighborLevel) ancestor = int(uMaskMeta[ancestor].z);
            SoilSurface coarse = maskSurface(ancestor, world, dx, dy, normal);
            if (uMaskMeta[neighbor].y < 1.0) coarse = mixSurface(maskSurface(int(uMaskMeta[ancestor].z), world, dx, dy, normal), coarse, uMaskMeta[neighbor].y);
            surface = mixSurface(coarse, surface, smoothstep(0.0, width, distances[edge]));
        } else if (neighborLevel == uMaskMeta[slot].x && uMaskMeta[neighbor].y < uMaskMeta[slot].y) {
            SoilSurface coarse = maskSurface(int(uMaskMeta[slot].z), world, dx, dy, normal);
            surface = mixSurface(coarse, surface, mix(uMaskMeta[neighbor].y / max(0.001, uMaskMeta[slot].y), 1.0, smoothstep(0.0, width, distances[edge])));
        }
    }
    return surface;
}

vec3 illuminate(SoilSurface surface) {
    const float PI = 3.14159265359;
    vec3 n = surface.normal, l = normalize(vec3(-0.44, 0.87, -0.22)), v = normalize(cameraPosition - vLandscapeWorld), h = normalize(l + v);
    float nl = max(dot(n, l), 0.0), nv = max(dot(n, v), 0.001), nh = max(dot(n, h), 0.0), vh = max(dot(v, h), 0.0);
    float alpha = surface.roughness * surface.roughness, a2 = alpha * alpha;
    float denominator = nh * nh * (a2 - 1.0) + 1.0;
    float distribution = a2 / max(PI * denominator * denominator, 0.00001);
    float k = (surface.roughness + 1.0) * (surface.roughness + 1.0) / 8.0;
    float geometry = nv / (nv * (1.0 - k) + k) * nl / (nl * (1.0 - k) + k);
    vec3 fresnel0 = mix(vec3(0.04), surface.albedo, surface.metalness);
    vec3 fresnel = fresnel0 + (1.0 - fresnel0) * pow(1.0 - vh, 5.0);
    vec3 specular = distribution * geometry * fresnel / max(4.0 * nv * nl, 0.001);
    vec3 diffuse = (1.0 - fresnel) * (1.0 - surface.metalness) * surface.albedo / PI;
    vec3 hemisphere = mix(vec3(0.30, 0.34, 0.25), vec3(0.65, 0.78, 0.83), n.y * 0.5 + 0.5);
    return hemisphere * surface.albedo * surface.ao * 0.68 + (diffuse + specular) * vec3(2.7, 2.6, 2.3) * nl;
}

void main() {
    vec3 normal = normalize(vLandscapeNormal);
    vec2 world = vLandscapeWorld.xz;
    vec2 dx = dFdx(world), dy = dFdy(world);
    vec3 color;
    if (uDiagnostic == 1) {
        float elevation = clamp((vLandscapeWorld.y - uDiagnosticRange.x) / max(0.001, uDiagnosticRange.y - uDiagnosticRange.x), 0.0, 1.0);
        vec3 low = mix(vec3(0.10, 0.27, 0.29), vec3(0.43, 0.54, 0.28), smoothstep(0.0, 0.45, elevation));
        color = mix(low, vec3(0.82, 0.70, 0.49), smoothstep(0.4, 1.0, elevation));
        float contourHeight = vLandscapeWorld.y / 5.0;
        float contourDistance = abs(fract(contourHeight - 0.5) - 0.5);
        float contour = 1.0 - smoothstep(0.0, max(fwidth(contourHeight) * 1.2, 0.0001), contourDistance);
        color = mix(color, vec3(0.07, 0.12, 0.13), contour * 0.82);
    } else if (uDiagnostic == 2) {
        vec3 faceNormal = normalize(cross(dFdx(vLandscapeWorld), dFdy(vLandscapeWorld)));
        float slope = acos(clamp(abs(faceNormal.y), 0.0, 1.0)) * 57.2957795;
        color = mix(vec3(0.16, 0.54, 0.34), vec3(0.91, 0.67, 0.17), smoothstep(0.0, 15.0, slope));
        color = mix(color, vec3(0.81, 0.16, 0.10), smoothstep(15.0, 35.0, slope));
    } else if (uDiagnostic == 3) {
        float depth = max(0.0, uDiagnosticRange.z - vLandscapeWorld.y);
        color = depth > 0.0 ? mix(vec3(0.18, 0.63, 0.72), vec3(0.04, 0.12, 0.33), clamp(depth / 10.0, 0.0, 1.0)) : vec3(0.46, 0.48, 0.37);
    } else if (uAppearanceReady > 0.5) {
        SoilSurface surface = appearanceSurface(world, dx, dy, normal);
        surface.albedo = mix(surface.albedo, uTint, uLodColor);
        color = illuminate(surface);
    } else {
        float diffuse = max(0.0, dot(normal, normalize(vec3(-0.44, 0.87, -0.22))));
        vec3 hemisphere = mix(vec3(0.32, 0.37, 0.28), vec3(0.65, 0.78, 0.83), normal.y * 0.5 + 0.5);
        color = mix(vLandscapeColor, uTint, uLodColor) * (hemisphere * 0.8 + diffuse * vec3(0.95, 0.91, 0.81));
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
