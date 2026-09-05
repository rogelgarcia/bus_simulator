import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiverAtlas, scalarReceiverExclusion, RECEIVER_LIGHTMAP_PROFILE } from '../../../src/app/illumination/receiver_lightmaps/ReceiverAtlas.js';

function fixture() {
    const bytes = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]).buffer);
    const material = { id: 'material', channelSupport: { indirect_irradiance: { supported: true } },
        textureBindings: {}, alpha: { mode: 'opaque' }, metalness: 0 };
    const instances = [0, 1].map((sourceIndex) => ({ id: `instance/${sourceIndex}`, objectId: 'shared', sourceIndex,
        matrixThreeWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sourceIndex * 4, 0, 0, 1] }));
    return { getBuffer: () => bytes, manifest: { materials: [material],
        geometries: [{ id: 'geometry', referenceCount: 3, attributes: { position: { bufferId: 'positions',
            componentType: 'f32', normalized: false, byteOffset: 0, byteStride: 12 } } }], meshInstances: instances,
        receiverMappings: instances.map((instance) => ({ id: `receiver/${instance.id}`, meshInstanceId: instance.id,
            objectId: 'shared', geometryId: 'geometry', materialId: 'material', start: 0, count: 3, chunkId: 'chunk' })) } };
}

test('Receiver atlas gives repeated instances distinct coordinates and a zero sentinel', () => {
    const result = createReceiverAtlas(fixture());
    assert.deepEqual(Array.from(result.coordinates.slice(0, 4)), [0, 0, 0, 0]);
    assert.equal(result.objects.length, 1);
    assert.equal(result.objects[0].instances.length, 2);
    assert.notDeepEqual(Array.from(result.coordinates.slice(4, 16)), Array.from(result.coordinates.slice(16, 28)));
    assert.equal(result.statistics.triangles, 2);
    for (let index = 1; index <= 6; index++) assert.equal(result.coordinates[index * 4 + 3], 1);
});

test('Receiver atlas is stable under discovery-order changes and preserves input UV inventory', () => {
    const input = fixture();
    const before = JSON.stringify(input.manifest);
    const first = createReceiverAtlas(input);
    assert.equal(JSON.stringify(input.manifest), before);
    input.manifest.receiverMappings.reverse();
    assert.deepEqual(createReceiverAtlas(input), first);
});

test('Receiver atlas excludes perturbed shading normals and rejects unsafe mip padding', () => {
    const material = fixture().manifest.materials[0];
    material.textureBindings.normalMap = 'normal';
    assert.equal(scalarReceiverExclusion(material), 'runtime_shading_normal');
    assert.throws(() => createReceiverAtlas(fixture(), { ...RECEIVER_LIGHTMAP_PROFILE, padding: 2 }), /Invalid/);
});

test('Receiver atlas page budget and oversized charts explicitly leave receivers unmapped', () => {
    const input = fixture();
    input.manifest.meshInstances[1].matrixThreeWorld[0] = 1000;
    const result = createReceiverAtlas(input);
    assert.equal(result.statistics.exclusions.chart_exceeds_page, 1);
    assert.equal(result.coordinates[4 * 4 + 3], 0);
});

test('Directional atlas opts normal-mapped receivers in without changing the legacy scalar policy', () => {
    const input = fixture();
    input.manifest.materials[0].textureBindings.normalMap = 'normal';
    const profile = { ...RECEIVER_LIGHTMAP_PROFILE, directional: 'chart-affine-irradiance-v1', patchSizeMeters: 24 };
    const atlas = createReceiverAtlas(input, profile);
    assert.equal(atlas.statistics.normalMappedTriangles, 2);
    assert.equal(scalarReceiverExclusion(input.manifest.materials[0]), 'runtime_shading_normal');
    assert.throws(() => createReceiverAtlas(input), /No eligible scalar receivers/);
    input.manifest.receiverMappings.reverse();
    assert.deepEqual(createReceiverAtlas(input, profile), atlas);
    for (let i = 0; i < atlas.charts.length; i++) for (let j = i + 1; j < atlas.charts.length; j++) {
        const a = atlas.charts[i], b = atlas.charts[j];
        assert.ok(a.page !== b.page || a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    }
});
