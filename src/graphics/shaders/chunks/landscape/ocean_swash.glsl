// AI 597 D4 swash and wet beach (landscape-ocean-v1): the run-up and backwash of each wave of the shore train across the foreshore, and the
// wetness and the foam the swash leaves on the sand, all analytic in time (no state, so a fixed time repeats exactly). The train's crest
// reaches the waterline at phase 0: the arrival a fragment of sand follows is its nearest waterline texel's (the shore distance is an exact
// distance field, so its gradient leads to that texel and the travel time is read there); the swash cycle u = fract(lag / period) then runs
// the water sheet up the beach to the wave's run-up R and back: the front stands at R sin(pi u). R is the Stockdon et al. (2006) R2 run-up
// of the sea state's swell at the foreshore slope (the sand height over its distance to the waterline), scaled by the train's group envelope,
// its longshore variation and the shore exposure like the train itself. The sand at a height z is wet while the sheet covers it and dries
// afterwards with a lag (e^(-t / drying)): the last of the remembered cycles whose run-up passed z gives the time since the water receded.
// The foam the backwash leaves follows the same memory with its own, shorter lifetime, strongest at the top of each run-up where the water
// stalls, and scales with the foam supply of the shoreline (the D3 state's deposit channel). Below the tidal and capillary reach the sand
// stays saturated (the AI577 D5 static band's core, which the sheet replaces in time). The wrack line lies at the highest run-up of the
// remembered cycles. The vertex program places the sheet on the native beach heights.
// x sqrt(H L) of the sea state's swell (m), y swell period (s), z drying time (s), w the foam the sheet carries behind its front (of the
// shoreline's supply)
uniform vec4 uOceanSwash;
// x static reach (tidal + capillary, m), y maximum beach slope (degrees), z cycles remembered, w width of the front foam along the beach (m)
uniform vec4 uOceanSwashBand;
// x deposit share (the foam the backwash leaves, of the shoreline's supply), y deposit lifetime (s), z mean square slope of the water sheet below
// its ripples, w the sheet's share of the finest cascade's slopes (its ripples)
uniform vec4 uOceanSwashFoam;

struct OceanSwash {
    float wetness;    // 0 dry .. 1 saturated
    float film;       // 1 under the water sheet
    float thickness;  // depth of the sheet in units of the run-up (0 at the front)
    float front;      // the foam at the sheet's front
    float sheetFoam;  // the foam the sheet carries behind its front, 0..1 of the shoreline's supply
    float deposit;    // the foam the backwash left, 0..1 of the shoreline's supply
    float runup;      // the current wave's run-up (m)
    float wrack;      // the wrack line band at the highest remembered run-up
    float cycle;      // u of the current cycle
};

// Stockdon et al. (2006) R2 run-up at a beach slope tan(beta) for the sea state's swell
float oceanSwashRunup(float beta) {
    float hl = uOceanSwash.x * uOceanSwash.x;
    return 1.1 * (0.35 * beta * uOceanSwash.x + 0.5 * sqrt(hl * (0.563 * beta * beta + 0.004)));
}

// the foreshore slope that drives the run-up (Stockdon uses the mean slope of the swash zone, not the local one, which a berm face would
// turn into metres of run-up): the sand height over its horizontal distance to the waterline, the depth field's gradient at the waterline
// itself, capped at the maximum beach slope
float oceanSwashSlope(vec2 uv, float height, float shoreDistance) {
    vec2 texel = 1.0 / vec2(textureSize(uOceanField, 0));
    vec2 spacing = texel / uOceanFieldBounds.zw;
    float dx = (texture(uOceanField, uv + vec2(texel.x, 0.0)).x - texture(uOceanField, uv - vec2(texel.x, 0.0)).x) / (2.0 * spacing.x);
    float dz = (texture(uOceanField, uv + vec2(0.0, texel.y)).x - texture(uOceanField, uv - vec2(0.0, texel.y)).x) / (2.0 * spacing.y);
    float local = length(vec2(dx, dz));
    float inland = max(-shoreDistance, 0.0);
    float foreshore = max(height, 0.0) / max(inland, 4.0);
    float slope = mix(local, foreshore, smoothstep(2.0, 8.0, inland));
    return min(slope, tan(radians(uOceanSwashBand.y)));
}

// the crest arrival the sand at uv follows: the travel time at its nearest waterline texel, two metres past the waterline along the shore
// distance's gradient, averaged with the texels beside it along the shore so the fronts of two waterline points meeting on the sand blend
float oceanSwashArrival(vec2 uv, float shoreDistance) {
    vec2 texel = 1.0 / vec2(textureSize(uOceanField, 0));
    vec2 gradient = vec2(texture(uOceanField, uv + vec2(texel.x, 0.0)).y - texture(uOceanField, uv - vec2(texel.x, 0.0)).y,
        texture(uOceanField, uv + vec2(0.0, texel.y)).y - texture(uOceanField, uv - vec2(0.0, texel.y)).y);
    vec2 toWater = length(gradient) > 1.0e-6 ? normalize(gradient) : vec2(0.0);
    vec2 foot = uv + toWater * (max(-shoreDistance, 0.0) + 2.0) * uOceanFieldBounds.zw;
    vec2 along = vec2(-toWater.y, toWater.x) * texel;
    return 0.5 * texture(uOceanShoreField, foot).x + 0.25 * (texture(uOceanShoreField, foot + along).x + texture(uOceanShoreField, foot - along).x);
}

OceanSwash oceanSwashAt(vec2 xz, float height) {
    OceanSwash s = OceanSwash(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    vec2 uv = (xz - uOceanFieldBounds.xy) * uOceanFieldBounds.zw;
    vec4 field = texture(uOceanField, uv);
    float period = uOceanSwash.y;
    float lag = uOceanTime - oceanSwashArrival(uv, field.y);
    float u = fract(lag / period);
    s.cycle = u;
    // the wave-to-wave run-up: the group envelope and the longshore variation of the train, damped by the shore exposure like the train
    float sheltered = uOceanShoreExposure.x + (1.0 - uOceanShoreExposure.x) * field.w;
    vec2 p = xz / uOceanShoreWave.w + vec2(3.7, 11.9);
    float longshore = 1.0 + uOceanShoreShape.y * (2.0 * (0.65 * oceanValueNoise(p) + 0.35 * oceanValueNoise(p * 2.0 + vec2(5.1, 2.3))) - 1.0);
    float slope = oceanSwashSlope(uv, height, field.y);
    float base = oceanSwashRunup(slope) * longshore * sheltered;
    float cycleStart = lag - u * period;
    float runupMax = 0.0;
    float wetness = 0.0;
    float deposit = 0.0;
    // the current cycle and the remembered ones before it
    for (int i = 0; i < 12; i++) {
        if (float(i) >= uOceanSwashBand.z) break;
        float start = cycleStart - float(i) * period;
        float group = 1.0 + uOceanShoreShape.x * sin(6.283185307179586 * start / uOceanShoreWave.y);
        float runup = base * group;
        // the oldest remembered cycle fades out over its last period, so the memory window never drops a wave at once
        float age = 1.0 - clamp(u + float(i) - (uOceanSwashBand.z - 1.0), 0.0, 1.0);
        runupMax = max(runupMax, runup * age);
        if (i == 0) {
            s.runup = runup;
            float front = runup * sin(3.141592653589793 * u);
            s.film = 1.0 - smoothstep(front - 0.03, front + 0.03, height);
            s.thickness = max(front - height, 0.0) / max(runup, 0.01);
            // the foam at the leading edge is a band of a fixed width along the beach (the sheet's depth over the foreshore slope, so a flat
            // beach does not turn a share of the run-up into tens of metres of foam); behind it the sheet carries foam that thins seaward
            float behind = max(front - height, 0.0) / max(slope, 0.02);
            s.front = (1.0 - smoothstep(0.0, uOceanSwashBand.w, behind)) * s.film;
            s.sheetFoam = uOceanSwash.w * (1.0 - smoothstep(0.0, 0.6, s.thickness)) * s.film;
        }
        if (runup <= height) continue;
        // the sheet covered this height between the phases where runup sin(pi u) = height
        float ua = asin(clamp(height / runup, 0.0, 1.0)) / 3.141592653589793, ub = 1.0 - ua;
        float ui = u + float(i);
        float since = ui < ua ? -1.0 : (ui <= ub ? 0.0 : (ui - ub) * period);
        if (since < 0.0) continue;
        wetness = max(wetness, exp(-since / uOceanSwash.z) * age);
        // the foam the backwash left here: dying with its lifetime, most where this run-up stalled (its top), little on the lower foreshore
        deposit = max(deposit, exp(-since / uOceanSwashFoam.y) * (0.4 + 0.6 * smoothstep(0.3, 1.0, height / runup)) * age);
    }
    // the saturated core below the tidal and capillary reach (the static band of AI577 D5)
    float reach = uOceanSwashBand.x;
    wetness = max(wetness, 1.0 - smoothstep(LANDSCAPE_TERRAIN_WETTING.x * reach, reach, height));
    s.wetness = clamp(wetness, 0.0, 1.0);
    s.deposit = deposit * uOceanSwashFoam.x * (1.0 - s.film);
    s.wrack = smoothstep(runupMax - 0.3, runupMax - 0.08, height) * (1.0 - smoothstep(runupMax + 0.02, runupMax + 0.18, height)) * (1.0 - s.film);
    return s;
}
