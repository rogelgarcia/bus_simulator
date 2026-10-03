uniform vec3 uColor;
uniform float uOpacity;

void main() {
    gl_FragColor = vec4(uColor, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
