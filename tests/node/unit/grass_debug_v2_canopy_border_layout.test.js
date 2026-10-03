// Fixed alpha borders never clip or duplicate the source leaves retained by the field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrassDebugV2CanopyBorderLayout } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyBorderLayout.js';

const leaf = (id, x, z, radius = .01) => ({ id, rootX: x, rootZ: z, minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius });

test('canopy perimeter covers every leaf exactly once with 2m, 1m and LOD2 remainders', () => {
    const leaves = [];
    for (let i = 0; i < 240; i++) {
        const u = -5.99 + i * .05;
        leaves.push(leaf(leaves.length, u, 5.96), leaf(leaves.length + 1, u, -5.96));
        leaves.push(leaf(leaves.length, 5.96, u), leaf(leaves.length + 1, -5.96, u));
    }
    const plan = createGrassDebugV2CanopyBorderLayout({ width: 12, depth: 12, leaves });
    assert.equal(plan.largeCards, 20);
    assert.equal(plan.smallCards, 4);
    assert(plan.fallback.length > 0);
    const assigned = [...plan.fallback];
    for (const card of plan.cards) {
        assert([1, 2].includes(card.width));
        assert.equal(Math.hypot(card.rx, card.rz), 1);
        assert(Math.abs(card.rx * card.nx + card.rz * card.nz) < 1e-12);
        for (const id of card.leafIds) {
            assigned.push(id);
            const source = leaves[id];
            for (const x of [source.minX, source.maxX]) for (const z of [source.minZ, source.maxZ]) {
                const u = x * card.rx + z * card.rz;
                assert(u >= card.left + .002 - 1e-9);
                assert(u <= card.left + card.width - .002 + 1e-9);
            }
        }
    }
    assert.equal(new Set(assigned).size, leaves.length);
    assert.equal(assigned.length, leaves.length);
    assert.equal(plan.cardLeaves + plan.fallback.length, leaves.length);
});

test('corners, undersized remainder and leaves crossing a card boundary stay geometric', () => {
    const leaves = [leaf(0, 5.96, 5.96), leaf(1, -3.9, 5.96, .04), leaf(2, 5.8, 5.96),
        leaf(3, -5.4, 5.96), leaf(4, -5.2, 5.96)];
    const plan = createGrassDebugV2CanopyBorderLayout({ width: 12, depth: 12, leaves });
    assert.deepEqual(plan.fallback, [0, 1, 2]);
    assert.deepEqual(plan.cards[0].leafIds, [3, 4]);
});

test('sparse edge cards retain original leaves and duplicate ids fail at the boundary', () => {
    assert.deepEqual(createGrassDebugV2CanopyBorderLayout({ width: 4, depth: 4, leaves: [leaf(3, 0, 1.96)] }).fallback, [3]);
    assert.throws(() => createGrassDebugV2CanopyBorderLayout({ width: 4, depth: 4, leaves: [leaf(0, 0, 1.96), leaf(0, 1, 1.96)] }), /unique leaf ids/);
});
