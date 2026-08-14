// Node unit tests: tree-trunk placement exclusions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTreePlacementExclusion } from '../../../src/app/city/TreePlacementExclusion.js';

const square = (minX, minZ, maxX, maxZ) => [
    { x: minX, z: minZ },
    { x: maxX, z: minZ },
    { x: maxX, z: maxZ },
    { x: minX, z: maxZ }
];

test('TreePlacementExclusion: rejects asphalt, curb, and sidewalk trunk positions', () => {
    const exclusion = createTreePlacementExclusion({
        roadPolygons: [square(-5, -2, 5, 2)],
        roadMargin: 2.5
    });

    assert.equal(exclusion.allowsTrunk(0, 0), false);
    assert.equal(exclusion.allowsTrunk(0, 4.4), false);
    assert.equal(exclusion.allowsTrunk(0, 4.6), true);
});

test('TreePlacementExclusion: rejects building footprints using the trunk radius', () => {
    const exclusion = createTreePlacementExclusion({
        buildingFootprints: [[square(10, 10, 20, 20)]],
        buildingMargin: 0.5
    });

    assert.equal(exclusion.allowsTrunk(15, 15), false);
    assert.equal(exclusion.allowsTrunk(9.6, 15), false);
    assert.equal(exclusion.allowsTrunk(9.4, 15), true);
});

test('TreePlacementExclusion: preserves building courtyard holes away from walls', () => {
    const exclusion = createTreePlacementExclusion({
        buildingFootprints: [[square(0, 0, 20, 20), square(5, 5, 15, 15)]],
        buildingMargin: 0.5
    });

    assert.equal(exclusion.allowsTrunk(2, 2), false);
    assert.equal(exclusion.allowsTrunk(10, 10), true);
    assert.equal(exclusion.allowsTrunk(5.2, 10), false);
});

test('TreePlacementExclusion: keeps trunks and canopies clear of traffic controls', () => {
    const exclusion = createTreePlacementExclusion({
        trafficControls: [{ position: { x: 4, z: 8 } }],
        trafficControlClearance: 5
    });

    assert.equal(exclusion.allowsTrunk(7, 8), false);
    assert.equal(exclusion.allowsTrunk(9.1, 8), true);
});
