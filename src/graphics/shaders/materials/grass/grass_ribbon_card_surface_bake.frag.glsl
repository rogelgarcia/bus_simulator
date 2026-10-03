// R packs leaf identity and blade warmth, G roughness, B transmission; A remains coverage.
uniform sampler2D roughnessMap;
uniform float roughness;
varying float vGrassLeafId;
varying vec2 vGrassUv;
void main() {
    float blade = smoothstep(0.12, 0.28, vGrassUv.y);
    float margin = smoothstep(0.1, 0.8, abs(2.0 * vGrassUv.x - 1.0));
    float transmission = mix(0.35, mix(0.50, 0.64, margin), blade);
    gl_FragColor = vec4((vGrassLeafId + 0.99 * blade) / 4.0,
        roughness * texture2D(roughnessMap, vGrassUv).g, transmission, 1.0);
}
