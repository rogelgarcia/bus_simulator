// Shared by the canopy vertices and the terminal blade color handoff.
vec3 grassBakedCanopyTile(vec2 world, vec2 center, float scale, out mat2 transform) {
    ivec2 cell = ivec2(floor(center));
    uint hash = uint(cell.x) * 1597334677u ^ uint(cell.y) * 3812015801u;
    hash = (hash ^ (hash >> 16u)) * 2246822519u;
    transform = mat2(0.5 * scale, 0.0, 0.0, -0.5 * scale);
    if ((hash & 1u) != 0u) transform = mat2(0.0, 1.0, 1.0, 0.0) * transform;
    transform = mat2((hash & 2u) == 0u ? 1.0 : -1.0, 0.0, 0.0, (hash & 4u) == 0u ? 1.0 : -1.0) * transform;
    vec2 offset = vec2(float((hash >> 4u) & 255u), float((hash >> 12u) & 255u)) / 256.0;
    return vec3(transform * (world - center) + offset, float((hash >> 3u) & 1u));
}

vec3 grassBakedCanopyViewColor(vec3 ray) {
    float elevation = abs(ray.y) / max(length(ray), 0.001);
    // At grazing views the blades expose their tips. Keep that brightness without
    // lifting the texture highlights at the bus-height handoff or elevated views.
    return mix(vec3(0.80, 0.88, 0.73), vec3(0.47, 0.48, 0.44), smoothstep(0.10, 0.55, elevation))
        * mix(1.35, 1.0, smoothstep(0.04, 0.13, elevation));
}
