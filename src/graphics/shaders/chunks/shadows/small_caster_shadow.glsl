uniform int smallSunEnabled;
uniform highp sampler2DArray smallSunLayers;
uniform highp sampler2D smallSunData;
uniform highp vec4 smallSunGridBounds;

highp vec4 smallSunRecord(int index) {
    return texelFetch(smallSunData, ivec2(index % 256, index / 256), 0);
}
highp float smallSunCompare(ivec2 coordinate, int layer, float receiverCode) {
    if (any(lessThan(coordinate, ivec2(0))) || any(greaterThanEqual(coordinate, ivec2(256)))) return 1.0;
    vec2 bytes = texelFetch(smallSunLayers, ivec3(coordinate, layer), 0).rg;
    float code = floor(dot(bytes, vec2(65280.0, 255.0)) + 0.5);
    return max(step(receiverCode, code), step(65534.5, code));
}
highp float smallSunShadowVisibility(vec3 worldPosition) {
    if (smallSunEnabled == 0 || staticSunDepthFilterPolicy.w <= 0.0) return 1.0;
    vec3 light = staticSunDepthReceiverCoordinates(worldPosition);
    ivec2 cell = ivec2(floor((light.xy - smallSunGridBounds.xy) / 8.0));
    if (any(lessThan(cell, ivec2(0))) || any(greaterThanEqual(cell, ivec2(smallSunGridBounds.zw)))) return 1.0;
    vec2 list = smallSunRecord(cell.y * int(smallSunGridBounds.z) + cell.x).rg;
    float visibility = 1.0;
    for (int candidate = 0; candidate < int(list.y); candidate++) {
        int layer = int(smallSunRecord(int(list.x) + candidate).x);
        int record = int(smallSunGridBounds.z * smallSunGridBounds.w) + layer * 2;
        vec4 bounds = smallSunRecord(record), depth = smallSunRecord(record + 1);
        float receiver = light.z - staticSunDepthBiasPolicy.x;
        float radius = max(0.0, receiver - depth.x) * staticSunDepthFilterPolicy.w;
        if (receiver <= depth.x || any(lessThan(light.xy, bounds.xy - radius)) || any(greaterThan(light.xy, bounds.zw + radius))) continue;
        vec2 texelsPerMeter = vec2(256.0) / (bounds.zw - bounds.xy);
        float receiverCode = (receiver - depth.x) / (depth.y - depth.x) * 65534.0;
        float sum = 0.0;
        for (int ray = 0; ray < 12; ray++) {
            vec2 offset = staticSunDepthVogelDiskSample(ray, 12, 0.0) * radius;
            vec2 texel = (light.xy + offset - bounds.xy) * texelsPerMeter - 0.5;
            ivec2 base = ivec2(floor(texel)); vec2 f = fract(texel);
            sum += mix(mix(smallSunCompare(base, layer, receiverCode), smallSunCompare(base + ivec2(1,0), layer, receiverCode), f.x),
                mix(smallSunCompare(base + ivec2(0,1), layer, receiverCode), smallSunCompare(base + ivec2(1,1), layer, receiverCode), f.x), f.y);
        }
        visibility = min(visibility, sum / 12.0);
    }
    return visibility;
}
