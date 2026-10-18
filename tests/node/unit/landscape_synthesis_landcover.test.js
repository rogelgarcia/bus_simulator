// Verifies derive-land-cover (AI 596 D4): every declared rule on synthetic geology layers, the transition matrix, the derive cover policy of the executor and the recipe rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainFieldMemory } from '../../../tools/bake_landscape/terrain_fields/TerrainFieldsGrid.mjs';
import { executeSynthesisRecipe } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisGraph.mjs';
import { LAND_COVER_OPERATORS, coverTransitionMatrix } from '../../../tools/bake_landscape/terrain_synthesis/operators/LandCover.mjs';
import { upsampleCover } from '../../../tools/bake_landscape/terrain_synthesis/SynthesisWorkingGrid.mjs';
import { LANDSCAPE_SYNTHESIS_OPERATORS, resolveLandscapeSynthesisParameters, validateLandscapeSynthesisRecipe } from '../../../src/app/landscape/index.js';

const op = (id, type, params = {}, mask = null) => ({ id, op: type, params, mask, seed: null, enabled: true });
const gridOf = (chunkIntervals, maxLevel, spacing) => {
    const intervals = chunkIntervals * 2 ** maxLevel;
    return { columns: intervals + 1, rows: intervals + 1, spacingX: spacing, spacingZ: spacing, bounds: { minX: 0, maxX: intervals * spacing, minZ: 0, maxZ: intervals * spacing }, chunkIntervals, maxLevel };
};
const recipeOf = (grid, operators, { working = null, coverPolicy = 'keep-source' } = {}) => ({
    format: 'landscape-synthesis-recipe', schemaVersion: 1, id: 'landcover-test', seed: 5, seaLevel: 0, grid, working,
    inputs: { landscape: { directory: 'synthetic', expectedRevision: null }, plan: null, imports: [] }, operators, outputs: { heightCap: null, coverPolicy, channels: ['height'] }, overrides: []
});
const run = (recipe, inputs) => executeSynthesisRecipe({ recipe, inputs, memory: new TerrainFieldMemory(256 << 20) });

// the executor's context shape for one direct operator call: a layer store over typed arrays, a scope and the catalog defaults
function operatorContext({ grid, heights, layers, params = {}, seaLevel = 0, mask = null }) {
    const memory = new TerrainFieldMemory(128 << 20), n = grid.columns * grid.rows, store = new Map([['height', heights], ...Object.entries(layers)]), scoped = new Set();
    const layerStore = Object.freeze({ has: name => store.has(name), get(name) { if (!store.has(name)) throw new Error(`missing layer ${name}`); return store.get(name); },
        create(name, Type) { const array = memory.allocate(`layer/${name}`, Type, n); store.set(name, array); return array; } });
    const scope = Object.freeze({ allocate(name, Type, length) { scoped.add(`op/test/${name}`); return memory.allocate(`op/test/${name}`, Type, length); },
        free(...names) { for (const name of names) { memory.free(`op/test/${name}`); scoped.delete(`op/test/${name}`); } }, releaseAll() { for (const name of scoped) memory.free(name); scoped.clear(); } });
    const context = Object.freeze({ grid, seaLevel, memory, scope, layers: layerStore, cache: {}, checkpoint() {}, log() {}, mask: () => null,
        operator: { id: 'test', op: 'derive-land-cover', seed: 1, params: resolveLandscapeSynthesisParameters({ op: 'derive-land-cover', params }), mask } });
    return { context, memory, store, scope };
}

// a 33 x 33 grid at 2 m: a gentle plane rising east from the sea at column 6 with a 60-degree step face at columns 24-25
const GRID = { columns: 33, rows: 33, spacingX: 2, spacingZ: 2, minX: 0, maxZ: 64 }, N = 33 * 33;
const heightAt = (c, r) => (c - 6) * .25 + (c >= 25 ? 7 : c === 24 ? 3.5 : 0) + (r > 28 ? (c - 6) * .9 : 0);
function synthetic() {
    const heights = new Float32Array(N), cover = new Uint8Array(N), regolith = new Float32Array(N), depositType = new Uint8Array(N), depositThickness = new Float32Array(N), faceMask = new Float32Array(N), coastalZone = new Uint8Array(N), hardness = new Float32Array(N);
    for (let r = 0; r < 33; r++) for (let c = 0; c < 33; c++) {
        const i = r * 33 + c;
        heights[i] = heightAt(c, r); cover[i] = c < 6 ? 0 : c < 9 ? 1 : r < 16 ? 2 : 3; regolith[i] = .4; hardness[i] = c % 2 ? .9 : .3;
        if (r >= 2 && r <= 4 && c >= 12 && c <= 14) cover[i] = 5 + (c - 12);
    }
    return { heights, layers: { cover, regolith, depositType, depositThickness, faceMask, coastalZone, hardness } };
}
const at = (c, r) => r * 33 + c;

test('Land cover: every declared rule decides its samples in the documented precedence and the transition matrix accounts for every sample', async () => {
    const { heights, layers } = synthetic(), { cover, regolith, depositType, depositThickness, faceMask, coastalZone, hardness } = layers, before = Uint8Array.from(cover);
    // sand by deposit (beach sand 4, dune sand 5), sand by zone (swash 5 .. foredune 8), rock by face mask, slope, talus and exposed hard bedrock, grass on an alluvium floor
    depositType[at(10, 10)] = 4; depositThickness[at(10, 10)] = .6; depositType[at(10, 11)] = 5; depositThickness[at(10, 11)] = 1.2;
    coastalZone[at(10, 12)] = 6; coastalZone[at(10, 13)] = 8; coastalZone[at(10, 14)] = 4;
    faceMask[at(16, 10)] = .7; faceMask[at(16, 11)] = .3;
    depositType[at(18, 10)] = 1; depositThickness[at(18, 10)] = .8; depositType[at(18, 11)] = 1; depositThickness[at(18, 11)] = .2;
    depositType[at(20, 20)] = 3; depositThickness[at(20, 20)] = .5; depositType[at(20, 21)] = 3; depositThickness[at(20, 21)] = .1;
    regolith[at(17, 30)] = 0; regolith[at(16, 30)] = 0; // exposed bedrock on the steep southern rows: hard at odd columns
    cover[at(7, 3)] = 0; heights[at(7, 3)] = .5; // former water now land, no sand rule
    heights[at(12, 20)] = -.5; // former land now below sea level
    const { context, scope, memory, store } = operatorContext({ grid: GRID, heights, layers: { ...layers, cover }, params: { valleyFloorSlopeDegrees: 8 } });
    const statistics = await LAND_COVER_OPERATORS['derive-land-cover'](context);
    scope.releaseAll();
    assert.ok([...memory.entries.keys()].every(name => name.startsWith('layer/')), 'temporaries released');
    const derived = store.get('cover');
    for (const [c, r] of [[12, 2], [13, 3], [14, 4]]) assert.equal(derived[at(c, r)], before[at(c, r)], 'planning classes copied exactly');
    for (let c = 0; c < 6; c++) assert.equal(derived[at(c, 20)], 0, 'sea stays water');
    assert.equal(derived[at(12, 20)], 0, 'land that sank below sea level becomes water');
    assert.equal(derived[at(10, 10)], 1); assert.equal(derived[at(10, 11)], 1); assert.equal(derived[at(10, 12)], 1); assert.equal(derived[at(10, 13)], 1);
    assert.equal(derived[at(10, 14)], 2, 'the surf zone on land is not a sand zone: the source class stays');
    assert.equal(derived[at(16, 10)], 4, 'face mask at or above the threshold is rock'); assert.equal(derived[at(16, 11)], 2, 'below the threshold the source class stays');
    assert.equal(derived[at(24, 10)], 4, 'the 60 degree step is rock by slope'); assert.equal(derived[at(22, 10)], 2, 'the 7 degree plane is not');
    assert.equal(derived[at(18, 10)], 4, 'thick talus is rock'); assert.equal(derived[at(18, 11)], 2, 'a thin talus veneer is not');
    assert.equal(derived[at(17, 30)], 4, 'exposed hard bedrock on the 26 degree flank is rock'); assert.equal(derived[at(16, 30)], 3, 'exposed soft bedrock keeps the forest');
    assert.equal(derived[at(20, 20)], 2, 'an alluvium valley floor in the forest becomes grass and scrub'); assert.equal(derived[at(20, 21)], 3, 'a thin alluvium veneer keeps the forest');
    assert.equal(derived[at(20, 18)], 3, 'the neutral forest partition is kept'); assert.equal(derived[at(7, 20)], 1, 'the neutral source sand is kept');
    assert.equal(derived[at(7, 3)], 2, 'emerged land takes the emerged class');
    const matrix = statistics.matrix, total = Object.values(matrix).reduce((sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0), 0);
    assert.equal(total, N); assert.equal(statistics.samples, N);
    assert.equal(statistics.totals[5].before, 3); assert.equal(statistics.totals[5].after, 3); assert.equal(matrix[6][6], 3); assert.equal(matrix[7][7], 3);
    assert.ok(matrix[2][4] >= 3 && matrix[3][4] >= 1 && matrix[2][1] === 4 && matrix[0][2] === 1 && matrix[3][0] === 1, JSON.stringify(matrix));
    assert.equal(statistics.changedSamples, Object.entries(matrix).reduce((sum, [from, row]) => sum + Object.entries(row).filter(([to]) => to !== from).reduce((a, [, count]) => a + count, 0), 0));
    assert.equal(Object.values(statistics.decidedByRule).reduce((a, b) => a + b, 0), N);
    assert.ok(statistics.decidedByRule.planning === 9 && statistics.decidedByRule['sand-deposit'] === 2 && statistics.decidedByRule['sand-zone'] === 2 && statistics.decidedByRule['rock-talus'] === 1 && statistics.decidedByRule['grass-alluvium'] === 1 && statistics.decidedByRule['rock-bedrock'] === 1 && statistics.decidedByRule.emerged === 1, JSON.stringify(statistics.decidedByRule));
    assert.equal(statistics.rules.hardnessApplied, true);
    // without a hardness layer the exposed-bedrock rule is off and reported
    const second = synthetic();
    second.layers.regolith.fill(0);
    delete second.layers.hardness;
    const plain = operatorContext({ grid: GRID, heights: second.heights, layers: second.layers });
    const again = await LAND_COVER_OPERATORS['derive-land-cover'](plain.context);
    plain.scope.releaseAll();
    assert.equal(again.rules.hardnessApplied, false); assert.equal(again.decidedByRule['rock-bedrock'], 0);
    assert.equal(plain.store.get('cover')[at(17, 30)], 3, 'exposed bedrock without hardness keeps the source class');
    // a mask is refused
    const masked = operatorContext({ grid: GRID, heights: second.heights, layers: synthetic().layers, mask: { type: 'all' } });
    await assert.rejects(LAND_COVER_OPERATORS['derive-land-cover'](masked.context), /does not take a mask/);
});

test('Land cover: the transition matrix helper counts every pair and totals, and the operator is deterministic', async () => {
    const before = Uint8Array.from([0, 0, 1, 2, 3, 5, 7, 2]), after = Uint8Array.from([0, 2, 1, 4, 3, 5, 7, 2]);
    const result = coverTransitionMatrix(before, after);
    assert.deepEqual(result.matrix, { 0: { 0: 1, 2: 1 }, 1: { 1: 1 }, 2: { 2: 1, 4: 1 }, 3: { 3: 1 }, 5: { 5: 1 }, 7: { 7: 1 } });
    assert.deepEqual(result.totals[2], { before: 2, after: 2, delta: 0 }); assert.deepEqual(result.totals[4], { before: 0, after: 1, delta: 1 });
    assert.equal(result.changedSamples, 2); assert.equal(result.samples, 8);
    assert.throws(() => coverTransitionMatrix(before, new Uint8Array(3)), /one length/);
    const a = synthetic(), b = synthetic(), first = operatorContext({ grid: GRID, heights: a.heights, layers: a.layers }), second = operatorContext({ grid: GRID, heights: b.heights, layers: b.layers });
    const left = await LAND_COVER_OPERATORS['derive-land-cover'](first.context), right = await LAND_COVER_OPERATORS['derive-land-cover'](second.context);
    assert.deepEqual(left, right); assert.deepEqual(first.store.get('cover'), second.store.get('cover'));
});

test('Land cover: the executor publishes the derived cover under coverPolicy derive, nearest-upsampled from a coarse working grid with the planning classes restored exactly', async () => {
    const grid = gridOf(16, 2, 1), heightAt = (x, z) => (x - 8) * .4 + (x > 50 ? 12 : 0), coverAt = (x, z) => (x < 8 ? 0 : x < 12 ? 1 : z > 40 && z < 44 && x > 30 && x < 40 ? 6 : 3);
    const sourceOf = (binding, { memory, output }) => {
        const n = output.columns * output.rows, heights = memory.allocate('source/heights', Float32Array, n), cover = memory.allocate('source/cover', Uint8Array, n);
        for (let r = 0; r < output.rows; r++) for (let c = 0; c < output.columns; c++) { heights[r * output.columns + c] = heightAt(c, 64 - r); cover[r * output.columns + c] = coverAt(c, 64 - r); }
        return { grid: output, heights, cover, tracked: ['source/heights', 'source/cover'], sha256: 'ab'.repeat(32) };
    };
    const operators = [op('import', 'import-heights'), op('geology', 'geology-channels'), op('cover', 'derive-land-cover'), op('out', 'resample', { filter: 'bilinear' })];
    const native = await run(recipeOf(grid, operators, { coverPolicy: 'derive' }), { readLandscape: sourceOf });
    assert.equal(native.report.coverPolicy, 'derive'); assert.deepEqual(native.report.outputCover, { policy: 'derive', source: 'working-layer', planningRestoredSamples: 0 });
    for (let r = 0; r < 65; r++) for (let c = 0; c < 65; c++) {
        const i = r * 65 + c, source = coverAt(c, 64 - r);
        if (source === 6) assert.equal(native.cover[i], 6, 'planning road kept');
        else if (c < 8) assert.equal(native.cover[i], 0, 'sea');
        else if (c === 50 || c === 51) assert.equal(native.cover[i], 4, 'the 12 m step is rock');
        else assert.equal(native.cover[i], source, `neutral sample ${c},${r} keeps its class`);
    }
    const statistics = native.report.operators[2].statistics;
    assert.ok(statistics.matrix[3][4] > 0 && statistics.matrix[6][6] > 0 && statistics.totals[6].delta === 0, JSON.stringify(statistics.totals));
    native.release();
    // on a 2 m working grid the derived cover is upsampled nearest and the planning classes come from the native cover exactly
    const coarse = await run(recipeOf(grid, operators, { working: { spacing: 2 }, coverPolicy: 'derive' }), { readLandscape: sourceOf });
    assert.equal(coarse.report.outputCover.policy, 'derive'); assert.equal(coarse.report.outputCover.source, 'working-layer-nearest-upsampled');
    const working = { columns: 33, rows: 33, spacingX: 2, spacingZ: 2, minX: 0, maxZ: 64 }, expected = new Uint8Array(65 * 65);
    upsampleCover(working, coarse.layers.cover, coarse.grid, expected);
    let restored = 0;
    for (let r = 0; r < 65; r++) for (let c = 0; c < 65; c++) {
        const i = r * 65 + c, source = coverAt(c, 64 - r);
        if (source === 6 || expected[i] === 6) { assert.equal(coarse.cover[i], source, `planning restored at ${c},${r}`); if (expected[i] !== source) restored++; }
        else assert.equal(coarse.cover[i], expected[i], `nearest working label at ${c},${r}`);
    }
    assert.equal(coarse.report.outputCover.planningRestoredSamples, restored); assert.ok(restored > 0, 'the odd road rows need restoring');
    coarse.release();
    // keep-source on the same recipe is rejected, as is derive without the operator or the operator before geology-channels
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf(grid, operators, { coverPolicy: 'keep-source' })), /coverPolicy derive requires exactly one enabled derive-land-cover/);
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights'), op('geology', 'geology-channels')], { coverPolicy: 'derive' })), /coverPolicy derive requires exactly one/);
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights'), op('cover', 'derive-land-cover'), op('geology', 'geology-channels')], { coverPolicy: 'derive' })), /must follow an enabled geology-channels/);
    assert.throws(() => validateLandscapeSynthesisRecipe(recipeOf(grid, [op('import', 'import-heights'), op('geology', 'geology-channels'), op('cover', 'derive-land-cover', { emergedLandClass: 2, planningClasses: [2, 5, 6, 7] })], { coverPolicy: 'derive' })), /must not be a planning class/);
    assert.equal(LANDSCAPE_SYNTHESIS_OPERATORS['derive-land-cover'].family, 'output');
});
