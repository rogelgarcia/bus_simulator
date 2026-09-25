// Carry the source ribbon's structural facing independently of its fine shading normal.
attribute vec3 grassFacingNormal;
varying vec2 vGrassUv;
varying vec3 vGrassFacingNormal;
void main() {
    vGrassUv = uv;
    vGrassFacingNormal = grassFacingNormal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
