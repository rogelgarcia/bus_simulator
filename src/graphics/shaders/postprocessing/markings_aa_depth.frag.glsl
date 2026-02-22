#include <packing>
uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;
uniform float uRangeMeters;
uniform float uPower;
varying vec2 vUv;

void main() {
    float fragCoordZ = texture2D(tDepth, vUv).x;
    float viewZ = perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
    float dist = max(0.0, -viewZ - cameraNear);
    float t = dist / max(uRangeMeters, 0.001);
    t = clamp(t, 0.0, 1.0);
    float c = pow(1.0 - t, max(uPower, 0.001));
    gl_FragColor = vec4(vec3(c), 1.0);
    #include <colorspace_fragment>
}
