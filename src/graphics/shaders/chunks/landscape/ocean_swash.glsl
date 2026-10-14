// AI 597 D4 swash and wet beach (landscape-ocean-v1): the run-up and backwash of each wave of the shore train across the foreshore, and the
// wetness and the foam the swash leaves on the sand, all analytic in time (no state, so a fixed time repeats exactly). The train's crest
// reaches the waterline at phase 0: the arrival a fragment of sand follows is its nearest waterline texel's (the shore distance is an exact
// distance field, so its gradient leads to that texel and the travel time is read there); the swash cycle u = fract(lag / period) then runs
// the water sheet up the beach to the wave's run-up R and back: the front stands R sin(pi u) / beta metres inland of the waterline along the
// shore distance averaged over the field's 3 x 3 texels (a smooth offset of the shoreline; the 3.9 m raster's waterline is a staircase and
// the sand's own relief never interrupts the sheet). R is the Stockdon et al. (2006) R2 run-up of the sea state's swell at the foreshore
// slope beta of this longshore position (the field's sand height eight metres inland of the waterline over those eight metres), scaled by the
// train's group envelope, its longshore variation and the shore exposure like the train itself. The sand at a distance d is wet while the
// sheet covers it and dries afterwards with a lag (e^(-t / drying)): the last of the remembered cycles whose excursion passed d gives the
// time since the water receded. The foam the backwash leaves follows the same memory with its own, shorter lifetime, strongest at the top of
// each run-up where the water stalls, and scales with the foam supply of the shoreline (the D3 state's deposit channel). Below the tidal and
// capillary reach the sand stays saturated (the AI577 D5 static band's core, which the sheet replaces in time). The wrack line lies at the
// highest excursion of the remembered cycles. The vertex program places the sheet on the native beach heights.
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

// the field averaged over the 3 x 3 texels around uv: the waterline of the 3.9 m raster is a staircase, its smoothed offset is what the
// sheet follows
vec4 oceanSwashFieldWide(vec2 uv) {
    vec2 texel = 1.0 / vec2(textureSize(uOceanField, 0));
    vec4 sum = vec4(0.0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) sum += texture(uOceanField, uv + vec2(float(i), float(j)) * texel);
    return sum / 9.0;
}

// the unit direction toward the water in texture space (the shore distance's gradient; the distance field is exact, so it points at the
// nearest waterline texel)
vec2 oceanSwashToWater(vec2 uv) {
    vec2 texel = 1.0 / vec2(textureSize(uOceanField, 0));
    vec2 gradient = vec2(texture(uOceanField, uv + vec2(texel.x, 0.0)).y - texture(uOceanField, uv - vec2(texel.x, 0.0)).y,
        texture(uOceanField, uv + vec2(0.0, texel.y)).y - texture(uOceanField, uv - vec2(0.0, texel.y)).y);
    return length(gradient) > 1.0e-6 ? normalize(gradient) : vec2(0.0);
}

// the crest arrival the sand follows: the travel time at its nearest waterline texel, two metres past the waterline, averaged over the 3 x 3
// texels there (the marched time has local maxima in the inner corners of the raster's staircased waterline; averaged, the fronts of two
// waterline points meeting on the sand blend)
float oceanSwashArrival(vec2 uv, vec2 toWater, float shoreDistance) {
    vec2 texel = 1.0 / vec2(textureSize(uOceanField, 0));
    vec2 foot = uv + toWater * (max(-shoreDistance, 0.0) + 2.0) * uOceanFieldBounds.zw;
    float sum = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) sum += texture(uOceanShoreField, foot + vec2(float(i), float(j)) * texel).x;
    return sum / 9.0;
}

// the foreshore slope that drives the run-up at this longshore position (Stockdon uses the mean slope of the swash zone, not the local one,
// which a berm face would turn into metres of run-up and a raster texel's centre into none): the field's sand height eight metres inland of
// the waterline over those eight metres, averaged along the shore, between a floor and the maximum beach slope; the same for every fragment
// across the profile, on the water side too
float oceanSwashSlope(vec2 uv, vec2 toWater, float shoreDistance) {
    vec2 texel = 1.0 / vec2(textureSize(uOceanField, 0));
    vec2 waterline = uv - toWater * shoreDistance * uOceanFieldBounds.zw;
    vec2 probe = waterline - toWater * 8.0 * uOceanFieldBounds.zw;
    vec2 along = vec2(-toWater.y, toWater.x) * texel;
    float height = max(-(0.5 * texture(uOceanField, probe).x + 0.25 * (texture(uOceanField, probe + along).x + texture(uOceanField, probe - along).x)), 0.0);
    return clamp(height / 8.0, 0.02, tan(radians(uOceanSwashBand.y)));
}

OceanSwash oceanSwashAt(vec2 xz, float height) {
    OceanSwash s = OceanSwash(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    vec2 uv = (xz - uOceanFieldBounds.xy) * uOceanFieldBounds.zw;
    vec4 field = texture(uOceanField, uv);
    vec4 wide = oceanSwashFieldWide(uv);
    vec2 toWater = oceanSwashToWater(uv);
    float period = uOceanSwash.y;
    float lag = uOceanTime - oceanSwashArrival(uv, toWater, field.y);
    float u = fract(lag / period);
    s.cycle = u;
    // the wave-to-wave run-up: the group envelope and the longshore variation of the train, damped by the shore exposure like the train
    float sheltered = uOceanShoreExposure.x + (1.0 - uOceanShoreExposure.x) * field.w;
    vec2 p = xz / uOceanShoreWave.w + vec2(3.7, 11.9);
    float longshore = 1.0 + uOceanShoreShape.y * (2.0 * (0.65 * oceanValueNoise(p) + 0.35 * oceanValueNoise(p * 2.0 + vec2(5.1, 2.3))) - 1.0);
    float slope = oceanSwashSlope(uv, toWater, field.y);
    float base = oceanSwashRunup(slope) * longshore * sheltered;
    // the sheet is placed by the cross-shore distance, not by the sand's own height: the run-up R climbs the foreshore slope, so its edge
    // stands R / slope metres inland of the smoothed waterline, and the sand's hummocks and ridges neither ring the front with foam nor
    // push it into spikes
    float inland = max(-wide.y, 0.0);
    // the sheet's foam belongs to the land side of the waterline: the water side is the rings' (their breaker and shoreline foam)
    float onLand = smoothstep(-0.5, 0.5, -wide.y);
    float metersPerMeter = 1.0 / slope;
    float cycleStart = lag - u * period;
    float excursionMax = 0.0;
    float wetness = 0.0;
    float deposit = 0.0;
    // the current cycle and the remembered ones before it
    for (int i = 0; i < 12; i++) {
        if (float(i) >= uOceanSwashBand.z) break;
        float start = cycleStart - float(i) * period;
        float group = 1.0 + uOceanShoreShape.x * sin(6.283185307179586 * start / uOceanShoreWave.y);
        float runup = base * group;
        float excursion = runup * metersPerMeter;
        // the oldest remembered cycle fades out over its last period, so the memory window never drops a wave at once
        float age = 1.0 - clamp(u + float(i) - (uOceanSwashBand.z - 1.0), 0.0, 1.0);
        excursionMax = max(excursionMax, excursion * age);
        if (i == 0) {
            s.runup = runup;
            float front = excursion * sin(3.141592653589793 * u);
            s.film = 1.0 - smoothstep(front - 0.4, front + 0.4, inland);
            s.thickness = max(front - inland, 0.0) / max(excursion, 0.1);
            // the foam rides the advancing edge over a band of a fixed width along the beach and thins away as the sheet recedes (the backwash
            // leaves its foam on the sand instead: the deposit below); behind the edge the sheet carries foam that thins seaward
            float behind = max(front - inland, 0.0);
            float advancing = 1.0 - smoothstep(0.5, 0.85, u);
            s.front = (1.0 - smoothstep(0.0, uOceanSwashBand.w, behind)) * s.film * advancing * onLand;
            s.sheetFoam = uOceanSwash.w * (1.0 - smoothstep(0.0, 0.6, s.thickness)) * s.film * onLand;
        }
        if (excursion <= inland) continue;
        // the sheet covered this distance between the phases where excursion sin(pi u) = inland
        float ua = asin(clamp(inland / excursion, 0.0, 1.0)) / 3.141592653589793, ub = 1.0 - ua;
        float ui = u + float(i);
        float since = ui < ua ? -1.0 : (ui <= ub ? 0.0 : (ui - ub) * period);
        if (since < 0.0) continue;
        wetness = max(wetness, exp(-since / uOceanSwash.z) * age);
        // the foam the backwash left here: dying with its lifetime, most where this run-up stalled (its top), little on the lower foreshore
        deposit = max(deposit, exp(-since / uOceanSwashFoam.y) * (0.4 + 0.6 * smoothstep(0.3, 1.0, inland / excursion)) * age);
    }
    // the saturated core below the tidal and capillary reach (the static band of AI577 D5)
    float reach = uOceanSwashBand.x;
    // the saturated core fades over the last forty metres of the band so its inland edge never shows as a step on a low, wide beach
    wetness = max(wetness, (1.0 - smoothstep(LANDSCAPE_TERRAIN_WETTING.x * reach, reach, height)) * (1.0 - smoothstep(60.0, 100.0, inland)));
    s.wetness = clamp(wetness, 0.0, 1.0);
    s.deposit = deposit * uOceanSwashFoam.x * (1.0 - s.film) * onLand;
    // the wrack line two metres wide at the highest remembered excursion
    s.wrack = smoothstep(excursionMax - 1.5, excursionMax - 0.4, inland) * (1.0 - smoothstep(excursionMax + 0.1, excursionMax + 0.9, inland)) * (1.0 - s.film);
    return s;
}
