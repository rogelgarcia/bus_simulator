// Verifies the AI577 D5c natural-ground material response, terrain-reflected light and terrain-field visibility mirrors (pure JavaScript).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_MATERIAL_RESPONSE, landscapeBackscatterRatio, landscapeEonAlbedo, landscapeEonBrdf, landscapeFonAlbedo, landscapeFonAlbedoExact, landscapeFonMeanAlbedo,
    landscapeMaterialResponseDefines, landscapeMaterialResponseDefinition, landscapeMaterialResponseValues, landscapeNaturalSpecularShadowing, landscapeOppositionFactor,
    landscapeOppositionMean, landscapeOppositionProfile, landscapeTerrainBounce, landscapeTerrainOccluderLight } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialResponse.js';
import { LANDSCAPE_LIGHTING, landscapeHorizontalIrradiance, landscapeReflectedRadiance, landscapeResponseUniformValue, landscapeSunDirection, landscapeTerrainRadiance,
    landscapeTerrainVisibility, LANDSCAPE_WATER_LEVEL_DISABLED } from '../../../src/graphics/engine3d/landscape/LandscapeLightingModel.js';
import { LANDSCAPE_SOIL_CATALOG } from '../../../src/app/landscape/LandscapeCatalog.js';
import { landscapeSolarDiscVisibility } from '../../../src/app/landscape/LandscapeTerrainFields.js';
import { CALIBRATED_DAYLIGHT } from '../../../src/graphics/lighting/CalibratedDaylight.js';

const close = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} ${actual} vs ${expected}`);
const direction = (zenithDegrees, azimuthDegrees) => {
    const t = zenithDegrees * Math.PI / 180, p = azimuthDegrees * Math.PI / 180;
    return [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)];
};
// cosine-weighted hemisphere integral of f(l) (midpoint rule in zenith and azimuth)
function hemisphere(f, steps = 180) {
    let sum = 0;
    for (let i = 0; i < steps; i++) for (let j = 0; j < 2 * steps; j++) {
        const t = (i + .5) / steps * Math.PI / 2, p = (j + .5) / (2 * steps) * 2 * Math.PI;
        sum += f([Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)]) * Math.cos(t) * Math.sin(t) * (Math.PI / 2 / steps) * (Math.PI / steps);
    }
    return sum;
}
const n = [0, 1, 0];

test('Material response: the EON albedo fit matches the exact Fujii Oren-Nayar albedo and its numerical integral', () => {
    for (const r of [0, .15, .3, .5, 1]) {
        for (const mu of [.02, .1, .3, .5, .7, .9, 1]) close(landscapeFonAlbedo(mu, r), landscapeFonAlbedoExact(mu, r), 6e-4, `fit r ${r} mu ${mu}`);
        // the exact closed form is the cosine-weighted integral of the single-scattering lobe of a white surface
        for (const mu of [.2, .6, .95]) {
            const v = [Math.sqrt(1 - mu * mu), mu, 0];
            const single = hemisphere(l => { const muI = Math.max(0, l[1]), s = l[0] * v[0] + l[1] * v[1] + l[2] * v[2] - muI * mu; return (1 + r * (s > 0 ? s / Math.max(muI, mu) : s)) / (1 + (.5 - 2 / (3 * Math.PI)) * r) / Math.PI; }, 120);
            close(single, landscapeFonAlbedoExact(mu, r), 3e-4, `integral r ${r} mu ${mu}`);
        }
        let mean = 0;
        for (let i = 0; i < 4000; i++) { const mu = (i + .5) / 4000; mean += 2 * landscapeFonAlbedoExact(mu, r) * mu / 4000; }
        close(mean, landscapeFonMeanAlbedo(r), 1e-5, `mean albedo r ${r}`);
    }
});

test('Material response: EON is reciprocal, keeps a white surface white, reduces exactly to Lambert at zero roughness and favors backscatter', () => {
    for (const [l, v] of [[direction(30, 10), direction(60, 200)], [direction(75, 0), direction(20, 90)], [direction(5, 40), direction(85, 300)]]) {
        const a = landscapeEonBrdf([.2, .5, .9], .4, .3, l, v, n), b = landscapeEonBrdf([.2, .5, .9], .4, .3, v, l, n);
        a.forEach((value, channel) => close(value, b[channel], 1e-12, 'reciprocity'));
        // the guarded multiple-scattering lobe leaves a 1e-7 relative residual, far below float precision
        landscapeEonBrdf([.3], 0, 0, l, v, n).forEach(value => close(value, .3 / Math.PI, .3 / Math.PI * 1e-6, 'Lambert at zero roughness'));
        close(landscapeEonAlbedo([.3], 0, v[1])[0], .3, 1e-12, 'Lambert ambient albedo');
    }
    // white furnace: the directional albedo of a unit-albedo EON surface is 1 for every view (the fit leaves at most 2e-3)
    for (const r of [.25, .5, 1]) for (const mu of [.15, .5, .9]) {
        const v = [Math.sqrt(1 - mu * mu), mu, 0];
        close(hemisphere(l => landscapeEonBrdf([1], r, 0, l, v, n)[0], 120), 1, 2e-3, `furnace r ${r} mu ${mu}`);
        close(landscapeEonAlbedo([1], r, mu)[0], 1, 1e-12, 'ambient furnace');
    }
    for (const soilId of LANDSCAPE_SOIL_CATALOG.map(soil => soil.id)) {
        const ratio = landscapeBackscatterRatio(soilId);
        assert.ok(ratio >= 1.3 && ratio <= 3, `${soilId} backscatter/forward ratio ${ratio} at 60° within field goniometer measurements (1.3-3)`);
    }
    assert.ok(landscapeBackscatterRatio('loam') > landscapeBackscatterRatio('sand') && landscapeBackscatterRatio('sand') > landscapeBackscatterRatio('rock'), 'canopies backscatter most, rock least');
});

test('Material response: the opposition peak is normalized, narrow and monotonic', () => {
    assert.equal(landscapeOppositionProfile(1), 1);
    let previous = 2;
    for (let g = 0; g <= 180; g += 5) { const value = landscapeOppositionProfile(Math.cos(g * Math.PI / 180)); assert.ok(value < previous || g === 0); previous = value; }
    close(landscapeOppositionProfile(Math.cos(2 * Math.atan(LANDSCAPE_MATERIAL_RESPONSE.oppositionWidth))), .5, 1e-12, 'half height at tan(g/2) = h');
    const mean = landscapeOppositionMean();
    close(hemisphere(l => landscapeOppositionProfile(l[1]) / Math.PI, 400), mean, 2e-4, 'nadir-view hemispherical mean');
    // the normalized factor moves energy into the backscatter peak: its cosine-weighted mean at a nadir view is 1
    for (const amplitude of [.1, .5, 1]) close(hemisphere(l => landscapeOppositionFactor(l[1], amplitude) / Math.PI, 400), 1, 3e-4, `energy-neutral amplitude ${amplitude}`);
    assert.equal(landscapeOppositionFactor(.3, 0), 1);
});

test('Material response: natural specular shadowing keeps normal incidence and removes the grazing forward sheen', () => {
    assert.equal(landscapeNaturalSpecularShadowing(.2, 0), 1, 'weight 0 keeps GGX (smooth or wet ground)');
    close(landscapeNaturalSpecularShadowing(1, 1), 1, 1e-12, 'normal incidence');
    // a sun 10° and a view 15° above the horizon in the forward direction: γ is half the angle between them
    const l = direction(80, 0), v = direction(75, 180), h = l.map((value, axis) => value + v[axis]), length = Math.hypot(...h);
    const cosine = (v[0] * h[0] + v[1] * h[1] + v[2] * h[2]) / length;
    close(Math.acos(cosine) * 180 / Math.PI, 77.5, 1e-9, 'facet incidence angle');
    const forward = landscapeNaturalSpecularShadowing(cosine, 1);
    assert.ok(forward < .015, `grazing forward specular keeps ${forward}`);
    close(landscapeNaturalSpecularShadowing(cosine, .5), 1 + (forward - 1) * .5, 1e-12, 'weights interpolate');
    let previous = 1;
    for (let c = 1; c >= .05; c -= .05) { const value = landscapeNaturalSpecularShadowing(c, 1); assert.ok(value <= previous + 1e-15); previous = value; }
});

test('Material response: terrain-reflected light follows the open-ground view factor and the occluding horizons', () => {
    const sun = landscapeSunDirection(45, 30), sunIrradiance = [150, 140, 120], skyUp = [6, 12, 24], ground = [.2, .25, .1];
    const horizontal = sunIrradiance.map((value, k) => value * sun[1] + skyUp[k]);
    const flat = landscapeTerrainBounce({ normal: [0, 1, 0], groundAlbedo: ground, skyVisibility: 1, sunDirection: sun, sunIrradiance, skyUp });
    flat.irradiance.forEach(value => assert.equal(value, 0, 'open flat ground sees no ground'));
    const wall = landscapeTerrainBounce({ normal: [1, 0, 0], groundAlbedo: ground, skyVisibility: 1, sunDirection: sun, sunIrradiance, skyUp });
    wall.irradiance.forEach((value, k) => close(value, .5 * ground[k] * horizontal[k], 1e-9, 'a vertical facet sees half its hemisphere as lit open ground (Liu & Jordan)'));
    const tilted = landscapeTerrainBounce({ normal: direction(30, 120), groundAlbedo: ground, skyVisibility: 1, sunDirection: sun, sunIrradiance, skyUp });
    close(tilted.below, (1 - Math.cos(Math.PI / 6)) / 2, 1e-12, '(1 - cos S) / 2');
    // a horizontal facet in a uniform bowl (horizon h in every azimuth): V = 1 - sin²h, the occluders face the facet at slope h; an overhead sun lights them by cos h
    const h = 20 * Math.PI / 180, horizonSine = new Array(8).fill(Math.sin(h)), overhead = [0, 1, 0];
    const bowlOccluders = landscapeTerrainOccluderLight([0, 1, 0], horizonSine, overhead);
    close(bowlOccluders.sun, Math.cos(h), 1e-12, 'occluder sun cosine');
    close(bowlOccluders.sky, (1 + Math.cos(h)) / 2, 1e-12, 'occluder sky view');
    close(bowlOccluders.total, 8 * .5 * Math.sin(h) ** 2, 1e-12, 'eight azimuths of hidden band sin²h / 2');
    const bowl = landscapeTerrainBounce({ normal: [0, 1, 0], groundAlbedo: [1, 1, 1], skyVisibility: 1 - Math.sin(h) ** 2, occluders: bowlOccluders, sunDirection: overhead, sunIrradiance: [100, 100, 100], skyUp: [10, 10, 10] });
    close(bowl.occluded, Math.sin(h) ** 2, 1e-12, 'occluded share');
    bowl.irradiance.forEach(value => close(value, Math.sin(h) ** 2 * (100 * Math.cos(h) + 10 * (1 + Math.cos(h)) / 2), 1e-9));
    // a low sun behind a backlit facet lights the opposite wall it sees: occluders in the facet's view face the sun
    const low = landscapeSunDirection(0, 10), facet = direction(25, 180), sines = [.0, .05, .3, .3, .5, .3, .3, .05];
    const backlit = landscapeTerrainOccluderLight(facet, sines, low);
    assert.ok(backlit.sun > low[1] * 1.5, `the occluders a backlit facet sees catch more sun (${backlit.sun}) than open ground (${low[1]})`);
    assert.deepEqual(landscapeTerrainOccluderLight(facet, new Array(8).fill(0), low), { sun: low[1], sky: 1, total: 0 }, 'no occluders: open ground values');
    const noOccluders = landscapeTerrainBounce({ normal: facet, groundAlbedo: [1, 1, 1], skyVisibility: .8, occluders: null, sunDirection: low, sunIrradiance: [100, 100, 100], skyUp: [0, 0, 0] });
    assert.equal(noOccluders.occluded, 0, 'without terrain fields only open ground reflects');
    // energy plausibility: reflected light never exceeds the ground albedo times the lit hemisphere a facet can see
    for (const normal of [direction(0, 0), direction(40, 30), direction(80, 250)]) {
        const occluders = landscapeTerrainOccluderLight(normal, new Array(8).fill(.6), overhead);
        const result = landscapeTerrainBounce({ normal, groundAlbedo: [1, 1, 1], skyVisibility: .5, occluders, sunDirection: overhead, sunIrradiance: [100, 100, 100], skyUp: [20, 20, 20] });
        assert.ok(result.below + result.occluded <= 1 + 1e-12 && result.irradiance[0] <= 120 + 1e-9);
    }
});

test('Material response: the reflected radiance mirror keeps the D5b model at zero response and applies each term as specified', () => {
    const light = { sunDirection: landscapeSunDirection(45, 12), sunIrradiance: [160, 140, 110], skyIrradiance: [6, 12, 24], skyRadiance: [3, 5, 9] };
    const surface = { albedo: [.12, .19, .04], normal: n, view: direction(78, 225), roughness: .86, metalness: 0, occlusion: .8 };
    const d5b = landscapeReflectedRadiance(surface, light), neutral = landscapeReflectedRadiance({ ...surface, response: [0, 0, 0], skyVisibility: 1 }, { ...light, groundIrradiance: [0, 0, 0] });
    d5b.forEach((value, channel) => close(neutral[channel], value, value * 1e-6, 'zero response is the D5b radiance'));
    // forward toward a low sun: the response removes most of the sheen; backlit toward the antisolar point: opposition and EON backscatter brighten
    const forward = { ...surface, view: direction(75, 180 + 45) }, back = { ...surface, view: direction(78, 45) };
    const loam = landscapeMaterialResponseDefinition('loam'), response = [loam.diffuseRoughness, loam.specularShadowing, loam.opposition];
    const sheenBefore = landscapeReflectedRadiance(forward, light)[1], sheenAfter = landscapeReflectedRadiance({ ...forward, response }, light)[1];
    assert.ok(sheenAfter < sheenBefore * .5, `forward radiance ${sheenAfter} vs ${sheenBefore}`);
    assert.ok(landscapeReflectedRadiance({ ...back, response }, light)[1] > landscapeReflectedRadiance(back, light)[1], 'backscatter brightens');
    // sky visibility scales only the ambient sky terms; terrain-reflected light adds albedo · E · ao / π through the EON ambient albedo
    const occluded = landscapeReflectedRadiance({ ...surface, skyVisibility: .5 }, { ...light, sunIrradiance: [0, 0, 0] }), open = landscapeReflectedRadiance(surface, { ...light, sunIrradiance: [0, 0, 0] });
    occluded.forEach((value, channel) => assert.ok(value < open[channel]));
    const lit = landscapeReflectedRadiance(surface, { ...light, groundIrradiance: [10, 10, 10] }), unlit = landscapeReflectedRadiance(surface, { ...light, groundIrradiance: [0, 0, 0] });
    lit.forEach((value, channel) => assert.ok(value > unlit[channel]));
});

test('Material response: the terrain radiance mirror composes switches, response, bounce and visibility; uniform values keep the D5b default', () => {
    assert.deepEqual(landscapeResponseUniformValue(undefined), [0, 0, 0, 0], 'absent switches are the D5b model');
    assert.deepEqual(landscapeResponseUniformValue(LANDSCAPE_LIGHTING.response), [1, 1, 1, 1], 'the shipped switches include the AI577 D5 terrain-driven appearance (w)');
    assert.deepEqual(landscapeResponseUniformValue({ ...LANDSCAPE_LIGHTING.response, terrainAppearance: false }), [1, 1, 1, 0]);
    assert.throws(() => landscapeResponseUniformValue({ shadows: true }), /accepts boolean model, bounce, terrainVisibility/);
    const skyCoefficients = new Array(33).fill(0);
    [20, 40, 75].forEach((value, channel) => { skyCoefficients[channel] = value; });
    [8, 15, 30].forEach((value, channel) => { skyCoefficients[6 + channel] = value; });
    const state = { seaLevel: 0, waterLevel: LANDSCAPE_WATER_LEVEL_DISABLED, sunDirection: landscapeSunDirection(45, 30), sunIrradiance: [...CALIBRATED_DAYLIGHT.sunNormalRgb], skyCoefficients };
    const fragment = { albedo: [.2, .2, .2], normal: direction(35, 200), roughness: .9, metalness: 0, ao: 1, world: [0, 10, 0], origin: [-30, 25, -40], response: [.3, 1, .5], groundAlbedo: [.2, .25, .15] };
    const d5b = landscapeTerrainRadiance(state, fragment, 'low'), off = landscapeTerrainRadiance({ ...state, response: { model: false, bounce: false, terrainVisibility: false } }, fragment, 'low');
    d5b.forEach((value, channel) => assert.equal(off[channel], value, 'switched off equals the absent switches'));
    const on = landscapeTerrainRadiance({ ...state, response: { model: true, bounce: true, terrainVisibility: true } }, fragment, 'low');
    on.forEach((value, channel) => assert.notEqual(value, d5b[channel]));
    const bounceOnly = landscapeTerrainRadiance({ ...state, response: { model: false, bounce: true, terrainVisibility: false } }, fragment, 'low');
    bounceOnly.forEach((value, channel) => assert.ok(value > d5b[channel], 'a tilted facet gains ground light'));
    // a shadowed fragment loses exactly the direct sun
    const lit = landscapeTerrainRadiance(state, fragment, 'low'), shadowed = landscapeTerrainRadiance(state, { ...fragment, sunVisibility: 0 }, 'low');
    const sunOnly = landscapeTerrainRadiance({ ...state, skyCoefficients: new Array(33).fill(0) }, fragment, 'low');
    lit.forEach((value, channel) => close(value - shadowed[channel], sunOnly[channel], 1e-9));
    assert.ok(landscapeHorizontalIrradiance(state).every((value, channel) => value > state.sunIrradiance[channel] * state.sunDirection[1]));
});

test('Material response: terrain visibility widens the solar disc by the margin footprint and divides sky view by the open slope', () => {
    const sun = landscapeSunDirection(90, 12), sines = [0, 0, Math.sin(12 * Math.PI / 180), 0, 0, 0, 0, 0];
    const sample = { availability: 1, fields: { skyView: (1 + Math.cos(Math.PI / 6)) / 2 * .9, slopeDegrees: 30, horizonSine: sines } };
    const sharp = landscapeTerrainVisibility(sample, sun);
    close(sharp.margin, 0, 1e-12, 'sun on the horizon line');
    close(sharp.sun, .5, 1e-12, 'half the disc');
    close(sharp.sky, .9, 1e-12, 'sky view over (1 + cos S) / 2');
    const radius = .265 * Math.PI / 180, low = { ...sample, fields: { ...sample.fields, horizonSine: sines.map(value => value && Math.sin(12 * Math.PI / 180 + radius / 2)) } };
    close(landscapeTerrainVisibility(low, sun).sun, landscapeSolarDiscVisibility(-radius / 2, 0, radius), 1e-12, 'the disc segment');
    const blurred = landscapeTerrainVisibility(low, sun, { marginWidth: 8 * radius });
    close(blurred.sun, landscapeSolarDiscVisibility(-radius / 2, 0, 4 * radius), 1e-12, 'a wide footprint widens the edge');
    assert.ok(blurred.sun > landscapeTerrainVisibility(low, sun).sun);
    assert.deepEqual(landscapeTerrainVisibility({ availability: 0, fields: null }, sun), { sun: 1, sky: 1, weight: 0, margin: 12 * Math.PI / 180 + 0 });
    const half = landscapeTerrainVisibility({ ...sample, availability: .5 }, sun), disabled = landscapeTerrainVisibility(sample, sun, { enabled: false });
    close(half.sky, .95, 1e-12, 'availability blends toward neutral'); assert.equal(disabled.sun, 1); assert.equal(disabled.sky, 1);
});

test('Material response: catalog values, shader defines and the GLSL mirror agree', async () => {
    assert.deepEqual(Object.keys(LANDSCAPE_MATERIAL_RESPONSE.materials).sort(), LANDSCAPE_SOIL_CATALOG.map(soil => soil.id).sort());
    const values = landscapeMaterialResponseValues(LANDSCAPE_SOIL_CATALOG.map(soil => ({ soilId: soil.id })));
    LANDSCAPE_SOIL_CATALOG.forEach((soil, index) => {
        const definition = landscapeMaterialResponseDefinition(soil.id);
        assert.deepEqual([...values.response.subarray(index * 4, index * 4 + 4)], [definition.diffuseRoughness, definition.specularShadowing, 0, 0].map(Math.fround));
        assert.equal(values.opposition[index], Math.fround(definition.opposition));
    });
    assert.equal(landscapeMaterialResponseDefinition('seabed').specularShadowing, 0, 'submerged sand keeps the wet specular interface');
    assert.throws(() => landscapeMaterialResponseDefinition('mud'), /No natural-ground response/);
    const defines = landscapeMaterialResponseDefines();
    close(Number(defines.LANDSCAPE_FON_C1), .5 - 2 / (3 * Math.PI), 1e-15);
    close(Number(defines.LANDSCAPE_FON_C2), 2 / 3 - 28 / (15 * Math.PI), 1e-15);
    close(Number(defines.LANDSCAPE_OPPOSITION_MEAN), landscapeOppositionMean(), 1e-15);
    const lighting = await readFile(new URL('../../../src/graphics/shaders/chunks/landscape/lighting.glsl', import.meta.url), 'utf8');
    for (const literal of ['0.0571085289', '0.491881867', '-0.332181442', '0.0714429953', 'LANDSCAPE_FON_C1', 'LANDSCAPE_FON_C2', 'LANDSCAPE_OPPOSITION_WIDTH', 'LANDSCAPE_OPPOSITION_MEAN', '0.7071067811865476']) {
        assert.ok(lighting.includes(literal), `lighting.glsl mirrors ${literal}`);
    }
    assert.match(lighting, /float single = af \* \(1\.0 \+ r \* sOverT\) \* landscapeOppositionFactor\(dot\(l, v\), opposition\);/);
    assert.match(lighting, /return 1\.0 \+ \(exp\(-sqrt\(max\(1\.0 - c \* c, 0\.0\)\) \/ c\) - 1\.0\) \* weight;/);
    assert.match(lighting, /uniform vec4 uLandscapeSunIrradiance;\s*\/\/[^\n]*\s*uniform vec4 uLandscapeResponse;/);
});
