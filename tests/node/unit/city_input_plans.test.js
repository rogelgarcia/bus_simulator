import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { CITY_INPUT_SCHEMA, CITY_INPUT_ALGORITHMS, createCityInputPlans, coplanarInputKey, slabInputKey } from '../../../src/app/city/precomputed/CityInputPlans.js';
import { loadCityInputPlans, CITY_INPUT_INDEX } from '../../../src/app/city/precomputed/CityInputLoader.js';
import { rawSha256Hex } from '../../../src/app/illumination/package/RawSha256.js';
import { planReceiverCoplanarOwnership } from '../../../src/app/illumination/receiver_lightmaps/ReceiverCoplanarOwnership.js';
import { compileCityInputs } from '../../../tools/bake_lighting/city_inputs/job.mjs';
import { planBuildingSlabs } from '../../../src/app/city/BuildingSlabPlan.js';

const input = { footprintLoops: [[{x:0,z:0},{x:2,z:0},{x:2,z:2},{x:0,z:2}]], sidewalkBoundaries: [] };
const positions = new Float32Array([0,0,0, 2,0,0, 0,0,2, 0,0,0, 2,0,0, 0,0,2]);
const groups = new Int32Array([0,0]);
const bytes = value => new TextEncoder().encode(JSON.stringify(value));

async function fixture() {
    const plan = planReceiverCoplanarOwnership(positions, groups);
    return { schema: CITY_INPUT_SCHEMA, slabs: [{ key: slabInputKey(input), plan: planBuildingSlabs(input) }],
        coplanar: [{ key: await coplanarInputKey(positions, groups), patches: [...plan.patches], removedArea: plan.removedArea }] };
}

test('City plans: exact slab geometry, detached ownership, and changed live layout misses', async () => {
    const catalog = await fixture(), cache = createCityInputPlans(catalog);
    const result = cache.slabs(input, () => { throw new Error('should reuse'); });
    assert.deepEqual(result, planBuildingSlabs(input));
    result[0].top[0].x = 100;
    assert.notEqual(cache.slabs(input, () => null)[0].top[0].x, 100);
    const edited = structuredClone(input); edited.footprintLoops[0][0].x = .125;
    assert.deepEqual(cache.slabs(edited, planBuildingSlabs), planBuildingSlabs(edited));
    assert.equal(cache.diagnostics().slabMisses, 1);
});

test('City plans: ownership checks actual corners and eligibility, not asserted IDs', async () => {
    const cache = createCityInputPlans(await fixture());
    const found = await cache.coplanar(positions, groups);
    assert.deepEqual(found.plan, planReceiverCoplanarOwnership(positions, groups));
    found.plan.patches.clear();
    assert.equal((await cache.coplanar(positions, groups)).plan.patches.size, 1);
    const moved = positions.slice(); moved[0] = .01;
    assert.equal((await cache.coplanar(moved, groups)).plan, null);
    assert.equal((await cache.coplanar(positions, new Int32Array([0, -1]))).plan, null);
    assert.equal((await cache.coplanar(positions, new Int32Array([1, 0]))).plan, null);
});

test('City plans: offline compiler independently rejects false plan assertions', async () => {
    const catalog = await fixture();
    const captured = { slabs: [{ ...catalog.slabs[0], input }], coplanar: [{ ...catalog.coplanar[0], positions: [...positions], groups: [...groups] }] };
    assert.deepEqual(await compileCityInputs(captured), catalog);
    captured.coplanar[0].removedArea++;
    await assert.rejects(compileCityInputs(captured), /Independent coplanar/);
});

async function loaderFixture() {
    const decoded = bytes(await fixture()), payload = gzipSync(decoded), hash = await rawSha256Hex(payload);
    const index = { schema: CITY_INPUT_SCHEMA, file: `bigcity2.${hash}.json.gz`, sha256: hash, bytes: payload.length, decodedBytes: decoded.length, algorithms: {} };
    const files = new Map();
    for (const file of CITY_INPUT_ALGORITHMS) { const body = new TextEncoder().encode(file); files.set('/' + file, body); index.algorithms[file] = await rawSha256Hex(body); }
    files.set(CITY_INPUT_INDEX, bytes(index));
    files.set(CITY_INPUT_INDEX.replace('bigcity2.index.json', index.file), payload);
    const warnings = [];
    return { files, index, warnings, load: () => loadCityInputPlans({ fetchImpl: async url => new Response(files.get(url) ?? null, {status: files.has(url) ? 200 : 404}), warn: message => warnings.push(message) }) };
}

test('City plans: loader verifies algorithm content independently of package assertions', async () => {
    const f = await loaderFixture();
    assert.equal((await f.load()).diagnostics().state, 'ready');
    f.files.set('/' + CITY_INPUT_ALGORITHMS[1], bytes('changed dependency'));
    const stale = await f.load();
    assert.match(stale.diagnostics().state, /Planner changed/);
    assert.deepEqual(stale.slabs(input, planBuildingSlabs), planBuildingSlabs(input));
    assert.equal(f.warnings.length, 1);
});

test('City plans: corrupt, missing and forged dependency inventories fall back explicitly', async () => {
    const f = await loaderFixture();
    const payloadUrl = CITY_INPUT_INDEX.replace('bigcity2.index.json', f.index.file);
    f.files.set(payloadUrl, bytes({schema:CITY_INPUT_SCHEMA,slabs:[],coplanar:[]}));
    assert.match((await f.load()).diagnostics().state, /integrity mismatch/);
    delete f.index.algorithms[CITY_INPUT_ALGORITHMS[0]];
    f.files.set(CITY_INPUT_INDEX, bytes(f.index));
    assert.match((await f.load()).diagnostics().state, /Invalid city input index/);
    f.files.delete(CITY_INPUT_INDEX);
    assert.equal((await f.load()).diagnostics().state, 'missing');
});

test('City plans: gzip expansion is bounded by the authenticated declared length', async () => {
    const f = await loaderFixture();
    f.index.decodedBytes--;
    f.files.set(CITY_INPUT_INDEX, bytes(f.index));
    assert.match((await f.load()).diagnostics().state, /expansion exceeds/);
    f.index.decodedBytes += 2;
    f.files.set(CITY_INPUT_INDEX, bytes(f.index));
    assert.match((await f.load()).diagnostics().state, /expansion is incomplete/);
});

test('City plans: declared planner dependencies include the complete algorithm import closure', async () => {
    for (const file of CITY_INPUT_ALGORITHMS.slice(0,3)) {
        const source = await readFile(file, 'utf8');
        for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
            const dependency = new URL(match[1], new URL(file, 'https://local/')).pathname.slice(1);
            assert.ok(CITY_INPUT_ALGORITHMS.includes(dependency), `Unauthenticated algorithm dependency: ${dependency}`);
        }
    }
});
