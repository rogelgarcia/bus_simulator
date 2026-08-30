// Verifies deterministic illumination bake-source canonicalization, hashing, transforms, and packages.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BAKE_SOURCE_PACKAGE_INTEGRITY_DOMAIN,
    assertUniqueIds,
    buildBakeSourceHashSet,
    buildBakeSourcePackage,
    canonicalJsonStringify,
    convertThreeMatrixToBlender,
    createStableInventory,
    createStableInventoryAsync,
    parseBakeSourcePackage,
    selectStableInventoryById,
    sha256Digest,
    sha256Hex,
    validateAffineTransform
} from '../../../src/app/illumination/bake_source/index.js';

function makeHashInput({ usedRoughness = 0.4, unusedRoughness = 0.1, sunIntensity = 5.75 } = {}) {
    const materialCatalog = [
        { id: 'material:unused', roughness: unusedRoughness },
        { id: 'material:used', roughness: usedRoughness }
    ];
    return {
        resolvedSource: { cityId: 'bigcity2', objectIds: ['building:a'] },
        geometry: {
            buffers: [{ id: 'geometry:building:a', sha256: 'geometry-bytes-a' }],
            transforms: [{ id: 'instance:building:a', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 4, 1] }]
        },
        usedMaterials: selectStableInventoryById(
            materialCatalog,
            ['material:used'],
            { label: 'materials' }
        ),
        profiles: [{ id: 'sun:default', azimuth: 45, elevation: 35, intensity: sunIntensity }],
        channels: [{ id: 'static_sun_depth', resolution: 2048 }],
        compiler: { id: 'blender:5.2.1-cycles-cpu', scriptSha256: 'compiler-script-a' }
    };
}

function joinBytes(parts) {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    return result;
}

test('canonical JSON sorts keys, normalizes negative zero, and rejects non-JSON ambiguity', () => {
    const first = { z: -0, nested: { z: 2, a: 1 }, a: ['text', true, null] };
    const reordered = { a: ['text', true, null], nested: { a: 1, z: 2 }, z: 0 };
    assert.equal(
        canonicalJsonStringify(first),
        '{"a":["text",true,null],"nested":{"a":1,"z":2},"z":0}'
    );
    assert.equal(canonicalJsonStringify(first), canonicalJsonStringify(reordered));
    assert.throws(() => canonicalJsonStringify({ invalid: Number.NaN }), /non-finite/);
    assert.throws(() => canonicalJsonStringify([1, undefined]), /unsupported JSON type/);
    assert.throws(() => canonicalJsonStringify(new Date(0)), /plain JSON objects/);
    const cyclic = {};
    cyclic.self = cyclic;
    assert.throws(() => canonicalJsonStringify(cyclic), /cyclic reference/);
    const arrayWithHiddenState = [1];
    Object.defineProperty(arrayWithHiddenState, 'hidden', { value: 2 });
    assert.throws(() => canonicalJsonStringify(arrayWithHiddenState), /without custom properties/);
});

test('stable ID helpers and inventories reject duplicates and non-finite records', () => {
    assert.doesNotThrow(() => assertUniqueIds(['building:a', 'building:b'], 'objects'));
    assert.throws(() => assertUniqueIds(['building:a', 'building:a'], 'objects'), /duplicate ID/);
    assert.throws(
        () => createStableInventory([{ id: 'b' }, { id: 'b' }], { label: 'objects' }),
        /duplicate ID/
    );
    assert.throws(
        () => createStableInventory([{ id: 'a', position: Number.POSITIVE_INFINITY }], { label: 'objects' }),
        /non-finite/
    );
});

test('async inventory resolution is stable across input and completion order', async () => {
    let resolveA;
    let resolveB;
    const itemA = new Promise((resolve) => {
        resolveA = resolve;
    });
    const itemB = new Promise((resolve) => {
        resolveB = resolve;
    });
    const pending = createStableInventoryAsync([itemB, itemA], { label: 'trees' });
    resolveA({ id: 'tree:a', position: [1, 0, 2] });
    await Promise.resolve();
    resolveB({ id: 'tree:b', position: [3, 0, 4] });
    const inventory = await pending;
    assert.deepEqual(inventory.map((entry) => entry.id), ['tree:a', 'tree:b']);
    assert.equal(Object.isFrozen(inventory), true);
    assert.equal(Object.isFrozen(inventory[0]), true);
});

test('SHA-256 is deterministic and explicitly separated by domain', async () => {
    const bytes = new TextEncoder().encode('same bytes');
    const first = await sha256Hex('test/domain/a', bytes);
    const repeated = await sha256Hex('test/domain/a', bytes);
    const separated = await sha256Hex('test/domain/b', bytes);
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.equal(first, repeated);
    assert.notEqual(first, separated);
    await assert.rejects(() => sha256Hex('', bytes), /domain must be a non-empty string/);
});

test('Three.js column-major transforms convert to Blender Z-up without decomposition', () => {
    const threeTranslation = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        2, 3, 4, 1
    ];
    assert.deepEqual(convertThreeMatrixToBlender(threeTranslation), [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        2, -4, 3, 1
    ]);
    const threeScale = [
        2, 0, 0, 0,
        0, 3, 0, 0,
        0, 0, 4, 0,
        0, 0, 0, 1
    ];
    assert.deepEqual(convertThreeMatrixToBlender(threeScale), [
        2, 0, 0, 0,
        0, 4, 0, 0,
        0, 0, 3, 0,
        0, 0, 0, 1
    ]);
    assert.equal(validateAffineTransform(threeScale).determinant, 24);
});

test('transform validation rejects non-finite, projective, singular, and reflected matrices', () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const nonFinite = [...identity];
    nonFinite[4] = Number.NaN;
    assert.throws(() => convertThreeMatrixToBlender(nonFinite), /finite number/);
    const projective = [...identity];
    projective[3] = 0.25;
    assert.throws(() => convertThreeMatrixToBlender(projective), /must be affine/);
    const singular = [...identity];
    singular[0] = 0;
    assert.throws(() => convertThreeMatrixToBlender(singular), /singular/);
    const reflected = [...identity];
    reflected[0] = -1;
    assert.throws(() => convertThreeMatrixToBlender(reflected), /negative determinant/);
});

test('source hash set is order-stable and isolates relevant freshness domains', async () => {
    const referenceInput = makeHashInput();
    const reorderedInput = {
        ...referenceInput,
        resolvedSource: { objectIds: ['building:a'], cityId: 'bigcity2' },
        profiles: [{ intensity: 5.75, elevation: 35, id: 'sun:default', azimuth: 45 }]
    };
    const reference = await buildBakeSourceHashSet(referenceInput);
    const reordered = await buildBakeSourceHashSet(reorderedInput);
    assert.deepEqual(reference, reordered);

    const geometryChanged = makeHashInput();
    geometryChanged.geometry.transforms[0].matrix[12] = 3;
    const geometryResult = await buildBakeSourceHashSet(geometryChanged);
    assert.notEqual(geometryResult.geometry, reference.geometry);
    assert.notEqual(geometryResult.resolvedSource, reference.resolvedSource);
    assert.equal(geometryResult.usedMaterials, reference.usedMaterials);

    const materialChanged = await buildBakeSourceHashSet(makeHashInput({ usedRoughness: 0.8 }));
    assert.notEqual(materialChanged.usedMaterials, reference.usedMaterials);
    assert.notEqual(materialChanged.resolvedSource, reference.resolvedSource);
    assert.equal(materialChanged.geometry, reference.geometry);

    const profileChanged = await buildBakeSourceHashSet(makeHashInput({ sunIntensity: 6 }));
    assert.notEqual(profileChanged.profiles[0].sha256, reference.profiles[0].sha256);
    assert.equal(profileChanged.resolvedSource, reference.resolvedSource);
    assert.equal(profileChanged.compiler, reference.compiler);

    const unusedCatalogChanged = await buildBakeSourceHashSet(makeHashInput({ unusedRoughness: 0.95 }));
    assert.deepEqual(unusedCatalogChanged, reference);
});

test('package bytes repeat across manifest and buffer discovery order', async () => {
    const first = await buildBakeSourcePackage({
        manifest: { sourceHash: 'source-a', city: { revision: 2, id: 'bigcity2' } },
        buffers: [
            { id: 'mesh:z', data: new Uint8Array([9, 8]) },
            { id: 'mesh:a', data: new Uint8Array([1, 2, 3]) },
            { id: 'mesh:shared', data: new Uint8Array([1, 2, 3]) }
        ]
    });
    const repeated = await buildBakeSourcePackage({
        manifest: { city: { id: 'bigcity2', revision: 2 }, sourceHash: 'source-a' },
        buffers: [
            { id: 'mesh:shared', data: new Uint8Array([1, 2, 3]) },
            { id: 'mesh:a', data: new Uint8Array([1, 2, 3]) },
            { id: 'mesh:z', data: new Uint8Array([9, 8]) }
        ]
    });
    assert.deepEqual(first, repeated);

    const parsed = await parseBakeSourcePackage(first);
    assert.deepEqual(parsed.manifest, {
        city: { id: 'bigcity2', revision: 2 },
        sourceHash: 'source-a'
    });
    assert.equal(parsed.bufferCount, 3);
    assert.equal(parsed.uniqueBufferCount, 2);
    assert.deepEqual(parsed.buffers.map((entry) => entry.id), ['mesh:a', 'mesh:shared', 'mesh:z']);
    assert.equal(parsed.buffers[0].storageIndex, parsed.buffers[1].storageIndex);
    assert.equal(parsed.buffers[0].storageOffset, parsed.buffers[1].storageOffset);
    assert.deepEqual([...parsed.getBuffer('mesh:a')], [1, 2, 3]);
    const mutableCopy = parsed.getBuffer('mesh:a');
    mutableCopy[0] = 255;
    assert.deepEqual([...parsed.getBuffer('mesh:a')], [1, 2, 3]);
});

test('package builder rejects duplicate buffer IDs and invalid manifest values', async () => {
    await assert.rejects(
        () => buildBakeSourcePackage({
            manifest: { cityId: 'bigcity2' },
            buffers: [
                { id: 'mesh:a', data: new Uint8Array([1]) },
                { id: 'mesh:a', data: new Uint8Array([2]) }
            ]
        }),
        /duplicate ID/
    );
    await assert.rejects(
        () => buildBakeSourcePackage({
            manifest: { invalid: Number.NaN },
            buffers: []
        }),
        /non-finite/
    );
});

test('package parser rejects corruption, truncation, and per-buffer hash mismatch', async () => {
    const bytes = await buildBakeSourcePackage({
        manifest: { cityId: 'bigcity2' },
        buffers: [{ id: 'mesh:a', data: new Uint8Array([1, 2, 3, 4]) }]
    });
    const corrupt = bytes.slice();
    corrupt[corrupt.length - 1] ^= 0xff;
    await assert.rejects(() => parseBakeSourcePackage(corrupt), /package_integrity_mismatch/);

    const truncated = bytes.slice(0, bytes.length - 1);
    await assert.rejects(() => parseBakeSourcePackage(truncated), /package_length_mismatch/);

    const forgedPackageIntegrity = bytes.slice();
    forgedPackageIntegrity[forgedPackageIntegrity.length - 1] ^= 0x01;
    const integrityInput = joinBytes([
        forgedPackageIntegrity.slice(0, 32),
        forgedPackageIntegrity.slice(64)
    ]);
    forgedPackageIntegrity.set(
        await sha256Digest(BAKE_SOURCE_PACKAGE_INTEGRITY_DOMAIN, integrityInput),
        32
    );
    await assert.rejects(
        () => parseBakeSourcePackage(forgedPackageIntegrity),
        /buffer_hash_mismatch/
    );
});
