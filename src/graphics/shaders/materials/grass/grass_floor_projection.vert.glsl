// Cover the output tile once while keeping floor UVs explicit.
varying vec2 vFloorUv;
void main() {
    vFloorUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
