attribute float missingLeaf;
uniform vec2 cameraSlope;
varying vec3 leafColor;
varying float leafCoverage;
void main() {
    vec3 projected = position;
    projected.xz -= max(position.y - 0.005, 0.0) * cameraSlope;
    leafColor = color;
    leafCoverage = missingLeaf;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(projected, 1.0);
}
