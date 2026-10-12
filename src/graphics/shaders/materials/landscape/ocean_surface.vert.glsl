// AI 597 ocean surface vertex program: one clipmap ring of the camera-snapped grid, displaced by the cascade sum. The geometry holds integer grid
// indices; the ring uniform places them in the world at the ring's cell. Vertices strictly inside the hole (the previous ring's extent) collapse to
// the hole edge (degenerate triangles). Toward the ring's outer edge every vertex morphs to the next ring's lattice (CDLOD): odd vertices take the
// mean of their even neighbours sampled at the coarser mip, even vertices the coarser mip itself, so the rings meet without cracks or popping.
#include <shaderlib:landscape/ocean_sampling>
uniform vec4 uOceanRing;   // origin x, origin z, cell meters, half extent meters
uniform vec4 uOceanHole;   // min x, min z, max x, max z of the hole; disabled when max x <= min x
uniform vec2 uOceanMorph;  // morph start and end as fractions of the half extent
uniform float uOceanLevel; // sea level
varying vec3 vOceanWorld;
varying vec2 vOceanPlane;

void main() {
    vec2 index = position.xy;
    float cell = uOceanRing.z;
    vec2 plane = uOceanRing.xy + index * cell;
    if (uOceanHole.z > uOceanHole.x && plane.x > uOceanHole.x && plane.x < uOceanHole.z && plane.y > uOceanHole.y && plane.y < uOceanHole.w) {
        vec4 edges = vec4(plane.x - uOceanHole.x, plane.y - uOceanHole.y, uOceanHole.z - plane.x, uOceanHole.w - plane.y);
        float nearest = min(min(edges.x, edges.y), min(edges.z, edges.w));
        if (nearest == edges.x) plane.x = uOceanHole.x;
        else if (nearest == edges.z) plane.x = uOceanHole.z;
        else if (nearest == edges.y) plane.y = uOceanHole.y;
        else plane.y = uOceanHole.w;
    }
    float morph = smoothstep(uOceanMorph.x, uOceanMorph.y, max(abs(index.x), abs(index.y)) * cell / uOceanRing.w);
    vec2 parity = mod(index, 2.0);
    vec3 fine = oceanDisplacement(plane, cell);
    vec3 coarse;
    if (parity.x + parity.y > 0.5) {
        vec2 step = (parity.x > 0.5 ? vec2(1.0, parity.y) : vec2(0.0, 1.0)) * cell;
        coarse = 0.5 * (oceanDisplacement(plane - step, 2.0 * cell) + oceanDisplacement(plane + step, 2.0 * cell));
    } else {
        coarse = oceanDisplacement(plane, 2.0 * cell);
    }
    vec3 displacement = mix(fine, coarse, morph);
    vOceanPlane = plane;
    vOceanWorld = vec3(plane.x + displacement.x, uOceanLevel + displacement.y, plane.y + displacement.z);
    gl_Position = projectionMatrix * viewMatrix * vec4(vOceanWorld, 1.0);
}
