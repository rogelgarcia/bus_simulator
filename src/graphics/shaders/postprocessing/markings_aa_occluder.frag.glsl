uniform vec3 uColor;
uniform sampler2D uDepthTex;
uniform vec2 uInvSize;
uniform float cameraNear;
uniform float cameraFar;
uniform float uBiasMeters;
#include <packing>

void main() {
    vec2 uv = gl_FragCoord.xy * uInvSize;
    float sceneDepth = texture2D(uDepthTex, uv).x;
    float fragDepth = gl_FragCoord.z;

    float sceneViewZ = perspectiveDepthToViewZ(sceneDepth, cameraNear, cameraFar);
    float fragViewZ = perspectiveDepthToViewZ(fragDepth, cameraNear, cameraFar);

    float sceneDist = -sceneViewZ;
    float fragDist = -fragViewZ;
    if (fragDist > sceneDist + uBiasMeters) discard;
    gl_FragColor = vec4(uColor, 1.0);
}
