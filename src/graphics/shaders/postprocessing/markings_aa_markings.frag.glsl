uniform sampler2D tMarkings;
uniform vec3 uBgColor;
varying vec2 vUv;

void main() {
    vec4 m = texture2D(tMarkings, vUv);
    vec3 outColor = mix(uBgColor, m.rgb, m.a);
    gl_FragColor = vec4(outColor, 1.0);
    #include <colorspace_fragment>
}
