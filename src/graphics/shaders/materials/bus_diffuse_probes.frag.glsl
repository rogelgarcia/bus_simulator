varying vec3 busProbeWorldPosition;
uniform sampler2D busProbeField;
uniform float busProbeEnabled;
uniform int busProbeRegionCount;
uniform vec3 busProbeOrigins[4];
uniform vec3 busProbeSpacings[4];
uniform ivec4 busProbeSizes[4];

vec2 busProbeOct(vec3 direction) {
    direction /= max(abs(direction.x) + abs(direction.y) + abs(direction.z), 0.00001);
    vec2 folded = (1.0 - abs(direction.yx)) * mix(vec2(-1.0), vec2(1.0), step(vec2(0.0), direction.xy));
    return (direction.z < 0.0 ? folded : direction.xy) * 0.5 + 0.5;
}

vec4 busProbeIrradiance(vec3 position, vec3 normalWorld) {
    if (busProbeEnabled < 0.5) return vec4(0.0);
    for (int region = 0; region < 4; region++) {
        if (region >= busProbeRegionCount) break;
        ivec3 size = busProbeSizes[region].xyz;
        vec3 grid = (position - busProbeOrigins[region]) / busProbeSpacings[region];
        if (any(lessThan(grid, vec3(0.0))) || any(greaterThan(grid, vec3(size - 1)))) continue;
        ivec3 base = clamp(ivec3(floor(grid)), ivec3(0), size - 2);
        vec3 f = clamp(grid - vec3(base), 0.0, 1.0);
        vec3 edge = min(grid, vec3(size - 1) - grid);
        float coverage = smoothstep(0.0, 0.5, min(edge.x, min(edge.y, edge.z)));
        vec3 irradiance = vec3(0.0);
        float total = 0.0;
        for (int corner = 0; corner < 8; corner++) {
            ivec3 step3 = ivec3(corner & 1, (corner >> 1) & 1, (corner >> 2) & 1);
            ivec3 cell = base + step3;
            int row = busProbeSizes[region].w + cell.x + size.x * (cell.y + size.y * cell.z);
            vec3 factors = mix(1.0 - f, f, vec3(step3));
            float weight = factors.x * factors.y * factors.z;
            vec3 ray = position - (busProbeOrigins[region] + vec3(cell) * busProbeSpacings[region]);
            float distanceToProbe = length(ray);
            ivec2 oct = clamp(ivec2(busProbeOct(ray / max(distanceToProbe, .00001)) * 8.0), ivec2(0), ivec2(7));
            float depth = texelFetch(busProbeField, ivec2(6 + oct.x + oct.y * 8, row), 0).r;
            // Conservative depth rejection prevents interpolation through static walls.
            weight *= 1.0 - smoothstep(depth - .08, depth + .08, distanceToProbe);
            vec4 x = texelFetch(busProbeField, ivec2(normalWorld.x >= 0.0 ? 0 : 1, row), 0);
            vec3 y = texelFetch(busProbeField, ivec2(normalWorld.y >= 0.0 ? 2 : 3, row), 0).rgb;
            vec3 z = texelFetch(busProbeField, ivec2(normalWorld.z >= 0.0 ? 4 : 5, row), 0).rgb;
            weight *= x.a;
            vec3 squared = normalWorld * normalWorld;
            irradiance += weight * (x.rgb * squared.x + y * squared.y + z * squared.z);
            total += weight;
        }
        return vec4(irradiance / max(total, .00001), coverage * smoothstep(.01, .15, total));
    }
    return vec4(0.0);
}
