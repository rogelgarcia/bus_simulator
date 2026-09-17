uniform highp sampler2DArray staticSunStreamTiles;
uniform highp sampler2D staticSunStreamTable;
uniform highp vec4 staticSunStreamLayout;
uniform highp vec2 staticSunStreamTileCount;
uniform highp float staticSunStreamTime;
uniform int staticSunStreamEnabled;

highp vec3 staticSunStreamEntry(ivec2 page) {
    if (any(lessThan(page, ivec2(0))) || any(greaterThanEqual(page, ivec2(staticSunStreamTileCount)))) return vec3(0.0);
    return texelFetch(staticSunStreamTable, page, 0).rgb;
}
highp float staticSunStreamWeight(vec3 entry) {
    float arrival = clamp((staticSunStreamTime - entry.y) / 0.35, 0.0, 1.0);
    float retirement = entry.z > 0.0 ? 1.0 - clamp((staticSunStreamTime - entry.z) / 0.35, 0.0, 1.0) : 1.0;
    return entry.x == 0.0 ? 0.0 : min(arrival, retirement);
}
highp vec2 staticSunStreamDepth(vec2 texel, int layer) {
    ivec2 coordinate = ivec2(floor(texel));
    if (any(lessThan(coordinate, ivec2(0))) || any(greaterThanEqual(coordinate, ivec2(staticSunStreamLayout.xy + 2.0 * staticSunStreamLayout.zz)))) return vec2(staticSunDepthDepthRange.x, 1.0);
    return staticSunDepthDecodedDepth(texelFetch(staticSunStreamTiles, ivec3(coordinate, layer), 0));
}
highp float staticSunStreamCompare(vec2 texel, int layer, float receiver) {
    vec2 depth = staticSunStreamDepth(texel, layer);
    float safety = (staticSunDepthDepthRange.y - staticSunDepthDepthRange.x) * 0.375 / 65534.0;
    float separation = receiver - depth.x;
    bool outsideBand = staticSunDepthSeparationBandEnabled && (separation < staticSunDepthSeparationBand.x || separation >= staticSunDepthSeparationBand.y);
    return depth.y < 0.5 || outsideBand ? 1.0 : step(receiver, depth.x - safety);
}
highp float staticSunStreamLinearCompare(vec2 texel, int layer, float receiver, vec2 slopeTexels) {
    vec2 base = floor(texel - 0.5), f = fract(texel - 0.5);
    return mix(mix(staticSunStreamCompare(base, layer, receiver + dot(base + 0.5 - texel, slopeTexels)), staticSunStreamCompare(base + vec2(1,0), layer, receiver + dot(base + vec2(1.5,0.5) - texel, slopeTexels)), f.x),
        mix(staticSunStreamCompare(base + vec2(0,1), layer, receiver + dot(base + vec2(0.5,1.5) - texel, slopeTexels)), staticSunStreamCompare(base + vec2(1,1), layer, receiver + dot(base + 1.5 - texel, slopeTexels)), f.x), f.y);
}
highp vec2 staticSunStreamVisibility(vec3 light, vec2 localTexel, int layer, vec2 slope) {
    staticSunDepthSeparationBandEnabled = false;
    float pitch = staticSunStreamLayout.w;
    float receiver = light.z - staticSunDepthBiasPolicy.x;
    float search = max(pitch, (receiver - staticSunDepthDepthRange.x) * staticSunDepthFilterPolicy.w);
    float separation = 0.0, blockers = 0.0;
    vec2 gaps = vec2(1e20, 0.0);
    for (int i = 0; i < 9; i++) {
        float probeRadius = min(search, staticSunDepthLayout.w * (i < 5 ? 2.0 : 6.0));
        float angle = float(i - 1) * (PI * 0.5);
        vec2 offset = i == 0 ? vec2(0.0) : vec2(cos(angle), sin(angle)) * probeRadius;
        vec2 depth = staticSunStreamDepth(localTexel + offset / pitch, layer);
        float plane = receiver + dot(floor(localTexel + offset / pitch) + 0.5 - localTexel, slope * pitch);
        if (i == 0 && depth.y > 0.5 && depth.x < plane) search = min(search, max(pitch, (plane - depth.x) * staticSunDepthFilterPolicy.w));
        if (depth.y > 0.5 && depth.x < plane) gaps = vec2(min(gaps.x, plane - depth.x), max(gaps.y, plane - depth.x));
        if (depth.y > 0.5 && depth.x < plane && length(offset) <= (plane - depth.x) * staticSunDepthFilterPolicy.w + pitch) {
            separation += plane - depth.x; blockers += 1.0;
        }
    }
    vec2 result = vec2(1.0, 0.0);
    if (blockers < 0.5) result = vec2(staticSunStreamLinearCompare(localTexel, layer, receiver, slope * pitch), 1.0);
    else {
        float radius = max(pitch * 0.5, separation / blockers * staticSunDepthFilterPolicy.w);
        bool mixed = gaps.x * staticSunDepthFilterPolicy.w < staticSunDepthLayout.w && gaps.y * staticSunDepthFilterPolicy.w > 2.0 * staticSunDepthLayout.w;
        // Broad single-depth penumbras stay on the parent; mixed edges retain the fine caster.
        float detailWeight = mixed ? 1.0 : 1.0 - smoothstep(1.0, 2.0, radius / staticSunDepthLayout.w);
        if (detailWeight > 0.0) {
            staticSunDepthSeparationBandEnabled = mixed;
            float visible = 0.0, occupied = 0.0, depth = staticSunDepthDepthRange.x - 1.0;
            vec2 parentCoordinate = (light.xy - staticSunDepthGridOrigin) / staticSunDepthLayout.w;
            staticSunDepthPlaneSlopeTexels = slope * staticSunDepthLayout.w;
            float nearRadius = mixed ? max(pitch * 0.5, gaps.x * staticSunDepthFilterPolicy.w) : radius;
            float split = (gaps.x + gaps.y) * 0.5;
            float nearVisibility = 1.0;
            int comparisons = mixed ? 24 : 12;
            for (int i = 0; i < comparisons; i++) {
                bool farBand = mixed && (i % 2 == 1);
                vec2 direction = staticSunDepthVogelDiskSample(mixed ? i / 2 : i, 12, 0.0);
                vec2 offset = direction * (farBand ? gaps.y * staticSunDepthFilterPolicy.w : nearRadius);
                staticSunDepthSeparationBand = farBand ? vec2(split, 1e20) : vec2(0.0, split);
                float visibility = 1.0;
                if (farBand) visibility = staticSunDepthLinearCompare(parentCoordinate + offset / staticSunDepthLayout.w,
                    receiver + dot(offset, slope), occupied, depth);
                else visibility = staticSunStreamLinearCompare(localTexel + offset / pitch, layer, receiver + dot(offset, slope), slope * pitch);
                if (!mixed) visible += visibility;
                else if (farBand) visible += min(nearVisibility, visibility);
                else nearVisibility = visibility;
            }
            staticSunDepthSeparationBandEnabled = false;
            result = vec2(visible / 12.0, detailWeight);
        }
    }
    return result;
}
highp vec2 staticSunStreamLookup(highp vec3 worldPosition) {
    // Derivatives are evaluated before nonuniform residency decisions.
    vec3 light = staticSunDepthReceiverCoordinates(worldPosition);
    vec3 normal = mat3(staticSunDepthWorldToLight) * normalize(cross(dFdx(worldPosition), dFdy(worldPosition)));
    vec2 slope = abs(normal.z) > 0.001 ? -normal.xy / normal.z : vec2(0.0);
    // The minor footprint preserves detail across a foreshortened facade.
    // Its long screen axis must not force the short axis onto coarse texels.
    vec2 dx = dFdx(light.xy), dy = dFdy(light.xy);
    float trace = dot(dx, dx) + dot(dy, dy);
    float determinant = dx.x * dy.y - dx.y * dy.x;
    float footprint = sqrt(max(0.0, 0.5 * (trace - sqrt(max(0.0, trace * trace - 4.0 * determinant * determinant)))));
    vec2 coordinate = (light.xy - staticSunDepthGridOrigin) / (staticSunStreamLayout.xy * staticSunStreamLayout.w);
    ivec2 page = ivec2(floor(coordinate));
    vec3 entry = staticSunStreamEntry(page);
    float weight = staticSunStreamWeight(entry) * (1.0 - smoothstep(0.7, 1.2, footprint / staticSunDepthLayout.w));
    vec2 within = fract(coordinate), metres = staticSunStreamLayout.xy * staticSunStreamLayout.w;
    // Only incomplete neighbour boundaries fade to the parent.
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        if (x == 0 && y == 0) continue;
        vec2 gap = vec2(x < 0 ? within.x : 1.0 - within.x, y < 0 ? within.y : 1.0 - within.y) * metres;
        float proximity = x == 0 ? gap.y : y == 0 ? gap.x : max(gap.x, gap.y);
        if (proximity < 0.5) weight = min(weight, mix(staticSunStreamWeight(staticSunStreamEntry(page + ivec2(x,y))), 1.0, smoothstep(0.0,0.5,proximity)));
    }
    if (weight <= 0.0 || light.z < staticSunDepthDepthRange.x || light.z > staticSunDepthDepthRange.y) return vec2(1.0, 0.0);
    vec2 fine = entry.x < 0.0 ? vec2(1.0) : staticSunStreamVisibility(light,
        within * staticSunStreamLayout.xy + staticSunStreamLayout.zz, int(entry.x) - 1, slope);
    return vec2(fine.x, weight * fine.y);
}
highp vec4 staticSunDepthLookup(highp vec3 worldPosition, highp vec3 receiverNormal) {
    vec2 detail = vec2(1.0, 0.0);
    if (staticSunStreamEnabled != 0 && staticSunDepthDebugMode == 0) detail = staticSunStreamLookup(worldPosition);
    if (detail.y >= 1.0) return vec4(detail.x, staticSunDepthDepthRange.x - 1.0, -1.0, 0.0);
    vec4 parent = staticSunDepthLookupBase(worldPosition, receiverNormal);
    parent.x = mix(parent.x, detail.x, detail.y); return parent;
}
