// Verifies production static-sun tile arrays become exact, self-verified AI 530 packages.
// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canonicalJsonBytes
} from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    buildIlluminationBinaryPackage,
    rawSha256Hex,
    verifyIlluminationBinaryPackage
} from '../../../../src/app/illumination/package/index.js';
import {
    createStableStaticSunDepthBasis,
    createThreeR183DirectionalShadowFilterAxes
} from '../../../../src/app/illumination/static_sun_depth/index.js';
import {
    PRODUCTION_STATIC_SUN_DEPTH_CHUNK_ID,
    PRODUCTION_STATIC_SUN_DEPTH_LAYER_WINDOW_SCHEMA,
    buildProductionStaticSunDepthChunkInputs,
    buildProductionStaticSunDepthPackage,
    requireProductionStaticSunDepthChunkWindows
} from '../../../../tools/static_sun_depth/src/ProductionPackage.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_D = 'd'.repeat(64);
const HASH_E = 'e'.repeat(64);
const HASH_F = 'f'.repeat(64);

test('production adapter snapshots and returns one verified RG8 texture-array package', async () => {
    const fixture = await makeFixture();
    const originalPayload = fixture.payload.slice();
    const pending = buildProductionStaticSunDepthPackage(fixture.options);
    fixture.payload.fill(0);
    const result = await pending;

    assert.ok(result.bytes instanceof Uint8Array);
    assert.equal(result.compatibility.compatible, true);
    assert.equal(result.compatibility.reason, 'ready');
    assert.equal(result.chunks.length, 1);
    assert.equal(result.tileArrayIntegrity.layerCount, 1);
    assert.equal(result.tileArrayIntegrity.validatedGuardTexelCount, 12);
    assert.equal(result.buildMetrics.decodedByteLength, originalPayload.byteLength);

    const chunk = result.chunks[0];
    assert.equal(chunk.descriptor.id, PRODUCTION_STATIC_SUN_DEPTH_CHUNK_ID);
    assert.equal(chunk.descriptor.channelId, 'static_sun_depth');
    assert.equal(chunk.descriptor.resourceType, 'texture_2d_array');
    assert.equal(chunk.descriptor.encoding, 'rg8_unorm');
    assert.equal(chunk.descriptor.precision, 'unorm8');
    assert.equal(chunk.descriptor.rowOrigin, 'lower_left');
    assert.deepEqual(chunk.descriptor.dimensions, {
        components: 2,
        depth: 1,
        height: 4,
        width: 4
    });
    assert.deepEqual(chunk.descriptor.coordinateTransform, fixture.descriptor);
    assert.deepEqual(chunk.descriptor.requiredRuntimeCapabilities, [
        'fragment_highp_float',
        'rg8_unorm',
        'texture_2d_array',
        'webgl2'
    ]);
    assert.deepEqual(chunk.data, originalPayload);
    const directWindow = requireProductionStaticSunDepthChunkWindows(result.chunks);
    assert.equal(directWindow.mode, 'single');
    assert.equal(directWindow.id, PRODUCTION_STATIC_SUN_DEPTH_CHUNK_ID);
    const badDirectCapabilities = structuredClone(result.chunks);
    badDirectCapabilities[0].descriptor.requiredRuntimeCapabilities = ['webgl2'];
    assert.throws(
        () => requireProductionStaticSunDepthChunkWindows(badDirectCapabilities),
        /complete texture array/
    );
    const badDirectDigest = structuredClone(result.chunks);
    badDirectDigest[0].descriptor.sha256 = 'A'.repeat(64);
    badDirectDigest[0].descriptor.decodedSha256 = 'A'.repeat(64);
    assert.throws(
        () => requireProductionStaticSunDepthChunkWindows(badDirectDigest),
        /complete texture array/
    );
    assert.equal(result.manifest.cityId, fixture.options.cityId);
    assert.equal(result.manifest.lightingProfileId, fixture.options.lightingProfileId);
    assert.equal(
        result.manifest.selectedCapabilityProfileId,
        fixture.options.selectedCapabilityProfileId
    );
    assert.equal(result.manifest.channels[0].sourceSha256, HASH_B);
    assert.equal(result.manifest.channels[0].profileSha256, HASH_F);
    assert.equal(
        result.manifest.compiler.signatureSha256,
        fixture.descriptor.identity.compilerSignatureSha256
    );

    const independentlyVerified = await verifyIlluminationBinaryPackage(result.bytes, {
        expectations: {
            aggregateSha256: result.aggregateSha256,
            cityId: fixture.options.cityId,
            compilerSignatureSha256: fixture.descriptor.identity.compilerSignatureSha256,
            lightingProfileId: fixture.options.lightingProfileId,
            profileSha256: HASH_F,
            resolvedSourceSha256: HASH_E,
            selectedCapabilityProfileId: fixture.options.selectedCapabilityProfileId,
            staticSunDepthSourceSha256: HASH_B
        },
        runtimeCapabilities: [
            'fragment_highp_float',
            'rg8_unorm',
            'static_receiver_sampling_v1',
            'texture_2d_array',
            'webgl2'
        ]
    });
    assert.equal(independentlyVerified.compatibility.compatible, true);
    assert.deepEqual(independentlyVerified.chunks[0].data, originalPayload);
});

test('production chunk adapter emits deterministic authenticated 3/4-window inventories', async () => {
    for (const [layerCount, expectedLayerCounts] of [
        [5, [2, 2, 1]],
        [7, [2, 2, 2, 1]]
    ]) {
        const fixture = await makeFixture(layerCount);
        const dimensions = {
            components: 2,
            depth: layerCount,
            height: 4,
            width: 4
        };
        const chunks = await buildProductionStaticSunDepthChunkInputs(
            fixture.descriptor,
            fixture.payload,
            dimensions,
            64
        );
        assert.deepEqual(chunks.map((chunk) => chunk.id), expectedLayerCounts.map(
            (_, index) => `static_sun_depth.tiles.rg8.window.${String(index).padStart(5, '0')}`
        ));
        assert.deepEqual(chunks.map((chunk) => chunk.dimensions.depth), expectedLayerCounts);
        assert.deepEqual(chunks.map((chunk) => chunk.coordinateTransform.firstLayer),
            expectedLayerCounts.map((_, index) => expectedLayerCounts
                .slice(0, index)
                .reduce((sum, count) => sum + count, 0)));
        assert.ok(chunks.every((chunk) => (
            chunk.coordinateTransform.schema === PRODUCTION_STATIC_SUN_DEPTH_LAYER_WINDOW_SCHEMA
            && chunk.coordinateTransform.assembledByteLength === fixture.payload.byteLength
        )));
        assert.deepEqual(chunks[0].coordinateTransform.outputDescriptor, fixture.descriptor);

        const built = await buildIlluminationBinaryPackage({
            cityId: fixture.options.cityId,
            lightingProfileId: fixture.options.lightingProfileId,
            selectedCapabilityProfileId: fixture.options.selectedCapabilityProfileId,
            source: fixture.options.source,
            compilerDescriptor: fixture.options.compilerDescriptor,
            channels: [{
                id: 'static_sun_depth',
                required: true,
                sourceSha256: HASH_B,
                profileSha256: HASH_F,
                schemaVersion: 1
            }],
            chunks
        });
        const verified = await verifyIlluminationBinaryPackage(built.bytes);
        const resolved = requireProductionStaticSunDepthChunkWindows(verified.chunks);
        assert.equal(resolved.mode, 'layer-windows');
        assert.equal(resolved.id, PRODUCTION_STATIC_SUN_DEPTH_CHUNK_ID);
        assert.deepEqual(resolved.dimensions, dimensions);
        assert.deepEqual(resolved.sourceChunks.map((chunk) => chunk.layerCount), expectedLayerCounts);
        assert.equal(resolved.assembledByteLength, fixture.payload.byteLength);
        const badWindowCapabilities = structuredClone(verified.chunks);
        for (const chunk of badWindowCapabilities) {
            chunk.descriptor.requiredRuntimeCapabilities = ['webgl2'];
        }
        assert.throws(
            () => requireProductionStaticSunDepthChunkWindows(badWindowCapabilities),
            /exact runtime capability set/
        );
    }
});

test('production adapter rejects cross-provenance identities and invalid payloads', async (context) => {
    await context.test('city identity mismatch', async () => {
        const fixture = await makeFixture();
        await assert.rejects(
            buildProductionStaticSunDepthPackage({
                ...fixture.options,
                cityId: 'another.city'
            }),
            /cityId does not match descriptor.identity.cityId/
        );
    });
    await context.test('compiler identity mismatch', async () => {
        const fixture = await makeFixture();
        await assert.rejects(
            buildProductionStaticSunDepthPackage({
                ...fixture.options,
                compilerDescriptor: {...fixture.options.compilerDescriptor, buildHash: 'changed'}
            }),
            /compilerDescriptor canonical SHA-256 does not match/
        );
    });
    await context.test('layer hash mismatch', async () => {
        const fixture = await makeFixture();
        fixture.payload[0] ^= 1;
        await assert.rejects(
            buildProductionStaticSunDepthPackage(fixture.options),
            /tile layer 0 .* SHA-256 mismatch/
        );
    });
    await context.test('fixture-only capability profile', async () => {
        const fixture = await makeFixture();
        await assert.rejects(
            buildProductionStaticSunDepthPackage({
                ...fixture.options,
                selectedCapabilityProfileId: 'transport.fixture_v1'
            }),
            /must require the static_sun_depth channel/
        );
    });
});

async function makeFixture(layerCount = 1) {
    const compilerDescriptor = {
        backend: 'cycles_cpu',
        buildHash: 'production-fixture-build',
        schema: 'production-static-sun-compiler-v1',
        version: '5.2.1 LTS'
    };
    const compilerSignatureSha256 = await rawSha256Hex(
        canonicalJsonBytes(compilerDescriptor)
    );
    const payload = new Uint8Array(4 * 4 * 2 * layerCount);
    payload.fill(0xff);
    const contentSha256 = await rawSha256Hex(payload.subarray(0, 4 * 4 * 2));
    const sunPointDirectionWorld = [0, 0, -1];
    const filterAxes = createThreeR183DirectionalShadowFilterAxes(
        sunPointDirectionWorld
    );
    const descriptor = {
        schema: 'static-sun-depth-tile-set-v1',
        identity: {
            channelId: 'static_sun_depth',
            channelVersion: 1,
            cityId: 'production.city',
            casterInventorySha256: HASH_A,
            channelSourceSha256: HASH_B,
            compilerSignatureSha256,
            sunPointDirectionWorld,
            basis: createStableStaticSunDepthBasis(sunPointDirectionWorld),
            layout: {
                order: 'row-major-y-then-x-v1',
                lookup: 'half-open-min-inclusive-max-exclusive-v1',
                rowOrigin: 'min-light-y-v1',
                guardPolicy: 'copy-adjacent-clamp-exterior-v1',
                tileCount: [layerCount, 1],
                interiorTexels: [2, 2],
                guardTexels: 1,
                texelSizeMeters: 1,
                boundsLightMeters: {min: [0, 0], max: [2 * layerCount, 2]}
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
                    constantDepthReliefMeters: 0.0697915,
                    geometricNormalOffsetMeters: 0.0232,
                    model: 'geometric-normal-offset-plus-constant-depth-relief-v1'
                },
                pcf: {
                    hardwareComparison: 'linear-four-compare-taps-v1',
                    model: 'three-r183-vogel-5-linear-compare-v1',
                    radiusTexels: 1.5,
                    sampleCount: 5,
                    screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
                    shadowMapSizeTexels: [16384, 16384],
                    shadowMapWorldExtentMeters: [680, 680],
                    sourceMapRightAxisWorld: filterAxes.rightAxisWorld,
                    sourceMapUpAxisWorld: filterAxes.upAxisWorld
                }
            }
        },
        tiles: Array.from({ length: layerCount }, (_, index) => ({
            id: `tile.${index}.0`,
            coordinates: [index, 0],
            interiorBoundsLightMeters: {min: [2 * index, 0], max: [2 * (index + 1), 2]},
            storedTexels: [4, 4],
            contentSha256
        }))
    };
    return {
        descriptor,
        payload,
        options: {
            descriptor,
            payload,
            cityId: descriptor.identity.cityId,
            lightingProfileId: 'production.sun.v1',
            selectedCapabilityProfileId: 'development.static_sun_v1',
            source: {
                geometrySha256: '1'.repeat(64),
                resolvedSourceSha256: HASH_E,
                schema: 'production-static-sun-source-v1',
                usedMaterialsSha256: '2'.repeat(64)
            },
            compilerDescriptor,
            channelProfileSha256: HASH_F
        }
    };
}
