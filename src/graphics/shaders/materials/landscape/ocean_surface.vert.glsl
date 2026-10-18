// AI 597 ocean surface vertex program: one clipmap ring of the camera-snapped grid, displaced by the cascade sum. The geometry holds integer grid
// indices (the full grid for ring 0, the annulus outside the inner square for the rings with a hole; the fragment program discards what lies
// inside the exact hole, the previous ring's extent); the ring uniform places them in the world at the ring's cell. Toward the ring's outer edge
// every vertex morphs to the next ring's lattice (CDLOD): odd vertices take the
// mean of their even neighbours sampled at the coarser mip, even vertices the coarser mip itself, so the rings meet without cracks or popping.
// The AI 597 D2 shore wave (an analytic train band-limited by the grid cell) morphs the same way, so the rings stay watertight through it.
#include <shaderlib:landscape/ocean_sampling>
#include <shaderlib:landscape/ocean_shore>
uniform vec4 uOceanRing;   // origin x, origin z, cell meters, half extent meters
uniform vec2 uOceanMorph;  // morph start and end as fractions of the half extent
uniform float uOceanLevel; // sea level
varying vec3 vOceanWorld;
varying vec2 vOceanPlane;

void main() {
    vec2 index = position.xy;
    float cell = uOceanRing.z;
    vec2 plane = uOceanRing.xy + index * cell;
    float morph = smoothstep(uOceanMorph.x, uOceanMorph.y, max(abs(index.x), abs(index.y)) * cell / uOceanRing.w);
    vec2 parity = mod(index, 2.0);
    vec3 fine = oceanDisplacement(plane, cell) + oceanShoreDisplacement(plane, cell);
    vec3 coarse;
    if (parity.x + parity.y > 0.5) {
        vec2 step = (parity.x > 0.5 ? vec2(1.0, parity.y) : vec2(0.0, 1.0)) * cell;
        coarse = 0.5 * (oceanDisplacement(plane - step, 2.0 * cell) + oceanShoreDisplacement(plane - step, 2.0 * cell) + oceanDisplacement(plane + step, 2.0 * cell) + oceanShoreDisplacement(plane + step, 2.0 * cell));
    } else {
        coarse = oceanDisplacement(plane, 2.0 * cell) + oceanShoreDisplacement(plane, 2.0 * cell);
    }
    vec3 displacement = mix(fine, coarse, morph);
    vOceanPlane = plane;
    vOceanWorld = vec3(plane.x + displacement.x, uOceanLevel + displacement.y, plane.y + displacement.z);
    gl_Position = projectionMatrix * viewMatrix * vec4(vOceanWorld, 1.0);
}
