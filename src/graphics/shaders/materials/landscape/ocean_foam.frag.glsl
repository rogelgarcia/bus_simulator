// AI 597 D3 foam state pass (landscape-ocean-foam-v1): one fixed step of the foam lifecycle over the extent raster. Each texel holds the foam
// density on the water (r) and the foam deposited on the sand by the backwash (g, read by the AI 597 D4 swash sheet). A step decays both
// (e^(-dt / tau)), advects the residual water foam shoreward along the train with a slow drift (semi-Lagrangian) while diffusing it a little
// into its neighbours, and adds the sources of the step: the breaker band at the bore front of the shore train (where it breaks), whitecaps
// where the spectral surface folds (a point sample of the full-resolution Jacobian, so the texel accumulates foam in proportion to how often
// it folds), the shoreline line where each crest reaches the waterline, and the deposit on the sand within the run-up band when a crest arrives
// (the land side of the shore field carries the shoreline's travel time, so the phase is defined there). Every source is a rate per second
// capped so a texel saturates at 1. The raster is the extent field's (uOceanFieldBounds), the chunks give the train and the folding.
#include <shaderlib:landscape/ocean_sampling>
#include <shaderlib:landscape/ocean_shore>
uniform sampler2D uOceanFoamPrevious;
// x step seconds, y water decay (per step factor), z deposit decay (per step factor), w reserved
uniform vec4 uOceanFoamStep;
// x breaker source rate (per second at bore 1), y whitecap source rate, z shoreline source rate, w deposit source rate
uniform vec4 uOceanFoamSources;
// x drift (m/s) of the residual foam along the train, y diffusion share per step, z folding threshold (1 - Jacobian) where whitecaps start, w folding span to full
uniform vec4 uOceanFoamFlow;
varying vec2 vOceanUv;

void main() {
    vec2 xz = uOceanFieldBounds.xy + vOceanUv / uOceanFieldBounds.zw;
    vec4 field = texture(uOceanField, vOceanUv);
    vec2 texel = 1.0 / vec2(textureSize(uOceanFoamPrevious, 0));
    float dt = uOceanFoamStep.x;
    OceanShoreWave wave = oceanShoreAt(xz);
    // the previous state, the water channel advected against the drift and blended with its neighbours
    vec2 drift = wave.amplitude > 0.0 ? wave.direction * (uOceanFoamFlow.x * dt) * uOceanFieldBounds.zw : vec2(0.0);
    vec2 previous = texture(uOceanFoamPrevious, vOceanUv - drift).rg;
    float neighbours = 0.25 * (texture(uOceanFoamPrevious, vOceanUv + vec2(texel.x, 0.0)).r + texture(uOceanFoamPrevious, vOceanUv - vec2(texel.x, 0.0)).r
        + texture(uOceanFoamPrevious, vOceanUv + vec2(0.0, texel.y)).r + texture(uOceanFoamPrevious, vOceanUv - vec2(0.0, texel.y)).r);
    float water = mix(previous.x, neighbours, uOceanFoamFlow.y) * uOceanFoamStep.y;
    float deposit = previous.y * uOceanFoamStep.z;
    if (field.x > 0.0) {
        // the breaker band: the bore front just ahead of the crest (phase decreases toward the shore, so the front lies at a small negative phase)
        float front = pow(max(cos(wave.phase + 0.6), 0.0), 4.0);
        float breaker = wave.breaking * wave.weight * front;
        // whitecaps: a point sample of the full-resolution folding (below 1 the horizontal displacement folds the surface)
        float folding = oceanFoldingAt(xz);
        float whitecap = smoothstep(uOceanFoamFlow.z, uOceanFoamFlow.z + uOceanFoamFlow.w, 1.0 - folding);
        // the shoreline line: each crest arriving at the waterline (the last metres of water)
        float shoreline = (1.0 - smoothstep(0.0, 6.0, field.y)) * max(cos(wave.phase), 0.0) * wave.weight * step(0.0001, wave.amplitude);
        // whitecaps alone fill a texel to half (a lacy streak); the breaker band and the shoreline line can fill it
        float headroom = max(0.0, 0.5 - water) * 2.0;
        float source = uOceanFoamSources.x * breaker + uOceanFoamSources.y * whitecap * headroom + uOceanFoamSources.z * shoreline;
        water = min(water + source * dt, 1.0);
    } else {
        // the sand within the run-up band: a crest arriving at the waterline deposits foam that lingers (the phase comes from the filled travel time)
        vec2 shore = texture(uOceanShoreField, vOceanUv).xy;
        float band = 1.0 - smoothstep(0.0, 8.0, -field.y);
        float arrival = max(cos(uOceanShoreWave.x * (uOceanTime - shore.x) - 0.5), 0.0);
        deposit = min(deposit + uOceanFoamSources.w * band * arrival * dt, 1.0);
        water = 0.0;
    }
    gl_FragColor = vec4(water, deposit, 0.0, 1.0);
}
