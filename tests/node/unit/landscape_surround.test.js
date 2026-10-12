// Verifies the AI 596 D5 render-only surround contract: binding and staleness, the mesh exclusion skirt, the water extent, the residency share and the soil palette.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { buildLandscapeMeshBuffers, estimateLandscapeMeshBuffers, estimateLandscapeMeshExclusionBytes, landscapeCatalogSoilPalette, landscapeMeshBoundsExcluded, landscapeMeshExclusion, landscapeMeshTransferList, sampleLandscapeMeshHeight } from '../../../src/graphics/engine3d/landscape/LandscapeMeshBuffers.js';
import { withLandscapeMorphedPositions } from '../../../src/graphics/engine3d/landscape/LandscapeTileEdges.js';
import { LANDSCAPE_SOIL_PALETTE, createLandscapeSoilPalette, createLandscapeSoilPaletteUniforms, landscapeAppearanceSoilPalette, landscapeCorrectedAlbedo, landscapeMeanLinearAlbedo, landscapeMeanSurface } from '../../../src/graphics/engine3d/landscape/LandscapeSoilPalette.js';
import { landscapeMaterialResponseDefinition } from '../../../src/graphics/engine3d/landscape/LandscapeMaterialResponse.js';
import { readFile } from 'node:fs/promises';
import { LANDSCAPE_SOIL_SLOTS } from '../../../src/graphics/engine3d/landscape/LandscapeCoverageSlots.js';
import { LANDSCAPE_SURROUND, createLandscapeSurroundLedger, landscapeSurroundBinding, landscapeSurroundOption, landscapeSurroundResidency, landscapeSurroundUrl, landscapeSurroundWaterBounds } from '../../../src/graphics/engine3d/landscape/LandscapeSurroundModel.js';
import { LANDSCAPE_STREAMING_BUDGETS, LandscapeResidencyBudget } from '../../../src/app/landscape/LandscapeResidencyBudget.js';
import { LANDSCAPE_SURFACE_CACHE, LANDSCAPE_SURFACE_CACHE_BUDGETS } from '../../../src/graphics/engine3d/landscape/LandscapeSurfaceCacheLayout.js';

const MiB = 1024 * 1024;
const sha = 'a'.repeat(64);
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} differs from ${b}`);
const landscape = Object.freeze({ id: 'coastal-city-v3', revision: 'synthesis-7045f619de9de74a367bc3a8', bounds: { minX: 0, maxX: 4000, minZ: 0, maxZ: 4000 } });
const surroundManifest = (block, bounds = { minX: -14000, maxX: 18000, minZ: -14000, maxZ: 18000 }) => ({ id: 'coastal-city-v3-surround', revision: 'synthesis-0123456789abcdef01234567', bounds,
    provenance: { kind: 'procedural-synthesis', preparation: { algorithm: 'landscape-synthesis-v1', ...(block === undefined ? {} : { surround: block }) } } });
const binding = { landscapeId: landscape.id, revision: landscape.revision, manifestSha256: sha, extent: { ...landscape.bounds }, boundaryHash: sha };

test('Surround binding: only a block naming the loaded landscape id, exact revision and bounds binds; anything else is stale, unbound or invalid', () => {
    const bound = landscapeSurroundBinding(surroundManifest(binding), landscape);
    assert.equal(bound.status, 'bound'); assert.equal(bound.reason, null); assert.deepEqual(bound.binding, binding);
    assert.equal(landscapeSurroundBinding(surroundManifest({ ...binding, manifestSha256: undefined }), landscape).status, 'bound', 'the manifest hash is optional');
    assert.equal(landscapeSurroundBinding(surroundManifest(undefined), landscape).status, 'unbound');
    const stale = landscapeSurroundBinding(surroundManifest({ ...binding, revision: 'synthesis-ffffffffffffffffffffffff' }), landscape);
    assert.equal(stale.status, 'stale'); assert.match(stale.reason, /revision synthesis-ffffffffffffffffffffffff; synthesis-7045f619de9de74a367bc3a8 is loaded/); assert.equal(stale.binding.revision, 'synthesis-ffffffffffffffffffffffff');
    assert.equal(landscapeSurroundBinding(surroundManifest({ ...binding, landscapeId: 'coastal-city' }), landscape).status, 'stale');
    assert.equal(landscapeSurroundBinding(surroundManifest({ ...binding, extent: { minX: 0, maxX: 4000, minZ: 0, maxZ: 3000 } }), landscape).status, 'stale');
    for (const broken of [{ ...binding, boundaryHash: 'nope' }, { ...binding, manifestSha256: 'XYZ' }, { ...binding, landscapeId: 7 }, { ...binding, extent: { minX: 0, maxX: 0, minZ: 0, maxZ: 1 } }, []]) {
        assert.equal(landscapeSurroundBinding(surroundManifest(broken), landscape).status, 'invalid', JSON.stringify(broken));
    }
    assert.equal(landscapeSurroundBinding(surroundManifest(binding, { minX: 100, maxX: 18000, minZ: -14000, maxZ: 18000 }), landscape).status, 'invalid', 'the surround must contain its extent');
});

test('Surround option and sidecar address: auto resolves the sidecar beside the landscape manifest (pinned snapshots included), off loads nothing, a URL is explicit', () => {
    assert.deepEqual({ ...landscapeSurroundOption(undefined) }, { mode: 'auto', url: null });
    assert.deepEqual({ ...landscapeSurroundOption('off') }, { mode: 'off', url: null });
    assert.deepEqual({ ...landscapeSurroundOption('/assets/public/landscape/x/manifest.json') }, { mode: 'url', url: '/assets/public/landscape/x/manifest.json' });
    assert.throws(() => landscapeSurroundOption('on'), /auto, off or a manifest URL/);
    assert.throws(() => landscapeSurroundOption('/x/manifest'), /ending in \.json/);
    const manifestUrl = 'http://127.0.0.1:8002/assets/public/landscape/coastal-city-v3/manifest.3846aed4.json';
    assert.equal(landscapeSurroundUrl(manifestUrl, landscapeSurroundOption('auto')), 'http://127.0.0.1:8002/assets/public/landscape/coastal-city-v3/surround/manifest.json');
    assert.equal(landscapeSurroundUrl(manifestUrl, landscapeSurroundOption('off')), null);
    assert.equal(landscapeSurroundUrl(manifestUrl, landscapeSurroundOption('/assets/public/landscape/p/manifest.json')), 'http://127.0.0.1:8002/assets/public/landscape/p/manifest.json');
});

test('Surround water extent: the sea plane spans the surround bounds only while a surround is active and covers the landscape', () => {
    assert.deepEqual({ ...landscapeSurroundWaterBounds(landscape, null) }, landscape.bounds);
    assert.deepEqual({ ...landscapeSurroundWaterBounds(landscape, { status: 'stale', bounds: { minX: -14000, maxX: 18000, minZ: -14000, maxZ: 18000 } }) }, landscape.bounds);
    assert.deepEqual({ ...landscapeSurroundWaterBounds(landscape, { status: 'active', bounds: { minX: -14000, maxX: 18000, minZ: -14000, maxZ: 18000 } }) }, { minX: -14000, maxX: 18000, minZ: -14000, maxZ: 18000 });
    assert.throws(() => landscapeSurroundWaterBounds(landscape, { status: 'active', bounds: { minX: 1, maxX: 18000, minZ: -14000, maxZ: 18000 } }), /must contain the landscape bounds/);
    assert.deepEqual(landscapeSurroundResidency({ residentLeafIds: ['l0/c0/r0', 'l2/c1/r1', 'l2/c3/r0'] }), { tiles: 3, byLevel: { 0: 1, 2: 2 } });
});

// a 9x9 fixture tile (two levels) straddling an interior exclusion rectangle (a quarter of its area)
test('Mesh exclusion: straddling tiles take the reference surface inside (lowered by the skirt, exact on the boundary) for positions and parent heights alike and drop the cells inside', () => {
    const { manifest, decoded } = createLandscapeModelFixture({ chunkIntervals: 8, heightAt: (column, row) => 3 + Math.sin(column * .7) * 2 + row * .3 });
    const root = decoded.get(manifest.overviewId), chunk = decoded.get('l1/c0/r0'), { bounds, columns, rows } = chunk.descriptor;
    const reference = decoded.get('l1/c1/r1');
    const wide = { descriptor: { ...reference.descriptor, bounds: { minX: bounds.minX - 100, maxX: bounds.maxX + 100, minZ: bounds.minZ - 100, maxZ: bounds.maxZ + 100 } }, heights: reference.heights.map(value => value + 10) };
    // an interior 8 x 8 m rectangle of the 16 m tile (every boundary vertex has cells outside it, as the landscape extent has inside the straddling surround tiles)
    const exclusion = { bounds: { minX: bounds.minX + 4, maxX: bounds.minX + 12, minZ: bounds.minZ + 4, maxZ: bounds.minZ + 12 }, skirtDepth: 1.5, wallDepth: 4.5, reference: wide };
    const plain = buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest });
    const built = buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest, exclusion });
    assert.ok(built.exclusion.modifiedVertices > 0 && built.exclusion.droppedCells > 0);
    const estimate = estimateLandscapeMeshBuffers(chunk.descriptor);
    // the wall: one copy 4.5 m below each of the 16 boundary vertices, a quad (both windings) on each of the 16 boundary edges, after the perimeter skirt
    assert.equal(built.exclusion.wallVertices, 16); assert.equal(built.exclusion.wallTriangles, 64);
    assert.equal(built.positions.length / 3, estimate.vertices + 16); assert.equal(built.parentHeights.length, estimate.vertices + 16); assert.equal(built.exclusionHeights.length, estimate.vertices + 16);
    for (let copy = estimate.vertices; copy < estimate.vertices + 16; copy++) {
        const x = built.positions[copy * 3], z = built.positions[copy * 3 + 2];
        const onBoundary = (x === exclusion.bounds.minX || x === exclusion.bounds.maxX) && z >= exclusion.bounds.minZ && z <= exclusion.bounds.maxZ || (z === exclusion.bounds.minZ || z === exclusion.bounds.maxZ) && x >= exclusion.bounds.minX && x <= exclusion.bounds.maxX;
        assert.ok(onBoundary, `wall vertex ${copy} at (${x}, ${z}) is not on the boundary line`);
        near(built.positions[copy * 3 + 1], sampleLandscapeMeshHeight(wide, x, z) - 4.5); near(built.parentHeights[copy], built.positions[copy * 3 + 1], 0);
    }
    const wallTriangles = built.indices.subarray(built.indices.length - 64 * 3);
    for (let t = 0; t < 64; t++) assert.ok([0, 1, 2].every(k => { const index = wallTriangles[t * 3 + k], x = built.positions[index * 3], z = built.positions[index * 3 + 2]; return (x === exclusion.bounds.minX || x === exclusion.bounds.maxX || z === exclusion.bounds.minZ || z === exclusion.bounds.maxZ); }), `wall triangle ${t} leaves the boundary line`);
    let inside = 0, boundary = 0, outside = 0;
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const i = row * columns + column, x = built.positions[i * 3], z = built.positions[i * 3 + 2], y = built.positions[i * 3 + 1];
        const within = x >= exclusion.bounds.minX && x <= exclusion.bounds.maxX && z >= exclusion.bounds.minZ && z <= exclusion.bounds.maxZ;
        const strictly = x > exclusion.bounds.minX && x < exclusion.bounds.maxX && z > exclusion.bounds.minZ && z < exclusion.bounds.maxZ;
        if (strictly) { inside++; near(y, sampleLandscapeMeshHeight(wide, x, z) - 1.5); near(built.parentHeights[i], y, 0); }
        else if (within) { boundary++; near(y, sampleLandscapeMeshHeight(wide, x, z)); near(built.parentHeights[i], y, 0); }
        else { outside++; assert.equal(y, plain.positions[i * 3 + 1]); assert.equal(built.parentHeights[i], plain.parentHeights[i]); }
    }
    assert.deepEqual([inside, boundary, outside], [9, 16, 56]);
    assert.equal(built.exclusion.modifiedVertices, 25);
    // the sixteen cells without a corner outside the exclusion are dropped (the surround ends on the boundary line), every other cell is triangulated,
    // and the skirt still closes the perimeter
    assert.equal(built.exclusion.droppedCells, 16);
    assert.equal(built.surfaceTriangles, plain.surfaceTriangles - 32);
    assert.equal(built.indices.length, plain.indices.length - 96 + 64 * 3);
    const within = index => { const x = built.positions[index * 3], z = built.positions[index * 3 + 2]; return x >= exclusion.bounds.minX && x <= exclusion.bounds.maxX && z >= exclusion.bounds.minZ && z <= exclusion.bounds.maxZ; };
    // no surface triangle lies inside the closed exclusion (the wall triangles below the boundary line follow)
    for (let t = 0; t < built.surfaceTriangles; t++) {
        const corners = [0, 1, 2].map(k => built.indices[t * 3 + k]);
        assert.ok(!corners.every(within), `triangle ${t} lies inside the exclusion`);
    }
    // the boundary line is still fully covered from outside: every boundary vertex belongs to a kept triangle
    const referenced = new Set(built.indices.subarray(0, built.surfaceTriangles * 3));
    for (let i = 0; i < chunk.heights.length; i++) { const x = built.positions[i * 3], z = built.positions[i * 3 + 2]; const strictly = x > exclusion.bounds.minX && x < exclusion.bounds.maxX && z > exclusion.bounds.minZ && z < exclusion.bounds.maxZ; if (within(i) && !strictly) assert.ok(referenced.has(i), `boundary vertex ${i} is unreferenced`); if (strictly) assert.ok(!referenced.has(i), `inside vertex ${i} is referenced`); }
    assert.ok(built.wireIndices.length < plain.wireIndices.length);
    assert.equal(built.geometryBytes, ['positions', 'colors', 'normals', 'parentNormals', 'parentHeights', 'indices'].reduce((sum, key) => sum + built[key].byteLength, 0));
    // the bytes are exact, and the admission estimate plus the exclusion allowance bounds them for any exclusion (on the real 257² surround tiles the
    // dropped inside cells outweigh the wall; on this 9² fixture they do not, which is what the allowance is for)
    assert.equal(built.geometryBytes, ['positions', 'colors', 'normals', 'parentNormals', 'parentHeights', 'indices'].reduce((sum, key) => sum + built[key].byteLength, 0));
    const allowance = estimateLandscapeMeshExclusionBytes(chunk.descriptor);
    assert.equal(allowance, 2 * (columns + rows) * (31 + 48));
    for (const bounds2 of [exclusion.bounds, { minX: bounds.minX + 2, maxX: bounds.maxX - 2, minZ: bounds.minZ + 2, maxZ: bounds.maxZ - 2 }, { minX: bounds.minX, maxX: bounds.minX + 2, minZ: bounds.minZ, maxZ: bounds.maxZ }]) {
        const variant = buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest, exclusion: { ...exclusion, bounds: bounds2 } });
        assert.ok(variant.geometryBytes <= estimate.geometryBytes + allowance, `${JSON.stringify(bounds2)}: ${variant.geometryBytes} > ${estimate.geometryBytes} + ${allowance}`);
        assert.ok(variant.exclusionHeights.byteLength <= (estimate.vertices + allowance / 79) * 4);
    }
    assert.equal(landscapeMeshTransferList(built).length, 10);
    // skirt copies follow the displayed heights, and picking restores to them rather than to the replaced source samples
    const perimeterCount = 2 * columns + 2 * rows - 4;
    for (let index = 0; index < perimeterCount; index++) near(built.positions[(chunk.heights.length + index) * 3 + 1], built.boundaryPositions[index * 3 + 1] - built.skirtDepth, 3e-6);
    const displayed = built.positions.slice();
    withLandscapeMorphedPositions(built, chunk.heights, { morph: .5, coarser: [0, 0, 0, 0], edgeMorph: [1, 1, 1, 1] }, () => {});
    assert.deepEqual(built.positions, displayed);
    assert.deepEqual(chunk.heights, decoded.get('l1/c0/r0').heights);
});

test('Mesh exclusion: without a reference the tile\'s own heights are the surface, a disjoint exclusion leaves the tile untouched, and the validators refuse bad inputs', () => {
    const { manifest, decoded } = createLandscapeModelFixture({ heightAt: (column, row) => column * .5 + row });
    const root = decoded.get(manifest.overviewId), chunk = decoded.get('l1/c1/r0'), { bounds } = chunk.descriptor;
    const own = buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest, exclusion: { bounds: { minX: bounds.minX, maxX: bounds.minX + 4, minZ: bounds.minZ, maxZ: bounds.minZ + 4 }, skirtDepth: 2 } });
    for (let i = 0; i < chunk.heights.length; i++) {
        const x = own.positions[i * 3], z = own.positions[i * 3 + 2];
        if (x > bounds.minX && x < bounds.minX + 4 && z > bounds.minZ && z < bounds.minZ + 4) near(own.positions[i * 3 + 1], chunk.heights[i] - 2, 1e-5);
        else if (x <= bounds.minX + 4 && z <= bounds.minZ + 4) near(own.positions[i * 3 + 1], chunk.heights[i], 1e-5);
        else assert.equal(own.positions[i * 3 + 1], chunk.heights[i]);
    }
    const untouched = buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest, exclusion: { bounds: { minX: bounds.maxX + 1, maxX: bounds.maxX + 2, minZ: bounds.minZ, maxZ: bounds.maxZ }, skirtDepth: 1 } });
    const plain = buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest });
    assert.deepEqual(untouched.positions, plain.positions); assert.equal(untouched.exclusion, undefined); assert.equal(untouched.exclusionHeights, undefined);
    assert.ok(landscapeMeshBoundsExcluded(bounds, { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ }), 'a tile exactly filling the exclusion is excluded');
    assert.ok(!landscapeMeshBoundsExcluded(bounds, { minX: bounds.minX + 1, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ }));
    assert.throws(() => landscapeMeshExclusion({ bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 1 }, skirtDepth: 1 }), /positive area/);
    assert.throws(() => landscapeMeshExclusion({ bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, skirtDepth: 0 }), /positive skirt depth/);
    assert.throws(() => landscapeMeshExclusion({ bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, skirtDepth: 1, reference: { descriptor: { columns: 2, rows: 2, bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 } }, heights: new Float32Array(3) } }), /decoded chunk/);
    assert.throws(() => landscapeMeshExclusion({ bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, skirtDepth: 1, reference: root }), /cover the exclusion bounds/);
});

test('Surround ledger: reservations carry the surround kind in the shared ledger, stop at the share with the stream\'s own refusal reasons, and release to zero', () => {
    const shared = new LandscapeResidencyBudget({ cpuBytes: 64 * MiB, gpuBytes: 64 * MiB });
    shared.reserve('authoritative', { cpuBytes: 10 * MiB, gpuBytes: 10 * MiB, kind: 'terrain-resident' });
    const ledger = createLandscapeSurroundLedger(shared, { cpuBytes: 8 * MiB, gpuBytes: 4 * MiB });
    assert.equal(ledger.kind, LANDSCAPE_SURROUND.kind);
    assert.deepEqual({ ...ledger.reserve('a', { cpuBytes: 3 * MiB, gpuBytes: 1 * MiB, kind: 'terrain-build-reservation' }) }, { admitted: true, reason: null });
    assert.equal(shared.snapshot().entries.find(entry => entry.key === 'a').kind, LANDSCAPE_SURROUND.kind, 'the shared ledger sees the surround kind');
    assert.deepEqual({ ...ledger.update('a', { kind: 'terrain-resident' }) }, { admitted: true, reason: null });
    assert.equal(shared.snapshot().entries.find(entry => entry.key === 'a').kind, LANDSCAPE_SURROUND.kind, 'a kind update keeps the surround kind');
    assert.deepEqual({ ...ledger.reserve('b', { cpuBytes: 6 * MiB, gpuBytes: 1 * MiB, kind: 'terrain-build-reservation' }) }, { admitted: false, reason: 'cpu-budget' });
    assert.deepEqual({ ...ledger.reserve('b', { cpuBytes: 2 * MiB, gpuBytes: 4 * MiB, kind: 'terrain-build-reservation' }) }, { admitted: false, reason: 'gpu-budget' });
    assert.ok(!shared.has('b'), 'a share denial reserves nothing in the shared ledger');
    assert.deepEqual({ ...ledger.reserve('b', { cpuBytes: 2 * MiB, gpuBytes: 3 * MiB, kind: 'terrain-build-reservation' }) }, { admitted: true, reason: null });
    assert.deepEqual({ ...ledger.update('b', { cpuBytes: 2 * MiB, gpuBytes: 3 * MiB + 1 }) }, { admitted: false, reason: 'gpu-budget' });
    let share = ledger.shareSnapshot();
    assert.deepEqual([share.cpuBytes, share.gpuBytes, share.peakCpuBytes, share.peakGpuBytes, share.denied, share.entries], [5 * MiB, 4 * MiB, 5 * MiB, 4 * MiB, 3, 2]);
    assert.equal(shared.snapshot().cpuBytes, 15 * MiB);
    // the shared ledger can still refuse (its own limit), and a refused update keeps the share unchanged
    ledger.update('b', { cpuBytes: 1 * MiB, gpuBytes: 1 * MiB });
    shared.reserve('other', { cpuBytes: 48 * MiB, gpuBytes: 0, kind: 'terrain-resident' });
    assert.deepEqual({ ...ledger.update('b', { cpuBytes: 4 * MiB, gpuBytes: 1 * MiB }) }, { admitted: false, reason: 'cpu-budget' });
    assert.equal(ledger.shareSnapshot().cpuBytes, 4 * MiB);
    // pinned entries do not release through the share either; once unpinned the share and the shared ledger return to zero
    ledger.update('a', { pinned: true });
    assert.equal(ledger.release('a'), false);
    assert.equal(ledger.shareSnapshot().entries, 2);
    ledger.update('a', { pinned: false });
    assert.equal(ledger.release('a'), true); assert.equal(ledger.release('b'), true); assert.equal(ledger.release('never'), true);
    share = ledger.shareSnapshot();
    assert.deepEqual([share.cpuBytes, share.gpuBytes, share.entries, share.peakCpuBytes], [0, 0, 0, 5 * MiB]);
    assert.equal(shared.snapshot().entries.filter(entry => entry.kind === LANDSCAPE_SURROUND.kind).length, 0);
    assert.throws(() => ledger.update('gone', { cpuBytes: 1, gpuBytes: 1 }), /missing reservation/);
    assert.throws(() => ledger.reserve('authoritative', { cpuBytes: 1, gpuBytes: 1, kind: 'x' }), /duplicate reservation/);
    assert.throws(() => createLandscapeSurroundLedger(shared, { cpuBytes: -1, gpuBytes: 1 }), /nonnegative/);
});

test('Surround budgets: the share is accounted inside the shipped profiles and leaves the authoritative streams their pre-D5 room', () => {
    const share = LANDSCAPE_SURROUND.budgets;
    assert.ok(share.cpuBytes > 0 && share.gpuBytes > 0 && share.cpuBytes % MiB === 0 && share.gpuBytes % MiB === 0);
    // the uncached shipped profile and the surface cache profile both hold the surround share beside what the streams had before AI 596 D5 (512/256 and 512/448 MiB)
    assert.ok(LANDSCAPE_STREAMING_BUDGETS.gpuBytes - share.gpuBytes >= 256 * MiB, `${LANDSCAPE_STREAMING_BUDGETS.gpuBytes / MiB} MiB GPU leaves the streams less than 256 MiB beside the surround`);
    assert.ok(LANDSCAPE_STREAMING_BUDGETS.cpuBytes - share.cpuBytes >= 512 * MiB, `${LANDSCAPE_STREAMING_BUDGETS.cpuBytes / MiB} MiB CPU leaves the streams less than 512 MiB beside the surround`);
    assert.ok(LANDSCAPE_SURFACE_CACHE_BUDGETS.gpuBytes - LANDSCAPE_SURFACE_CACHE.streamReserveGpuBytes >= 192 * MiB, 'the cache keeps its 192 MiB ceiling above the streams\' reserve');
    assert.equal(LANDSCAPE_SURFACE_CACHE.streamReserveGpuBytes, LANDSCAPE_STREAMING_BUDGETS.gpuBytes);
    assert.equal(LANDSCAPE_SURROUND.targetErrorPixels, 3); assert.equal(LANDSCAPE_SURROUND.skirtDepthMeters, 1.5); assert.equal(LANDSCAPE_SURROUND.workers, 1);
    // the recorded raises: AI 596 D5 512/256 -> 640/352 MiB uncached, 512/448 -> 640/544 MiB with the cache (share 128/96 MiB); AI 597 D1 adds the
    // ocean's share (32/64 MiB in D1, 48/64 MiB since D2): 688/416 and 688/608 MiB
    assert.deepEqual([LANDSCAPE_STREAMING_BUDGETS.cpuBytes / MiB, LANDSCAPE_STREAMING_BUDGETS.gpuBytes / MiB], [688, 416]);
    assert.deepEqual([LANDSCAPE_SURFACE_CACHE_BUDGETS.cpuBytes / MiB, LANDSCAPE_SURFACE_CACHE_BUDGETS.gpuBytes / MiB], [688, 608]);
    assert.deepEqual([share.cpuBytes / MiB, share.gpuBytes / MiB], [128, 96]);
});

test('Soil palette mode: the tiles carry display soil indices, the catalog palette reproduces the vertex colours, and the stream cells follow the appearance palette', () => {
    const { manifest, decoded } = createLandscapeModelFixture({ chunkIntervals: 8, maxLevel: 1 });
    const root = decoded.get('l0/c0/r0'), chunk = decoded.get('l1/c0/r0');
    const plain = buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest });
    const indexed = buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest, soilPalette: true });
    const catalog = landscapeCatalogSoilPalette(manifest), soilIds = manifest.soil.catalog.map(entry => entry.id);
    assert.equal(indexed.colors.length, plain.colors.length);
    assert.equal(indexed.geometryBytes, plain.geometryBytes);
    const seen = new Set();
    for (let i = 0; i < indexed.colors.length; i += 3) {
        const soil = indexed.colors[i];
        assert.ok(soil < soilIds.length, `soil index ${soil}`); assert.equal(indexed.colors[i + 1], 0); assert.equal(indexed.colors[i + 2], 0);
        seen.add(soilIds[soil]);
        // the catalog palette is the byte colour the plain build carries for the same vertex (skirt copies included)
        assert.deepEqual([...plain.colors.subarray(i, i + 3)], catalog[soilIds[soil]].map(component => Math.round(component * 255)));
    }
    assert.ok(seen.size >= 2, 'the fixture shows several soils');
    assert.throws(() => buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest, soilPalette: 'yes' }), /boolean/);
    const sevenSoils = { ...manifest, soil: { ...manifest.soil, catalog: [...manifest.soil.catalog, { id: 'extra', label: 'Extra', materialId: 'pbr.extra', biome: 'land' }] } };
    assert.throws(() => buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest: sevenSoils, soilPalette: true }), /holds 6 soils/);
    // the stream's cells: palette mode with the catalog colours, an appearance palette replaces the soils it names, null restores the catalog, an applied version is skipped
    const cells = createLandscapeSoilPalette(manifest);
    assert.equal(cells.uniforms.uSoilPaletteMode.value, 1);
    assert.equal(cells.uniforms.uSoilPalette.value.length, LANDSCAPE_SOIL_SLOTS * 3);
    assert.deepEqual(cells.soilIds, soilIds);
    const before = cells.snapshot();
    assert.equal(before.source, 'catalog'); assert.equal(before.version, null); assert.equal(before.recipe, LANDSCAPE_SOIL_PALETTE.id);
    for (const [index, id] of soilIds.entries()) {
        for (let k = 0; k < 3; k++) near(cells.uniforms.uSoilPalette.value[index * 3 + k], catalog[id][k]);
        assert.deepEqual(before.soils[id], catalog[id].map(component => Math.round(component * 1e4) / 1e4));
    }
    assert.equal(before.srgb.sand, '#d9c58f');
    // the natural-ground response of each soil rides the cells in both states; the surface cells hold the plain fallback until an appearance palette names a soil
    for (const [index, id] of soilIds.entries()) {
        const definition = landscapeMaterialResponseDefinition(id);
        assert.deepEqual([...cells.uniforms.uSoilPaletteResponse.value.subarray(index * 3, index * 3 + 3)].map(value => Math.round(value * 1e4) / 1e4), [definition.diffuseRoughness, definition.specularShadowing, definition.opposition]);
        assert.deepEqual(before.response[id], [definition.diffuseRoughness, definition.specularShadowing, definition.opposition]);
        assert.deepEqual([...cells.uniforms.uSoilPaletteSurface.value.subarray(index * 2, index * 2 + 2)].map(value => Math.round(value * 1e4) / 1e4), [...LANDSCAPE_SOIL_PALETTE.plainSurface]);
        assert.deepEqual(before.surface[id], [...LANDSCAPE_SOIL_PALETTE.plainSurface]);
    }
    assert.equal(cells.set({ version: 1, soils: { loam: [.1, .2, .05] }, surface: { loam: [.7, .8] } }), true);
    const after = cells.snapshot();
    assert.deepEqual(after.surface.loam, [.7, .8]); assert.deepEqual(after.surface.sand, [...LANDSCAPE_SOIL_PALETTE.plainSurface]);
    near(cells.uniforms.uSoilPaletteSurface.value[soilIds.indexOf('loam') * 2 + 1], .8);
    assert.throws(() => cells.set({ soils: {}, surface: { loam: [2, 0] } }), /roughness, occlusion/);
    assert.equal(after.source, 'appearance'); assert.equal(after.version, 1);
    assert.deepEqual(after.soils.loam, [.1, .2, .05]);
    assert.deepEqual(after.soils.sand, before.soils.sand, 'unnamed soils keep the catalog');
    near(cells.uniforms.uSoilPalette.value[soilIds.indexOf('loam') * 3 + 1], .2);
    assert.equal(cells.set({ version: 1, soils: { loam: [.9, .9, .9] } }), false, 'an applied version is skipped');
    assert.equal(cells.set({ version: 2, soils: { loam: [.9, .9, .9] } }), true);
    near(cells.uniforms.uSoilPalette.value[soilIds.indexOf('loam') * 3], .9);
    assert.throws(() => cells.set({ soils: { loam: [1, 2] } }), /linear rgb triples/);
    assert.equal(cells.set(null), true); assert.equal(cells.snapshot().source, 'catalog'); assert.equal(cells.set(null), false);
    assert.deepEqual(cells.snapshot().surface.loam, [...LANDSCAPE_SOIL_PALETTE.plainSurface]);
    for (let k = 0; k < 3; k++) near(cells.uniforms.uSoilPalette.value[soilIds.indexOf('loam') * 3 + k], catalog.loam[k]);
    assert.equal(createLandscapeSoilPaletteUniforms().uSoilPaletteMode.value, 0, 'a tile reads its colour attribute as a colour until a stream binds its cells');
    assert.throws(() => createLandscapeSoilPalette(sevenSoils), /holds 6 soils/);
});

test('Soil palette derivation: the mean linear albedo of the coarse page under the shader albedo correction, ready once every material has its page', () => {
    const page = (r, g, b) => { const bytes = new Uint8Array(32 * 32 * 4); for (let i = 0; i < bytes.length; i += 4) bytes.set([r, g, b, 255], i); return bytes; };
    const linear = byte => { const s = byte / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; };
    const mean = landscapeMeanLinearAlbedo(page(128, 64, 200));
    for (const [k, byte] of [128, 64, 200].entries()) near(mean[k], linear(byte), 1e-6);
    // a two-tone page averages in linear light, not in sRGB
    const twoTone = page(0, 0, 0);
    for (let i = 0; i < twoTone.length; i += 8) twoTone.set([255, 255, 255, 255], i);
    for (const component of landscapeMeanLinearAlbedo(twoTone)) near(component, .5, 1e-6);
    assert.throws(() => landscapeMeanLinearAlbedo(new Uint8Array(5)), /RGBA8/);
    // the correction as the fragment shader applies it: identity, the brightness gain, a 120 degree hue rotation about the grey axis (a cyclic channel
    // permutation), full desaturation to the luminance, the hue's tint
    assert.deepEqual(landscapeCorrectedAlbedo([.2, .3, .1], [1, 0, 0, 0]), [.2, .3, .1]);
    for (const [k, value] of landscapeCorrectedAlbedo([.2, .3, .1], { x: .71, y: 0, z: 0, w: 0 }).entries()) near(value, [.2, .3, .1][k] * .71, 1e-12);
    for (const [k, value] of landscapeCorrectedAlbedo([.2, .3, .1], [1, 2 * Math.PI / 3, 0, 0]).entries()) near(value, [.1, .2, .3][k], 1e-9);
    for (const value of landscapeCorrectedAlbedo([.2, .3, .1], [1, 0, -1, 0])) near(value, .2126 * .2 + .7152 * .3 + .0722 * .1, 1e-12);
    const tinted = landscapeCorrectedAlbedo([.2, .2, .2], [1, 0, 0, 1]);
    near(tinted[0], .4, 1e-6); near(tinted[1], .1, 1e-6); near(tinted[2], .1, 1e-6);
    assert.throws(() => landscapeCorrectedAlbedo([1, 2], [1, 0, 0, 0]), /linear rgb triple/);
    // the surface of an ORM page: the shader's roughness remap (range normalization, inversion, min/max/gamma, scale, the 0.05..1 clamp) and occlusion intensity, averaged
    const orm = (ao, rough) => page(ao, rough, 0);
    assert.deepEqual(landscapeMeanSurface(orm(255, 255), { roughness: [0, 1, 1, 0], range: [0, 1, 1, 0], aoIntensity: 1 }), [1, 1]);
    near(landscapeMeanSurface(orm(128, 128), { roughness: [0, 1, 1, 0], range: [0, 1, 1, 0], aoIntensity: 1 })[0], 128 / 255, 1e-6);
    near(landscapeMeanSurface(orm(128, 128), { roughness: [0, 1, 1, 0], range: [0, 1, 1, 0], aoIntensity: .5 })[1], 1 - (1 - 128 / 255) * .5, 1e-6);
    near(landscapeMeanSurface(orm(0, 128), { roughness: [.2, .8, 2, 1], range: [0, 1, .5, 0], aoIntensity: 1 })[0], (.2 + .6 * (1 - 128 / 255) ** 2) * .5, 1e-6);
    near(landscapeMeanSurface(orm(0, 64), { roughness: [0, 1, 1, 0], range: [.25, .75, 1, 0], aoIntensity: 1 })[0], Math.max(.05, (64 / 255 - .25) / .5), 1e-6);
    assert.deepEqual(landscapeMeanSurface(orm(0, 0), { roughness: [0, 1, 1, 0], range: [0, 1, 1, 0], aoIntensity: 1 }), [.05, 0]);
    assert.throws(() => landscapeMeanSurface(orm(0, 0), { roughness: [0, 1, 1, 0], range: [0, 1, 1, 0], aoIntensity: NaN }), /finite/);
    // a palette is ready only with every coarse page; the page means are cached on the record and outlive its released bytes; the surface follows the ORM layer of the record
    const tier = { pages: [{ role: 'baseColor' }, { role: 'normal' }, { role: 'orm' }] };
    const surfaceLayers = new Uint8Array(32 * 32 * 4 * 2); surfaceLayers.set(orm(128, 128), 32 * 32 * 4);
    const materials = [{ definition: { soilId: 'sand' }, index: 0, coarse: { baseColor: page(217, 197, 143), surface: surfaceLayers, tier, maps: 3 } }, { definition: { soilId: 'loam' }, index: 1, coarse: null }];
    const corrections = [[.5, 0, 0, 0], [1, 0, 0, 0]];
    const shading = { albedo: corrections, roughness: [[0, 1, 1, 0], [0, 1, 1, 0]], range: [[0, 1, 1, 0], [0, 1, 1, 0]], scale: [[1, 1, .5, 0], [1, 1, 1, 0]] };
    const partial = landscapeAppearanceSoilPalette(materials, shading);
    assert.equal(partial.ready, false); assert.deepEqual(Object.keys(partial.soils), ['sand']);
    near(partial.surface.sand[0], 128 / 255, 1e-6); near(partial.surface.sand[1], 1 - (1 - 128 / 255) * .5, 1e-6);
    for (const [k, byte] of [217, 197, 143].entries()) near(partial.soils.sand[k], linear(byte) * .5, 1e-6);
    materials[1].coarse = { baseColor: page(10, 20, 30) };
    const full = landscapeAppearanceSoilPalette(materials, shading);
    assert.equal(full.ready, true); assert.deepEqual(Object.keys(full.soils).sort(), ['loam', 'sand']);
    assert.deepEqual(Object.keys(full.surface), ['sand'], 'a record without an ORM page has no surface; the cells keep the plain fallback for it');
    for (const [k, byte] of [10, 20, 30].entries()) near(full.soils.loam[k], linear(byte), 1e-6);
    materials[0].coarse.baseColor = materials[0].coarse.surface = null;
    const released = landscapeAppearanceSoilPalette(materials, corrections);
    assert.equal(released.ready, true, 'the cached page means serve after the bytes are released'); near(released.surface.sand[0], 128 / 255, 1e-6);
    assert.deepEqual([...LANDSCAPE_SOIL_PALETTE.sources], ['catalog', 'appearance']);
});

test('Soil palette shaders: the vertex shader reads the palette cells into the fallback surface varyings and the fragment fallback path shades with them', async () => {
    const root = new URL('../../../src/graphics/shaders/materials/landscape/', import.meta.url);
    const vertex = await readFile(new URL('terrain.vert.glsl', root), 'utf8'), fragment = await readFile(new URL('terrain.frag.glsl', root), 'utf8');
    for (const declaration of ['uniform vec3 uSoilPalette[6];', 'uniform vec3 uSoilPaletteResponse[6];', 'uniform vec2 uSoilPaletteSurface[6];', 'uniform float uSoilPaletteMode;', 'varying vec3 vLandscapeResponse;', 'varying vec2 vLandscapeSurface;']) assert.ok(vertex.includes(declaration), declaration);
    assert.match(vertex, /int soil = clamp\(int\(vertexColor\.r \* 255\.0 \+ 0\.5\), 0, 5\);/);
    assert.match(vertex, /vLandscapeResponse = vec3\(0\.0\);\s+vLandscapeSurface = vec2\(0\.9, 1\.0\);/, 'outside palette mode the plain fallback surface');
    assert.equal(vertex.match(/landscapeFallbackSurface\(color\);/g).length, 2, 'both vertex paths');
    for (const declaration of ['varying vec3 vLandscapeResponse;', 'varying vec2 vLandscapeSurface;']) assert.ok(fragment.includes(declaration), declaration);
    assert.equal(fragment.match(/response = vLandscapeResponse, groundAlbedo = albedo;/g).length, 2, 'both fallback sites take the palette response');
    assert.equal(fragment.match(/float roughness = vLandscapeSurface\.x, (metalness = 0\.0, )?ao = vLandscapeSurface\.y, reach = 0\.0;/g).length, 2, 'both fallback sites take the palette surface');
    assert.ok(!/response = vec3\(0\.0\), groundAlbedo/.test(fragment) && !/float roughness = 0\.9/.test(fragment), 'no plain fallback constant remains in the fragment shader');
});
