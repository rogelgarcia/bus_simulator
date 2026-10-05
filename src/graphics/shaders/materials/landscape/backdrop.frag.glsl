// AI577 D5 atmosphere backdrop (landscape-atmosphere-backdrop-v1): below the horizon, where the finite landscape leaves the view empty, the
// calibrated HDR has no ground (its lower hemisphere is the sky model's ground-free in-scattering, nearly black), so the view shows the
// aerial-perspective limit of an optically infinite path instead. It equals the HDR's horizon radiance at the horizon and blends into the HDR
// background over a narrow band around it; above the horizon the HDR background itself shows.
varying vec3 vBackdropWorld;

#include <shaderlib:landscape/lighting_visibility>
#include <shaderlib:landscape/lighting>
#include <shaderlib:landscape/atmosphere>

void main() {
    vec3 origin, toCamera;
    float distance;
    landscapeViewRay(vBackdropWorld, origin, toCamera, distance);
    vec3 direction = -toCamera;
    float coverage = 1.0 - smoothstep(-LANDSCAPE_BACKDROP_HORIZON_BAND, LANDSCAPE_BACKDROP_HORIZON_BAND, direction.y);
    if (coverage <= 0.0) discard;
    gl_FragColor = vec4(landscapeHazeLimit(direction), coverage);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
