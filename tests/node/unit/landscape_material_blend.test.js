// Checks material relief competition, mid-scale clump relief, exact support and bounded footprint/tier transitions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_MATERIAL_BLEND, LANDSCAPE_MATERIAL_CLUMPS, LANDSCAPE_MATERIAL_CLUMP_OCTAVES, landscapeClumpedCoverage, landscapeMaterialClumpDefinition, landscapeMaterialClumpDetail,
    landscapeMaterialClumpRelief, landscapeMaterialClumpSalts, landscapeMaterialClumpUniforms, landscapeMaterialClumpValue, landscapeMaterialHeightDetail,
    sampleLandscapeMaterialBlend } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialBlend.js';
import { landscapeNoiseSalt } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceNoise.js';
import { LANDSCAPE_SOIL_CATALOG } from '../../../src/app/landscape/LandscapeCatalog.js';

const blend = (weights, heights, detail = 1, extra = {}) => sampleLandscapeMaterialBlend({ weights, heights, details: weights.map(() => detail), ...extra });
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
const seed = 4005984422;
const relief = (soilId, x, z, metersPerPixel = .004, extra = {}) => landscapeMaterialClumpRelief({ soilId, seed, x, z, metersPerPixel, ...extra });

test('Landscape material blend: true relief reverses the dominant material at equal semantic coverage', () => {
    assert.deepEqual(blend([.5, .5], [.85, .15]).weights, [1, 0]);
    assert.deepEqual(blend([.5, .5], [.15, .85]).weights, [0, 1]);
    assert.deepEqual(blend([.5, .5], [.5, .5]).weights, [.5, .5]);
    assert.equal(LANDSCAPE_MATERIAL_BLEND.measuredDisplacement, false);
});

test('Landscape material blend: absent high relief cannot leak into pure interiors or normalized junctions', () => {
    for (let active = 0; active < 6; active++) {
        const weights = Array.from({ length: 6 }, (_, index) => Number(index === active));
        assert.deepEqual(blend(weights, weights.map(weight => 1 - weight)).weights, weights);
    }
    for (let step = 0; step <= 500; step++) {
        const a = step / 500, weights = [a, (1 - a) * .7, (1 - a) * .3, 0, 0, 0];
        const result = blend(weights, [.1, .65, .95, 1, 1, 1]);
        close(result.weights.reduce((sum, weight) => sum + weight, 0), 1);
        assert.ok(result.weights.every(weight => Number.isFinite(weight) && weight >= 0 && weight <= 1));
        assert.deepEqual(result.weights.slice(3), [0, 0, 0]);
    }
});

test('Landscape material blend: an arriving support channel and competitor ties stay continuous', () => {
    const h = [.2, .2, .2, .2, .2, 1], epsilon = 1e-7;
    const before = blend([.2, .2, .2, .2, .2, 0], h).weights;
    const after = blend(Array.from({ length: 6 }, (_, index) => index === 5 ? epsilon : (1 - epsilon) / 5), h).weights;
    before.forEach((weight, index) => close(after[index], weight, 2e-6));
    const low = blend([.5 - epsilon, .5 + epsilon], [.5, .5]).weights;
    const high = blend([.5 + epsilon, .5 - epsilon], [.5, .5]).weights;
    close(low[0], high[0], 1e-5);
});

test('Landscape material blend: projected score footprints soften relief edges and remain finite on axis-aligned views', () => {
    const point = blend([.5, .5], [.6, .4]);
    const axis = blend([.5, .5], [.6, .4], 1, { scoreDx: [.4, -.4] });
    const diagonal = blend([.5, .5], [.6, .4], 1, { scoreDx: [.4, -.4], scoreDy: [.3, -.3] });
    assert.equal(point.weights[0], 1);
    assert.ok(axis.weights[0] > .5 && axis.weights[0] < point.weights[0]);
    assert.ok(diagonal.weights[0] > .5 && diagonal.weights[0] < axis.weights[0]);
    for (const result of [axis, diagonal]) close(result.weights.reduce((sum, weight) => sum + weight, 0), 1);
});

test('Landscape material blend: unresolved material tiers and minified footprints converge to categorical coverage', () => {
    const at = options => landscapeMaterialHeightDetail({ periodMeters: 4, resolution: 512, metersPerPixel: .01, ...options });
    assert.equal(at({}), 1);
    assert.equal(at({ enabled: false }), 0);
    assert.equal(at({ periodMeters: 16, resolution: 32 }), 0);
    assert.equal(at({ metersPerPixel: .3 }), 0);
    const coarse = at({ resolution: 32 }), fine = at({ resolution: 512 });
    assert.ok(coarse > 0 && coarse < fine);
    for (let index = 0; index <= 20; index++) {
        const transition = index / 20;
        close(at({ resolution: 32, targetResolution: 512, transition }), coarse * (1 - transition) + fine * transition);
    }
    const weights = [.25, .5, .25], heights = [.9, .1, .75];
    assert.deepEqual(blend(weights, heights, 0).weights, weights);
    const almostFar = blend(weights, heights, 1e-8).weights;
    weights.forEach((weight, index) => close(almostFar[index], weight, 1e-8));
});

test('Landscape material blend: tier replacement has identical endpoints and validates its public inputs', () => {
    const value = { periodMeters: 8, resolution: 32, targetResolution: 128, metersPerPixel: .015 };
    close(landscapeMaterialHeightDetail({ ...value, transition: 1 }), landscapeMaterialHeightDetail({ ...value, resolution: 128, transition: 0 }));
    assert.throws(() => landscapeMaterialHeightDetail({ ...value, resolution: 0 }), /positive/);
    assert.throws(() => blend([0, 0], [.5, .5]), /sum to one/);
    assert.throws(() => blend([.5, .5], [.5, 2]), /matching finite/);
    assert.throws(() => blend([.5, .5], [.5, .5], 1, { clumpRelief: [1, -1] }), /clump/);
});

test('Landscape material clumps: the frozen catalog covers every soil with bounded 0.3-1.5 m interleaving scales', () => {
    const model = LANDSCAPE_MATERIAL_CLUMPS;
    assert.ok(Object.isFrozen(model) && Object.isFrozen(model.materials) && Object.isFrozen(model.octaves) && model.octaves.every(Object.isFrozen));
    assert.deepEqual(Object.keys(model.materials).sort(), LANDSCAPE_SOIL_CATALOG.map(soil => soil.id).sort());
    assert.ok(model.octaves.length >= 2 && model.octaves.length <= LANDSCAPE_MATERIAL_CLUMP_OCTAVES);
    assert.deepEqual([model.octaves[0].frequency, model.octaves[0].amplitude], [1, 1]);
    model.octaves.forEach((octave, index) => {
        if (index) assert.ok(octave.frequency > model.octaves[index - 1].frequency, 'octaves are ordered by frequency so an unresolved octave ends the sum');
        assert.ok(octave.amplitude > 0 && octave.amplitude <= 1);
        close(Math.hypot(...octave.rotation), 1, 1e-12);
    });
    assert.ok(model.fadeStartWavelengths > 0 && model.fadeStartWavelengths < model.fadeEndWavelengths && model.fadeEndWavelengths <= .25, 'an octave fades out before it has fewer than four pixels per wavelength');
    assert.ok(model.coverageConfidence[0] > 0 && model.coverageConfidence[0] < model.coverageConfidence[1] && model.coverageConfidence[1] < .5 && model.reliefFloor > 0 && model.gain > 0);
    for (const soil of LANDSCAPE_SOIL_CATALOG) {
        const definition = landscapeMaterialClumpDefinition(soil.id);
        assert.ok(Object.isFrozen(definition) && ['smooth', 'billow'].includes(definition.shaping));
        assert.ok(definition.wavelengthMeters >= .6 && definition.wavelengthMeters <= 3, `${soil.id} clumps (half its first wavelength) stay within 0.3-1.5 m`);
        assert.ok(definition.weight > 0 && definition.weight <= 1 && definition.textureReliefGain >= 0);
    }
    assert.throws(() => landscapeMaterialClumpDefinition('mud'), /No clump relief/);
});

test('Landscape material clumps: values are world-anchored, deterministic, centered and fade with the pixel footprint', () => {
    const loam = landscapeMaterialClumpDefinition('loam'), salts = landscapeMaterialClumpSalts(seed, 'loam');
    const value = (x, z, metersPerPixel = .002, shaping = loam.shaping, input = salts) => landscapeMaterialClumpValue({ x, z, wavelengthMeters: loam.wavelengthMeters, shaping, salts: input, metersPerPixel });
    assert.equal(value(1070.3125, 914.0625), value(1070.3125, 914.0625));
    assert.notEqual(value(1070.3125, 914.0625), value(1070.3125, 914.0625, .002, loam.shaping, landscapeMaterialClumpSalts(seed + 1, 'loam')));
    assert.notDeepEqual(landscapeMaterialClumpSalts(seed, 'loam'), landscapeMaterialClumpSalts(seed, 'sand'));
    assert.deepEqual([salts, landscapeMaterialClumpSalts(0, 'rock')], [[2943696198, 3469230915, 2039068455, 1936293899], [3145188381, 3533309465, 742548327, 3092455528]],
        'soil-id keyed octave salts are bit-stable');
    assert.equal(new Set(salts).size, salts.length);
    assert.equal(landscapeNoiseSalt(seed, 0, 0) === salts[0], false, 'clump salts never reuse the warp component');
    for (const shaping of ['smooth', 'billow']) {
        const samples = [];
        for (let i = 0; i < 160; i++) for (let j = 0; j < 160; j++) samples.push(value(1000 + i * .137, 900 + j * .113, .002, shaping));
        const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length, deviation = Math.sqrt(samples.reduce((sum, sample) => sum + (sample - mean) ** 2, 0) / samples.length);
        assert.ok(Math.abs(mean) < .06, `${shaping} clump values are centered (${mean})`);
        assert.ok(deviation > .2 && deviation < .5, `${shaping} clump deviation ${deviation}`);
        assert.ok(samples.every(sample => Math.abs(sample) < 3.5));
    }
    const { fadeStartWavelengths: start, fadeEndWavelengths: end } = LANDSCAPE_MATERIAL_CLUMPS;
    assert.equal(landscapeMaterialClumpDetail(loam.wavelengthMeters, loam.wavelengthMeters * start), 1);
    assert.equal(landscapeMaterialClumpDetail(loam.wavelengthMeters, loam.wavelengthMeters * end), 0);
    assert.equal(value(1070, 914, loam.wavelengthMeters * end), 0, 'an unresolved first octave removes the clump term');
    let previous = value(1070.3, 914.1, 0), largestStep = 0;
    for (let index = 1; index <= 400; index++) {
        const current = value(1070.3, 914.1, loam.wavelengthMeters * end * index / 400);
        largestStep = Math.max(largestStep, Math.abs(current - previous));
        previous = current;
    }
    assert.ok(largestStep < .05, `footprint fades are continuous (${largestStep})`);
    assert.throws(() => value(Number.NaN, 0), /finite position/);
    assert.throws(() => value(0, 0, .01, 'ridged'), /shaping/);
    assert.throws(() => value(0, 0, .01, 'smooth', [1, 2]), /one salt per octave/);
});

test('Landscape material clumps: floored relief never lets reconstruction tails gain weight and keeps interiors exact', () => {
    for (let i = 0; i < 2000; i++) {
        const x = 1000 + i * .731, z = 900 + i * .419, mpp = [.001, .01, .05, .2, .5][i % 5];
        for (const soil of LANDSCAPE_SOIL_CATALOG) assert.ok(relief(soil.id, x, z, mpp, { height: (i % 11) / 10, heightDetail: (i % 7) / 6 }) >= 0);
    }
    assert.equal(relief('loam', 1070, 914, 1, { heightDetail: 0 }), 0, 'unresolved clumps and texture relief contribute nothing');
    assert.equal(relief('loam', 1070, 914, .002, { enabled: false }), 0);
    assert.throws(() => relief('loam', 1070, 914, .002, { height: 1.5 }), /height/);
    for (let active = 0; active < 6; active++) {
        const weights = Array.from({ length: 6 }, (_, index) => Number(index === active));
        assert.deepEqual(landscapeClumpedCoverage(weights, [9, 1, 0, 3, 7, 2]), weights);
    }
    assert.deepEqual(landscapeClumpedCoverage([.3, .7, 0], [0, 0, 0]), [.3, .7, 0]);
    const [start] = LANDSCAPE_MATERIAL_CLUMPS.coverageConfidence;
    for (const tail of [1e-6, 1e-3, start * .5, start]) for (const strength of [0, 1, 10, 1e3]) {
        const result = landscapeClumpedCoverage([1 - tail, tail, 0], [strength * .01, strength, 50]);
        assert.ok(result[1] <= tail + 1e-15, `a ${tail} tail with relief ${strength} cannot gain weight`);
        assert.equal(result[2], 0, 'zero coverage stays zero');
        close(result[0] + result[1], 1, 1e-12);
    }
    const substantial = landscapeClumpedCoverage([.6, .4], [0, 4]), stronger = landscapeClumpedCoverage([.6, .4], [0, 6]);
    assert.ok(substantial[1] > .4 && stronger[1] > substantial[1], 'relief of confidently covered materials reweights coverage monotonically');
    const extreme = landscapeClumpedCoverage([.5, .3, .2], [1e4, 0, 5e3]);
    assert.ok(extreme.every(Number.isFinite)); close(extreme.reduce((sum, weight) => sum + weight, 0), 1, 1e-12);
    const mixed = sampleLandscapeMaterialBlend({ weights: [.45, .35, .2, 0, 0, 0], heights: [.2, .8, .5, 1, 1, 1], details: [1, 1, 1, 1, 1, 1], clumpRelief: [0, 3, 1, 9, 9, 9] });
    close(mixed.weights.reduce((sum, weight) => sum + weight, 0), 1);
    assert.deepEqual(mixed.weights.slice(3), [0, 0, 0]);
    const legacy = blend([.25, .5, .25], [.9, .1, .75]), zeroRelief = blend([.25, .5, .25], [.9, .1, .75], 1, { clumpRelief: [0, 0, 0] });
    assert.deepEqual(zeroRelief.weights, legacy.weights, 'zero clump relief reproduces the relief competition bit for bit');
    assert.throws(() => landscapeClumpedCoverage([.5, .5], [1]), /matching/);
});

test('Landscape material clumps: a straight coverage ramp interleaves with decreasing density instead of one cut edge', () => {
    // loam|sand ramp of the 1.2 m pair profile at 2 cm samples, close-up footprint, neutral texture relief
    const width = 1.2, step = .02, rows = 200, columns = Math.round(2.4 / step), fractions = new Float64Array(columns);
    let islands = 0, loamArea = 0, coverageArea = 0;
    for (let row = 0; row < rows; row++) {
        let previous = null, changes = 0;
        for (let column = 0; column < columns; column++) {
            const across = (column + .5) * step - 1.2, t = Math.min(1, Math.max(0, .5 - across / width)), loam = t * t * (3 - 2 * t);
            const x = 1060 + across, z = 900 + row * step, weights = [0, 0, 1 - loam, loam, 0, 0];
            const clumped = landscapeClumpedCoverage(weights, [0, 0, relief('sand', x, z, .004), relief('loam', x, z, .004), 0, 0]);
            const winner = clumped[3] > clumped[2];
            fractions[column] += winner / rows; loamArea += winner; coverageArea += loam;
            if (previous !== null && winner !== previous) changes++;
            previous = winner;
        }
        if (changes >= 3) islands++;
    }
    const band = [...fractions].filter(fraction => fraction > .05 && fraction < .95).length * step;
    assert.ok(band >= .4, `interleaving spans ${band} m of the 1.2 m ramp instead of a single cut`);
    assert.ok(islands >= rows * .25, `${islands} of ${rows} transects cross clumps or pockets`);
    for (let column = 8; column < columns; column += 8) assert.ok(fractions[column] <= fractions[column - 8] + .12, 'grass density decreases toward the sand');
    assert.ok(fractions[0] > .97 && fractions[columns - 1] < .03, 'interiors stay pure');
    assert.ok(Math.abs(loamArea - coverageArea) / coverageArea < .2, 'clumps redistribute rather than replace semantic coverage');
});

test('Landscape material clumps: the shader chunk and uniform payload mirror the JS model', async () => {
    const chunk = await readFile(new URL('../../../src/graphics/shaders/chunks/landscape/material_clumps.glsl', import.meta.url), 'utf8');
    const terrain = await readFile(new URL('../../../src/graphics/shaders/materials/landscape/terrain.frag.glsl', import.meta.url), 'utf8');
    assert.match(terrain, /#include <shaderlib:landscape\/surface_warp>\s+#include <shaderlib:landscape\/material_clumps>/);
    for (const declaration of ['uniform vec4 uSoilClumps[6];', 'uniform ivec4 uSoilClumpSalts[6];', `uniform vec4 uClumpOctaves[${LANDSCAPE_MATERIAL_CLUMP_OCTAVES}];`, 'uniform vec4 uClumpSettings;', 'uniform vec4 uClumpConfidence;']) assert.ok(chunk.includes(declaration), declaration);
    assert.ok(!/#include/.test(chunk), 'the chunk documents its include without a directive the loader would expand');
    for (const expression of ['return landscapeWarpLattice(lattice + vec2(float(bits & 0xffffu), float(bits >> 16u)) / 65536.0, bits);',
        'vec2 lattice = vec2(rotation.x * world.x - rotation.y * world.y, rotation.y * world.x + rotation.x * world.y) * inverseWavelength;',
        'return 1.0 - smoothstep(wavelength * uClumpSettings.y, wavelength * uClumpSettings.z, footprint);', 'if (amplitude <= 0.0) break;',
        'float value = sum * inversesqrt(power);', 'return first * (clump.w > 0.0 ? 2.0 * abs(value) - clump.w : value);']) assert.ok(chunk.includes(expression), expression);
    assert.ok(terrain.includes('value = max(0.0, uClumpConfidence.z * max(clumpDetail, textureDetail) + value + clump.z * textureDetail * (coverageWeight(heights, soil) - 0.5));'));
    assert.ok(terrain.includes('vec3 lowExponent = smoothstep(vec3(uClumpConfidence.x), vec3(uClumpConfidence.y), coverage.low) * relief.low;'));
    const soils = LANDSCAPE_SOIL_CATALOG.map(soil => ({ soilId: soil.id, enabled: soil.id !== 'seabed' })), uniforms = landscapeMaterialClumpUniforms({ seed, soils });
    assert.ok(Object.isFrozen(uniforms));
    assert.deepEqual([uniforms.uSoilClumps.length, uniforms.uSoilClumpSalts.length, uniforms.uClumpOctaves.length, uniforms.uClumpSettings.length, uniforms.uClumpConfidence.length], [24, 24, 16, 4, 4]);
    const model = LANDSCAPE_MATERIAL_CLUMPS;
    soils.forEach(({ soilId, enabled }, index) => {
        const definition = landscapeMaterialClumpDefinition(soilId), row = [...uniforms.uSoilClumps.slice(index * 4, index * 4 + 4)];
        if (!enabled) { assert.deepEqual(row, [0, 0, 0, 0]); assert.deepEqual([...uniforms.uSoilClumpSalts.slice(index * 4, index * 4 + 4)], [0, 0, 0, 0]); return; }
        assert.deepEqual(row, [Math.fround(1 / definition.wavelengthMeters), Math.fround(definition.weight), Math.fround(definition.textureReliefGain), Math.fround(definition.shaping === 'billow' ? model.billowCenter : 0)]);
        assert.deepEqual([...uniforms.uSoilClumpSalts.slice(index * 4, index * 4 + 4)], landscapeMaterialClumpSalts(seed, soilId).map(salt => salt | 0));
    });
    model.octaves.forEach((octave, index) => assert.deepEqual([...uniforms.uClumpOctaves.slice(index * 4, index * 4 + 4)], [octave.frequency, octave.amplitude, ...octave.rotation].map(Math.fround)));
    assert.deepEqual([...uniforms.uClumpSettings], [model.gain, model.fadeStartWavelengths, model.fadeEndWavelengths, 1].map(Math.fround));
    assert.deepEqual([...uniforms.uClumpConfidence], [...model.coverageConfidence, model.reliefFloor, 0].map(Math.fround));
    assert.throws(() => landscapeMaterialClumpUniforms({ seed, soils: [{ soilId: 'loam', enabled: 1 }] }), /boolean/);
    assert.throws(() => landscapeMaterialClumpUniforms({ seed: -1, soils: [{ soilId: 'loam', enabled: true }] }), /seed/);
});
