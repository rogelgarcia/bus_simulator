// Project relightable floor maps and bake periodic canopy occlusion into soil gaps.
uniform sampler2D captureMap;
uniform sampler2D albedoMap;
uniform sampler2D heightMap;
uniform mat4 bakeProjection;
uniform int channel;
uniform float planeHeight;
varying vec2 vFloorUv;
vec2 projectFloorUv(vec2 uv) {
    vec4 projected = bakeProjection * vec4(uv.x - 0.5, planeHeight, 0.5 - uv.y, 1.0);
    return projected.xy / projected.w * 0.5 + 0.5;
}
void main() {
    vec2 captureUv = projectFloorUv(vFloorUv);
    vec3 value = texture2D(captureMap, captureUv).rgb;
    if (channel == 3 || channel == 4) { gl_FragColor = vec4(value, 1.0); return; }
    if (channel == 1) value = normalize(value * 2.0 - 1.0) * 0.5 + 0.5;
    if (channel == 2) value = vec3(value.g);
    vec3 albedo = channel > 0 ? texture2D(albedoMap, vFloorUv).rgb : value;
    float coverage = smoothstep(0.015, 0.07, albedo.g - max(albedo.r, albedo.b));
    if (channel == 0) {
        float density = 0.0;
        for (int ring = 1; ring <= 4; ring++) for (int spoke = 0; spoke < 8; spoke++) {
            float angle = float(spoke) * 0.7853981634 + float(ring) * 0.3;
            vec3 neighbor = texture2D(captureMap, projectFloorUv(fract(vFloorUv + vec2(cos(angle), sin(angle)) * float(ring) * 0.02))).rgb;
            density += smoothstep(0.015, 0.07, neighbor.g - max(neighbor.r, neighbor.b));
        }
        value *= mix(max(0.08, exp(-8.0 * density / 32.0)), 1.0, coverage);
    }
    vec3 soil = albedo * (1.0 - coverage);
    gl_FragColor = channel == 2 ? vec4(soil.r, value.g, soil.g, soil.b)
        : vec4(value, channel == 1 ? coverage : texture2D(heightMap, vFloorUv).r);
}
