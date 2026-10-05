attribute float parentHeight;
attribute vec3 parentNormal;
uniform float uMorph;
uniform vec4 uEdges;
uniform vec4 uEdgeMorph;
uniform vec4 uBounds;
varying vec3 vLandscapeColor;
varying vec3 vLandscapeNormal;
varying vec3 vLandscapeWorld;

void main() {
#ifdef LANDSCAPE_SURFACE_CACHE_GENERATION
    // AI577 D6 surface cache generation draws each tile's own surface (no LOD morph or coarser-edge heights); pages over a morphing tile wait
    vec3 transformed = position;
    vLandscapeNormal = normalize(normal);
#else
    float morph = uMorph;
    if (abs(position.x - uBounds.x) < 0.002) morph = uEdges.x > 0.5 ? 0.0 : min(morph, uEdgeMorph.x);
    if (abs(position.x - uBounds.y) < 0.002) morph = uEdges.y > 0.5 ? 0.0 : min(morph, uEdgeMorph.y);
    if (abs(position.z - uBounds.z) < 0.002) morph = uEdges.z > 0.5 ? 0.0 : min(morph, uEdgeMorph.z);
    if (abs(position.z - uBounds.w) < 0.002) morph = uEdges.w > 0.5 ? 0.0 : min(morph, uEdgeMorph.w);
    vec3 transformed = vec3(position.x, mix(parentHeight, position.y, morph), position.z);
    vLandscapeNormal = normalize(mix(parentNormal, normal, morph));
#endif
    vLandscapeColor = color;
    vLandscapeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
