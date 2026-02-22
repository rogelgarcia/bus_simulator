uniform sampler2D tDiffuse;
uniform float uEnableToneMapping;
uniform float uEnableOutputColorSpace;
varying vec2 vUv;

void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
    if (uEnableToneMapping > 0.5) {
        #include <tonemapping_fragment>
    }
    if (uEnableOutputColorSpace > 0.5) {
        #include <colorspace_fragment>
    }
}
