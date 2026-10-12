// AI 597 full-screen pass of the ocean simulation: one quad in clip space, the texture coordinate for the fragment passes.
varying vec2 vOceanUv;

void main() {
    vOceanUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
