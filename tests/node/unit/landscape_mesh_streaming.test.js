// Verifies transferable terrain geometry, parent transitions, seams, and exact buffer accounting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLandscapeMeshBuffers, estimateLandscapeMeshBuffers, landscapeMeshTransferList, sampleLandscapeMeshHeight } from '../../../src/graphics/engine3d/landscape/LandscapeMeshBuffers.js';
import { sampleLandscapeChunk } from '../../../src/app/landscape/index.js';
import { createLandscapeModelFixture } from './landscape_model_fixture.js';
import { computeLandscapeTileEdges, withLandscapeMorphedPositions } from '../../../src/graphics/engine3d/landscape/LandscapeTileEdges.js';

const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} differs from ${b}`);

test('Landscape mesh: native positions preserve heights, north row orientation and the canonical upward triangulation', () => {
    const { manifest, decoded } = createLandscapeModelFixture();
    const chunk = decoded.get('l1/c0/r0'), root = decoded.get(manifest.overviewId);
    const result = buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest });
    for (let i = 0; i < chunk.heights.length; i++) assert.equal(result.positions[i * 3 + 1], chunk.heights[i]);
    assert.deepEqual([...result.positions.slice(0, 3)], [chunk.descriptor.bounds.minX, chunk.heights[0], chunk.descriptor.bounds.maxZ]);
    assert.deepEqual([...result.indices.slice(0, 6)], [0, 6, 5, 0, 1, 6]);
    assert.equal(result.surfaceTriangles, 32);
    assert.ok(result.indices.length / 3 > result.surfaceTriangles);
});

test('Landscape mesh: every child vertex starts exactly on the parent NW-SE surface during an atomic refinement', () => {
    const { manifest, decoded } = createLandscapeModelFixture({ heightAt: (column, row) => column * column * .4 + row * row * .17 });
    const root = decoded.get(manifest.overviewId);
    for (const chunk of [...decoded.values()].slice(1)) {
        const result = buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest });
        for (let i = 0; i < chunk.heights.length; i++) {
            const x = result.positions[i * 3], z = result.positions[i * 3 + 2];
            near(result.parentHeights[i], sampleLandscapeChunk(manifest, root, x, z).height, 3e-6);
            near(sampleLandscapeMeshHeight(chunk, x, z), chunk.heights[i]);
        }
    }
});

test('Landscape mesh: adjacent fine tile boundaries have identical native heights, parent heights and packed normals', () => {
    const { manifest, decoded } = createLandscapeModelFixture({ heightAt: (column, row) => Math.sin(column) + Math.cos(row * 2) });
    const root = decoded.get(manifest.overviewId);
    const left = buildLandscapeMeshBuffers({ chunk: decoded.get('l1/c0/r0'), parent: root, root, manifest });
    const right = buildLandscapeMeshBuffers({ chunk: decoded.get('l1/c1/r0'), parent: root, root, manifest });
    for (let row = 0; row < 5; row++) {
        const a = row * 5 + 4, b = row * 5;
        assert.deepEqual([...left.positions.slice(a * 3, a * 3 + 3)], [...right.positions.slice(b * 3, b * 3 + 3)]);
        assert.equal(left.parentHeights[a], right.parentHeights[b]);
        assert.deepEqual([...left.normals.slice(a * 3, a * 3 + 3)], [...right.normals.slice(b * 3, b * 3 + 3)]);
        assert.deepEqual([...left.parentNormals.slice(a * 3, a * 3 + 3)], [...right.parentNormals.slice(b * 3, b * 3 + 3)]);
    }
});

test('Landscape mesh: conservative transition skirts stay below both child and parent edge endpoints', () => {
    const { manifest, decoded } = createLandscapeModelFixture();
    const root = decoded.get(manifest.overviewId), chunk = decoded.get('l1/c1/r0');
    const result = buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest });
    const depth = Math.max(1, root.descriptor.geometricError * 2 + .25);
    for (let i = 0; i < result.boundaryParents.length; i++) {
        const skirt = chunk.heights.length + i;
        near(result.positions[skirt * 3 + 1], result.boundaryPositions[i * 3 + 1] - depth, 3e-6);
        near(result.parentHeights[skirt], result.boundaryParents[i] - depth, 3e-6);
    }
});

test('Landscape mesh: admission estimates match actual typed arrays and owned inspection costs', () => {
    const { manifest, decoded } = createLandscapeModelFixture();
    const chunk = decoded.get(manifest.overviewId);
    const result = buildLandscapeMeshBuffers({ chunk, manifest });
    const estimate = estimateLandscapeMeshBuffers(chunk.descriptor);
    const gpu = ['positions', 'colors', 'normals', 'parentNormals', 'parentHeights', 'indices'].reduce((sum, key) => sum + result[key].byteLength, 0);
    assert.equal(estimate.geometryBytes, gpu);
    assert.equal(estimate.wireBytes, result.positions.byteLength + result.parentHeights.byteLength + result.wireIndices.byteLength);
    assert.equal(estimate.boundaryBytes, result.boundaryPositions.byteLength + result.boundaryParents.byteLength);
    const transfers = landscapeMeshTransferList(result);
    assert.equal(transfers.length, 9);
    assert.equal(new Set(transfers).size, transfers.length);
    const native = estimateLandscapeMeshBuffers({ columns: 257, rows: 257 });
    assert.ok(native.geometryBytes < 4 * 1024 * 1024);
    assert.ok(native.geometryBytes + native.wireBytes + native.boundaryBytes < 8 * 1024 * 1024);
});

test('Landscape mesh: source height and semantic arrays remain unchanged by geometry building', () => {
    const { manifest, decoded } = createLandscapeModelFixture();
    const chunk = decoded.get(manifest.overviewId);
    const heights = chunk.heights.slice(), cover = chunk.landCover.slice();
    buildLandscapeMeshBuffers({ chunk, manifest });
    assert.deepEqual(chunk.heights, heights);
    assert.deepEqual(chunk.landCover, cover);
    assert.throws(() => buildLandscapeMeshBuffers({ chunk: { ...chunk, heights: new Float32Array(1) }, manifest }), /complete bounded decoded channels/);
});

test('Landscape mesh: adjacent refining or coarsening groups share the same continuous boundary height at every progress', () => {
    const { manifest, decoded } = createLandscapeModelFixture({ heightAt: (column, row) => Math.sin(column * .8) + Math.cos(row * 1.2) });
    const root = decoded.get(manifest.overviewId), first = decoded.get('l1/c0/r0'), second = decoded.get('l1/c1/r0');
    const left = buildLandscapeMeshBuffers({ chunk: first, parent: root, root, manifest });
    const right = buildLandscapeMeshBuffers({ chunk: second, parent: root, root, manifest });
    assert.notEqual(left.parentHeights[9], left.positions[9 * 3 + 1]);
    for (const progress of [0, .1, .25, .5, .75, .9, 1, .75, .25, 0]) {
        const edges = computeLandscapeTileEdges([
            { id: first.descriptor.id, level: 1, bounds: first.descriptor.bounds, morph: progress },
            { id: second.descriptor.id, level: 1, bounds: second.descriptor.bounds, morph: 1 }
        ]);
        const aMorph = Math.min(progress, edges[0].morph[1]), bMorph = Math.min(1, edges[1].morph[0]);
        for (let row = 0; row < 5; row++) {
            const a = row * 5 + 4, b = row * 5;
            const firstHeight = left.parentHeights[a] + (left.positions[a * 3 + 1] - left.parentHeights[a]) * aMorph;
            const secondHeight = right.parentHeights[b] + (right.positions[b * 3 + 1] - right.parentHeights[b]) * bMorph;
            near(firstHeight, secondHeight);
        }
    }
});

test('Landscape mesh: mixed edge flags preserve the coarse surface and reject unbalanced live partitions', () => {
    const tiles = [
        { id: 'fine', level: 2, bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, morph: 1 },
        { id: 'coarse', level: 1, bounds: { minX: 1, maxX: 3, minZ: 0, maxZ: 2 }, morph: 1 }
    ];
    assert.deepEqual(computeLandscapeTileEdges(tiles)[0].coarser, [0, 1, 0, 0]);
    assert.throws(() => computeLandscapeTileEdges([{ ...tiles[0], level: 3 }, tiles[1]]), /Unbalanced rendered terrain edge/);
});

test('Landscape mesh: picking reads the displayed morph and stitch surface then restores every source buffer even on failure', () => {
    const { manifest, decoded } = createLandscapeModelFixture({ heightAt: (column, row) => Math.sin(column * .8) + Math.cos(row * 1.2) });
    const root = decoded.get(manifest.overviewId), chunk = decoded.get('l1/c0/r0');
    const buffers = buildLandscapeMeshBuffers({ chunk, parent: root, root, manifest });
    const positions = buffers.positions.slice(), heights = chunk.heights.slice();
    const state = { morph: .5, coarser: [0, 1, 0, 0], edgeMorph: [1, 1, 1, 1] };
    assert.throws(() => withLandscapeMorphedPositions(buffers, chunk.heights, state, () => {
        assert.equal(buffers.positions[9 * 3 + 1], buffers.parentHeights[9]);
        near(buffers.positions[6 * 3 + 1], (heights[6] + buffers.parentHeights[6]) * .5);
        throw new Error('ray test interruption');
    }), /ray test interruption/);
    assert.deepEqual(buffers.positions, positions);
    assert.deepEqual(chunk.heights, heights);
});
