// Source UVs retain each blade's material coordinates inside the tuft projection.
attribute float grassLeafId;
varying float vGrassLeafId;
varying vec2 vGrassUv;
void main() {
    vGrassLeafId = grassLeafId;
    vGrassUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
