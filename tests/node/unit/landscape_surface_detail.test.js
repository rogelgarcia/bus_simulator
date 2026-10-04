// Checks generated fine surface-detail addressing, canonical support windows, content identity and view planning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { validateLandscapeManifest, createLandscapeAppearancePlanner, createLandscapeSurfaceDetailIndex, landscapeSurfaceDetailSupport, landscapeSurfaceDetailInputs,
    landscapeSurfaceDetailKey, landscapeSurfaceDetailSeed, landscapeSurfaceDetailRecipeHash, landscapeRegionIntersectsBounds, LANDSCAPE_SURFACE_DETAIL_FORMAT } from '../../../src/app/landscape/index.js';
import { LANDSCAPE_SURFACE_DETAIL_RECIPE, validateLandscapeSurfaceDetailRecipe } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceDetailRecipe.js';

const coastalUrl = new URL('../../../assets/public/landscape/coastal-city/manifest.json', import.meta.url);
const coastal = validateLandscapeManifest(JSON.parse(await readFile(coastalUrl, 'utf8')));
const coastalAppearance = JSON.parse(await readFile(new URL('appearance/manifest.json', coastalUrl), 'utf8'));
const recipe = LANDSCAPE_SURFACE_DETAIL_RECIPE;
const anchor = { x: 1071.2890625, z: 914.0625 };

function withOverrides(manifest, entries, revision = 'fixture-r2') {
    const draft = structuredClone(manifest);
    draft.capabilities = [...new Set([...draft.capabilities, 'terrain-editing-v1', 'terrain-editing-v2'])];
    draft.revision = revision;
    draft.operations = entries.map((entry, sequence) => ({ id: `soil-${sequence}`, type: 'assign-soil', soilId: entry.soilId, region: entry.region, falloff: { type: 'none' }, sequence, batchId: 'batch-1' }));
    draft.soil.overrides = entries.map((entry, sequence) => ({ id: `soil-${sequence}`, sequence, batchId: 'batch-1', soilId: entry.soilId, region: entry.region }));
    draft.editHistory = { batchIds: ['batch-1'], lastBatchId: 'batch-1', previousManifestUrl: `manifest.${'0'.repeat(64)}.json` };
    return validateLandscapeManifest(draft);
}

function orthographic(height, center = anchor, aspect = 16 / 9) {
    const halfX = height * aspect / 2, halfZ = height / 2;
    return { projection: 'orthographic', position: { x: center.x, y: 400, z: center.z }, viewportHeight: 1080, orthoHeight: height, zoom: 1,
        frustumPlanes: [{ x: 1, y: 0, z: 0, w: halfX - center.x }, { x: -1, y: 0, z: 0, w: center.x + halfX }, { x: 0, y: 0, z: 1, w: halfZ - center.z }, { x: 0, y: 0, z: -1, w: center.z + halfZ }] };
}

function perspective(position, target, fovDegrees, aspect = 16 / 9, near = .1, far = 6000) {
    const length = Math.hypot(target.x - position.x, target.y - position.y, target.z - position.z);
    const f = { x: (target.x - position.x) / length, y: (target.y - position.y) / length, z: (target.z - position.z) / length };
    const side = Math.hypot(f.z, f.x), r = { x: f.z / side, y: 0, z: -f.x / side }, u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
    const ty = Math.tan(fovDegrees * Math.PI / 360), tx = ty * aspect, dot = n => n.x * position.x + n.y * position.y + n.z * position.z;
    const plane = (a, b, scale) => { const n = { x: a.x + b.x * scale, y: a.y + b.y * scale, z: a.z + b.z * scale }, l = Math.hypot(n.x, n.y, n.z), m = { x: n.x / l, y: n.y / l, z: n.z / l }; return { ...m, w: -dot(m) }; };
    const negate = v => ({ x: -v.x, y: -v.y, z: -v.z });
    return { projection: 'perspective', position, direction: f, viewportHeight: 1080, fovYRadians: fovDegrees * Math.PI / 180, zoom: 1,
        frustumPlanes: [plane(r, f, tx), plane(negate(r), f, tx), plane(u, f, ty), plane(negate(u), f, ty), { ...f, w: -(dot(f) + near) }, { ...negate(f), w: dot(f) + far }] };
}

function levelsOf(ids) {
    const counts = {};
    for (const id of ids) counts[Number(id.slice(1, id.indexOf('/')))] = (counts[Number(id.slice(1, id.indexOf('/')))] ?? 0) + 1;
    return counts;
}

function visibleBox(node, planes) {
    const b = node.bounds;
    return planes.every(p => p.x * (p.x >= 0 ? b.maxX : b.minX) + p.y * (p.y >= 0 ? node.maxHeight : node.minHeight) + p.z * (p.z >= 0 ? b.maxZ : b.minZ) + p.w >= 0);
}

test('Surface detail index: fine descriptors derive lazily from the grid as frozen generated pages', () => {
    const index = createLandscapeSurfaceDetailIndex(coastal, { levels: 3 }), native = coastal.chunks.find(chunk => chunk.id === 'l3/c2/r6');
    const page = index.descriptor('l6/c17/r49');
    assert.deepEqual({ ...page, bounds: { ...page.bounds }, spacing: { ...page.spacing } }, { id: 'l6/c17/r49', level: 6, column: 17, row: 49, startColumn: 544, startRow: 1568,
        fineStartColumn: 4352, fineStartRow: 12544, sampleStride: .125, columns: 257, rows: 257, bounds: { minX: 1062.5, maxX: 1125, minZ: 875, maxZ: 937.5 },
        minHeight: native.minHeight, maxHeight: native.maxHeight, parentId: 'l5/c8/r24', nativeAncestorId: 'l3/c2/r6', spacing: { x: .244140625, z: .244140625 }, generated: true, measured: false });
    assert.ok(Object.isFrozen(page) && Object.isFrozen(page.bounds) && Object.isFrozen(page.spacing));
    assert.equal(index.descriptor('l4/c4/r12').parentId, 'l3/c2/r6');
    assert.deepEqual(index.children('l3/c2/r6').map(child => child.id), ['l4/c4/r12', 'l4/c5/r12', 'l4/c4/r13', 'l4/c5/r13']);
    assert.deepEqual(index.children('l6/c17/r49'), []);
    for (const parent of ['l3/c2/r6', 'l4/c4/r12', 'l5/c9/r25']) {
        const children = index.children(parent), parentBounds = parent.startsWith('l3') ? native.bounds : index.descriptor(parent).bounds;
        assert.equal(Math.min(...children.map(child => child.bounds.minX)), parentBounds.minX);
        assert.equal(Math.max(...children.map(child => child.bounds.maxX)), parentBounds.maxX);
        assert.equal(Math.min(...children.map(child => child.bounds.minZ)), parentBounds.minZ);
        assert.equal(Math.max(...children.map(child => child.bounds.maxZ)), parentBounds.maxZ);
        for (const child of children) assert.equal(child.parentId, parent);
    }
    const chain = [];
    for (let id = 'l6/c17/r49'; index.isFine(id); id = index.parentId(id)) chain.push(id);
    assert.deepEqual(chain, ['l6/c17/r49', 'l5/c8/r24', 'l4/c4/r12']);
    assert.equal(index.parentId('l4/c4/r12'), 'l3/c2/r6');
    assert.equal(index.nativeAncestorId('l6/c63/r0'), 'l3/c7/r0');
    for (const id of ['l3/c2/r6', 'l7/c0/r0', 'l6/c64/r0', 'l06/c1/r1', 'l6/c01/r1', 'l6/c1', 17, null]) assert.equal(index.isFine(id), false, String(id));
    assert.throws(() => index.descriptor('l7/c0/r0'), /unknown surface detail page/);
    assert.throws(() => index.descriptor('l3/c2/r6'), /unknown surface detail page/);
    assert.deepEqual({ ...index.spacing(5) }, { x: .48828125, z: .48828125 });
    const shallow = createLandscapeSurfaceDetailIndex(coastal, { levels: 0 });
    assert.deepEqual(shallow.children('l3/c2/r6'), []);
    assert.equal(shallow.isFine('l4/c4/r12'), false);
    assert.equal(createLandscapeSurfaceDetailIndex(coastal, { levels: 2 }).isFine('l6/c0/r0'), false);
    for (const levels of [-1, 5, 1.5, '3', undefined]) assert.throws(() => createLandscapeSurfaceDetailIndex(coastal, { levels }), /levels/);
    assert.equal(Object.keys(index).some(key => Array.isArray(index[key])), false);
});

test('Surface detail support: canonical native windows cover warp, override and query reach plus the smoothing dependency margin', () => {
    const format = LANDSCAPE_SURFACE_DETAIL_FORMAT, sha = id => coastal.chunks.find(chunk => chunk.id === id).channels.landCover.sha256, grid = coastal.grid;
    const corner = landscapeSurfaceDetailSupport(coastal, createLandscapeSurfaceDetailIndex(coastal, { levels: 3 }).descriptor('l5/c8/r24'), recipe);
    assert.deepEqual(corner.owners.map(owner => owner.id), ['l3/c1/r5', 'l3/c2/r5', 'l3/c1/r6', 'l3/c2/r6']);
    assert.ok(corner.owners.every(owner => owner.sha256 === sha(owner.id)));
    assert.deepEqual({ ...corner.windows.output }, { minColumn: 2048 - 2, maxColumn: 2304 + 2, minRow: 6144 - 2, maxRow: 6400 + 2 });
    assert.deepEqual({ ...corner.windows.labels }, { minColumn: 2048 - 4, maxColumn: 2304 + 5, minRow: 6144 - 4, maxRow: 6400 + 5 });
    assert.equal('field' in corner.windows, false);
    const boundary = recipe.boundary, warp = recipe.warp.amplitudes.reduce((sum, value) => sum + value, 0);
    const dependency = Math.ceil(boundary.windowSigmas * boundary.sigmaCells + boundary.maxDisplacementCells / boundary.gapFraction + 1 + boundary.loops.maxPerimeterCells / 2) + 2;
    for (const [id, expectedRadius] of [['l5/c8/r24', 11], ['l6/c17/r49', 19], ['l4/c4/r12', 7]]) {
        const support = landscapeSurfaceDetailSupport(coastal, id, recipe), spacing = support.spacing.x, window = support.native.window, evaluation = support.evaluationBounds;
        assert.equal(support.searchRadius, expectedRadius);
        assert.equal(support.searchRadiusMeters, expectedRadius * spacing);
        assert.equal(support.maxWarpMeters, warp);
        assert.equal(support.queryRadiusMeters, support.searchRadiusMeters + (boundary.maxDisplacementCells + 1.5) * grid.spacingX);
        assert.equal(support.canonicalMeters, warp + support.searchRadiusMeters + format.overrideProbeMeters + support.queryRadiusMeters);
        assert.equal(support.native.dependencyCells, dependency);
        assert.equal(dependency, 19);
        assert.ok(window.minColumn <= Math.floor((evaluation.minX - support.canonicalMeters) / grid.spacingX) - dependency);
        assert.ok(window.maxColumn >= Math.ceil((evaluation.maxX + support.canonicalMeters) / grid.spacingX) + dependency);
        assert.ok(window.minRow <= Math.floor((4000 - evaluation.maxZ - support.canonicalMeters) / grid.spacingZ) - dependency);
        assert.ok(window.maxRow >= Math.ceil((4000 - evaluation.minZ + support.canonicalMeters) / grid.spacingZ) + dependency);
        const labels = support.windows.labels;
        assert.deepEqual([evaluation.minX, evaluation.maxX, evaluation.minZ, evaluation.maxZ], [labels.minColumn * spacing, labels.maxColumn * spacing, 4000 - labels.maxRow * spacing, 4000 - labels.minRow * spacing]);
        const reach = warp + support.searchRadiusMeters + format.overrideProbeMeters;
        assert.deepEqual({ ...support.influenceBounds }, { minX: evaluation.minX - reach, maxX: evaluation.maxX + reach, minZ: evaluation.minZ - reach, maxZ: evaluation.maxZ + reach });
        assert.ok(Object.isFrozen(support) && Object.isFrozen(support.native.window) && Object.isFrozen(support.owners));
    }
    assert.deepEqual(landscapeSurfaceDetailSupport(coastal, 'l6/c17/r49', recipe).owners.map(owner => owner.id), ['l3/c2/r6']);
    const west = landscapeSurfaceDetailSupport(coastal, 'l6/c0/r0', recipe), east = landscapeSurfaceDetailSupport(coastal, 'l6/c63/r63', recipe);
    assert.deepEqual(west.owners.map(owner => owner.id), ['l3/c0/r0']);
    assert.deepEqual(east.owners.map(owner => owner.id), ['l3/c7/r7']);
    assert.ok(west.native.window.minColumn < 0 && west.native.window.minRow < 0 && east.native.window.maxColumn > 2048 && east.native.window.maxRow > 2048);
    assert.deepEqual([west.native.bounds.minX, west.native.bounds.maxZ, east.native.bounds.maxX, east.native.bounds.minZ], [0, 4000, 4000, 0]);
    assert.deepEqual([west.evaluationBounds.minX, west.evaluationBounds.maxZ], [0, 4000]);
    assert.ok(west.influenceBounds.minX < 0 && east.influenceBounds.maxX > 4000);
    for (const chunkIntervals of [1, 2]) {
        const { manifest } = createLandscapeModelFixture({ chunkIntervals, maxLevel: 2, coverAt: (column, row) => (column + row) % 4 });
        const index = createLandscapeSurfaceDetailIndex(manifest, { levels: 3 }), support = index.support('l5/c15/r15', recipe), window = support.native.window;
        const natives = manifest.chunks.filter(chunk => chunk.level === manifest.grid.maxLevel), owner = value => Math.min(3, Math.floor(Math.max(0, Math.min(manifest.grid.columns - 1, value)) / chunkIntervals));
        const expected = [];
        for (let row = owner(window.minRow); row <= owner(window.maxRow); row++) for (let column = owner(window.minColumn); column <= owner(window.maxColumn); column++) expected.push(`l2/c${column}/r${row}`);
        assert.deepEqual(support.owners.map(entry => entry.id), expected);
        assert.ok(support.owners.every(entry => natives.some(chunk => chunk.id === entry.id)));
    }
});

test('Surface detail identity: revisions, heights and material bindings never change page keys', () => {
    const fixture = createLandscapeModelFixture(), base = withOverrides(fixture.manifest, [{ soilId: 'sand', region: { type: 'circle', center: { x: 0, z: 18 }, radius: 1 } }]);
    const edited = structuredClone(base);
    edited.revision = 'fixture-height-and-material-edit';
    for (const chunk of edited.chunks) {
        chunk.revision = 'fixture-r9';
        chunk.channels.height = { ...chunk.channels.height, sha256: 'a'.repeat(64), url: `edits/${chunk.id}.bin`, revision: 'fixture-r9' };
        if (chunk.level === edited.grid.maxLevel) { chunk.minHeight = Math.min(chunk.minHeight + .25, chunk.maxHeight); }
    }
    edited.soil.catalog = edited.soil.catalog.map(soil => ({ ...soil, materialId: soil.id === 'loam' ? 'pbr.another_grass' : soil.materialId }));
    const region = edited.soil.overrides[0].region;
    edited.soil.overrides[0].region = { radius: region.radius, type: region.type, center: { z: region.center.z, x: region.center.x } };
    edited.operations[0].region = edited.soil.overrides[0].region;
    const manifest = validateLandscapeManifest(edited);
    for (const id of ['l2/c1/r1', 'l3/c3/r2', 'l4/c7/r9', 'l4/c0/r15']) {
        const before = landscapeSurfaceDetailInputs(base, id, recipe, 7), after = landscapeSurfaceDetailInputs(manifest, id, recipe, 7);
        assert.equal(landscapeSurfaceDetailKey(before), landscapeSurfaceDetailKey(after), id);
        const json = JSON.stringify(before);
        assert.ok(!json.includes(base.revision) && !json.includes('materialId') && !json.includes('pbr.') && !json.includes('height'), id);
        assert.ok(Object.isFrozen(before) && Object.isFrozen(before.cover) && Object.isFrozen(before.overrides));
        assert.match(landscapeSurfaceDetailKey(before), /^[0-9a-f]{16}$/);
    }
});

test('Surface detail identity: an override changes exactly the keys whose influence bounds it intersects', () => {
    const fixture = createLandscapeModelFixture({ chunkIntervals: 16, maxLevel: 2, spacing: 1.953125, minX: 0, minZ: 0 }), region = { type: 'circle', center: { x: 40, z: 60 }, radius: 1 };
    const rectangle = { type: 'rectangle', minX: 90, maxX: 92, minZ: 30, maxZ: 32 };
    const before = createLandscapeSurfaceDetailIndex(fixture.manifest, { levels: 3 }), after = createLandscapeSurfaceDetailIndex(withOverrides(fixture.manifest, [{ soilId: 'sand', region }]), { levels: 3 });
    const both = createLandscapeSurfaceDetailIndex(withOverrides(fixture.manifest, [{ soilId: 'sand', region }, { soilId: 'rock', region: rectangle }]), { levels: 3 });
    let changed = 0, unchanged = 0;
    for (let row = 0; row < 16; row++) for (let column = 0; column < 16; column++) {
        const id = `l4/c${column}/r${row}`, support = before.support(id, recipe);
        const intersects = landscapeRegionIntersectsBounds(region, support.influenceBounds);
        const keyBefore = landscapeSurfaceDetailKey(before.inputs(id, recipe, 1)), keyAfter = landscapeSurfaceDetailKey(after.inputs(id, recipe, 1));
        assert.equal(keyBefore !== keyAfter, intersects, id);
        if (intersects) changed++; else unchanged++;
        if (!landscapeRegionIntersectsBounds(rectangle, support.influenceBounds)) assert.equal(landscapeSurfaceDetailKey(both.inputs(id, recipe, 1)), keyAfter, id);
    }
    assert.ok(changed > 0 && unchanged > 0, `${changed} changed, ${unchanged} unchanged`);
});

test('Surface detail identity: recipe, seed, owned cover and overview infill inputs change keys', () => {
    const index = createLandscapeSurfaceDetailIndex(coastal, { levels: 3 }), id = 'l6/c17/r49', key = (manifest, options = {}) => landscapeSurfaceDetailKey(
        landscapeSurfaceDetailInputs(manifest, id, options.recipe ?? recipe, options.seed ?? landscapeSurfaceDetailSeed(coastal.id, recipe)));
    const baseline = key(coastal);
    assert.equal(baseline, landscapeSurfaceDetailKey(index.inputs(id, recipe, landscapeSurfaceDetailSeed(coastal.id, recipe))));
    const variant = validateLandscapeSurfaceDetailRecipe({ ...structuredClone(recipe), breakup: { ...structuredClone(recipe.breakup), amplitudes: [.45, .35, .2, .1] } });
    assert.notEqual(landscapeSurfaceDetailRecipeHash(variant), landscapeSurfaceDetailRecipeHash(recipe));
    assert.notEqual(key(coastal, { recipe: variant }), baseline);
    assert.notEqual(key(coastal, { seed: landscapeSurfaceDetailSeed(coastal.id, recipe) + 1 }), baseline);
    const recolored = id => { const draft = structuredClone(coastal); draft.chunks.find(chunk => chunk.id === id).channels.landCover.sha256 = 'b'.repeat(64); return validateLandscapeManifest(draft); };
    assert.notEqual(key(recolored('l3/c2/r6')), baseline);
    assert.equal(key(recolored('l3/c5/r5')), baseline);
    assert.notEqual(key(recolored('l0/c0/r0')), baseline);
    let fnv = 0x811c9dc5;
    for (const byte of new TextEncoder().encode('coastal-city|landscape-surface-detail')) fnv = Math.imul(fnv ^ byte, 0x01000193);
    assert.equal(landscapeSurfaceDetailSeed('coastal-city', recipe), fnv >>> 0);
    assert.equal(landscapeSurfaceDetailSeed('coastal-city', recipe), 1207276911);
    const nextVersion = validateLandscapeSurfaceDetailRecipe({ ...structuredClone(recipe), id: 'landscape-surface-detail-v4' });
    assert.equal(landscapeSurfaceDetailSeed('coastal-city', nextVersion), landscapeSurfaceDetailSeed('coastal-city', recipe), 'a new version of the family keeps the seed');
    assert.notEqual(landscapeSurfaceDetailRecipeHash(nextVersion), landscapeSurfaceDetailRecipeHash(recipe), 'the recipe hash still renews identities');
    const otherFamily = validateLandscapeSurfaceDetailRecipe({ ...structuredClone(recipe), id: 'experimental-detail-v1', family: 'experimental-detail' });
    assert.notEqual(landscapeSurfaceDetailSeed('coastal-city', otherFamily), landscapeSurfaceDetailSeed('coastal-city', recipe));
    assert.equal(landscapeSurfaceDetailRecipeHash(recipe), landscapeSurfaceDetailRecipeHash(validateLandscapeSurfaceDetailRecipe(JSON.parse(JSON.stringify(recipe)))));
    const inputs = index.inputs(id, recipe, 5);
    assert.deepEqual(Object.keys(inputs).sort(), ['cover', 'format', 'frame', 'overrides', 'overview', 'page', 'recipe', 'schemaVersion', 'seed', 'soil']);
    assert.deepEqual(inputs.soil.planningOnly, [5, 6, 7]);
    assert.throws(() => landscapeSurfaceDetailKey({ ...inputs, format: 'other' }), /inputs v1/);
    assert.throws(() => index.inputs(id, recipe, -1), /seed/);
});

test('Surface detail planning: existing appearance outputs stay byte-identical with or without fine levels', () => {
    const plain = createLandscapeAppearancePlanner(coastal, coastalAppearance), disabled = createLandscapeAppearancePlanner(coastal, coastalAppearance, { surfaceDetail: { levels: 0 } });
    const detailed = createLandscapeAppearancePlanner(coastal, coastalAppearance, { surfaceDetail: { levels: 3 } });
    assert.equal(plain.surfaceDetail, null); assert.equal(disabled.surfaceDetail, null); assert.equal(detailed.surfaceDetail.finestLevel, 6);
    const cameras = [orthographic(3000), orthographic(400), orthographic(120), perspective({ x: anchor.x, y: 6, z: anchor.z + 30 }, { x: anchor.x, y: 0, z: anchor.z - 40 }, 55),
        perspective({ x: 2000, y: 900, z: 2000 }, { x: 1500, y: 0, z: 1500 }, 40)];
    let previous = [];
    for (const camera of cameras) {
        const options = { previousMaskIds: previous };
        const a = plain.plan(camera, options), b = disabled.plan(camera, options), c = detailed.plan(camera, options);
        const { detail, ...rest } = c;
        assert.equal(JSON.stringify(b), JSON.stringify(a));
        assert.equal(JSON.stringify(rest), JSON.stringify(a));
        assert.ok(Object.isFrozen(c) && Object.isFrozen(detail) && Object.isFrozen(detail.desiredIds));
        assert.equal('detail' in a, false);
        previous = a.desiredMaskIds;
    }
});

test('Surface detail planning: fixed-position orthographic and perspective zoom refine fine levels below the native masks', () => {
    const planner = createLandscapeAppearancePlanner(coastal, coastalAppearance, { surfaceDetail: { levels: 3 } });
    const finest = plan => Math.max(0, ...plan.detail.visibleIds.map(id => planner.surfaceDetail.descriptor(id).level));
    assert.deepEqual([3000, 600, 400, 200, 120, 60].map(height => finest(planner.plan(orthographic(height)))), [0, 0, 4, 5, 6, 6]);
    const close = planner.plan(orthographic(60));
    assert.equal(close.detail.sourceLimited, true);
    assert.equal(planner.plan(orthographic(200)).detail.sourceLimited, false);
    assert.deepEqual({ ...close.detail.spacingMetersByLevel }, { 4: .9765625, 5: .48828125, 6: .244140625 });
    for (const id of close.detail.visibleIds) {
        const descriptor = planner.surfaceDetail.descriptor(id);
        assert.ok(Math.abs(close.detail.pixelsById[id] - 1080 / 60 * descriptor.spacing.x) < 1e-9);
    }
    const position = { x: anchor.x, y: 6, z: anchor.z + 30 }, target = { x: anchor.x, y: 0, z: anchor.z - 40 };
    const levels = [55, 30, 10, 3].map(fov => levelsOf(planner.plan(perspective(position, target, fov)).detail.visibleIds));
    assert.ok(levels[0][4] > 0 && levels[0][6] > 0, JSON.stringify(levels));
    const fraction = counts => (counts[6] ?? 0) / Object.values(counts).reduce((sum, value) => sum + value, 0);
    assert.ok(fraction(levels[3]) > fraction(levels[0]), JSON.stringify(levels));
    const wide = planner.plan(perspective(position, target, 55));
    assert.ok(wide.detail.visibleIds.every(id => wide.detail.pixelsById[id] > 0));
    assert.ok(new Set(wide.detail.desiredIds).size === wide.detail.desiredIds.length);
});

test('Surface detail planning: 65% hysteresis, frustum exclusion, level limits and explicit configuration errors', () => {
    const planner = createLandscapeAppearancePlanner(coastal, coastalAppearance, { surfaceDetail: { levels: 3 } }), level = id => planner.surfaceDetail.descriptor(id).level;
    const zoomed = planner.plan(orthographic(200));
    assert.ok(zoomed.detail.visibleIds.some(id => level(id) === 5));
    assert.ok(!planner.plan(orthographic(300)).detail.visibleIds.some(id => level(id) === 5));
    const retained = planner.plan(orthographic(300), { previousMaskIds: zoomed.desiredMaskIds, previousDetailIds: zoomed.detail.desiredIds });
    assert.ok(retained.detail.visibleIds.some(id => level(id) === 5));
    assert.ok(!planner.plan(orthographic(450), { previousMaskIds: zoomed.desiredMaskIds, previousDetailIds: zoomed.detail.desiredIds }).detail.visibleIds.some(id => level(id) === 5));
    const camera = orthographic(120), partial = { ...camera, frustumPlanes: [...camera.frustumPlanes, { x: 1, y: 0, z: 0, w: -anchor.x }] }, plan = planner.plan(partial);
    assert.ok(plan.detail.visibleIds.length > 0);
    const fineIds = new Set(plan.detail.desiredIds);
    for (const id of plan.detail.desiredIds) {
        const descriptor = planner.surfaceDetail.descriptor(id), shown = visibleBox(descriptor, partial.frustumPlanes);
        assert.equal(plan.detail.visibleIds.includes(id), shown, id);
        if (!shown) assert.equal(plan.detail.pixelsById[id], undefined, id);
        for (let parent = descriptor.parentId; planner.surfaceDetail.isFine(parent); parent = planner.surfaceDetail.parentId(parent)) {
            assert.equal(fineIds.has(parent), false);
            assert.ok(visibleBox(planner.surfaceDetail.descriptor(parent), partial.frustumPlanes), `${parent} was refined while invisible`);
        }
    }
    assert.ok(plan.detail.visibleIds.every(id => planner.surfaceDetail.descriptor(id).bounds.maxX >= anchor.x));
    const nothing = planner.plan({ ...camera, frustumPlanes: [{ x: 0, y: 1, z: 0, w: -100000 }] });
    assert.deepEqual([nothing.detail.desiredIds.length, nothing.detail.visibleIds.length], [0, 0]);
    const two = createLandscapeAppearancePlanner(coastal, coastalAppearance, { surfaceDetail: { levels: 2 } }).plan(orthographic(60));
    assert.equal(Math.max(...two.detail.visibleIds.map(level)), 5);
    assert.equal(two.detail.sourceLimited, true);
    assert.deepEqual(Object.keys(two.detail.spacingMetersByLevel), ['4', '5']);
    const coarse = createLandscapeAppearancePlanner(coastal, coastalAppearance, { surfaceDetail: { levels: 3, targetPixels: 16 } }).plan(orthographic(120));
    assert.ok(Math.max(...coarse.detail.visibleIds.map(level)) < 6);
    for (const surfaceDetail of [{ levels: 5 }, { levels: -1 }, { levels: 1.5 }, { levels: '3' }, { levels: 3, targetPixels: 0 }, { levels: 3, extra: 1 }, [], null]) {
        assert.throws(() => createLandscapeAppearancePlanner(coastal, coastalAppearance, { surfaceDetail }), /surfaceDetail/, JSON.stringify(surfaceDetail));
    }
    assert.throws(() => createLandscapeAppearancePlanner(coastal, coastalAppearance).plan(camera, { previousDetailIds: ['l4/c4/r12'] }), /previousDetailIds/);
    assert.throws(() => planner.plan(camera, { previousDetailIds: ['l3/c2/r6'] }), /unknown previous surface detail page/);
    assert.throws(() => planner.plan(camera, { previousDetailIds: 'l4/c4/r12' }), /previousDetailIds/);
});
