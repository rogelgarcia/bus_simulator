// Checks the stochastic hex-tiling catalog, its deterministic world-anchored lattice math and the shader mirror contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_MATERIAL_SAMPLING, LANDSCAPE_MATERIAL_SAMPLING_MODES, landscapeHexBlend, landscapeHexContrastSignal, landscapeHexLattice, landscapeHexLatticeAngle,
    landscapeHexNormalSlope, landscapeHexRotateGradient, landscapeHexTriangle, landscapeHexVertexCenter, landscapeHexVertexTransform, landscapeHexWeights,
    landscapeMaterialSamplingDefinition, landscapeMaterialSamplingMode, landscapeMaterialSamplingSalt, landscapeMaterialSamplingUniforms, landscapeMicroSamplingSalt } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialSampling.js';
import { LANDSCAPE_MICRO_DETAIL } from '../../../src/graphics/engine3d/landscape/LandscapeMicroDetail.js';
import { landscapeNoiseHash } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceNoise.js';
import { LANDSCAPE_SOIL_CATALOG } from '../../../src/app/landscape/LandscapeCatalog.js';

const seed = 1207276911, model = LANDSCAPE_MATERIAL_SAMPLING;
const close = (actual, expected, tolerance = 1e-9, label = '') => assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} differs from ${expected} by more than ${tolerance}`);
const lattice = (soilId, u, v, exponent, lattice = 'top') => {
    const definition = landscapeMaterialSamplingDefinition(soilId);
    return landscapeHexLattice({ u, v, cellsPerPeriod: definition.cellsPerPeriod, salt: landscapeMaterialSamplingSalt(seed, soilId, lattice),
        rotationRangeRadians: definition.rotationRangeDegrees * Math.PI / 180, offsetSpreadV: definition.offsetSpreadV, exponent: exponent ?? definition.contrastExponent });
};
function random(state) { let s = state >>> 0; return () => { s = Math.imul(s ^ s >>> 15, 0x2c1b3c6d) + 0x9e3779b9 >>> 0; return s / 4294967296; }; }
// smooth periodic test texture (one channel), so blended values are continuous wherever the weights are
const smoothTexture = (u, v) => .5 + .2 * Math.sin(2 * Math.PI * u) * Math.cos(2 * Math.PI * (v + .3)) + .1 * Math.sin(4 * Math.PI * (u + v));
const blendAt = (soilId, u, v, mode = 'hex-contrast') => {
    const hex = lattice(soilId, u, v, mode === 'hex-linear' ? 1 : undefined), values = hex.samples.map(sample => smoothTexture(...sample.uv));
    return landscapeHexBlend({ values, weights: landscapeHexWeights({ weights: hex.weights, signals: values, mode }).weights, mode });
};

test('Material sampling: the frozen catalog covers every soil with bounded, direction-aware parameters', () => {
    assert.ok(Object.isFrozen(model) && Object.isFrozen(model.materials));
    assert.deepEqual(Object.keys(model.materials).sort(), LANDSCAPE_SOIL_CATALOG.map(soil => soil.id).sort());
    assert.deepEqual(LANDSCAPE_MATERIAL_SAMPLING_MODES, { single: 0, 'hex-linear': 1, 'hex-contrast': 2, 'hex-variance': 3 });
    assert.equal(landscapeMaterialSamplingMode(model.defaultMode), 2);
    for (const invalid of ['hex', 'gaussian', '', undefined, 2]) assert.throws(() => landscapeMaterialSamplingMode(invalid), /Material sampling must be one of/);
    assert.throws(() => landscapeMaterialSamplingDefinition('pavement'), /No stochastic tiling is defined for soil pavement/);
    for (const soilId of ['sand', 'seabed']) {
        const definition = landscapeMaterialSamplingDefinition(soilId);
        assert.equal(definition.rotationRangeDegrees, 0, `${soilId} keeps ripple orientation`);
        assert.equal(definition.offsetSpreadV, 0, `${soilId} keeps ripple phase across the ripple direction`);
    }
    for (const soilId of ['unknown', 'loam', 'forest', 'rock']) assert.equal(landscapeMaterialSamplingDefinition(soilId).rotationRangeDegrees, 180, `${soilId} is isotropic`);
    assert.equal(model.samplesPerLattice, 3);
    assert.ok(model.weightCutoff > 0 && model.weightCutoff < 1 / 255, 'skipped samples stay below one 8-bit step');
});

test('Material sampling: salts derive deterministically from the landscape seed, soil and projection', () => {
    const salts = LANDSCAPE_SOIL_CATALOG.map(soil => landscapeMaterialSamplingSalt(seed, soil.id));
    assert.deepEqual(salts, LANDSCAPE_SOIL_CATALOG.map(soil => landscapeMaterialSamplingSalt(seed, soil.id)), 'repeatable');
    assert.equal(new Set(salts).size, salts.length, 'every soil has its own lattice');
    assert.deepEqual(model.projections, ['top', 'side-x', 'side-z']);
    for (const [index, soil] of LANDSCAPE_SOIL_CATALOG.entries()) {
        assert.ok(Number.isSafeInteger(salts[index]) && salts[index] >= 0 && salts[index] <= 0xffffffff);
        assert.equal(landscapeMaterialSamplingSalt(seed, soil.id, 'top'), salts[index], 'the top projection keeps the AI577 D3 lattice salt');
        const sides = ['side-x', 'side-z'].map((projection, side) => {
            const salt = landscapeMaterialSamplingSalt(seed, soil.id, projection);
            assert.equal(salt, landscapeNoiseHash((salts[index] ^ model.projectionSaltMixes[side + 1]) >>> 0), `the shader derives the ${projection} salt from the top salt`);
            return salt;
        });
        assert.equal(new Set([salts[index], ...sides]).size, 3, 'each projection has its own lattice');
        assert.equal(landscapeMicroSamplingSalt(salts[index]), landscapeNoiseHash((salts[index] ^ LANDSCAPE_MICRO_DETAIL.saltMix) >>> 0), 'micro lattices derive from their projection salt');
    }
    assert.notEqual(landscapeMaterialSamplingSalt(seed + 1, 'loam'), landscapeMaterialSamplingSalt(seed, 'loam'));
    assert.throws(() => landscapeMaterialSamplingSalt(seed, 'loam', 'macro'), /Projection must be one of top, side-x, side-z/);
    for (const salt of salts) { const angle = landscapeHexLatticeAngle(salt); assert.ok(angle >= 0 && angle < Math.PI / 3); }
});

test('Material sampling: the triangle grid is equilateral and its weights are exact barycentric coordinates', () => {
    const next = random(17);
    for (let i = 0; i < 2000; i++) {
        const x = (next() - .5) * 400, y = (next() - .5) * 400, { vertices, barycentric } = landscapeHexTriangle(x, y);
        close(barycentric.reduce((sum, w) => sum + w, 0), 1, 1e-12);
        assert.ok(barycentric.every(w => w >= -1e-12 && w <= 1 + 1e-12));
        const centers = vertices.map(([i, j]) => landscapeHexVertexCenter(i, j));
        close(centers.reduce((sum, c, k) => sum + c[0] * barycentric[k], 0), x, 1e-9, 'x');
        close(centers.reduce((sum, c, k) => sum + c[1] * barycentric[k], 0), y, 1e-9, 'y');
        for (let a = 0; a < 3; a++) close(Math.hypot(centers[a][0] - centers[(a + 1) % 3][0], centers[a][1] - centers[(a + 1) % 3][1]), 1, 1e-12, 'edge');
    }
});

test('Material sampling: blended surfaces stay continuous across triangle and hexagon edges', () => {
    const next = random(91), epsilon = 1e-5;
    let largest = 0;
    for (const soilId of ['loam', 'sand']) for (const mode of ['hex-linear', 'hex-contrast', 'hex-variance']) for (let i = 0; i < 3000; i++) {
        const u = next() * 40, v = next() * 40, angle = next() * Math.PI * 2;
        const a = blendAt(soilId, u, v, mode), b = blendAt(soilId, u + epsilon * Math.cos(angle), v + epsilon * Math.sin(angle), mode);
        largest = Math.max(largest, Math.abs(a - b));
    }
    // the smooth texture and the weights are Lipschitz (about 32 per period here); a seam or a skipped-sample step would jump by far more
    assert.ok(largest < 1e-3, `largest change over ${1e-5} periods was ${largest}`);
});

test('Material sampling: mode weights normalize, follow relief in hex-contrast and skip only negligible samples', () => {
    const next = random(5);
    let fetches = { 'hex-linear': 0, 'hex-contrast': 0, 'hex-variance': 0 }, count = 0;
    for (let i = 0; i < 4000; i++) {
        const u = next() * 20, v = next() * 20, signals = [next(), next(), next()];
        for (const mode of Object.keys(fetches)) {
            const exponent = mode === 'hex-linear' ? 1 : mode === 'hex-contrast' ? 7 : model.varianceExponent;
            const hex = lattice('loam', u, v, exponent), { weights, fetched } = landscapeHexWeights({ weights: hex.weights, signals, mode });
            close(weights.reduce((sum, w) => sum + w, 0), 1, 1e-12);
            assert.ok(weights.every((w, k) => w >= 0 && (fetched[k] || w === 0)));
            // without skipping, every sample's weight would be its scaled pre-weight; skipping and its fade-in move no weight by more than four cutoffs
            const scale = k => mode === 'hex-contrast' ? 1 - model.contrastFalloff + model.contrastFalloff * signals[k] : 1;
            const exact = hex.weights.map((w, k) => w * scale(k)), exactTotal = exact.reduce((s, w) => s + w, 0);
            exact.forEach((w, k) => {
                if (!fetched[k]) assert.ok(w / exactTotal < model.weightCutoff, 'only samples below the cutoff are skipped');
                assert.ok(Math.abs(w / exactTotal - weights[k]) <= 4 * model.weightCutoff);
            });
            fetches[mode] += fetched.filter(Boolean).length;
        }
        count++;
    }
    const averages = Object.fromEntries(Object.entries(fetches).map(([mode, total]) => [mode, total / count]));
    assert.ok(averages['hex-contrast'] < 2 && averages['hex-contrast'] > 1.5, `hex-contrast fetches ${averages['hex-contrast']}`);
    assert.ok(averages['hex-linear'] > 2.9, `linear weights need nearly three fetches (${averages['hex-linear']})`);
    const high = landscapeHexWeights({ weights: [1 / 3, 1 / 3, 1 / 3], signals: [1, 0, 0], mode: 'hex-contrast' }).weights;
    assert.ok(high[0] > .55 && high[1] === high[2], 'equal pre-weights favor the raised sample');
    assert.deepEqual(landscapeHexWeights({ weights: [1, 0, 0], signals: [0, 1, 1], mode: 'hex-contrast' }).weights, [1, 0, 0], 'a vertex keeps its own sample');
    assert.throws(() => landscapeHexWeights({ weights: [1, 0, 0], mode: 'single' }), /Hex weights need a hex mode/);
    assert.equal(landscapeHexContrastSignal([.5, .5, .5], .9, true), .9);
    close(landscapeHexContrastSignal([1, .5, 0], .9, false), .2126 + .3576, 1e-12);
});

test('Material sampling: vertex rotations and offsets respect each soil constraint and are uniformly spread', () => {
    for (const soilId of Object.keys(model.materials)) {
        const definition = landscapeMaterialSamplingDefinition(soilId), salt = landscapeMaterialSamplingSalt(seed, soilId), range = definition.rotationRangeDegrees * Math.PI / 180;
        let sumU = 0, sumV = 0, sumAngle = 0, n = 0;
        for (let i = -40; i < 40; i++) for (let j = -40; j < 40; j++) {
            const { offset, angle } = landscapeHexVertexTransform(i, j, salt, { rotationRangeRadians: range, offsetSpreadV: definition.offsetSpreadV });
            assert.ok(Math.abs(angle) <= range + 1e-12, `${soilId} angle ${angle}`);
            assert.ok(offset[0] >= 0 && offset[0] < 1 && offset[1] >= 0 && offset[1] < Math.max(definition.offsetSpreadV, 1e-12) + 1e-12);
            if (!definition.offsetSpreadV) assert.equal(offset[1], 0);
            sumU += offset[0]; sumV += offset[1]; sumAngle += angle; n++;
        }
        close(sumU / n, .5, .03, `${soilId} mean U offset`);
        close(sumV / n, definition.offsetSpreadV / 2, .03, `${soilId} mean V offset`);
        close(sumAngle / n, 0, range * .05 + 1e-12, `${soilId} mean angle`);
    }
});

test('Material sampling: sample coordinates rotate about their vertex and gradients rotate with them', () => {
    const next = random(33), h = 1e-6;
    for (let i = 0; i < 500; i++) {
        const u = next() * 30, v = next() * 30, hex = lattice('rock', u, v);
        for (const [k, sample] of hex.samples.entries()) {
            const along = (du, dv) => { const moved = lattice('rock', u + du, v + dv).samples.find(other => other.vertex[0] === sample.vertex[0] && other.vertex[1] === sample.vertex[1]); return moved?.uv; };
            const right = along(h, 0), up = along(0, h);
            if (!right || !up) continue;
            const [gx, gy] = landscapeHexRotateGradient([1, 0], sample.rotation), [hx, hy] = landscapeHexRotateGradient([0, 1], sample.rotation);
            close((right[0] - sample.uv[0]) / h, gx, 1e-4, `du/du ${k}`); close((right[1] - sample.uv[1]) / h, gy, 1e-4, `dv/du ${k}`);
            close((up[0] - sample.uv[0]) / h, hx, 1e-4, `du/dv ${k}`); close((up[1] - sample.uv[1]) / h, hy, 1e-4, `dv/dv ${k}`);
        }
        const centered = hex.samples[0];
        const atCenter = lattice('rock', ...centered.center).samples.find(other => other.vertex[0] === centered.vertex[0] && other.vertex[1] === centered.vertex[1]);
        if (atCenter) { close(atCenter.uv[0], centered.center[0] + centered.offset[0] - Math.floor(centered.center[0] + centered.offset[0]), 1e-9); }
    }
});

test('Material sampling: inverse-rotated slopes equal the world gradient of the rotated relief', () => {
    // relief sampled through a rotated, offset patch: world height H(x) = h(R x + c); its world slope is R^T (grad h)
    const h = (u, v) => .3 * Math.sin(5.1 * u + 1.3) * Math.cos(3.7 * v) + .2 * Math.sin(2.3 * u - 4.1 * v);
    const grad = (u, v) => [.3 * 5.1 * Math.cos(5.1 * u + 1.3) * Math.cos(3.7 * v) + .2 * 2.3 * Math.cos(2.3 * u - 4.1 * v),
        -.3 * 3.7 * Math.sin(5.1 * u + 1.3) * Math.sin(3.7 * v) - .2 * 4.1 * Math.cos(2.3 * u - 4.1 * v)];
    const next = random(77), step = 1e-6;
    for (let i = 0; i < 400; i++) {
        const angle = (next() * 2 - 1) * Math.PI, rotation = [Math.cos(angle), Math.sin(angle)], c = [next(), next()], x = [next() * 3, next() * 3];
        const map = (px, py) => { const [ru, rv] = landscapeHexRotateGradient([px, py], rotation); return [ru + c[0], rv + c[1]]; };
        const [tu, tv] = map(...x), [gu, gv] = grad(tu, tv), normal = [-gu, -gv, 1];
        // OpenGL tangent normals point away from rising relief: n = normalize(-dh/du, -dh/dv, 1)
        const slope = landscapeHexNormalSlope(normal, rotation).map(value => -value);
        const world = [(h(...map(x[0] + step, x[1])) - h(...map(x[0] - step, x[1]))) / (2 * step), (h(...map(x[0], x[1] + step)) - h(...map(x[0], x[1] - step))) / (2 * step)];
        close(slope[0], world[0], 1e-5, 'x slope'); close(slope[1], world[1], 1e-5, 'y slope');
    }
    const steep = landscapeHexNormalSlope([1, 0, 0], [1, 0]);
    assert.equal(steep[0], model.slopeLimit, 'grazing normals are limited instead of dividing by zero');
});

test('Material sampling: variance-preserving blends keep mean and variance while linear blends lose variance', () => {
    const next = random(1234), weights = [.5, .3, .2], gauss = () => Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next());
    let n = 0, sv = 0, svv = 0, sl = 0, sll = 0;
    for (let i = 0; i < 60000; i++) {
        const values = [.5 + .1 * gauss(), .5 + .1 * gauss(), .5 + .1 * gauss()];
        const variance = landscapeHexBlend({ values, weights, mode: 'hex-variance', mean: .5 }), linear = landscapeHexBlend({ values, weights, mode: 'hex-linear' });
        n++; sv += variance; svv += variance * variance; sl += linear; sll += linear * linear;
    }
    close(sv / n, .5, 2e-3, 'variance mean'); close(sl / n, .5, 2e-3, 'linear mean');
    close(Math.sqrt(svv / n - (sv / n) ** 2), .1, 2e-3, 'variance-preserving std');
    close(Math.sqrt(sll / n - (sl / n) ** 2), .1 * Math.sqrt(.25 + .09 + .04), 2e-3, 'linear std shrinks by sqrt(sum w^2)');
    close(landscapeHexBlend({ values: [.9, .9, .9], weights: [1, 0, 0], mode: 'hex-variance', mean: .2, clamp: true }), .9, 1e-12, 'a single dominant sample is returned');
    assert.equal(landscapeHexBlend({ values: [1, 1, 1], weights: [1 / 3, 1 / 3, 1 / 3], mode: 'hex-variance', mean: .2, clamp: true }), 1, 'amplified deviations clamp to the unit range');
});

test('Material sampling: shader uniforms pack catalog values, int32 salts and disabled soils as zero rows', () => {
    const soils = LANDSCAPE_SOIL_CATALOG.map((soil, index) => ({ soilId: soil.id, enabled: index !== 0 }));
    const uniforms = landscapeMaterialSamplingUniforms({ seed, soils });
    assert.ok(Object.isFrozen(uniforms));
    assert.equal(uniforms.uSoilStochastic.length, 24); assert.equal(uniforms.uSoilStochasticSalts.length, 8);
    assert.deepEqual([...uniforms.uSoilStochastic.subarray(0, 4)], [0, 0, 0, 0], 'disabled soils keep one lattice sample');
    for (const [index, soil] of LANDSCAPE_SOIL_CATALOG.entries()) {
        if (!index) { assert.equal(uniforms.uSoilStochasticSalts[0], 0); continue; }
        const definition = landscapeMaterialSamplingDefinition(soil.id), row = uniforms.uSoilStochastic.subarray(index * 4, index * 4 + 4);
        close(row[0], definition.cellsPerPeriod, 1e-6); close(row[1], Math.fround(definition.rotationRangeDegrees * Math.PI / 180), 1e-6);
        close(row[2], definition.offsetSpreadV, 1e-6); close(row[3], definition.contrastExponent, 1e-6);
        assert.equal(uniforms.uSoilStochasticSalts[index] >>> 0, landscapeMaterialSamplingSalt(seed, soil.id), 'two-complement salts round-trip');
    }
    assert.deepEqual([...uniforms.uStochasticSettings].map(value => Number(value.toFixed(6))), [model.contrastFalloff, Number(Math.fround(model.weightCutoff).toFixed(6)), model.varianceExponent, model.samplesPerLattice]);
    assert.throws(() => landscapeMaterialSamplingUniforms({ seed, soils: [] }), /one to six soil slots/);
    assert.throws(() => landscapeMaterialSamplingUniforms({ seed, soils: [{ soilId: 'loam', enabled: 'yes' }] }), /boolean enablement/);
});

test('Material sampling: the GLSL chunk mirrors the JavaScript constants and the terrain shader uses one shared weight set', async () => {
    const chunk = await readFile(new URL('../../../src/graphics/shaders/chunks/landscape/stochastic_tiling.glsl', import.meta.url), 'utf8');
    const terrain = await readFile(new URL('../../../src/graphics/shaders/materials/landscape/terrain.frag.glsl', import.meta.url), 'utf8');
    const layers = await readFile(new URL('../../../src/graphics/shaders/chunks/landscape/surface_layers.glsl', import.meta.url), 'utf8');
    for (const literal of ['0x27d4eb2du', '0x165667b1u', `0x${model.rotationSaltMix.toString(16)}u`, `0x${model.latticeAngleSaltMix.toString(16)}u`,
        '0.57735026919', '1.15470053838', '0.86602540378', '1.0471975512', `#define LANDSCAPE_HEX_SLOPE_LIMIT ${model.slopeLimit.toFixed(1)}`]) assert.ok(chunk.includes(literal), `chunk mirrors ${literal}`);
    for (const mix of [...model.projectionSaltMixes.slice(1), LANDSCAPE_MICRO_DETAIL.saltMix]) assert.ok(layers.includes(`0x${mix.toString(16)}u`), `surface layers mirror salt mix ${mix.toString(16)}`);
    assert.ok(!chunk.includes('macroLattice') && !terrain.includes('macroLattice'), 'the magnifying macro lattice is gone');
    assert.match(chunk, /#ifndef LANDSCAPE_MATERIAL_SAMPLING\s+#error /);
    assert.match(chunk, /uniform vec4 uSoilStochastic\[6\];\s+uniform ivec4 uSoilStochasticSalts\[2\];\s+uniform vec4 uStochasticSettings;/);
    assert.match(terrain, /#include <shaderlib:landscape\/surface_warp>\s+#include <shaderlib:landscape\/material_clumps>\s+#include <shaderlib:landscape\/stochastic_tiling>/);
    assert.match(terrain, /int samples = hex \? min\(int\(uStochasticSettings\.w\), 3\) : 1;/, 'a uniform sample count keeps one loop body per soil');
    assert.match(terrain, /latticeTexel\(soil, micro, sampleUv, turn \* dx, turn \* dy, sampleAlbedo, encodedNormal, sampleOrm\);/, 'gradients rotate with each sample');
    assert.match(terrain, /vec3 decoded = encodedNormal \* 2\.0 - 1\.0;[\s\S]*?slope \+= weight \* landscapeHexSlope\(decoded, rotation, meanSlope\);/, 'normals blend as de-leaned, inverse-rotated slopes with the shared weights');
    assert.match(chunk, /vec2 slope = normal\.xy \/ depth - meanSlope;/, 'the page mean slope is removed in the texture frame before the inverse rotation (AI577 D5c)');
    assert.match(terrain, /microLayer \? vec2\(0\.0\) : uSoilResponse\[soil\]\.zw\);/, 'the mean-neutral micro layer is never de-leaned');
    assert.match(terrain, /encodedNormal = microNormal\(texel\) \* 0\.5 \+ 0\.5;/, 'micro normals run through the same lattice body and blend as inverse-rotated slopes');
    assert.match(terrain, /if \(micro && hex\) stochastic = uMicroSampling;/, 'micro lattices use their own catalog parameters');
    assert.match(terrain, /if \(bound < uStochasticSettings\.y\) continue;\s+weight \*= smoothstep\(uStochasticSettings\.y, 2\.0 \* uStochasticSettings\.y, bound\);/, 'skipped samples fade in continuously');
    // AI577 D6: the cached frame program (LANDSCAPE_SURFACE_CACHE, which compiles out soilSurface) has its own single micro lattice call
    const cacheMicroStart = terrain.indexOf('void landscapeSurfaceCacheMicro('), cacheMicro = terrain.slice(cacheMicroStart, terrain.indexOf('\n}\n', cacheMicroStart));
    const uncached = terrain.replace(cacheMicro, '');
    assert.equal((uncached.match(/soilLattice\(soil, /g) ?? []).length, 1, 'one inlined lattice call per soil surface serves every projection and the micro layer');
    assert.equal((cacheMicro.match(/soilLattice\(soil, true, /g) ?? []).length, 1, 'the cached frame evaluates one micro lattice');
});
