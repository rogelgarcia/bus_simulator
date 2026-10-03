varying vec2 vGrassUv;
void main() {
    vGrassUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
