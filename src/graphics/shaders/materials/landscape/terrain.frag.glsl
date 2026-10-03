uniform vec3 uTint;
uniform float uLodColor;
varying vec3 vLandscapeColor;
varying vec3 vLandscapeNormal;

void main() {
    vec3 surface = mix(vLandscapeColor, uTint, uLodColor);
    vec3 normal = normalize(vLandscapeNormal);
    float diffuse = max(0.0, dot(normal, normalize(vec3(-0.44, 0.87, -0.22))));
    vec3 hemisphere = mix(vec3(0.32, 0.37, 0.28), vec3(0.65, 0.78, 0.83), normal.y * 0.5 + 0.5);
    gl_FragColor = vec4(surface * (hemisphere * 0.8 + diffuse * vec3(0.95, 0.91, 0.81)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
