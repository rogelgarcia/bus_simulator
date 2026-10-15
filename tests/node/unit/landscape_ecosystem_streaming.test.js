// Verifies the AI 599 D3 streaming planner: the sidecar address resolution, the frustum planes and box test, the view-disc planning with its keep hysteresis and ordering, the rank-prefix admission and reservation bookkeeping inside the ecosystem share, and the residency profiles the share grew.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LANDSCAPE_ECOSYSTEM, createLandscapeEcosystemLedger } from '../../../src/graphics/engine3d/landscape/ecosystem/LandscapeEcosystemModel.js';
import { createInertEcosystemStreamer, ecosystemBinding, ecosystemBoxVisible, ecosystemCellDistance, ecosystemFrustumPlanes, ecosystemRuntimeEstimate, ecosystemShareAvailable, ecosystemTileAdmission, ecosystemTileBytes, ecosystemTileHeightRange,
    ecosystemWorkerCacheBytes, landscapeEcosystemUrl, planEcosystemLayerCells } from '../../../src/graphics/engine3d/landscape/ecosystem/LandscapeEcosystemStreamingPlan.js';
import { LANDSCAPE_STREAMING_BUDGETS, LandscapeResidencyBudget } from '../../../src/app/landscape/LandscapeResidencyBudget.js';
import { LANDSCAPE_SURFACE_CACHE, LANDSCAPE_SURFACE_CACHE_BUDGETS } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheLayout.js';
import { LANDSCAPE_SURROUND } from '../../../src/graphics/engine3d/landscape/LandscapeSurroundModel.js';
import { LANDSCAPE_OCEAN } from '../../../src/graphics/engine3d/landscape/ocean/LandscapeOceanModel.js';
import { ECOSYSTEM_TILE_BYTES_PER_INSTANCE, ecosystemTileId, validateEcosystemRecipe } from '../../../src/app/landscape/index.js';

const MiB = 1024 * 1024, MANIFEST = 'http://127.0.0.1:8002/assets/public/landscape/coastal-city/manifest.json', BOUNDS = { minX: 0, maxX: 4000, minZ: 0, maxZ: 4000 };
const recipe = validateEcosystemRecipe(JSON.parse(await readFile(path.resolve('tools/bake_landscape/ecosystem/recipes/coastal-v3-ecosystem-v1.json'), 'utf8')));
// column-major perspective and orthographic projections (three's makePerspective / makeOrthographic) and a view looking along -Z from a position
const perspective = (fovDegrees, aspect, near, far) => { const f = 1 / Math.tan(fovDegrees * Math.PI / 360); return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]; };
const orthographic = (half, near, far) => [1 / half, 0, 0, 0, 0, 1 / half, 0, 0, 0, 0, -2 / (far - near), 0, 0, 0, -(far + near) / (far - near), 1];
const viewAt = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1];
// a view looking along +X from a position (camera right +Z, up +Y, back -X): the transpose of that rotation, then the rotated negative translation
const viewEast = (x, y, z) => [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, -z, -y, x, 1];
const distanceTo = (plane, point) => plane.x * point[0] + plane.y * point[1] + plane.z * point[2] + plane.w;

test('Ecosystem streaming: the sidecar address follows the option, the manifest attachment or the directory beside the landscape manifest', () => {
    assert.equal(landscapeEcosystemUrl(MANIFEST, { attachments: [] }, { mode: 'off', url: null }), null);
    assert.equal(landscapeEcosystemUrl(MANIFEST, { attachments: [] }, { mode: 'auto', url: null }), 'http://127.0.0.1:8002/assets/public/landscape/coastal-city/ecosystem/manifest.json');
    assert.equal(landscapeEcosystemUrl(MANIFEST.replace('manifest.json', `manifest.${'a'.repeat(64)}.json`), { attachments: [] }, { mode: 'auto', url: null }), 'http://127.0.0.1:8002/assets/public/landscape/coastal-city/ecosystem/manifest.json', 'a pinned snapshot resolves to the same directory');
    assert.equal(landscapeEcosystemUrl(MANIFEST, { attachments: [{ id: 'eco', kind: 'landscape-ecosystem', url: 'content/eco/manifest.json', revision: 'ecosystem-' + '0'.repeat(24) }] }, { mode: 'auto', url: null }), 'http://127.0.0.1:8002/assets/public/landscape/coastal-city/content/eco/manifest.json');
    assert.equal(landscapeEcosystemUrl(MANIFEST, { attachments: [{ id: 'eco', kind: 'landscape-ecosystem', url: 'content/eco/manifest.json' }] }, { mode: 'url', url: '/elsewhere/ecosystem/manifest.json' }), 'http://127.0.0.1:8002/elsewhere/ecosystem/manifest.json', 'an explicit URL wins');
    assert.equal(landscapeEcosystemUrl(MANIFEST, {}, { mode: 'auto', url: null }), 'http://127.0.0.1:8002/assets/public/landscape/coastal-city/ecosystem/manifest.json');
    assert.throws(() => landscapeEcosystemUrl('', {}, { mode: 'auto', url: null }), /manifest URL/);
});

test('Ecosystem streaming: the frustum planes have unit normals, contain the view volume and the grown box test agrees with the terrain planner', () => {
    const planes = ecosystemFrustumPlanes(perspective(90, 1, 1, 100), viewAt(0, 0, 0));
    assert.equal(planes.length, 6);
    for (const plane of planes) assert.ok(Math.abs(Math.hypot(plane.x, plane.y, plane.z) - 1) < 1e-9);
    for (const point of [[0, 0, -50], [40, 0, -50], [-40, 0, -50], [0, 40, -50], [0, 0, -1.5], [0, 0, -99]]) assert.ok(planes.every(plane => distanceTo(plane, point) >= -1e-9), `inside ${point}`);
    for (const point of [[0, 0, 10], [60, 0, -50], [0, -60, -50], [0, 0, -101], [0, 0, -.5]]) assert.ok(planes.some(plane => distanceTo(plane, point) < 0), `outside ${point}`);
    assert.equal(ecosystemBoxVisible({ minX: -5, maxX: 5, minZ: -50, maxZ: -40 }, [0, 3], planes), true);
    assert.equal(ecosystemBoxVisible({ minX: -5, maxX: 5, minZ: 40, maxZ: 50 }, [0, 3], planes), false, 'behind the camera');
    assert.equal(ecosystemBoxVisible({ minX: 200, maxX: 210, minZ: -50, maxZ: -40 }, [0, 3], planes), false, 'beside the 45 degree half angle');
    assert.equal(ecosystemBoxVisible({ minX: 52, maxX: 60, minZ: -50, maxZ: -40 }, [0, 3], planes), false);
    assert.equal(ecosystemBoxVisible({ minX: 52, maxX: 60, minZ: -50, maxZ: -40 }, [0, 3], planes, 3), true, 'the margin grows the box like the planner');
    const ortho = ecosystemFrustumPlanes(orthographic(10, 0, 100), viewAt(0, 0, 0));
    assert.equal(ecosystemBoxVisible({ minX: 15, maxX: 20, minZ: -50, maxZ: -40 }, [0, 1], ortho), false);
    assert.equal(ecosystemBoxVisible({ minX: 15, maxX: 20, minZ: -50, maxZ: -40 }, [0, 1], ortho, 6), true);
    assert.equal(ecosystemBoxVisible({ minX: -5, maxX: 5, minZ: -50, maxZ: -40 }, [0, 1], ortho), true);
    assert.equal(ecosystemBoxVisible({ minX: -5, maxX: 5, minZ: -50, maxZ: -40 }, [20, 30], ortho), false, 'above the orthographic top');
    const east = ecosystemFrustumPlanes(perspective(60, 16 / 9, .5, 2000), viewEast(1000, 20, 2000));
    assert.equal(ecosystemBoxVisible({ minX: 1200, maxX: 1300, minZ: 1950, maxZ: 2050 }, [0, 10], east), true, 'a box ahead of a camera looking east');
    assert.equal(ecosystemBoxVisible({ minX: 700, maxX: 800, minZ: 1950, maxZ: 2050 }, [0, 10], east), false, 'a box behind it');
    assert.throws(() => ecosystemFrustumPlanes([1, 2, 3], viewAt(0, 0, 0)), /column-major/);
});

test('Ecosystem streaming: the desired cells of a layer meet the view disc inside the landscape, nearest first, filtered by the index, the frustum and the keep hysteresis', () => {
    const boulders = recipe.layers.boulders, camera = { x: 1322, z: 2400 };
    const plan = planEcosystemLayerCells({ layer: boulders, cameraX: camera.x, cameraZ: camera.z, landscapeBounds: BOUNDS });
    assert.equal(plan.viewRadius, 900); assert.equal(plan.keepRadius, 900 * LANDSCAPE_ECOSYSTEM.streaming.keepHysteresis); assert.equal(plan.keepRadius, 1035);
    assert.ok(plan.desired.length > 20 && plan.candidates === plan.desired.length);
    assert.deepEqual([plan.desired[0].cellX, plan.desired[0].cellZ, plan.desired[0].distance], [5, 9, 0], 'the containing cell first');
    for (let i = 1; i < plan.desired.length; i++) assert.ok(plan.desired[i].distance >= plan.desired[i - 1].distance, 'nearest first');
    for (const cell of plan.desired) {
        assert.ok(cell.distance <= 900 && cell.bounds.minX < 4000 && cell.bounds.minZ < 4000 && cell.bounds.maxX > 0 && cell.bounds.maxZ > 0);
        assert.equal(cell.id, ecosystemTileId('boulders', cell.cellX, cell.cellZ));
        assert.equal(ecosystemCellDistance(cell.bounds, camera.x, camera.z), cell.distance);
    }
    assert.equal(plan.desired.every(cell => cell.bounds.minX <= 1322 + 900 && cell.bounds.maxX >= 1322 - 900 && cell.bounds.minZ <= 2400 + 900 && cell.bounds.maxZ >= 2400 - 900), true, 'every cell box reaches into the disc square');
    // the landscape bounds clip the disc: a camera outside the extent wants nothing beyond the edge, and far away nothing at all
    const edge = planEcosystemLayerCells({ layer: boulders, cameraX: -100, cameraZ: 2000, landscapeBounds: BOUNDS });
    assert.ok(edge.desired.length > 0 && edge.desired.every(cell => cell.bounds.minX >= 0 && cell.bounds.minX < 800));
    assert.equal(planEcosystemLayerCells({ layer: boulders, cameraX: -2000, cameraZ: 2000, landscapeBounds: BOUNDS }).desired.length, 0);
    // an offline layer's index admits only its published, fresh cells
    const published = new Set([ecosystemTileId('boulders', 5, 9), ecosystemTileId('boulders', 6, 9)]);
    const indexed = planEcosystemLayerCells({ layer: boulders, cameraX: camera.x, cameraZ: camera.z, landscapeBounds: BOUNDS, include: id => published.has(id) });
    assert.deepEqual(indexed.desired.map(cell => cell.id), [...published]); assert.equal(indexed.candidates, plan.candidates);
    // the frustum: a camera looking east keeps the cells ahead and drops the ones behind; a margin re-admits a box just outside
    const planes = ecosystemFrustumPlanes(perspective(55, 16 / 9, .5, 25000), viewEast(camera.x, 30, camera.z));
    const ahead = planEcosystemLayerCells({ layer: boulders, cameraX: camera.x, cameraZ: camera.z, landscapeBounds: BOUNDS, planes, heightRangeOf: () => [0, 40] });
    assert.ok(ahead.desired.length > 0 && ahead.desired.length < plan.desired.length);
    assert.ok(ahead.desired.every(cell => cell.bounds.maxX > camera.x - 1), `nothing behind: ${ahead.desired.map(cell => cell.id).join(' ')}`);
    assert.ok(plan.desired.filter(cell => cell.bounds.maxX < camera.x - 300).length > 0, 'the undirected disc holds cells behind the camera');
    // the fine runtime layer: 32 m cells over a 60 m disc, its keep disc 69 m; the hysteresis must be at least 1
    const pebbles = planEcosystemLayerCells({ layer: recipe.layers.pebbles, cameraX: 1228, cameraZ: 2600, landscapeBounds: BOUNDS });
    assert.deepEqual([pebbles.viewRadius, pebbles.keepRadius], [60, 69]); assert.ok(pebbles.desired.length >= 9 && pebbles.desired.length <= 25);
    assert.throws(() => planEcosystemLayerCells({ layer: boulders, cameraX: 0, cameraZ: 0, landscapeBounds: BOUNDS, keepHysteresis: .9 }), /at least 1/);
    assert.throws(() => planEcosystemLayerCells({ layer: boulders, cameraX: NaN, cameraZ: 0, landscapeBounds: BOUNDS }), /camera x/);
});

test('Ecosystem streaming: a tile reserves its records and ids before its job, a denial admits the longest rank prefix that fits and names the side that bound it', () => {
    assert.deepEqual({ ...ecosystemTileBytes(10) }, { cpuBytes: 600, gpuBytes: 480 }); assert.equal(ECOSYSTEM_TILE_BYTES_PER_INSTANCE, 60);
    assert.deepEqual({ ...ecosystemRuntimeEstimate(recipe.layers.pebbles) }, { cpuBytes: 2048 * 60, gpuBytes: 2048 * 48 }, 'half of the 64 x 64 sites');
    assert.deepEqual({ ...ecosystemTileAdmission({ count: 100, available: { cpuBytes: 6000, gpuBytes: 1e9 } }) }, { admitted: 100, fraction: 1, reason: null, cpuBytes: 6000, gpuBytes: 4800 });
    assert.deepEqual({ ...ecosystemTileAdmission({ count: 100, available: { cpuBytes: 3000, gpuBytes: 1e9 } }) }, { admitted: 50, fraction: .5, reason: 'ecosystem-cpu-budget', cpuBytes: 3000, gpuBytes: 2400 });
    assert.deepEqual({ ...ecosystemTileAdmission({ count: 100, available: { cpuBytes: 1e9, gpuBytes: 1440 } }) }, { admitted: 30, fraction: .3, reason: 'ecosystem-gpu-budget', cpuBytes: 1800, gpuBytes: 1440 });
    assert.deepEqual({ ...ecosystemTileAdmission({ count: 100, available: { cpuBytes: 59, gpuBytes: 1e9 } }) }, { admitted: 0, fraction: 0, reason: 'ecosystem-cpu-budget', cpuBytes: 0, gpuBytes: 0 });
    assert.deepEqual({ ...ecosystemTileAdmission({ count: 0, available: { cpuBytes: 0, gpuBytes: 0 } }) }, { admitted: 0, fraction: 1, reason: null, cpuBytes: 0, gpuBytes: 0 }, 'an empty tile always fits');
    assert.throws(() => ecosystemTileAdmission({ count: -1, available: { cpuBytes: 0, gpuBytes: 0 } }), /nonnegative integer/);
    // the bookkeeping over the real share: one standing reservation of the ecosystem kind in the shared ledger, the tiles accounted inside it
    const shared = new LandscapeResidencyBudget({ cpuBytes: 512 * MiB, gpuBytes: 512 * MiB }), share = createLandscapeEcosystemLedger(shared, { cpuBytes: 6000, gpuBytes: 100000 });
    assert.deepEqual(shared.snapshot().entries.map(entry => [entry.kind, entry.cpuBytes, entry.gpuBytes]), [[LANDSCAPE_ECOSYSTEM.kind, 6000, 100000]]);
    const first = ecosystemTileBytes(50);
    assert.equal(share.reserve('ecosystem/stream/boulders/x5/z9', first).admitted, true);
    assert.equal(share.reserve('ecosystem/stream/boulders/x6/z9', ecosystemTileBytes(100)).admitted, false, 'the whole tile is denied');
    const available = ecosystemShareAvailable(share.shareSnapshot());
    assert.deepEqual({ ...available }, { cpuBytes: 3000, gpuBytes: 97600 });
    const prefix = ecosystemTileAdmission({ count: 100, available });
    assert.deepEqual([prefix.admitted, prefix.reason], [50, 'ecosystem-cpu-budget']);
    assert.equal(share.reserve('ecosystem/stream/boulders/x6/z9', { cpuBytes: prefix.cpuBytes, gpuBytes: prefix.gpuBytes }).admitted, true);
    assert.deepEqual([share.shareSnapshot().cpuBytes, share.shareSnapshot().gpuBytes, share.shareSnapshot().entries, share.shareSnapshot().denied], [6000, 4800, 2, 1]);
    assert.equal(shared.snapshot().cpuBytes, 6000, 'the tiles never touch the shared ledger again');
    // a runtime cell corrects its provisional estimate on arrival; the room for the correction counts the reservation it replaces
    assert.deepEqual({ ...ecosystemShareAvailable(share.shareSnapshot(), first) }, { cpuBytes: 3000, gpuBytes: 95200 + 2400 });
    assert.equal(share.update('ecosystem/stream/boulders/x5/z9', ecosystemTileBytes(60)).admitted, false);
    assert.equal(share.update('ecosystem/stream/boulders/x5/z9', ecosystemTileBytes(40)).admitted, true);
    assert.equal(share.shareSnapshot().cpuBytes, 5400);
    share.release('ecosystem/stream/boulders/x5/z9'); share.release('ecosystem/stream/boulders/x6/z9');
    assert.deepEqual([share.shareSnapshot().cpuBytes, share.shareSnapshot().gpuBytes, share.shareSnapshot().entries], [0, 0, 0]);
    assert.equal(share.dispose(), true); assert.equal(shared.snapshot().entries.length, 0);
    assert.deepEqual(ecosystemTileHeightRange(Float32Array.from([0, 5, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, -2, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1]), 2, 0), [-2, 5]);
    assert.deepEqual(ecosystemTileHeightRange(new Float32Array(0), 0, -1), [-1, -1]);
});

test('Ecosystem streaming: the ecosystem share is accounted inside both shipped profiles and the streams keep their pre-AI 599 room', () => {
    const share = LANDSCAPE_ECOSYSTEM.budgets, streaming = LANDSCAPE_ECOSYSTEM.streaming;
    assert.deepEqual([LANDSCAPE_STREAMING_BUDGETS.cpuBytes / MiB, LANDSCAPE_STREAMING_BUDGETS.gpuBytes / MiB], [752, 528]);
    assert.deepEqual([LANDSCAPE_SURFACE_CACHE_BUDGETS.cpuBytes / MiB, LANDSCAPE_SURFACE_CACHE_BUDGETS.gpuBytes / MiB], [752, 720]);
    assert.equal(LANDSCAPE_SURFACE_CACHE.streamReserveGpuBytes, LANDSCAPE_STREAMING_BUDGETS.gpuBytes);
    // the AI 597 D4 profiles (688/432 uncached, 688/624 with the cache) are exactly what remains beside the ecosystem share
    assert.deepEqual([(LANDSCAPE_STREAMING_BUDGETS.cpuBytes - share.cpuBytes) / MiB, (LANDSCAPE_STREAMING_BUDGETS.gpuBytes - share.gpuBytes) / MiB], [688, 432]);
    assert.deepEqual([(LANDSCAPE_SURFACE_CACHE_BUDGETS.cpuBytes - share.cpuBytes) / MiB, (LANDSCAPE_SURFACE_CACHE_BUDGETS.gpuBytes - share.gpuBytes) / MiB], [688, 624]);
    // beside the surround, ocean and ecosystem shares the authoritative streams keep the 512/256 MiB they had before AI 596 D5
    const shares = [LANDSCAPE_SURROUND.budgets, LANDSCAPE_OCEAN.budgets, share];
    assert.equal((LANDSCAPE_STREAMING_BUDGETS.cpuBytes - shares.reduce((sum, entry) => sum + entry.cpuBytes, 0)) / MiB, 512);
    assert.equal((LANDSCAPE_STREAMING_BUDGETS.gpuBytes - shares.reduce((sum, entry) => sum + entry.gpuBytes, 0)) / MiB, 256);
    assert.equal((LANDSCAPE_SURFACE_CACHE_BUDGETS.gpuBytes - LANDSCAPE_SURFACE_CACHE.streamReserveGpuBytes) / MiB, 192, 'the cache keeps its 192 MiB ceiling');
    // the worker's declared caches fit the share with the asset sets (about 27.6 MB on the development recipe) beside them
    const workerCache = ecosystemWorkerCacheBytes({ grid: { chunkIntervals: 256 } }, recipe);
    assert.ok(workerCache > 10 * MiB && workerCache < 24 * MiB, `${workerCache / MiB} MiB`);
    assert.ok(workerCache + 28 * MiB + streaming.runtimeCacheBytes + 2 * MiB < share.cpuBytes, 'worker caches, asset sets, the runtime cache and the indexes leave room for the resident tiles');
    assert.ok(streaming.sidecarDecodeBytes === 3 * MiB && streaming.indexDecodeFactor === 4 && streaming.maxAttempts === 2);
});

test('Ecosystem streaming: an inert handle reports its status and binding, holds nothing and refuses the worker jobs', async () => {
    const manifest = { id: 'coastal-city-v3', revision: 'synthesis-b', bounds: BOUNDS }, sidecar = { landscapeId: 'coastal-city-v3', revision: 'ecosystem-' + '1'.repeat(24), densityScale: 1, recipe: { id: 'r' }, terrain: { revision: 'synthesis-a' }, dependencies: { recipeIdentity: 'ecosystem-recipe-' + '2'.repeat(24), fieldsRevision: null, geologyRevision: null, planningSha256s: ['b', 'a'].sort() } };
    const binding = ecosystemBinding(sidecar, manifest, null, { dependency: [{ sha256: 'a' }, { sha256: 'b' }, { sha256: 'a' }] });
    assert.deepEqual({ ...binding }, { landscapeId: 'coastal-city-v3', terrainRevision: 'synthesis-a', currentTerrainRevision: 'synthesis-b', bound: false, staleChunks: 0, fieldsRevision: null, geologyRevision: null, planningBound: true });
    assert.equal(ecosystemBinding(sidecar, manifest, { bound: false, staleChunks: ['l4/c0/r0'] }, null).planningBound, null);
    const inert = createInertEcosystemStreamer({ status: 'stale', reason: 'every native changed', url: 'http://h/ecosystem/manifest.json', landscape: { manifest }, planning: null, loadMs: 3, sidecar });
    assert.deepEqual([inert.status, inert.reason, inert.renderer, inert.recipe, inert.update(0, null, 0, 0), inert.evictTile('x')], ['stale', 'every native changed', null, null, 0, false]);
    assert.deepEqual([inert.snapshot().status, inert.snapshot().present, inert.snapshot().settled, inert.snapshot().revision, inert.snapshot().binding.bound, inert.snapshot().layers], ['stale', false, true, sidecar.revision, false, []]);
    await assert.rejects(inert.trace('boulders', 0, 0), /no ecosystem is active \(stale/); await assert.rejects(inert.hashCell('boulders', 0, 0), /no ecosystem is active/);
    assert.equal(await inert.tileSummary('boulders/x0/z0'), null); assert.deepEqual(inert.heatmap('boulders').cells, []);
    assert.equal(createInertEcosystemStreamer({ status: 'absent', reason: 'no sidecar', url: 'u', landscape: { manifest }, planning: null, loadMs: 1 }).snapshot().binding, null);
});
