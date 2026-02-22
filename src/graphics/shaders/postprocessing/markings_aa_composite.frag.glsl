uniform sampler2D tScene;
uniform sampler2D tMarkings;
varying vec2 vUv;

void main() {
    vec4 s = texture2D(tScene, vUv);
    vec4 m = texture2D(tMarkings, vUv);
    vec3 outColor = mix(s.rgb, m.rgb, m.a);
    gl_FragColor = vec4(outColor, 1.0);
    #include <colorspace_fragment>
}
