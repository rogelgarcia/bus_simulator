// Verifies the landscape lighting tiers, calibrated atmosphere and water optics constants, and the JavaScript mirrors of their shader math.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CALIBRATED_DAYLIGHT } from '../../../src/graphics/lighting/CalibratedDaylight.js';
import { cityPointToLandscape } from '../../../src/app/landscape/LandscapeCityBinding.js';
import { LANDSCAPE_ATMOSPHERE, LANDSCAPE_LIGHTING, LANDSCAPE_LIGHTING_TIERS, LANDSCAPE_REFERENCE_PROBE_LIGHTING, LANDSCAPE_WATER_LEVEL_DISABLED, LANDSCAPE_WATER_OPTICS,
    createLandscapeLightingUniforms, createLandscapeReferenceProbeLightingUniforms, landscapeAerialPerspective, landscapeAtmosphereVisibilityMeters, landscapeHazeAsymptote,
    landscapeHazeCalibration, landscapeHazeIsotropicSource, landscapeInWaterPath, landscapeLightingDefines, landscapeLightingTier, landscapeLightingUniformValues, landscapeMieCoefficients,
    landscapeOpticalLength, landscapeSunDirection, landscapeWaterColumn, landscapeWaterFresnel, landscapeWaterRefractedCosine, landscapeWaterSurfaceRoughness } from '../../../src/graphics/engine3d/landscape/LandscapeLightingModel.js';
import { evaluateLandscapeSkyIrradiance } from '../../../src/graphics/engine3d/landscape/LandscapeSkyIrradiance.js';

const root = new URL('../../../', import.meta.url);
const calibration = JSON.parse(await readFile(new URL('assets/public/lighting/calibrated/clear-afternoon-55.json', root), 'utf8'));
// a clear-sky-like harmonic state (band 0 and a bright-up gradient), the calibrated sun at its calibrated direction
const skyCoefficients = new Array(33).fill(0);
[20, 40, 75].forEach((value, channel) => { skyCoefficients[channel] = value; });
[8, 15, 30].forEach((value, channel) => { skyCoefficients[2 * 3 + channel] = value; });
const state = { seaLevel: 0, sunDirection: landscapeSunDirection(CALIBRATED_DAYLIGHT.azimuthDeg, CALIBRATED_DAYLIGHT.elevationDeg), sunIrradiance: [...CALIBRATED_DAYLIGHT.sunNormalRgb], skyCoefficients };
const close = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} ${actual} vs ${expected}`);

test('Lighting model: three tiers compile from parenthesized or decimal defines, never valueless flags', () => {
    assert.deepEqual(Object.keys(LANDSCAPE_LIGHTING_TIERS), ['low', 'standard', 'high']);
    assert.equal(LANDSCAPE_LIGHTING.defaultTier, 'standard');
    assert.equal(LANDSCAPE_LIGHTING.uniformVectors, Object.values(LANDSCAPE_LIGHTING.uniforms).reduce((sum, value) => sum + value, 0));
    assert.throws(() => landscapeLightingTier('ultra'), /landscapeLighting must be one of low, standard, high/);
    for (const tier of Object.keys(LANDSCAPE_LIGHTING_TIERS)) {
        const defines = landscapeLightingDefines(tier);
        assert.equal(defines.LANDSCAPE_LIGHTING_TIER, `(${LANDSCAPE_LIGHTING_TIERS[tier]})`);
        for (const [name, value] of Object.entries(defines)) {
            assert.ok(/^\(\d\)$|^vec3\(.*\)$|[.e]/.test(value), `${name} = ${value} is a GLSL float, vector or parenthesized integer`);
            assert.notEqual(value, '1');
        }
    }
    close(Number(landscapeLightingDefines('standard').LANDSCAPE_SUN_ANGULAR_RADIUS), .53 / 2 * Math.PI / 180, 1e-12, 'solar radius');
});

test('Lighting model: the atmosphere is the calibrated sky profile and the sun follows the game convention and a binding yaw', () => {
    const profile = calibration.profile, defaults = profile.defaults;
    assert.equal(LANDSCAPE_ATMOSPHERE.source.daylight, calibration.id);
    assert.equal(LANDSCAPE_ATMOSPHERE.source.profile, profile.profile.id);
    assert.equal(LANDSCAPE_ATMOSPHERE.source.aerosolDensity, profile.profile.aerosolDensity);
    assert.equal(LANDSCAPE_ATMOSPHERE.source.airDensity, defaults.airDensity);
    assert.equal(LANDSCAPE_ATMOSPHERE.source.ozoneDensity, defaults.ozoneDensity);
    assert.equal(LANDSCAPE_ATMOSPHERE.source.altitudeMeters, defaults.altitudeMeters);
    assert.equal(LANDSCAPE_ATMOSPHERE.source.skyModel, defaults.skyModel);
    assert.equal(LANDSCAPE_ATMOSPHERE.groundAlbedo, defaults.modelGroundAlbedo);
    const mie = landscapeMieCoefficients();
    close(mie.scattering, 5e-6, 1e-18); close(mie.extinction, 5.55e-6, 1e-18); close(mie.albedo, 1 / 1.11, 1e-15);
    // Koschmieder range at 550 nm: about 205 km for this very clear sky
    close(landscapeAtmosphereVisibilityMeters()[1], Math.log(50) / (13.558e-6 + 5.55e-6), 1e-6);
    assert.ok(landscapeAtmosphereVisibilityMeters()[1] > 200000 && landscapeAtmosphereVisibilityMeters()[1] < 210000);
    // azimuthElevationDegToDir: (cos az cos el, sin el, sin az cos el); the calibrated sun is Blender (x, y, z) = three (x, -z, y)
    const sun = landscapeSunDirection(45, 55);
    [sun[0], -sun[2], sun[1]].forEach((value, axis) => close(value, [.40557978767263886, -.40557978767263886, .8191520442889918][axis], 1e-12, 'blender sun'));
    const binding = { format: 'city-landscape-binding', schemaVersion: 1, landscapeId: 'coastal', manifestUrl: 'assets/public/landscape/coastal-city/manifest.json', revision: 'r1',
        transform: { translation: { x: 120, y: -4, z: 300 }, yawDegrees: 37 }, extent: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, capabilities: ['landscape-reference-v1'] };
    binding.transform.scale = 1;
    const game = landscapeSunDirection(210, 14), landscape = landscapeSunDirection(210, 14, 37);
    const a = cityPointToLandscape(binding, { x: 0, z: 0 }), b = cityPointToLandscape(binding, { x: game[0], z: game[2] });
    close(landscape[0], b.x - a.x, 1e-12, 'x'); close(landscape[2], b.z - a.z, 1e-12, 'z'); close(landscape[1], game[1], 0, 'y');
    close(Math.hypot(...landscape), 1, 1e-12);
});

test('Lighting model: closed-form optical lengths match numerical integration of the exponential layers', () => {
    for (const [h0, h1, distance, scale] of [[10, 5, 4000, 8000], [320, 8, 900, 1200], [1500, 10, 1500, 1200], [3, 3, 1000, 1200], [0, 4000, 9000, 8000], [50, 50.0001, 700, 1200]]) {
        let numeric = 0;
        const steps = 20000;
        for (let index = 0; index < steps; index++) { const t = (index + .5) / steps; numeric += Math.exp(-(h0 + (h1 - h0) * t) / scale) * distance / steps; }
        close(landscapeOpticalLength(h0, h1, distance, scale), numeric, numeric * 1e-6, `${h0}→${h1} over ${distance}`);
    }
    assert.equal(landscapeOpticalLength(10, 10, 0, 8000), 0);
});

test('Lighting model: aerial perspective is neutral at zero distance and converges to the calibrated horizon on long horizontal paths', () => {
    const horizon = [16.92, 18.21, 17.53];
    for (const tier of ['standard', 'high']) {
        const { calibration: factors, raw, asymptote, clamped } = landscapeHazeCalibration(state, horizon, tier);
        assert.equal(clamped, false); raw.forEach((value, channel) => close(value, horizon[channel] / asymptote[channel], 1e-12));
        const calibrated = { ...state, calibration: factors };
        const zero = landscapeAerialPerspective(calibrated, [5, 20, 5], [5, 20, 5], tier);
        zero.transmittance.forEach(value => assert.equal(value, 1)); zero.inscatter.forEach(value => assert.equal(value, 0));
        // an optically infinite horizontal path at sea level averaged over azimuth reproduces the horizon radiance
        const average = [0, 0, 0];
        for (let index = 0; index < 64; index++) {
            const angle = (index + .5) / 64 * 2 * Math.PI, far = [Math.cos(angle) * 4e7, 0, Math.sin(angle) * 4e7];
            const haze = landscapeAerialPerspective(calibrated, [0, 0, 0], far, tier);
            haze.transmittance.forEach(value => assert.ok(value < 1e-30));
            haze.inscatter.forEach((value, channel) => { average[channel] += value / 64; });
        }
        average.forEach((value, channel) => close(value, horizon[channel], horizon[channel] * 1e-9, `${tier} horizon channel ${channel}`));
    }
    const low = landscapeAerialPerspective(state, [0, 300, 0], [3000, 0, 0], 'low');
    assert.deepEqual(low, { transmittance: [1, 1, 1], inscatter: [0, 0, 0] });
    // 4 km horizontal at sea level: Rayleigh + Mie extinction only
    const haze = landscapeAerialPerspective({ ...state, calibration: [1, 1, 1] }, [0, 0, 0], [4000, 0, 0], 'standard');
    haze.transmittance.forEach((value, channel) => close(value, Math.exp(-(LANDSCAPE_ATMOSPHERE.rayleighScattering[channel] + 5.55e-6) * 4000), 1e-12));
    // the isotropic source holds the mean sky radiance and a lower hemisphere of model-albedo ground lit by sun and sky
    const iso = landscapeHazeIsotropicSource(state), up = evaluateLandscapeSkyIrradiance(skyCoefficients, [0, 1, 0]);
    iso.forEach((value, channel) => close(value, skyCoefficients[channel] / Math.PI + .5 * .3 / Math.PI * (state.sunIrradiance[channel] * state.sunDirection[1] + up[channel]), 1e-12));
    // forward scattering: looking toward the sun gathers more than looking away
    const toward = landscapeHazeAsymptote(state, state.sunDirection, 'standard'), away = landscapeHazeAsymptote(state, state.sunDirection.map(value => -value), 'standard');
    toward.forEach((value, channel) => assert.ok(value > away[channel]));
});

test('Lighting model: water Fresnel, refraction, in-water paths and the column mirror physical limits', () => {
    const n = LANDSCAPE_WATER_OPTICS.ior;
    close(landscapeWaterFresnel(1), ((n - 1) / (n + 1)) ** 2, 1e-12, 'normal incidence');
    assert.ok(landscapeWaterFresnel(.001) > .99, 'grazing');
    assert.equal(landscapeWaterFresnel(Math.cos(50 * Math.PI / 180), n, 1), 1, 'total internal reflection beyond the 48.6° critical angle');
    assert.ok(landscapeWaterFresnel(Math.cos(40 * Math.PI / 180), n, 1) < 1);
    close(landscapeWaterRefractedCosine(Math.cos(60 * Math.PI / 180)), Math.cos(Math.asin(Math.sin(60 * Math.PI / 180) / n)), 1e-12, 'Snell');
    close(landscapeWaterRefractedCosine(0), Math.sqrt(1 - 1 / (n * n)), 1e-12, 'horizon light refracts to the critical angle');
    const surface = landscapeWaterSurfaceRoughness();
    close(surface.meanSquareSlope, .003 + .00512 * 3, 1e-15); close(surface.roughness, Math.sqrt(Math.sqrt(surface.meanSquareSlope)), 1e-15);
    // exact in-water segments: camera above water, camera below water, dry target
    const above = landscapeInWaterPath([0, 10, 0], [30, -5, 40], 0);
    close(above.pathLength, Math.hypot(30, 15, 40) * 5 / 15, 1e-9); close(above.entry[1], 0, 1e-9); assert.equal(above.startDepth, 0);
    const below = landscapeInWaterPath([0, -2, 0], [0, -6, 3], 0);
    close(below.pathLength, 5, 1e-12); assert.equal(below.startDepth, 2); assert.equal(below.entry, null);
    assert.equal(landscapeInWaterPath([0, 10, 0], [5, 2, 5], 0).pathLength, 0);
    for (const tier of ['low', 'standard']) {
        const shallow = landscapeWaterColumn(state, { pathLength: 0, descent: 0, startDepth: 0 }, tier);
        shallow.transmittance.forEach(value => assert.equal(value, 1)); shallow.inscatter.forEach(value => assert.equal(value, 0));
    }
    // an infinitely deep nadir column reproduces Gordon's rrs·Ed(0-), and the closed form integrates the relaxation ODE exactly
    const deep = landscapeWaterColumn(state, { pathLength: 1e5, descent: 1e5, startDepth: 0 }, 'standard');
    deep.inscatter.forEach((value, channel) => close(value, deep.deep[channel], deep.deep[channel] * 1e-9, 'deep nadir equilibrium'));
    const kappa = LANDSCAPE_WATER_OPTICS.absorption.map((value, channel) => value + LANDSCAPE_WATER_OPTICS.backscatter[channel]);
    for (const [pathLength, descent, startDepth] of [[12, 3, 0], [6, -2, 4], [40, 40, 0]]) {
        const column = landscapeWaterColumn(state, { pathLength, descent, startDepth }, 'standard');
        for (let channel = 0; channel < 3; channel++) {
            const steps = 40000, rate = column.diffuseAttenuation[channel];
            const equilibrium = column.deep[channel] * (kappa[channel] + rate) / kappa[channel];
            let numeric = 0;
            for (let index = 0; index < steps; index++) {
                const t = (index + .5) / steps * pathLength, depth = descent * t / pathLength;
                numeric += kappa[channel] * equilibrium * Math.exp(-rate * depth) * Math.exp(-kappa[channel] * t) * pathLength / steps;
            }
            close(column.inscatter[channel], numeric, numeric * 1e-6, `column ${pathLength}/${descent}/${startDepth} channel ${channel}`);
            close(column.transmittance[channel], Math.exp(-kappa[channel] * pathLength), 1e-15);
        }
    }
    const low = landscapeWaterColumn(state, { pathLength: 8, descent: 8, startDepth: 0 }, 'low');
    low.inscatter.forEach((value, channel) => close(value, low.deep[channel] * (1 - low.transmittance[channel]), 1e-12, 'constant deep source'));
    // water reads blue-green: red attenuates fastest
    assert.ok(kappa[0] > kappa[1] && kappa[0] > kappa[2]);
    assert.ok(deep.deep[2] > deep.deep[0] && deep.deep[1] > deep.deep[0]);
});

test('Lighting model: uniform values pack the shader layout; defaults and the probe reference are explicit', () => {
    const values = landscapeLightingUniformValues({ ...state, calibration: [1.1, 1.2, 1.3], waterLevel: 0 });
    assert.equal(values.uLandscapeSky.length, 36);
    assert.deepEqual(Array.from(values.uLandscapeSun), [...state.sunDirection, 0].map(Math.fround));
    assert.deepEqual(Array.from(values.uLandscapeSunIrradiance), [...state.sunIrradiance, 0].map(Math.fround));
    assert.equal(values.uLandscapeSky[11], Math.fround(1.1)); assert.equal(values.uLandscapeSky[23], Math.fround(1.2)); assert.equal(values.uLandscapeSky[35], Math.fround(1.3));
    assert.equal(values.uLandscapeSky[12 + 2], Math.fround(skyCoefficients[2 * 3 + 1]), 'green y coefficient');
    assert.throws(() => landscapeLightingUniformValues({ ...state, sunDirection: [0, 2, 0], waterLevel: 0 }), /unit vector/);
    const defaults = createLandscapeLightingUniforms();
    assert.deepEqual(Array.from(defaults.uLandscapeSunIrradiance.value), [...CALIBRATED_DAYLIGHT.sunNormalRgb, LANDSCAPE_WATER_LEVEL_DISABLED].map(Math.fround));
    assert.ok(defaults.uLandscapeSky.value.every((value, index) => index % 12 === 11 ? value === 1 : value === 0), 'no sky light until the calibrated environment is projected');
    const probe = createLandscapeReferenceProbeLightingUniforms();
    // the pre-D5 hemisphere ambient 0.68·mix(ground, sky, n.y/2 + 1/2) as sky irradiance: π·0.68 times its value at up and down
    const up = evaluateLandscapeSkyIrradiance(LANDSCAPE_REFERENCE_PROBE_LIGHTING.skyCoefficients, [0, 1, 0]), down = evaluateLandscapeSkyIrradiance(LANDSCAPE_REFERENCE_PROBE_LIGHTING.skyCoefficients, [0, -1, 0]);
    [.65, .78, .83].forEach((value, channel) => close(up[channel], Math.PI * .68 * value, 1e-12)); [.30, .34, .25].forEach((value, channel) => close(down[channel], Math.PI * .68 * value, 1e-12));
    assert.equal(probe.uLandscapeSunIrradiance.value[3], LANDSCAPE_WATER_LEVEL_DISABLED);
    close(Math.hypot(...LANDSCAPE_REFERENCE_PROBE_LIGHTING.sunDirection), 1, 1e-12);
});

test('Lighting model: terrain and water shaders read only the lighting uniforms, defines and hooks (no fixed sun, sky or hemisphere constants)', async () => {
    const read = path => readFile(new URL(`src/graphics/shaders/${path}`, root), 'utf8');
    const terrain = await read('materials/landscape/terrain.frag.glsl'), lighting = await read('chunks/landscape/lighting.glsl');
    const atmosphere = await read('chunks/landscape/atmosphere.glsl'), water = await read('chunks/landscape/water_optics.glsl'), hooks = await read('chunks/landscape/lighting_visibility.glsl');
    const surface = await read('materials/landscape/water.frag.glsl');
    for (const source of [terrain, lighting, atmosphere, water, surface]) {
        assert.doesNotMatch(source, /-0\.44,\s*0\.87|2\.7,\s*2\.6,\s*2\.3|0\.65,\s*0\.78,\s*0\.83|hemisphere \* surface/, 'the pre-D5 fixed lights are gone');
    }
    assert.match(terrain, /#include <shaderlib:landscape\/terrain_fields>\s+#include <shaderlib:landscape\/lighting_visibility>\s+#include <shaderlib:landscape\/lighting>\s+#include <shaderlib:landscape\/atmosphere>\s+#include <shaderlib:landscape\/water_optics>/);
    // AI577 D5c: the terrain program binds the hooks to its once-per-fragment terrain-field evaluation; programs without fields keep them neutral
    assert.match(hooks, /float landscapeSunVisibility\(vec3 world, vec3 normal, vec3 sunDirection\) \{\s+#ifdef LANDSCAPE_TERRAIN_FIELDS\s+return landscapeFragmentSunVisibility;\s+#else\s+return 1\.0;\s+#endif\s+\}/);
    assert.match(hooks, /float landscapeSkyVisibility\(vec3 world, vec3 normal\) \{\s+#ifdef LANDSCAPE_TERRAIN_FIELDS\s+return landscapeFragmentSkyVisibility;\s+#else\s+return 1\.0;\s+#endif\s+\}/);
    assert.ok(!surface.includes('terrain_fields'), 'the water surface keeps neutral hooks');
    assert.match(terrain, /void terrainVisibility\(vec2 world, vec2 dx, vec2 dy, vec3 geometricNormal\) \{\s+#if LANDSCAPE_LIGHTING_TIER > 0\s+landscapeEvaluateTerrainVisibility\(world, dx, dy, geometricNormal\);\s+#endif\s+\}/,
        'the low tier skips the terrain fields');
    const main = terrain.slice(terrain.indexOf('void main() {'));
    // AI577 D5: the appearance and fallback paths share one lighting call site, which halves the inlined lighting code
    assert.equal((main.match(/color = terrainRadiance\(/g) || []).length, 1, 'the appearance and fallback paths are lit through one call site');
    assert.equal((main.match(/terrainVisibility\(world, dx, dy, normal\);\s+color = terrainRadiance\(/g) || []).length, 1, 'the fields are evaluated once per lit fragment, right before its radiance');
    assert.match(main, /#ifdef LANDSCAPE_TERRAIN_DIAGNOSTICS\s+if \(uAppearanceReady < 0\.5 \|\| uDiagnostic < 5\)\s+#endif\s+\{\s+terrainVisibility\(world, dx, dy, normal\);/,
        'unlit diagnostics of the AI577 D6 diagnostics program skip the lighting; the default program lights every fragment');
    const conditions = [...main.matchAll(/if \(([^)]*)\)/g)].map(match => match[1]);
    assert.ok(conditions.length > 0 && conditions.every(condition => /^(uDiagnostic|uAppearanceReady)\b/.test(condition)), `main branches on uniforms only, so the evaluation stays in uniform control flow: ${conditions.join(' | ')}`);
    assert.match(lighting, /uLandscapeSunIrradiance\.rgb \* landscapeSunVisibility\(world, n, sun\)/, 'sun visibility multiplies only the direct sun');
    assert.match(terrain, /float skyVisibility = landscapeSkyVisibility\(world, n\);/, 'sky visibility is evaluated once for the dry and submerged paths');
    assert.match(lighting, /float ems = 1\.0 - fab\.x - fab\.y, occlusion = ao \* skyVisibility;/, 'sky visibility joins the material occlusion of ambient sky light');
    assert.match(lighting, /light\.groundIrradiance \* \(ao \* LANDSCAPE_RECIPROCAL_PI\)/, 'terrain-reflected light takes the material occlusion only');
    for (const name of Object.keys(landscapeLightingDefines('standard'))) assert.ok([terrain, lighting, atmosphere, water, hooks, surface].some(source => source.includes(name)), `${name} is used`);
    assert.match(lighting, /uniform vec4 uLandscapeSky\[9\];\s*\/\/[^\n]*\s*uniform vec4 uLandscapeSun;\s*\/\/[^\n]*\s*uniform vec4 uLandscapeSunIrradiance;/);
});
