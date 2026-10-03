attribute float parentHeight;
uniform float uMorph;
uniform vec4 uEdges;
uniform vec4 uEdgeMorph;
uniform vec4 uBounds;
uniform float uOffset;

void main() {
    float morph = uMorph;
    if (abs(position.x - uBounds.x) < 0.002) morph = uEdges.x > 0.5 ? 0.0 : min(morph, uEdgeMorph.x);
    if (abs(position.x - uBounds.y) < 0.002) morph = uEdges.y > 0.5 ? 0.0 : min(morph, uEdgeMorph.y);
    if (abs(position.z - uBounds.z) < 0.002) morph = uEdges.z > 0.5 ? 0.0 : min(morph, uEdgeMorph.z);
    if (abs(position.z - uBounds.w) < 0.002) morph = uEdges.w > 0.5 ? 0.0 : min(morph, uEdgeMorph.w);
    vec3 transformed = vec3(position.x, mix(parentHeight, position.y, morph) + uOffset, position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
