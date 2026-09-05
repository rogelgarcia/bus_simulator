import test from 'node:test';
import assert from 'node:assert/strict';
import { omitPartialReceiverSurfaces } from '../../../src/graphics/illumination/receiver_lightmaps/EnhancedReceiverCoverage.js';

function fixture({ disconnected = false, crease = false, separateMaterial = false } = {}) {
    const values = [0, 0, 0, 1, 0, 0, 0, 1, 0, ...(!disconnected ? [1, 0, 0, 1, 1, crease ? 1 : 0, 0, 1, 0] : [3, 0, 0, 4, 1, 0, 3, 1, 0])];
    const coordinates = Float32Array.from({ length: 24 }, (_, i) => i < 12 ? [0.3, 0.5, 2, 1][i % 4] : 0);
    const geometry = { attributes: { position: { getX: (i) => values[i * 3], getY: (i) => values[i * 3 + 1], getZ: (i) => values[i * 3 + 2] } },
        groups: separateMaterial ? [{ start: 0, count: 3, materialIndex: 0 }, { start: 3, count: 3, materialIndex: 1 }] : [] };
    return { geometry, coordinates };
}

test('Enhanced coverage removes a partial coplanar face even with duplicated seam vertices', () => {
    const { geometry, coordinates } = fixture();
    assert.equal(omitPartialReceiverSurfaces(geometry, coordinates), 1);
    assert.ok(coordinates.every((value) => value === 0));
});

test('Enhanced coverage uses triangle references for indexed geometry', () => {
    const { geometry, coordinates } = fixture();
    geometry.index = { getX: (i) => [0, 1, 2, 1, 4, 2][i] };
    assert.equal(omitPartialReceiverSurfaces(geometry, coordinates), 1);
    assert.ok(coordinates.every((value) => value === 0));
});

test('Enhanced coverage preserves complete faces, disconnected charts, creases and material boundaries', () => {
    for (const options of [{ disconnected: true }, { crease: true }, { separateMaterial: true }]) {
        const { geometry, coordinates } = fixture(options), before = coordinates.slice();
        assert.equal(omitPartialReceiverSurfaces(geometry, coordinates), 0);
        assert.deepEqual(coordinates, before);
    }
    const { geometry, coordinates } = fixture();
    coordinates.set(coordinates.slice(0, 12), 12);
    const before = coordinates.slice();
    assert.equal(omitPartialReceiverSurfaces(geometry, coordinates), 0);
    assert.deepEqual(coordinates, before);
});

test('Inactive triangles outside the draw range do not remove a valid surface', () => {
    const { geometry, coordinates } = fixture(), before = coordinates.slice();
    geometry.drawRange = { start: 0, count: 3 };
    assert.equal(omitPartialReceiverSurfaces(geometry, coordinates), 0);
    assert.deepEqual(coordinates, before);
});
