// Verifies the landscape-synthesis-recipe contract: strict validation, canonical JSON, identity hashing, operator seeds and the catalog's self-consistency.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDSCAPE_SYNTHESIS_FAMILIES, LANDSCAPE_SYNTHESIS_LAYERS, LANDSCAPE_SYNTHESIS_OPERATORS, LANDSCAPE_SYNTHESIS_SELECTORS, canonicalLandscapeSynthesisJson, landscapeSynthesisEffectiveSeed,
    landscapeSynthesisOperatorSeed, landscapeSynthesisRecipeIdentity, resolveLandscapeSynthesisParameters, validateLandscapeSynthesisRecipe } from '../../../src/app/landscape/index.js';

const op = (id, type, params = {}, mask = null, extra = {}) => ({ id, op: type, params, mask, seed: null, enabled: true, ...extra });
const PLAN = { districts: 'districts.json', roads: 'roads.json', shoreline: 'shoreline.json', beachPoints: 'beach_points.json', landCover: null };
const recipe = (changes = {}) => ({
    format: 'landscape-synthesis-recipe', schemaVersion: 1, id: 'recipe-test', seed: 7, seaLevel: 0,
    grid: { columns: 2049, rows: 2049, spacingX: 1.953125, spacingZ: 1.953125, bounds: { minX: 0, maxX: 4000, minZ: 0, maxZ: 4000 }, chunkIntervals: 256, maxLevel: 3 },
    working: { spacing: 7.8125 },
    inputs: { landscape: { directory: 'assets/public/landscape/coastal-city', expectedRevision: null }, plan: PLAN, imports: [] },
    operators: [op('import', 'import-heights'), op('plan', 'plan-inputs'),
        op('plateau', 'landform-plateau', { districtId: 4, faceSlopeDegrees: 62 }, { type: 'min', selectors: [{ type: 'slope', edge: { from: 10, to: 20 } }, { type: 'district', ids: [4], invert: true }] }),
        op('hills', 'landform-hills', { amplitudeMeters: 20 }, { type: 'distance', feature: 'shoreline', edge: { from: 50, to: 200 } }),
        op('roads', 'constrain-roads'), op('shore', 'constrain-shoreline'), op('cap', 'height-cap', { capMeters: 50 }), op('out', 'resample', { filter: 'bicubic' })],
    outputs: { heightCap: null, coverPolicy: 'keep-source', channels: ['height'] }, overrides: [], ...changes
});

function reorder(value) {
    if (Array.isArray(value)) return value.map(reorder);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reorder(entry)]));
}

test('Synthesis recipe: a valid recipe validates into a deep-frozen copy without defaults filled in', () => {
    const validated = validateLandscapeSynthesisRecipe(recipe());
    assert.ok(Object.isFrozen(validated) && Object.isFrozen(validated.operators[2].params) && Object.isFrozen(validated.operators[2].mask.selectors[0]));
    assert.equal(validated.operators[2].params.rimWidthMeters, undefined, 'defaults are not written into the validated recipe');
    const resolved = resolveLandscapeSynthesisParameters(validated.operators[2]);
    assert.equal(resolved.rimWidthMeters, LANDSCAPE_SYNTHESIS_OPERATORS['landform-plateau'].parameters.rimWidthMeters.default);
    assert.equal(resolved.faceSlopeDegrees, 62);
    assert.equal(resolved.polygon, null);
    assert.ok(Object.isFrozen(resolved));
});

test('Synthesis recipe: every invalid recipe is rejected with an actionable [Landscape] message', () => {
    const rejections = {
        'unknown operator': [r => { r.operators[0].op = 'nope'; }, /not a declared operator/],
        'unknown parameter': [r => { r.operators[2].params.extra = 1; }, /not a declared parameter/],
        'out-of-range parameter': [r => { r.operators[2].params.faceSlopeDegrees = 95; }, /faceSlopeDegrees must be in 10..89/],
        'wrong parameter type': [r => { r.operators[2].params.profile = 'cliff'; }, /profile must be one of/],
        'missing required parameter': [r => { r.operators.splice(2, 0, op('valley', 'landform-valley', {})); }, /polyline is required/],
        'duplicate operator id': [r => { r.operators[1].id = 'import'; }, /repeats id import/],
        'bad seed': [r => { r.seed = 2 ** 32; }, /seed must be an unsigned 32-bit integer/],
        'bad operator seed': [r => { r.operators[3].seed = -1; }, /seed must be an unsigned 32-bit integer/],
        'non-dyadic grid': [r => { r.grid.columns = 2048; }, /dyadic chunk hierarchy/],
        'grid bounds mismatch': [r => { r.grid.bounds.maxX = 4001; }, /bounds must equal/],
        'working spacing does not divide': [r => { r.working.spacing = 7; }, /must divide the X extent/],
        'working finer than output': [r => { r.working.spacing = 1; }, /at least the output spacing/],
        'coarse without resample': [r => { r.operators.pop(); }, /requires an enabled resample operator/],
        'resample not last': [r => { r.operators.splice(1, 0, op('early', 'resample')); }, /at most one resample|must be the last/],
        'layer read before written': [r => { r.operators.splice(1, 1); }, /reads layer districtId before/],
        'bad mask type': [r => { r.operators[2].mask = { type: 'slopes', edge: { from: 1, to: 2 } }; }, /mask.type must be one of/],
        'mask missing edge': [r => { r.operators[2].mask = { type: 'slope' }; }, /mask.edge is required/],
        'mask equal edges': [r => { r.operators[2].mask = { type: 'height', edge: { from: 3, to: 3 } }; }, /two different edge values/],
        'combinator with parameters': [r => { r.operators[2].mask = { type: 'min', selectors: [{ type: 'all' }], edge: { from: 0, to: 1 } }; }, /takes only selectors and invert/],
        'district and polygon together': [r => { r.operators[2].params.polygon = [[0, 0], [10, 0], [10, 10]]; }, /exactly one of districtId or polygon/],
        'self-intersecting polygon': [r => { r.operators[2].params = { polygon: [[0, 0], [10, 10], [10, 0], [0, 10]], heightMeters: 5 }; }, /polygon must be simple/],
        'octave mismatch': [r => { r.operators[3].params.wavelengthsMeters = [100, 50]; r.operators[3].params.amplitudes = [1]; }, /amplitudes must match/],
        'octaves not decreasing': [r => { r.operators[3].params.wavelengthsMeters = [50, 100]; r.operators[3].params.amplitudes = [1, 1]; }, /strictly decreasing/],
        'plan operator without plan inputs': [r => { r.inputs.plan = null; }, /requires recipe.inputs.plan/],
        'unknown top-level field': [r => { r.extra = 1; }, /exactly the fields/],
        'overrides not empty': [r => { r.overrides = [{ id: 'x' }]; }, /overrides must be an empty array/],
        'bad cover policy': [r => { r.outputs.coverPolicy = 'paint'; }, /coverPolicy must be one of/],
        'raw import without file': [r => { r.operators[0].params = { source: 'raw-float32' }; }, /file is required for a raw-float32 import/]
    };
    for (const [label, [mutate, pattern]] of Object.entries(rejections)) {
        const copy = structuredClone(recipe()); mutate(copy);
        assert.throws(() => validateLandscapeSynthesisRecipe(copy), error => /^\[Landscape\]/.test(error.message) && pattern.test(error.message), `${label}: ${(() => { try { validateLandscapeSynthesisRecipe(copy); return 'accepted'; } catch (error) { return error.message; } })()}`);
    }
});

test('Synthesis recipe: canonical JSON ignores key order and the identity covers parameters and sorted input hashes', async () => {
    const base = recipe(), inputs = [{ id: 'plan/roads', sha256: 'a'.repeat(64) }, { id: 'landscape', sha256: 'b'.repeat(64) }];
    assert.equal(canonicalLandscapeSynthesisJson(reorder(base)), canonicalLandscapeSynthesisJson(base));
    assert.ok(canonicalLandscapeSynthesisJson(base).startsWith('{"format":"landscape-synthesis-recipe","grid":{"bounds":{"maxX":4000'));
    const identity = await landscapeSynthesisRecipeIdentity(base, inputs);
    assert.match(identity, /^synthesis-[a-f0-9]{24}$/);
    assert.equal(await landscapeSynthesisRecipeIdentity(reorder(base), [...inputs].reverse()), identity, 'key and input order do not change the identity');
    const changed = recipe(); changed.operators[2].params.faceSlopeDegrees = 61;
    assert.notEqual(await landscapeSynthesisRecipeIdentity(changed, inputs), identity, 'a parameter change renews the identity');
    assert.notEqual(await landscapeSynthesisRecipeIdentity(base, [inputs[0], { id: 'landscape', sha256: 'c'.repeat(64) }]), identity, 'an input hash change renews the identity');
    const reseeded = recipe(); reseeded.operators[3].seed = 5;
    assert.notEqual(await landscapeSynthesisRecipeIdentity(reseeded, inputs), identity, 'an explicit operator seed is part of the identity');
    await assert.rejects(landscapeSynthesisRecipeIdentity(base, [inputs[0], inputs[0]]), /repeat id/);
    await assert.rejects(landscapeSynthesisRecipeIdentity(base, [{ id: 'x', sha256: 'zz' }]), /lowercase SHA-256/);
});

test('Synthesis recipe: operator seeds derive deterministically from the recipe seed and the operator id', () => {
    const seed = landscapeSynthesisOperatorSeed(7, 'plateau');
    assert.equal(seed, landscapeSynthesisOperatorSeed(7, 'plateau'));
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
    assert.notEqual(seed, landscapeSynthesisOperatorSeed(7, 'plateau2'));
    assert.notEqual(seed, landscapeSynthesisOperatorSeed(8, 'plateau'));
    assert.notEqual(landscapeSynthesisOperatorSeed(0, 'a'), landscapeSynthesisOperatorSeed(0, 'b'));
    const validated = validateLandscapeSynthesisRecipe(recipe());
    assert.equal(landscapeSynthesisEffectiveSeed(validated, validated.operators[2]), landscapeSynthesisOperatorSeed(7, 'plateau'));
    const explicit = recipe(); explicit.operators[2].seed = 99;
    assert.equal(landscapeSynthesisEffectiveSeed(validateLandscapeSynthesisRecipe(explicit), explicit.operators[2]), 99, 'an explicit seed wins');
    assert.throws(() => landscapeSynthesisOperatorSeed(-1, 'a'), /unsigned 32-bit/);
});

test('Synthesis recipe: the operator catalog is frozen, typed, documented and its defaults validate against their own declarations', () => {
    assert.ok(Object.isFrozen(LANDSCAPE_SYNTHESIS_OPERATORS) && Object.isFrozen(LANDSCAPE_SYNTHESIS_SELECTORS) && Object.isFrozen(LANDSCAPE_SYNTHESIS_LAYERS));
    const required = ['import-heights', 'plan-inputs', 'landform-plateau', 'landform-hills', 'landform-valley', 'warp', 'noise', 'constrain-districts', 'constrain-roads', 'constrain-shoreline', 'constrain-points', 'constrain-runway', 'height-cap', 'resample'];
    for (const name of required) assert.ok(LANDSCAPE_SYNTHESIS_OPERATORS[name], `${name} is declared`);
    const types = ['number', 'integer', 'string', 'boolean', 'enum', 'point', 'polygon', 'array'];
    for (const [name, definition] of Object.entries(LANDSCAPE_SYNTHESIS_OPERATORS)) {
        assert.equal(definition.op, name);
        assert.ok(LANDSCAPE_SYNTHESIS_FAMILIES.includes(definition.family), `${name} family`);
        assert.ok(definition.description.length > 20, `${name} description`);
        assert.ok(Object.isFrozen(definition.parameters) && Object.isFrozen(definition.layers.reads));
        for (const layer of [...definition.layers.reads, ...definition.layers.writes]) assert.ok(LANDSCAPE_SYNTHESIS_LAYERS[layer], `${name} layer ${layer} is declared`);
        for (const [parameter, entry] of Object.entries(definition.parameters)) {
            assert.ok(types.includes(entry.type), `${name}.${parameter} type ${entry.type}`);
            assert.equal(typeof entry.unit, 'string', `${name}.${parameter} unit`);
            assert.ok(entry.description.length > 5, `${name}.${parameter} description`);
            assert.ok(entry.required === true || Object.hasOwn(entry, 'default'), `${name}.${parameter} is required or has a default`);
            if (entry.type === 'enum') assert.ok(entry.values.length >= 2 && (entry.required || entry.values.includes(entry.default)), `${name}.${parameter} enum default`);
        }
        const requiredParameters = Object.entries(definition.parameters).filter(([, entry]) => entry.required);
        if (requiredParameters.length === 0) assert.doesNotThrow(() => resolveLandscapeSynthesisParameters({ op: name, params: {} }), `${name} defaults resolve`);
    }
    for (const [name, definition] of Object.entries(LANDSCAPE_SYNTHESIS_SELECTORS)) {
        assert.ok(definition.description.length > 5 && Array.isArray(definition.requires), `selector ${name}`);
        for (const layer of definition.requires) assert.ok(LANDSCAPE_SYNTHESIS_LAYERS[layer], `selector ${name} requires declared layer ${layer}`);
    }
    assert.deepEqual(LANDSCAPE_SYNTHESIS_OPERATORS['constrain-roads'].parameters.maxGradePercent, { type: 'number', unit: 'percent', description: 'Maximum sustained centerline grade', default: 6, min: .1, max: 50 });
});
