// Node unit tests: AI 517 Bradbury comparison fixture keeps the production building intact.

import test from 'node:test';
import assert from 'node:assert/strict';
import { getBuildingConfigById } from '../../../src/graphics/content3d/catalogs/BuildingConfigCatalog.js';
import { BRADBURY_BLOCK_BUILDING_CONFIG } from '../../../src/graphics/content3d/buildings/configs/BradburyBlock.js';
import { BRADBURY_BLOCK_SPLIT_TEST_BUILDING_CONFIG } from '../../../src/graphics/content3d/buildings/configs/BradburyBlockSplitTest.js';

test('Bradbury split comparison preserves the production config and authors linked sub-faces', () => {
    const baseline = BRADBURY_BLOCK_BUILDING_CONFIG;
    const split = BRADBURY_BLOCK_SPLIT_TEST_BUILDING_CONFIG;

    assert.equal(baseline.id, 'bradbury_block');
    assert.equal(baseline.name, 'Bradbury Block');
    assert.equal(baseline.footprintLoops[0].length, 5);
    assert.equal(baseline.footprintLoops[0].some((point) => point.split === true), false);
    assert.deepEqual(baseline.layers.find((layer) => layer.id === 'floor_bb2').faceLinking.links, {});

    assert.equal(split.id, 'bradbury_block_split_test');
    assert.equal(split.footprintLoops[0].length, 11);
    assert.equal(split.footprintLoops[0].filter((point) => point.split === true).length, 6);
    assert.deepEqual(split.footprintLoops[0].map((point) => point.runId), ['A', 'F', 'G', 'H', 'I', 'B', 'J', 'C', 'K', 'D', 'E']);
    assert.deepEqual(split.layers.find((layer) => layer.id === 'floor_bb2').faceLinking, {
        links: { G: 'A', J: 'I', K: 'A', C: 'F' },
        reverseByFace: { J: true, K: true }
    });
    assert.equal(split.attachments.items.find((item) => item.id === 'attachment_1').target.faceId, 'F');
    assert.equal(split.attachments.items.find((item) => item.id === 'attachment_3').target.faceId, 'H');
    assert.equal(getBuildingConfigById('bradbury_block'), baseline);
    assert.equal(getBuildingConfigById('bradbury_block_split_test'), split);
});
