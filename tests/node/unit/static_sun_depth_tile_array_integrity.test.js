// Covers fail-closed AI 531 texture-array layer and guard integrity.
// @ts-check

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';

import {
    STATIC_SUN_DEPTH_TILE_ARRAY_INTEGRITY_SCHEMA,
    createStableStaticSunDepthBasis,
    validateOwnedStaticSunDepthTileArrayIntegrity,
    validateStaticSunDepthTileArrayIntegrity,
    validateStaticSunDepthTileSetDescriptor
} from '../../../src/app/illumination/static_sun_depth/index.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);

test('tile-array integrity authenticates every row-major layer and every guard texel', async () => {
    const fixture = makeFixture();
    const result = await validateStaticSunDepthTileArrayIntegrity(
        fixture.descriptor,
        fixture.payload
    );

    assert.equal(result.schema, STATIC_SUN_DEPTH_TILE_ARRAY_INTEGRITY_SCHEMA);
    assert.equal(result.byteLength, 128);
    assert.equal(result.bytesPerLayer, 32);
    assert.equal(result.layerCount, 4);
    assert.equal(result.validatedGuardTexelCount, 48);
    assert.deepEqual(
        result.layers.map((layer) => layer.tileId),
        ['tile-0-0', 'tile-1-0', 'tile-0-1', 'tile-1-1']
    );
    assert.deepEqual(
        result.layers.map((layer) => layer.contentSha256),
        fixture.descriptor.tiles.map((tile) => tile.contentSha256)
    );
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.layers), true);
    assert.equal(Object.isFrozen(result.layers[0]), true);
    assert.equal('payload' in result, false);

    const validated = validateStaticSunDepthTileSetDescriptor(fixture.descriptor);
    const repeated = await validateStaticSunDepthTileArrayIntegrity(
        validated,
        fixture.payload
    );
    assert.equal(repeated.validatedGuardTexelCount, 48);
});

test('tile-array integrity rejects truncated and overlong payloads before activation', async () => {
    const fixture = makeFixture();
    await assert.rejects(
        validateStaticSunDepthTileArrayIntegrity(
            fixture.descriptor,
            fixture.payload.subarray(0, fixture.payload.byteLength - 1)
        ),
        /byte length must be exactly 128, received 127/
    );
    await assert.rejects(
        validateStaticSunDepthTileArrayIntegrity(
            fixture.descriptor,
            new Uint8Array(fixture.payload.byteLength + 1)
        ),
        /byte length must be exactly 128, received 129/
    );
});

test('tile-array integrity hashes layers independently in descriptor row-major order', async () => {
    const fixture = makeFixture();
    const secondLayerInteriorOffset = fixture.bytesPerLayer + (1 * 4 + 1) * 2;
    fixture.payload[secondLayerInteriorOffset] ^= 0xff;

    await assert.rejects(
        validateStaticSunDepthTileArrayIntegrity(fixture.descriptor, fixture.payload),
        /tile layer 1 \("tile-1-0"\) SHA-256 mismatch/
    );
});

test('tile-array integrity validates internal, exterior, and corner guards', async (context) => {
    const mutations = [
        {label: 'internal horizontal edge', layer: 0, x: 3, y: 1},
        {label: 'internal vertical edge', layer: 0, x: 1, y: 3},
        {label: 'internal diagonal corner', layer: 0, x: 3, y: 3},
        {label: 'exterior edge clamp', layer: 0, x: 0, y: 1},
        {label: 'exterior corner clamp', layer: 0, x: 0, y: 0}
    ];

    for (const mutation of mutations) {
        await context.test(mutation.label, async () => {
            const fixture = makeFixture();
            const offset = mutation.layer * fixture.bytesPerLayer
                + (mutation.y * fixture.storedWidth + mutation.x) * 2;
            fixture.payload[offset] ^= 0xff;
            resealLayer(fixture, mutation.layer);
            await assert.rejects(
                validateStaticSunDepthTileArrayIntegrity(
                    fixture.descriptor,
                    fixture.payload
                ),
                /guard \[.*\] does not match owning tile/
            );
        });
    }
});

test('tile-array integrity snapshots before asynchronous hashing and guard checks', async () => {
    const fixture = makeFixture();
    const original = fixture.payload.slice();
    const expectedDigests = fixture.descriptor.tiles.map((tile) => tile.contentSha256);
    let verifiedPayload = null;
    const pending = validateStaticSunDepthTileArrayIntegrity(
        fixture.descriptor,
        fixture.payload,
        (payload) => {
            verifiedPayload = payload;
        }
    );
    fixture.payload.fill(0);
    const result = await pending;

    assert.deepEqual(
        result.layers.map((layer) => layer.contentSha256),
        expectedDigests
    );
    assert.equal(result.validatedGuardTexelCount, 48);
    assert.ok(verifiedPayload instanceof Uint8Array);
    assert.notEqual(verifiedPayload, fixture.payload);
    assert.deepEqual(verifiedPayload, original);
    assert.equal('payload' in result, false);
});

test('verified payload handoff occurs once only after complete successful validation', async () => {
    const fixture = makeFixture();
    let calls = 0;
    fixture.payload[0] ^= 0xff;
    await assert.rejects(
        validateStaticSunDepthTileArrayIntegrity(
            fixture.descriptor,
            fixture.payload,
            () => {
                calls += 1;
            }
        ),
        /SHA-256 mismatch/
    );
    assert.equal(calls, 0);
    await assert.rejects(
        validateStaticSunDepthTileArrayIntegrity(fixture.descriptor, fixture.payload, {}),
        /payload consumer must be a function/
    );
});

test('owned payload validation hands off the exact allocation without a full copy', async () => {
    const fixture = makeFixture();
    let verifiedPayload = null;
    const result = await validateOwnedStaticSunDepthTileArrayIntegrity(
        fixture.descriptor,
        fixture.payload,
        (payload) => {
            verifiedPayload = payload;
        }
    );
    assert.equal(result.validatedGuardTexelCount, 48);
    assert.equal(verifiedPayload, fixture.payload);
});

test('tile-array integrity rejects mutable shared storage and non-Uint8 inputs', async () => {
    const fixture = makeFixture();
    await assert.rejects(
        validateStaticSunDepthTileArrayIntegrity(
            fixture.descriptor,
            new Uint16Array(fixture.payload.buffer)
        ),
        /payload must be a Uint8Array/
    );
    if (typeof SharedArrayBuffer === 'function') {
        await assert.rejects(
            validateStaticSunDepthTileArrayIntegrity(
                fixture.descriptor,
                new Uint8Array(new SharedArrayBuffer(fixture.payload.byteLength))
            ),
            /payload must use a non-shared ArrayBuffer/
        );
    }
});

test('tile-array integrity accepts a guardless radius-zero layout', async () => {
    const fixture = makeFixture({guardTexels: 0});
    const result = await validateStaticSunDepthTileArrayIntegrity(
        fixture.descriptor,
        fixture.payload
    );
    assert.equal(result.bytesPerLayer, 8);
    assert.equal(result.validatedGuardTexelCount, 0);
});

/**
 * @param {{guardTexels?: number}} [options]
 */
function makeFixture(options = {}) {
    const guardTexels = options.guardTexels ?? 1;
    const tileCount = [2, 2];
    const interiorTexels = [2, 2];
    const storedWidth = interiorTexels[0] + guardTexels * 2;
    const storedHeight = interiorTexels[1] + guardTexels * 2;
    const bytesPerLayer = storedWidth * storedHeight * 2;
    const payload = new Uint8Array(bytesPerLayer * tileCount[0] * tileCount[1]);
    const globalWidth = interiorTexels[0] * tileCount[0];
    const globalHeight = interiorTexels[1] * tileCount[1];

    for (let tileIndex = 0; tileIndex < tileCount[0] * tileCount[1]; tileIndex += 1) {
        const tileX = tileIndex % tileCount[0];
        const tileY = Math.floor(tileIndex / tileCount[0]);
        for (let storedY = 0; storedY < storedHeight; storedY += 1) {
            for (let storedX = 0; storedX < storedWidth; storedX += 1) {
                const globalX = Math.min(
                    globalWidth - 1,
                    Math.max(0, tileX * interiorTexels[0] + storedX - guardTexels)
                );
                const globalY = Math.min(
                    globalHeight - 1,
                    Math.max(0, tileY * interiorTexels[1] + storedY - guardTexels)
                );
                const quantized = 257 * (1 + globalY * globalWidth + globalX);
                const offset = tileIndex * bytesPerLayer
                    + (storedY * storedWidth + storedX) * 2;
                payload[offset] = (quantized >>> 8) & 0xff;
                payload[offset + 1] = quantized & 0xff;
            }
        }
    }

    const sunPointDirectionWorld = [0, 0, -1];
    const descriptor = {
        schema: 'static-sun-depth-tile-set-v1',
        identity: {
            channelId: 'static_sun_depth',
            channelVersion: 1,
            cityId: 'tile-array-fixture',
            casterInventorySha256: HASH_A,
            channelSourceSha256: HASH_B,
            compilerSignatureSha256: HASH_C,
            sunPointDirectionWorld,
            basis: JSON.parse(JSON.stringify(
                createStableStaticSunDepthBasis(sunPointDirectionWorld)
            )),
            layout: {
                order: 'row-major-y-then-x-v1',
                lookup: 'half-open-min-inclusive-max-exclusive-v1',
                rowOrigin: 'min-light-y-v1',
                guardPolicy: 'copy-adjacent-clamp-exterior-v1',
                tileCount,
                interiorTexels,
                guardTexels,
                texelSizeMeters: 1,
                boundsLightMeters: {min: [0, 0], max: [4, 4]}
            },
            alpha: {
                model: 'evaluated-runtime-coverage-v1',
                coverage: 'opacity-times-vertex-alpha-times-map-a-times-alpha-map-g-v1',
                threshold: 'discard-when-coverage-lt-alpha-test-v1',
                sidedness: 'material-side-and-shadow-side-v1',
                forcedOpaque: 'shadow-as-opaque-v1',
                semanticsSha256: HASH_D
            },
            encoding: {
                id: 'rg8-packed-linear-depth-v1',
                quantization: 'linear-endpoints-inclusive-v1',
                redChannel: 'quantized-high-byte-v1',
                greenChannel: 'quantized-low-byte-v1',
                minDepthMeters: 0,
                maxDepthMeters: 10,
                maxQuantized: 65534,
                emptyQuantized: 65535
            },
            sampling: {
                comparison: 'receiver-depth-minus-bias-lte-caster-depth-v1',
                emptyPolicy: 'visible-v1',
                outOfBoundsPolicy: 'fail-closed-zero-visibility-v1',
                bias: {
                    model: 'constant-plus-normal-offset-v1',
                    constantMeters: 0,
                    normalOffsetScaleMeters: 0
                },
                pcf: {
                    model: 'square-nearest-box-v1',
                    radiusTexels: Math.min(1, guardTexels)
                }
            }
        },
        tiles: Array.from({length: 4}, (_, tileIndex) => {
            const x = tileIndex % 2;
            const y = Math.floor(tileIndex / 2);
            return {
                id: 'tile-' + x + '-' + y,
                coordinates: [x, y],
                interiorBoundsLightMeters: {
                    min: [x * 2, y * 2],
                    max: [(x + 1) * 2, (y + 1) * 2]
                },
                storedTexels: [storedWidth, storedHeight],
                contentSha256: digest(
                    payload.subarray(
                        tileIndex * bytesPerLayer,
                        (tileIndex + 1) * bytesPerLayer
                    )
                )
            };
        })
    };
    return {descriptor, payload, bytesPerLayer, storedWidth};
}

/**
 * @param {ReturnType<typeof makeFixture>} fixture
 * @param {number} layerIndex
 */
function resealLayer(fixture, layerIndex) {
    fixture.descriptor.tiles[layerIndex].contentSha256 = digest(
        fixture.payload.subarray(
            layerIndex * fixture.bytesPerLayer,
            (layerIndex + 1) * fixture.bytesPerLayer
        )
    );
}

/** @param {Uint8Array} bytes */
function digest(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}
