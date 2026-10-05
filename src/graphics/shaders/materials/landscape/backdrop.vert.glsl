varying vec3 vBackdropWorld;

void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vBackdropWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
