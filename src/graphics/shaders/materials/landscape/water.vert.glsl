varying vec3 vWaterWorld;

void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWaterWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
