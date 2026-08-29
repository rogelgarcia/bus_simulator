import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    STATIC_VISIBILITY_CATEGORIES,
    validateStaticVisibilityPayload
} from '../../../src/app/city/visibility/index.js';

const payloadUrl = new URL('../../../src/app/city/visibility/bakes/bigcity2.v1.json', import.meta.url);

test('production static visibility payload is compact, current-format, road-free, and zero-miss validated', async () => {
    const payload = JSON.parse(await readFile(payloadUrl, 'utf8'));
    assert.equal(payload.units.length, 228);
    assert.equal(payload.mask.wordsPerMask, 8);
    assert.equal(payload.mask.entryCount, 625 * 12);
    assert.equal(Buffer.from(payload.mask.data, 'base64').byteLength, 240_000);
    assert.equal(payload.bake.views, 607_500);
    assert.equal(payload.bake.missesAfterRepair, 0);
    assert.deepEqual([...new Set(payload.units.map((unit) => unit.category))].sort(), [...STATIC_VISIBILITY_CATEGORIES].sort());
    assert.equal(payload.units.some((unit) => /road|asphalt|curb|sidewalk|marking|slab|ground/i.test(unit.category)), false);

    const decoded = validateStaticVisibilityPayload(payload, {
        cityId: payload.cityId,
        cityConfigHash: payload.cityConfigHash,
        mapWidth: payload.map.width,
        mapHeight: payload.map.height,
        tileSize: payload.map.tileSize,
        originX: payload.map.origin.x,
        originZ: payload.map.origin.z,
        units: payload.units
    });
    assert.equal(decoded.ok, true, decoded.reason);
});
