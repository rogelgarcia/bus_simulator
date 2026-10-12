// AI 597 D2 shore waves (landscape-ocean-v1): the coherent swell of the sea state refracted, shoaled and broken by the bathymetry inside the
// landscape extent, added to the spectral sea as one wave train. The extent field (uOceanField, RGBA16F) carries per texel the depth, the signed
// shore distance, the wave height after energy-flux shoaling capped by depth-limited breaking (H <= gamma h on sand, the cap carried past reefs
// and bars; uncapped surge on rock) and the shore exposure of the geology; the shore field (uOceanShoreField, RG32F) the travel time of the swell
// period from the open sea (LandscapeOceanShore.js: fast marching with the finite-depth phase speed, so crests turn toward the shore normal; the
// land side holds the shoreline values so the bilinear lookup never bleeds a sentinel) and the rock flag (platform, bluff toe). The
// train: phase omega (t - T), amplitude H / 2 under a travelling group envelope and a longshore variation, a Stokes-like crest that sharpens as
// H / h approaches gamma, a front steepened into a bore where the wave breaks (a phase skew compresses the face that travels first), a Gerstner
// orbital displacement toward the crest, and on rock a partially reflected (standing) component instead of a bore. The weight is the complement
// of the swell cascade's depth fade, so the open sea's swell hands over to the shore wave once, never twice, and the sheltered shore (low
// exposure) damps the train over its last stretch. The train is band-limited like the cascades: a vertex grid coarser than an eighth of the
// local wavelength stops displacing (no geometric aliasing on the far rings), a pixel footprint wider than that stops tilting the facet and
// hands the train's mean square slope to the LEAN roughness instead (no dark streaks at grazing views).
// field: x depth (m, negative over land), y shore distance (m, positive in water), z wave height (m, 0 over land), w shore exposure (0 sheltered .. 1 open)
// shore field: x travel time (s), y rock (1) minus 8 over land (so a bilinear sample below -4 is land)
uniform sampler2D uOceanShoreField;
// x angular frequency of the train (rad/s), y group period (s), z gamma (breaking index), w longshore variation wavelength (m)
uniform vec4 uOceanShoreWave;
// x depth where the train is full, y depth where it is gone (the swell cascade fades the other way), z orbital displacement scale, w rock reflection
uniform vec4 uOceanShoreMix;
// x group envelope amplitude, y longshore variation amplitude, z 1 active or 0 inactive, w crest sharpening at breaking
uniform vec4 uOceanShoreShape;
// x exposure floor (the amplitude factor of a fully sheltered shore), y shore distance where the damping is full, z where it is gone,
// w texels per wavelength below which the train fades (the cascades' band limit)
uniform vec4 uOceanShoreExposure;
uniform float uOceanTime;

struct OceanShoreWave {
    float amplitude;   // half the local wave height after the envelope, the exposure and the depth weight (m)
    float phase;       // omega (t - T)
    vec2 direction;    // unit propagation direction in the plane
    float slowness;    // |grad T| (s / m), the inverse phase speed
    float travel;      // T (s)
    float steep;       // crest sharpening 0..1 (H / h approaching gamma)
    float breaking;    // bore strength 0..1 (sand only)
    float rock;        // 1 over the rock platform and the bluff toe
    float weight;      // depth weight of the train
    float shallow;     // 0 at the waterline, 1 from a metre of depth (the orbital motion's fade)
};

bool oceanShoreInside(vec2 xz) { return uOceanShoreShape.z > 0.5 && oceanInside(xz, uOceanFieldBounds); }

// the train at a plane position (zero amplitude outside the extent, over land and in the open sea)
OceanShoreWave oceanShoreAt(vec2 xz) {
    OceanShoreWave wave = OceanShoreWave(0.0, 0.0, vec2(1.0, 0.0), 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if (!oceanShoreInside(xz)) return wave;
    vec2 uv = (xz - uOceanFieldBounds.xy) * uOceanFieldBounds.zw;
    vec4 field = texture(uOceanField, uv);
    if (field.x <= 0.0 || field.z <= 0.0) return wave;
    vec2 shore = texture(uOceanShoreField, uv).xy;
    vec2 texel = 1.0 / vec2(textureSize(uOceanShoreField, 0));
    vec2 spacing = texel / uOceanFieldBounds.zw;
    vec2 east = texture(uOceanShoreField, uv + vec2(texel.x, 0.0)).xy, west = texture(uOceanShoreField, uv - vec2(texel.x, 0.0)).xy;
    vec2 north = texture(uOceanShoreField, uv + vec2(0.0, texel.y)).xy, south = texture(uOceanShoreField, uv - vec2(0.0, texel.y)).xy;
    // central differences over water, one-sided where a neighbour is land
    float dx = (east.y > -4.0 && west.y > -4.0) ? (east.x - west.x) : (east.y > -4.0 ? 2.0 * (east.x - shore.x) : (west.y > -4.0 ? 2.0 * (shore.x - west.x) : 0.0));
    float dz = (north.y > -4.0 && south.y > -4.0) ? (north.x - south.x) : (north.y > -4.0 ? 2.0 * (north.x - shore.x) : (south.y > -4.0 ? 2.0 * (shore.x - south.x) : 0.0));
    vec2 gradient = vec2(dx / (2.0 * spacing.x), dz / (2.0 * spacing.y));
    float slowness = length(gradient);
    if (slowness <= 1.0e-5) return wave;
    float rock = clamp(shore.y, 0.0, 1.0);
    float sheltered = uOceanShoreExposure.x + (1.0 - uOceanShoreExposure.x) * field.w;
    float exposure = 1.0 - (1.0 - sheltered) * (1.0 - smoothstep(uOceanShoreExposure.y, uOceanShoreExposure.z, field.y));
    float lag = uOceanTime - shore.x;
    float group = 1.0 + uOceanShoreShape.x * sin(6.283185307179586 * lag / uOceanShoreWave.y);
    vec2 p = xz / uOceanShoreWave.w + vec2(3.7, 11.9);
    float longshore = 1.0 + uOceanShoreShape.y * (2.0 * (0.65 * oceanValueNoise(p) + 0.35 * oceanValueNoise(p * 2.0 + vec2(5.1, 2.3))) - 1.0);
    wave.weight = 1.0 - smoothstep(uOceanShoreMix.x, uOceanShoreMix.y, field.x);
    // a surge over rock keeps its uncapped height, within the water it has (twice the sand cap plus a sheet)
    float height = min(field.z, 2.0 * uOceanShoreWave.z * field.x + 0.25);
    wave.amplitude = 0.5 * height * group * longshore * exposure * wave.weight;
    wave.phase = uOceanShoreWave.x * lag;
    wave.direction = gradient / slowness;
    wave.slowness = slowness;
    wave.travel = shore.x;
    wave.rock = rock;
    wave.steep = clamp(field.z / (max(field.x, 0.05) * uOceanShoreWave.z), 0.0, 1.0);
    wave.breaking = smoothstep(0.8, 1.0, wave.steep) * (1.0 - rock);
    wave.shallow = smoothstep(0.0, 1.0, field.x);
    return wave;
}

// the elevation of the train at a phase (unit amplitude): a Stokes-like crest that sharpens toward breaking, the front face compressed into a bore
// by the skew where the wave breaks (phase decreases toward the shore, so the face at negative phase travels first), plus the reflected component
float oceanShoreProfile(float phase, OceanShoreWave wave) {
    float skew = 0.7 * wave.breaking, sharpen = uOceanShoreShape.w * wave.steep;
    float s = phase + skew * cos(phase);
    float crest = cos(s) + 0.5 * sharpen * cos(2.0 * s);
    float reflected = uOceanShoreMix.w * wave.rock * cos(phase + 2.0 * uOceanShoreWave.x * wave.travel);
    return crest + reflected;
}

float oceanShoreProfileDerivative(float phase, OceanShoreWave wave) {
    float skew = 0.7 * wave.breaking, sharpen = uOceanShoreShape.w * wave.steep;
    float s = phase + skew * cos(phase), ds = 1.0 - skew * sin(phase);
    float crest = (-sin(s) - sharpen * sin(2.0 * s)) * ds;
    float reflected = -uOceanShoreMix.w * wave.rock * sin(phase + 2.0 * uOceanShoreWave.x * wave.travel);
    return crest + reflected;
}

// the share of the train a sampling spacing resolves: 1 up to the band limit (texels per wavelength), 0 at a quarter of it
float oceanShoreResolved(OceanShoreWave wave, float spacing) {
    float wavelength = 6.283185307179586 / (uOceanShoreWave.x * wave.slowness);
    float limit = wavelength / uOceanShoreExposure.w;
    return 1.0 - smoothstep(limit, 4.0 * limit, spacing);
}

// the displacement (Dx, h, Dz) of the train at a plane position for a vertex grid of the given cell: the elevation plus the Gerstner orbital
// motion toward the crest, faded out where the grid cannot resolve the local wavelength
vec3 oceanShoreDisplacement(vec2 xz, float cell) {
    OceanShoreWave wave = oceanShoreAt(xz);
    if (wave.amplitude <= 0.0) return vec3(0.0);
    float resolved = oceanShoreResolved(wave, cell);
    if (resolved <= 0.0) return vec3(0.0);
    float elevation = wave.amplitude * oceanShoreProfile(wave.phase, wave);
    // the orbital motion stops in the last metre of depth (the run-up over the sand is the AI 597 D4 swash, not a displaced vertex)
    vec2 orbital = wave.amplitude * uOceanShoreMix.z * wave.shallow * sin(wave.phase) * wave.direction;
    return vec3(orbital.x, elevation, orbital.y) * resolved;
}

struct OceanShoreSlope {
    vec2 slope;      // d elevation / d x, d elevation / d z of the resolved train
    float variance;  // mean square slope of the unresolved train (for the LEAN roughness)
    float breaking;  // bore strength
};

// the slope of the train at a fragment's plane position for a pixel footprint, with the mean square slope it no longer resolves
OceanShoreSlope oceanShoreSlopeAt(vec2 xz, float footprint) {
    OceanShoreSlope result = OceanShoreSlope(vec2(0.0), 0.0, 0.0);
    OceanShoreWave wave = oceanShoreAt(xz);
    if (wave.amplitude <= 0.0) return result;
    float resolved = oceanShoreResolved(wave, footprint);
    float derivative = oceanShoreProfileDerivative(wave.phase, wave);
    float steepness = wave.amplitude * uOceanShoreWave.x * wave.slowness;
    result.slope = -steepness * derivative * wave.direction * resolved;
    // a sinusoid of amplitude a and wavenumber k has the mean square slope (a k)^2 / 2
    result.variance = 0.5 * steepness * steepness * (1.0 - resolved * resolved);
    result.breaking = wave.breaking * wave.weight;
    return result;
}
