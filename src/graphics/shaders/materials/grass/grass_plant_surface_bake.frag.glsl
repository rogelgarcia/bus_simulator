// Roughness stays in green; unused red/blue carry an octahedral structural normal.
uniform sampler2D roughnessMap;
uniform float roughness;
varying vec2 vGrassUv;
varying vec3 vGrassFacingNormal;
void main() {
    vec3 n = normalize(vGrassFacingNormal);
    n /= abs(n.x) + abs(n.y) + abs(n.z);
    vec2 encoded = n.xy;
    if (n.z < 0.0) encoded = (1.0 - abs(encoded.yx)) * mix(vec2(-1.0), vec2(1.0), step(vec2(0.0), encoded));
    encoded = encoded * 0.5 + 0.5;
    gl_FragColor = vec4(encoded.x, roughness * texture2D(roughnessMap, vGrassUv).g, encoded.y, 1.0);
}
