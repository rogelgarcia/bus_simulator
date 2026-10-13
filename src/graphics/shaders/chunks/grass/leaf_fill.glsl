uniform highp sampler2DArray grassLeafFillMap;
uniform float grassLeafFillExtent;
uniform float grassLeafFillStrength;
vec4 grassLeafFillTile(vec2 world, vec2 dx, vec2 dy, vec2 center) {
    ivec2 tile = ivec2(floor(center * 0.5));
    uint seed = uint(tile.x) * 1597334677u ^ uint(tile.y) * 3812015801u;
    seed = (seed ^ (seed >> 16u)) * 2246822519u;
    mat2 inverseRotation = (seed & 1u) == 0u ? mat2(1.0) : mat2(0.0, -1.0, 1.0, 0.0);
    if ((seed & 2u) != 0u) inverseRotation = -inverseRotation;
    vec2 local = inverseRotation * (world - center);
    if (max(abs(local.x), abs(local.y)) >= grassLeafFillExtent) return vec4(0.0);
    vec2 view = inverseRotation * (cameraPosition.xz - center);
    float angle = mod(atan(view.y, view.x) * (8.0 / 6.28318530718) + 8.0, 8.0);
    vec2 scale = vec2(0.5, -0.5) / grassLeafFillExtent;
    vec2 uv = local * scale + 0.5;
    vec4 a = textureGrad(grassLeafFillMap, vec3(uv, floor(angle)), inverseRotation * dx * scale, inverseRotation * dy * scale);
    vec4 b = textureGrad(grassLeafFillMap, vec3(uv, mod(floor(angle) + 1.0, 8.0)), inverseRotation * dx * scale, inverseRotation * dy * scale);
    return mix(a, b, fract(angle));
}
vec4 grassLeafFill(vec2 world, vec2 dx, vec2 dy) {
    vec2 center = floor(world * 0.5) * 2.0 + 1.0;
    vec2 neighbor = mix(vec2(-2.0), vec2(2.0), step(center, world));
    vec4 sum = grassLeafFillTile(world, dx, dy, center);
    sum += grassLeafFillTile(world, dx, dy, center + vec2(neighbor.x, 0.0));
    sum += grassLeafFillTile(world, dx, dy, center + vec2(0.0, neighbor.y));
    sum += grassLeafFillTile(world, dx, dy, center + neighbor);
    return vec4(sum.rgb / max(sum.a, 0.00001), min(sum.a, 1.0) * grassLeafFillStrength);
}
