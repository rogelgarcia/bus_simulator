// tests/node/unit/facade_attachments_model.test.js
// AI 490: facade attachments model — normalization round-trip and the
// deterministic AC scatter.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    FACADE_ATTACHMENT_TYPE,
    hashAttachmentKeyToUnit,
    normalizeFacadeAttachmentsConfig,
    shouldPlaceAcUnit
} from '../../../src/app/buildings/FacadeAttachmentsModel.js';

test('normalizeFacadeAttachmentsConfig drops empty/unknown and keeps both types', () => {
    assert.equal(normalizeFacadeAttachmentsConfig(null), null);
    assert.equal(normalizeFacadeAttachmentsConfig({}), null);
    assert.equal(normalizeFacadeAttachmentsConfig({ items: [{ type: 'satellite_dish' }] }), null);

    const cfg = normalizeFacadeAttachmentsConfig({
        items: [
            { type: 'ac_unit' },
            { type: 'fire_escape', target: { faceId: 'b', bayId: 'bay_2' } },
            { type: 'ac_unit', enabled: false }
        ]
    });
    assert.equal(cfg.items.length, 2);
    assert.equal(cfg.items[0].type, FACADE_ATTACHMENT_TYPE.AC_UNIT);
    assert.equal(cfg.items[1].type, FACADE_ATTACHMENT_TYPE.FIRE_ESCAPE);
    assert.equal(cfg.items[1].target.faceId, 'B');
});

test('ac_unit items clamp and default', () => {
    const cfg = normalizeFacadeAttachmentsConfig({
        items: [{
            type: 'ac_unit',
            probability: 9,
            seedOffset: 3.7,
            unit: { widthMeters: 99, heightMeters: 0, depthMeters: -1, tiltDegrees: 99 },
            eligibility: { layerIds: ['floor_2', 7, ''], assetTypes: ['WINDOW', 'door', 'spaceship'], minFloor: -2 }
        }]
    });
    const item = cfg.items[0];
    assert.equal(item.probability, 1.0);
    assert.equal(item.seedOffset, 4);
    assert.equal(item.unit.widthMeters, 1.4);
    assert.equal(item.unit.heightMeters, 0.2);
    assert.equal(item.unit.depthMeters, 0.2);
    assert.equal(item.unit.tiltDegrees, 12.0);
    assert.deepEqual(item.eligibility.layerIds, ['floor_2']);
    assert.deepEqual(item.eligibility.assetTypes, ['window', 'door']);
    assert.equal(item.eligibility.minFloor, 1);
});

test('fire_escape items clamp and default', () => {
    const cfg = normalizeFacadeAttachmentsConfig({
        items: [{
            type: 'fire_escape',
            target: { layerId: 'floor_9', faceId: 'Z', bayId: 'bay_3' },
            floors: { start: 0, end: 99 },
            platform: { widthMeters: 99, depthMeters: 0 },
            stairWidthMeters: 99,
            dropLadder: { enabled: false, bottomClearanceMeters: 99 }
        }]
    });
    const item = cfg.items[0];
    assert.equal(item.target.layerId, 'floor_9');
    assert.equal(item.target.faceId, 'A', 'unknown face falls back to A');
    assert.equal(item.target.bayId, 'bay_3');
    assert.equal(item.floors.start, 1);
    assert.equal(item.floors.end, 99);
    assert.equal(item.platform.widthMeters, 4.5);
    assert.equal(item.platform.depthMeters, 0.5);
    assert.equal(item.stairWidthMeters, 1.2);
    assert.equal(item.dropLadder.enabled, false);
    assert.equal(item.dropLadder.bottomClearanceMeters, 5.0);

    // end 0 (or missing) means "all floors".
    const open = normalizeFacadeAttachmentsConfig({ items: [{ type: 'fire_escape' }] }).items[0];
    assert.equal(open.floors.end, 0);
});

test('re-normalization is stable', () => {
    const once = normalizeFacadeAttachmentsConfig({
        items: [
            { type: 'ac_unit', probability: 0.25 },
            { type: 'fire_escape', target: { layerId: 'floor_1', faceId: 'C', bayId: 'bay_4' }, floors: { start: 2, end: 5 } }
        ]
    });
    const twice = normalizeFacadeAttachmentsConfig(once);
    assert.deepEqual(twice, once);
});

test('AC scatter is deterministic and seed-sensitive', () => {
    const keys = [];
    for (let floor = 1; floor <= 8; floor++) {
        for (let i = 0; i < 12; i++) keys.push(`floor_2:${floor}:bay_${i}:0`);
    }
    const pick = (seed, seedOffset) => keys.filter((key) => shouldPlaceAcUnit({
        seed,
        instanceKey: key,
        probability: 0.35,
        seedOffset
    }));

    const a1 = pick(1234, 0);
    const a2 = pick(1234, 0);
    assert.deepEqual(a1, a2, 'same seed must produce the identical placement set');
    assert.ok(a1.length > 0 && a1.length < keys.length, 'scatter should pick a strict subset');

    const b = pick(99887, 0);
    assert.notDeepEqual(a1, b, 'a different building seed changes the set');
    const c = pick(1234, 7);
    assert.notDeepEqual(a1, c, 'a different seedOffset changes the set');

    // The scatter rate should be in the neighborhood of the probability.
    const rate = a1.length / keys.length;
    assert.ok(rate > 0.15 && rate < 0.55, `scatter rate ${rate.toFixed(2)} should track probability 0.35`);

    // Probability edges.
    assert.equal(pick(1234, 0).length, a1.length);
    assert.equal(keys.filter((key) => shouldPlaceAcUnit({ seed: 1, instanceKey: key, probability: 0 })).length, 0);
    assert.equal(keys.filter((key) => shouldPlaceAcUnit({ seed: 1, instanceKey: key, probability: 1 })).length, keys.length);
});

test('hashAttachmentKeyToUnit spreads across [0,1)', () => {
    let min = 1;
    let max = 0;
    let sum = 0;
    const n = 500;
    for (let i = 0; i < n; i++) {
        const v = hashAttachmentKeyToUnit(42, `k${i}`);
        assert.ok(v >= 0 && v < 1);
        min = Math.min(min, v);
        max = Math.max(max, v);
        sum += v;
    }
    assert.ok(min < 0.1 && max > 0.9, 'hash should reach both ends of the range');
    const mean = sum / n;
    assert.ok(mean > 0.4 && mean < 0.6, `hash mean ${mean.toFixed(3)} should be near 0.5`);
});
