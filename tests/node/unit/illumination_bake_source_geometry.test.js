// Verifies deterministic resolved-city geometry extraction without a Node-side Three.js dependency.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    BakeSourceValidationError,
    extractBakeSourceGeometry,
    getBakeSourceMaterialReferences,
    getBakeSourceObjectReferences
} from '../../../src/graphics/illumination/bake_source/index.js';

const IDENTITY = Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
]);

function hashBytes(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function attribute(array, itemSize, { normalized = false, name = '' } = {}) {
    return { array, itemSize, count: array.length / itemSize, normalized, name };
}

function interleavedAttribute(data, offset, itemSize, { normalized = false, name = '' } = {}) {
    return {
        isInterleavedBufferAttribute: true,
        data,
        offset,
        itemSize,
        count: data.count,
        normalized,
        name
    };
}

function geometry({ positions, index = null, attributes = {}, groups = [], drawRange = null } = {}) {
    return {
        attributes: {
            position: positions,
            ...attributes
        },
        index,
        groups,
        drawRange: drawRange ?? { start: 0, count: Number.POSITIVE_INFINITY },
        morphAttributes: {},
        boundingBox: null,
        boundingSphere: null
    };
}

function mesh(name, sourceGeometry, matrix = IDENTITY, material = {}) {
    return {
        isMesh: true,
        isInstancedMesh: false,
        type: 'Mesh',
        name,
        geometry: sourceGeometry,
        material,
        matrixWorld: { elements: matrix.slice() },
        userData: {},
        children: []
    };
}

function instancedMesh(name, sourceGeometry, matrices, count, colors = null, matrix = IDENTITY) {
    const source = mesh(name, sourceGeometry, matrix);
    source.isInstancedMesh = true;
    source.type = 'InstancedMesh';
    source.instanceMatrix = attribute(matrices, 16);
    source.instanceColor = colors ? attribute(colors, 3, { normalized: true }) : null;
    source.count = count;
    return source;
}

function rootEntry(children, traversal = children) {
    const root = {
        type: 'Group',
        name: 'ResolvedRoot',
        children,
        traverse(visitor) {
            visitor(this);
            for (const child of traversal) visitor(child);
        }
    };
    for (const child of children) child.parent = root;
    return { id: 'building:test', category: 'buildings', root };
}

function trianglePositions() {
    return attribute(new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0
    ]), 3, { name: 'position-source' });
}

function translationMatrix(x, y, z) {
    return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        x, y, z, 1
    ];
}

async function extract(entries) {
    return extractBakeSourceGeometry(entries, { hashBytes });
}

test('BakeSourceGeometry preserves indexed and non-indexed topology and little-endian index width', async () => {
    const indexed = geometry({
        positions: attribute(new Float32Array([
            0, 0, 0,
            1, 0, 0,
            1, 1, 0,
            0, 1, 0
        ]), 3),
        index: attribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1),
        attributes: {
            bakeMask: attribute(new Uint8Array([0, 64, 128, 255]), 1, {
                normalized: true,
                name: 'coverage'
            })
        }
    });
    const nonIndexed = geometry({
        positions: attribute(new Float32Array([
            0, 0, 0,
            1, 0, 0,
            1, 1, 0,
            0, 0, 0,
            1, 1, 0,
            0, 1, 0
        ]), 3)
    });
    const result = await extract([rootEntry([
        mesh('Indexed', indexed),
        mesh('NonIndexed', nonIndexed)
    ])]);

    assert.equal(result.geometries.length, 2);
    const indexedRecord = result.geometries.find((entry) => entry.index !== null);
    const nonIndexedRecord = result.geometries.find((entry) => entry.index === null);
    assert.ok(indexedRecord);
    assert.ok(nonIndexedRecord);
    assert.equal(indexedRecord.index.arrayType, 'Uint16Array');
    assert.equal(indexedRecord.index.componentType, 'u16');
    assert.equal(indexedRecord.index.itemSize, 1);
    assert.equal(indexedRecord.index.count, 6);
    assert.equal(indexedRecord.triangleCount, 2);
    assert.equal(indexedRecord.attributes.bakeMask.normalized, true);
    assert.equal(indexedRecord.attributes.bakeMask.name, 'coverage');
    assert.equal(nonIndexedRecord.referenceCount, 6);
    assert.equal(nonIndexedRecord.triangleCount, 2);

    const indexBuffer = result.buffers.find((entry) => entry.id === indexedRecord.index.bufferId);
    assert.ok(indexBuffer);
    assert.deepEqual([...indexBuffer.data], [0, 0, 1, 0, 2, 0, 0, 0, 2, 0, 3, 0]);
});

test('BakeSourceGeometry preserves one interleaved backing buffer and accessor layout', async () => {
    const data = {
        array: new Float32Array([
            0, 0, 0, 0.25, 0.5,
            1, 0, 0, 0.75, 1,
            0, 1, 0, 0.5, 0
        ]),
        stride: 5,
        count: 3
    };
    const sourceGeometry = geometry({
        positions: interleavedAttribute(data, 0, 3, { name: 'interleaved-position' }),
        attributes: {
            customBakeUv: interleavedAttribute(data, 3, 2, { name: 'custom-bake-uv' })
        }
    });
    const result = await extract([rootEntry([mesh('Interleaved', sourceGeometry)])]);
    const record = result.geometries[0];
    const position = record.attributes.position;
    const custom = record.attributes.customBakeUv;

    assert.equal(position.bufferId, custom.bufferId);
    assert.equal(position.byteOffset, 0);
    assert.equal(custom.byteOffset, 12);
    assert.equal(position.byteStride, 20);
    assert.equal(custom.byteStride, 20);
    assert.equal(position.interleaved, true);
    assert.equal(custom.arrayType, 'Float32Array');
    const buffer = result.buffers.find((entry) => entry.id === position.bufferId);
    assert.ok(buffer);
    assert.equal(buffer.byteLength, data.array.length * 4);
    const view = new DataView(buffer.data.buffer, buffer.data.byteOffset, buffer.data.byteLength);
    assert.equal(view.getFloat32(12, true), 0.25);
    assert.equal(view.getFloat32(32, true), 0.75);
    assert.equal(view.getFloat32(52, true), 0.5);
});

test('BakeSourceGeometry deduplicates shared geometry and is independent of traversal discovery order', async () => {
    const firstGeometry = geometry({ positions: trianglePositions() });
    const equivalentGeometry = geometry({ positions: trianglePositions() });
    const firstMesh = mesh('Shared', firstGeometry, translationMatrix(0, 0, 0));
    const secondMesh = mesh('Shared', equivalentGeometry, translationMatrix(3, 0, 0));
    const forward = await extract([rootEntry([firstMesh, secondMesh], [firstMesh, secondMesh])]);
    const reversed = await extract([rootEntry([firstMesh, secondMesh], [secondMesh, firstMesh])]);

    assert.equal(forward.geometries.length, 1);
    assert.equal(forward.buffers.length, 1);
    assert.equal(forward.geometries[0].objectIds.length, 2);
    assert.deepEqual(forward.objects.map((entry) => entry.id), [
        'object/building%3Atest/00000000-Shared',
        'object/building%3Atest/00000001-Shared'
    ]);
    assert.deepEqual(
        forward.objects.map((entry) => [entry.id, entry.contentHash]),
        reversed.objects.map((entry) => [entry.id, entry.contentHash])
    );
    assert.deepEqual(forward.geometries, reversed.geometries);
    assert.deepEqual(
        forward.buffers.map((entry) => [entry.id, [...entry.data]]),
        reversed.buffers.map((entry) => [entry.id, [...entry.data]])
    );
    assert.deepEqual(forward.inventory, reversed.inventory);
    assert.equal(getBakeSourceMaterialReferences(forward).size, 2);
    assert.equal(getBakeSourceObjectReferences(forward).get(forward.objects[0].id), firstMesh);
});

test('BakeSourceGeometry trims dormant InstancedMesh capacity and keeps producer-owned IDs stable', async () => {
    const sourceGeometry = geometry({ positions: trianglePositions() });
    const activeMatrices = [
        ...translationMatrix(2, 0, 4),
        ...translationMatrix(-3, 1, 5)
    ];
    const firstMatrices = new Float32Array([
        ...activeMatrices,
        ...translationMatrix(500, 500, 500)
    ]);
    const secondMatrices = new Float32Array([
        ...activeMatrices,
        ...translationMatrix(-900, -900, -900)
    ]);
    const changedActiveMatrices = new Float32Array([
        ...translationMatrix(9, 0, 4),
        ...translationMatrix(-3, 1, 5),
        ...translationMatrix(-900, -900, -900)
    ]);
    const firstColors = new Uint8Array([255, 0, 0, 0, 255, 0, 1, 2, 3]);
    const secondColors = new Uint8Array([255, 0, 0, 0, 255, 0, 250, 251, 252]);
    const objectMatrix = translationMatrix(10, 2, -1);
    const first = await extract([rootEntry([
        instancedMesh('Tiles', sourceGeometry, firstMatrices, 2, firstColors, objectMatrix)
    ])]);
    const second = await extract([rootEntry([
        instancedMesh('Tiles', sourceGeometry, secondMatrices, 2, secondColors, objectMatrix)
    ])]);
    const activeMutation = await extract([rootEntry([
        instancedMesh('Tiles', sourceGeometry, changedActiveMatrices, 2, firstColors, objectMatrix)
    ])]);
    const firstObject = first.objects[0];
    const secondObject = second.objects[0];

    assert.deepEqual(firstObject.instances.map((entry) => entry.id), [
        `${firstObject.id}/instance/00000000`,
        `${firstObject.id}/instance/00000001`
    ]);
    assert.deepEqual(firstObject.instances.map((entry) => entry.sourceIndex), [0, 1]);
    assert.deepEqual(firstObject.instances[0].matrixThreeWorld, translationMatrix(12, 2, 3));
    assert.deepEqual(firstObject.instances[1].matrixThreeWorld, translationMatrix(7, 3, 4));
    assert.equal(firstObject.instanceMatrix.count, 2);
    assert.equal(firstObject.instanceColor.count, 2);

    const matrixBuffer = first.buffers.find((entry) => entry.id === firstObject.instanceMatrix.bufferId);
    const colorBuffer = first.buffers.find((entry) => entry.id === firstObject.instanceColor.bufferId);
    assert.equal(matrixBuffer?.byteLength, 2 * 16 * 4);
    assert.equal(colorBuffer?.byteLength, 2 * 3);
    assert.equal(firstObject.id, secondObject.id);
    assert.equal(firstObject.contentHash, secondObject.contentHash);
    assert.deepEqual(
        firstObject.instances.map((entry) => [entry.id, entry.contentHash]),
        secondObject.instances.map((entry) => [entry.id, entry.contentHash])
    );
    assert.equal(activeMutation.objects[0].id, firstObject.id);
    assert.notEqual(activeMutation.objects[0].contentHash, firstObject.contentHash);
    assert.deepEqual(
        activeMutation.objects[0].instances.map((entry) => entry.id),
        firstObject.instances.map((entry) => entry.id)
    );
    assert.notEqual(activeMutation.objects[0].instances[0].contentHash, firstObject.instances[0].contentHash);
    assert.equal(activeMutation.objects[0].instances[1].contentHash, firstObject.instances[1].contentHash);
});

test('BakeSourceGeometry composes world transforms, converts Blender basis, and rejects reflection', async () => {
    const sourceGeometry = geometry({ positions: trianglePositions() });
    const matrix = [
        2, 0, 0, 0,
        0, 3, 0, 0,
        0, 0, 4, 0,
        7, 11, 13, 1
    ];
    const result = await extract([rootEntry([mesh('Transform', sourceGeometry, matrix)])]);
    const placement = result.objects[0].instances[0];

    assert.deepEqual(placement.matrixThreeWorld, matrix);
    assert.deepEqual(placement.matrixBlenderWorld, [
        2, 0, 0, 0,
        0, 4, 0, 0,
        0, 0, 3, 0,
        7, -13, 11, 1
    ]);
    assert.equal(placement.determinant, 24);
    assert.deepEqual(placement.boundsThreeWorld, {
        min: [7, 11, 13],
        max: [9, 14, 13]
    });
    assert.deepEqual(placement.boundsBlenderWorld, {
        min: [7, -13, 11],
        max: [9, -13, 14]
    });

    const reflected = matrix.slice();
    reflected[0] = -2;
    await assert.rejects(
        () => extract([rootEntry([mesh('Reflected', sourceGeometry, reflected)])]),
        (error) => error instanceof BakeSourceValidationError
            && error.code === 'negative_determinant_transform'
    );
});

test('BakeSourceGeometry preserves dormant groups without requiring dormant material slots', async () => {
    const sourceGeometry = geometry({
        positions: attribute(new Float32Array([
            0, 0, 0,
            1, 0, 0,
            0, 1, 0,
            2, 0, 0,
            3, 0, 0,
            2, 1, 0
        ]), 3),
        groups: [
            { start: 0, count: 3, materialIndex: 0 },
            { start: 3, count: 3, materialIndex: 7 }
        ],
        drawRange: { start: 0, count: 3 }
    });
    const result = await extract([rootEntry([mesh('DormantGroups', sourceGeometry, IDENTITY, {})])]);

    assert.equal(result.objects[0].materialSlotCount, 1);
    assert.equal(result.geometries[0].triangleCount, 1);
    assert.deepEqual(result.geometries[0].groups, [
        { start: 0, count: 3, materialIndex: 0 },
        { start: 3, count: 3, materialIndex: 7 }
    ]);
    assert.deepEqual(result.geometries[0].drawRange, {
        start: 0,
        count: 3,
        countWasInfinite: false
    });
});

test('BakeSourceGeometry rejects overlapping active material groups and accepts adjacent groups', async () => {
    const positions = () => attribute(new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        2, 0, 0,
        3, 0, 0,
        2, 1, 0
    ]), 3);
    const overlapping = geometry({
        positions: positions(),
        groups: [
            { start: 0, count: 6, materialIndex: 0 },
            { start: 3, count: 3, materialIndex: 1 }
        ]
    });
    await assert.rejects(
        () => extract([rootEntry([mesh('OverlappingGroups', overlapping, IDENTITY, [{}, {}])])]),
        (error) => error instanceof BakeSourceValidationError
            && error.code === 'overlapping_material_groups'
            && error.context.firstGroupIndex === 0
            && error.context.secondGroupIndex === 1
    );

    const adjacent = geometry({
        positions: positions(),
        groups: [
            { start: 0, count: 3, materialIndex: 0 },
            { start: 3, count: 3, materialIndex: 1 }
        ]
    });
    const result = await extract([rootEntry([mesh('AdjacentGroups', adjacent, IDENTITY, [{}, {}])])]);
    assert.equal(result.geometries[0].triangleCount, 2);
    assert.deepEqual(result.geometries[0].groups, [
        { start: 0, count: 3, materialIndex: 0 },
        { start: 3, count: 3, materialIndex: 1 }
    ]);
});
