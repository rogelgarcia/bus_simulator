// Verifies the inactive pure V2 block-affine world-Y depth representation.
// @ts-check

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
    STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_EMPTY_QUANTIZED,
    STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_MAX_QUANTIZED,
    assertStaticSunDepthBlockAffineWorldYV2PackageFits,
    compareStaticSunDepthBlockAffineWorldYV2,
    createStaticSunDepthBlockAffineWorldYV2Partition,
    createStaticSunDepthBlockAffineWorldYV2Range,
    createStaticSunDepthBlockAffineWorldYV2Transform,
    decodeStaticSunDepthBlockAffineWorldYV2,
    encodeStaticSunDepthBlockAffineWorldYV2,
    locateGlobalStaticSunDepthBlockAffineWorldYV2,
    locateStaticSunDepthBlockAffineWorldYV2,
    packStaticSunDepthBlockAffineWorldYV2Ranges,
    resolveStaticSunDepthBlockAffineWorldYV2GuardProvenance,
    roundStaticSunDepthWorldYDownToFloat32V2,
    roundStaticSunDepthWorldYUpToFloat32V2,
    staticSunDepthBlockAffineWorldYV2MaximumDepthErrorMeters,
    staticSunDepthComparisonWorldYV2,
    staticSunDepthLightDepthFromWorldYV2,
    staticSunDepthWorldYFromLightDepthV2,
    unpackStaticSunDepthBlockAffineWorldYV2Range
} from '../../../src/app/illumination/static_sun_depth/StaticSunDepthBlockAffineWorldYV2.js';

const PRODUCTION_INTERIOR = /** @type {const} */ ([1870, 1821]);
const PRODUCTION_GUARD = 4;
const CURRENT_HIGH_SUN_PACKAGE_OVERHEAD_BYTES = 220644;

test('32x32 partition accounts exactly for the near-cap 77-layer production layout', () => {
    const highSun = createStaticSunDepthBlockAffineWorldYV2Partition({
        interiorTexels: PRODUCTION_INTERIOR,
        tileCount: [11, 7],
        guardTexels: PRODUCTION_GUARD,
        packageOverheadBytes: CURRENT_HIGH_SUN_PACKAGE_OVERHEAD_BYTES
    });

    assert.deepEqual(highSun.blockTexels, [32, 32]);
    assert.deepEqual(highSun.blocksPerTile, [59, 57]);
    assert.deepEqual(highSun.storedTexels, [1878, 1829]);
    assert.equal(highSun.layerCount, 77);
    assert.equal(highSun.blockCountPerLayer, 3363);
    assert.equal(highSun.blockCount, 258951);
    assert.equal(highSun.depthLayerByteLength, 6869724);
    assert.equal(highSun.depthPayloadByteLength, 528968748);
    assert.equal(highSun.rangeLayerByteLength, 26904);
    assert.equal(highSun.rangePayloadByteLength, 2071608);
    assert.equal(highSun.payloadByteLength, 531040356);
    assert.equal(highSun.projectedPackageByteLength, 531261000);
    assert.equal(highSun.packageHeadroomBytes, 5609912);
    assert.equal(highSun.fitsMaximumPackageBytes, true);
    assert.equal(assertStaticSunDepthBlockAffineWorldYV2PackageFits(highSun), highSun);
    assert.equal(Object.isFrozen(highSun), true);
    assert.equal(Object.isFrozen(highSun.blocksPerTile), true);

    const lowSun = createStaticSunDepthBlockAffineWorldYV2Partition({
        interiorTexels: PRODUCTION_INTERIOR,
        tileCount: [11, 3],
        guardTexels: PRODUCTION_GUARD
    });
    assert.equal(lowSun.depthPayloadByteLength, 226700892);
    assert.equal(lowSun.rangePayloadByteLength, 887832);

    const oversized = createStaticSunDepthBlockAffineWorldYV2Partition({
        interiorTexels: PRODUCTION_INTERIOR,
        tileCount: [11, 8],
        guardTexels: PRODUCTION_GUARD
    });
    assert.equal(oversized.fitsMaximumPackageBytes, false);
    assert.throws(
        () => assertStaticSunDepthBlockAffineWorldYV2PackageFits(oversized),
        /projected package byte length .* exceeds 536870912/
    );
    assert.throws(
        () => createStaticSunDepthBlockAffineWorldYV2Partition({
            interiorTexels: PRODUCTION_INTERIOR,
            tileCount: [11, 7],
            guardTexels: PRODUCTION_GUARD,
            maximumPackageBytes: 536870913
        }),
        /cannot exceed 536870912/
    );
});

test('partition locates block and tile half-open boundaries in deterministic row-major order', () => {
    const partition = makeSmallPartition();

    const beforeBlockEdge = locateStaticSunDepthBlockAffineWorldYV2(
        partition,
        [0, 0],
        [31, 31]
    );
    const afterBlockEdge = locateStaticSunDepthBlockAffineWorldYV2(
        partition,
        [0, 0],
        [32, 31]
    );
    const finalPartialBlock = locateStaticSunDepthBlockAffineWorldYV2(
        partition,
        [0, 0],
        [64, 32]
    );

    assert.deepEqual(beforeBlockEdge.blockCoordinates, [0, 0]);
    assert.equal(beforeBlockEdge.blockIndexInLayer, 0);
    assert.deepEqual(afterBlockEdge.blockCoordinates, [1, 0]);
    assert.equal(afterBlockEdge.blockIndexInLayer, 1);
    assert.deepEqual(finalPartialBlock.blockCoordinates, [2, 1]);
    assert.equal(finalPartialBlock.blockIndexInLayer, 5);

    const beforeTileEdge = locateGlobalStaticSunDepthBlockAffineWorldYV2(partition, [64, 0]);
    const afterTileEdge = locateGlobalStaticSunDepthBlockAffineWorldYV2(partition, [65, 0]);
    const nextRow = locateGlobalStaticSunDepthBlockAffineWorldYV2(partition, [0, 33]);
    assert.deepEqual(beforeTileEdge.tileCoordinates, [0, 0]);
    assert.deepEqual(beforeTileEdge.localTexel, [64, 0]);
    assert.deepEqual(beforeTileEdge.blockCoordinates, [2, 0]);
    assert.deepEqual(afterTileEdge.tileCoordinates, [1, 0]);
    assert.deepEqual(afterTileEdge.localTexel, [0, 0]);
    assert.deepEqual(afterTileEdge.blockCoordinates, [0, 0]);
    assert.equal(afterTileEdge.layer, 1);
    assert.deepEqual(nextRow.tileCoordinates, [0, 1]);
    assert.equal(nextRow.layer, 2);
    assert.equal(nextRow.metadataIndex, partition.blockCountPerLayer * 2);

    assert.throws(
        () => locateGlobalStaticSunDepthBlockAffineWorldYV2(partition, [130, 0]),
        /outside its half-open domain/
    );
    assert.throws(
        () => locateStaticSunDepthBlockAffineWorldYV2(partition, [0, 0], [65, 0]),
        /outside its half-open domain/
    );
});

test('guard provenance binds copied codes to the logical source block range', () => {
    const partition = makeSmallPartition();
    const firstRightGuardX = partition.guardTexels + partition.interiorTexels[0];

    const adjacent = resolveStaticSunDepthBlockAffineWorldYV2GuardProvenance(
        partition,
        [0, 0],
        [firstRightGuardX, partition.guardTexels]
    );
    assert.equal(adjacent.kind, 'adjacent_copy');
    assert.equal(adjacent.isGuard, true);
    assert.equal(adjacent.exteriorClamped, false);
    assert.deepEqual(adjacent.logicalGlobalTexel, [65, 0]);
    assert.deepEqual(adjacent.sourceTileCoordinates, [1, 0]);
    assert.deepEqual(adjacent.sourceLocalTexel, [0, 0]);
    assert.deepEqual(adjacent.sourceBlockCoordinates, [0, 0]);
    assert.equal(
        adjacent.sourceMetadataIndex,
        locateGlobalStaticSunDepthBlockAffineWorldYV2(partition, [65, 0]).metadataIndex
    );

    const exterior = resolveStaticSunDepthBlockAffineWorldYV2GuardProvenance(
        partition,
        [0, 0],
        [0, 0]
    );
    assert.equal(exterior.kind, 'exterior_clamp');
    assert.equal(exterior.exteriorClamped, true);
    assert.deepEqual(exterior.logicalGlobalTexel, [-4, -4]);
    assert.deepEqual(exterior.sourceGlobalTexel, [0, 0]);
    assert.deepEqual(exterior.sourceTileCoordinates, [0, 0]);
    assert.deepEqual(exterior.sourceLocalTexel, [0, 0]);

    const interior = resolveStaticSunDepthBlockAffineWorldYV2GuardProvenance(
        partition,
        [1, 1],
        [partition.guardTexels, partition.guardTexels]
    );
    assert.equal(interior.kind, 'interior');
    assert.equal(interior.isGuard, false);
    assert.deepEqual(interior.sourceTileCoordinates, [1, 1]);
    assert.deepEqual(interior.sourceLocalTexel, [0, 0]);
});

test('range endpoints round outward to float32 and metadata is exact little-endian RG32F', () => {
    const range = createStaticSunDepthBlockAffineWorldYV2Range([null, 0.1, 0.2]);
    assert.ok(range.minWorldY <= 0.1);
    assert.ok(range.maxWorldY >= 0.2);
    assert.equal(Math.fround(range.minWorldY), range.minWorldY);
    assert.equal(Math.fround(range.maxWorldY), range.maxWorldY);
    assert.ok(roundStaticSunDepthWorldYDownToFloat32V2(0.1) <= 0.1);
    assert.ok(roundStaticSunDepthWorldYUpToFloat32V2(0.1) >= 0.1);
    assert.equal(Object.isFrozen(range), true);

    const empty = createStaticSunDepthBlockAffineWorldYV2Range([null, null]);
    const bytes = packStaticSunDepthBlockAffineWorldYV2Ranges([range, empty]);
    assert.equal(bytes.byteLength, 16);
    assert.deepEqual([...bytes.subarray(8)], [0, 0, 128, 127, 0, 0, 128, 255]);
    assert.deepEqual(unpackStaticSunDepthBlockAffineWorldYV2Range(bytes, 0), range);
    assert.deepEqual(unpackStaticSunDepthBlockAffineWorldYV2Range(bytes, 1), empty);
    assert.throws(
        () => unpackStaticSunDepthBlockAffineWorldYV2Range(bytes, 2),
        /outside source metadata/
    );

    const invalid = new Uint8Array(8);
    const invalidView = new DataView(invalid.buffer);
    invalidView.setFloat32(0, 2, true);
    invalidView.setFloat32(4, 1, true);
    assert.throws(
        () => unpackStaticSunDepthBlockAffineWorldYV2Range(invalid, 0),
        /increasing finite endpoints/
    );
    assert.throws(
        () => roundStaticSunDepthWorldYUpToFloat32V2(Number.MAX_VALUE),
        /no finite float32 upper bound/
    );
});

test('nearest RG8 encoding reserves empty and fails closed for empty and zero-span blocks', () => {
    const range = createStaticSunDepthBlockAffineWorldYV2Range([0, 2]);
    assert.equal(encodeStaticSunDepthBlockAffineWorldYV2(0, range), 0);
    assert.equal(
        encodeStaticSunDepthBlockAffineWorldYV2(1, range),
        STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_MAX_QUANTIZED / 2
    );
    assert.equal(
        encodeStaticSunDepthBlockAffineWorldYV2(2, range),
        STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_MAX_QUANTIZED
    );
    assert.equal(
        decodeStaticSunDepthBlockAffineWorldYV2(
            STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_MAX_QUANTIZED / 2,
            range
        ),
        1
    );
    assert.equal(
        encodeStaticSunDepthBlockAffineWorldYV2(null, range),
        STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_EMPTY_QUANTIZED
    );
    assert.equal(
        decodeStaticSunDepthBlockAffineWorldYV2(
            STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_EMPTY_QUANTIZED,
            range
        ),
        null
    );

    const empty = createStaticSunDepthBlockAffineWorldYV2Range([]);
    assert.equal(
        encodeStaticSunDepthBlockAffineWorldYV2(null, empty),
        STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_EMPTY_QUANTIZED
    );
    assert.equal(
        decodeStaticSunDepthBlockAffineWorldYV2(
            STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_EMPTY_QUANTIZED,
            empty
        ),
        null
    );
    assert.throws(
        () => encodeStaticSunDepthBlockAffineWorldYV2(0, empty),
        /all-empty block cannot encode an occupied texel/
    );
    assert.throws(
        () => decodeStaticSunDepthBlockAffineWorldYV2(0, empty),
        /occupied code references an all-empty block/
    );

    const zeroSpan = createStaticSunDepthBlockAffineWorldYV2Range([1.5, 1.5]);
    assert.equal(encodeStaticSunDepthBlockAffineWorldYV2(1.5, zeroSpan), 0);
    assert.equal(decodeStaticSunDepthBlockAffineWorldYV2(0, zeroSpan), 1.5);
    assert.throws(
        () => encodeStaticSunDepthBlockAffineWorldYV2(1.6, zeroSpan),
        /outside its outward-rounded block range/
    );
    assert.throws(
        () => decodeStaticSunDepthBlockAffineWorldYV2(1, zeroSpan),
        /permits only occupied code 0/
    );
});

test('negative depth-axis transform preserves depth comparison and bias exactly in world-Y', () => {
    const transform = makeTransform();
    const light = /** @type {const} */ ([12.25, -4.5]);
    const casterDepth = 20;
    const casterWorldY = staticSunDepthWorldYFromLightDepthV2(
        transform,
        light,
        casterDepth
    );

    assert.ok(Math.abs(
        staticSunDepthLightDepthFromWorldYV2(transform, light, casterWorldY)
        - casterDepth
    ) < 1e-12);
    assert.equal(
        compareStaticSunDepthBlockAffineWorldYV2(transform, light, 19, 0, casterWorldY),
        true
    );
    assert.equal(
        compareStaticSunDepthBlockAffineWorldYV2(transform, light, 21, 0, casterWorldY),
        false
    );
    assert.equal(
        compareStaticSunDepthBlockAffineWorldYV2(transform, light, 21, 1, casterWorldY),
        true
    );
    assert.equal(
        compareStaticSunDepthBlockAffineWorldYV2(transform, light, 100, 0, null),
        true
    );
    assert.equal(
        staticSunDepthComparisonWorldYV2(transform, light, 21, 1),
        casterWorldY
    );

    const range = createStaticSunDepthBlockAffineWorldYV2Range([25.6401, 27.1201]);
    const expectedHalfUnit = (range.maxWorldY - range.minWorldY)
        / STATIC_SUN_DEPTH_BLOCK_AFFINE_WORLD_Y_V2_MAX_QUANTIZED
        / Math.abs(transform.depthAxisWorldY)
        * 0.5;
    assert.equal(
        staticSunDepthBlockAffineWorldYV2MaximumDepthErrorMeters(range, transform),
        expectedHalfUnit
    );

    assert.throws(
        () => createStaticSunDepthBlockAffineWorldYV2Transform({
            originWorld: [0, 0, 0],
            rightAxisWorld: [1, 0, 0],
            upAxisWorld: [0, 1, 0],
            depthAxisWorld: [0, 0, 1]
        }),
        /strictly negative/
    );
    assert.throws(
        () => createStaticSunDepthBlockAffineWorldYV2Transform({
            originWorld: [0, 0, 0],
            rightAxisWorld: [1, 0, 0],
            upAxisWorld: [0, 1, 0],
            depthAxisWorld: [0, -1e-50, 1]
        }),
        /strictly negative/
    );
    assert.throws(
        () => staticSunDepthComparisonWorldYV2(transform, light, 20, -0.01),
        /biasMeters must be nonnegative/
    );
});

test('independent block ranges preserve inclusive comparisons across block and tile edges', () => {
    const partition = createStaticSunDepthBlockAffineWorldYV2Partition({
        interiorTexels: PRODUCTION_INTERIOR,
        tileCount: [2, 1],
        guardTexels: PRODUCTION_GUARD
    });
    const transform = makeTransform();
    const texels = /** @type {const} */ ([
        [31, 100],
        [32, 100],
        [1869, 100],
        [1870, 100]
    ]);
    const ranges = [
        createStaticSunDepthBlockAffineWorldYV2Range([20, 30]),
        createStaticSunDepthBlockAffineWorldYV2Range([10, 40]),
        createStaticSunDepthBlockAffineWorldYV2Range([0, 50]),
        createStaticSunDepthBlockAffineWorldYV2Range([15, 35])
    ];

    const locations = texels.map((texel) => (
        locateGlobalStaticSunDepthBlockAffineWorldYV2(partition, texel)
    ));
    assert.deepEqual(
        locations.map((location) => [location.tileCoordinates, location.blockCoordinates]),
        [
            [[0, 0], [0, 3]],
            [[0, 0], [1, 3]],
            [[0, 0], [58, 3]],
            [[1, 0], [0, 3]]
        ]
    );

    texels.forEach((texel, index) => {
        const light = /** @type {const} */ ([texel[0] * 0.04150390625, 4]);
        const exactCasterWorldY = 25;
        const code = encodeStaticSunDepthBlockAffineWorldYV2(
            exactCasterWorldY,
            ranges[index]
        );
        const decodedCasterWorldY = decodeStaticSunDepthBlockAffineWorldYV2(
            code,
            ranges[index]
        );
        assert.notEqual(decodedCasterWorldY, null);
        const equalReceiverDepth = staticSunDepthLightDepthFromWorldYV2(
            transform,
            light,
            /** @type {number} */ (decodedCasterWorldY)
        );
        assert.equal(
            compareStaticSunDepthBlockAffineWorldYV2(
                transform,
                light,
                equalReceiverDepth,
                0,
                decodedCasterWorldY
            ),
            true
        );
        assert.equal(
            compareStaticSunDepthBlockAffineWorldYV2(
                transform,
                light,
                equalReceiverDepth + 0.01,
                0,
                decodedCasterWorldY
            ),
            false
        );
    });
});

function makeSmallPartition() {
    return createStaticSunDepthBlockAffineWorldYV2Partition({
        interiorTexels: [65, 33],
        tileCount: [2, 2],
        guardTexels: 4
    });
}

function makeTransform() {
    return createStaticSunDepthBlockAffineWorldYV2Transform({
        originWorld: [-0.5760955810546875, 22.105132937431335, 0],
        rightAxisWorld: [-0.7071067811865476, 0, -0.7071067811865475],
        upAxisWorld: [0.09841024344762228, 0.9902680687415704, -0.0984102434476223],
        depthAxisWorld: [0.7002252665996704, -0.1391731009600654, -0.7002252665996705]
    });
}
