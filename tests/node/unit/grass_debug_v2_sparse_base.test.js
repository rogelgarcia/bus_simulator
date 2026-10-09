// Sparse bases should fill distinct regions rather than spend their budget on overlapping shoots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectGrassSparseBaseShoots } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2SparseBaseLayout.js';

function tile(roots) {
    const vertices = [], ranges = [];
    for (const [x, z] of roots) for (const direction of [-1, 1]) {
        const start = vertices.length / 3;
        vertices.push(x - .04, 0, z, x + .04, 0, z, x, .1, z + direction * .12);
        ranges.push({ start, count: 3 });
    }
    return { geometry: { index: { getX: i => i }, attributes: { position: {
        getX: i => vertices[i * 3], getZ: i => vertices[i * 3 + 2]
    } } }, userData: { grassLeafRanges: ranges } };
}

test('joint coverage picks separated shoots and preserves a single paired selection', () => {
    const a = tile([[0, 0], [0, 0], [.5, .5], [-.5, -.5]]);
    const b = tile([[0, 0], [0, 0], [-.5, -.5], [.5, .5]]);
    const result = selectGrassSparseBaseShoots([a, b], .75, 2);
    assert.equal(result.size, 3);
    assert.ok(result.has(2) && result.has(3));
    assert.equal(Number(result.has(0)) + Number(result.has(1)), 1);
    assert.deepEqual(result, selectGrassSparseBaseShoots([a, b], .75, 2));
});

test('coverage sees a shoot across the periodic seam as overlapping, not as a new empty region', () => {
    const source = tile([[1, 0], [-1, 0], [0, .5], [0, -.5]]);
    const result = selectGrassSparseBaseShoots([source, source], .75, 2);
    assert.equal(Number(result.has(0)) + Number(result.has(1)), 1);
    assert.ok(result.has(2) && result.has(3));
});

test('selection rejects incompatible tiles and invalid budgets', () => {
    const a = tile([[0, 0], [.5, .5]]), b = tile([[0, 0]]);
    assert.throws(() => selectGrassSparseBaseShoots([a, b], .5, 2), /matching/);
    assert.throws(() => selectGrassSparseBaseShoots([a, a], 1, 2), /partial density/);
});
