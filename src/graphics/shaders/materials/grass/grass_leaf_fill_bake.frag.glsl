varying vec3 leafColor;
varying float leafCoverage;
void main() {
    gl_FragColor = vec4(leafColor * leafCoverage, leafCoverage);
}
