// Verifies authenticated static-sun windows coalesce atomically without staging copies.
// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJsonBytes } from '../../../../src/app/illumination/bake_source/CanonicalJson.js';
import {
    ILLUMINATION_MAX_CHUNK_BYTES,
    ILLUMINATION_MAX_PACKAGE_BYTES,
    buildIlluminationBinaryPackage,
    parseIlluminationBinaryPackage,
    rawSha256Hex
} from '../../../../src/app/illumination/package/index.js';
import {
    parseTransferredIlluminationBinaryPackage,
    transferIlluminationPackageOwnership
} from '../../../../src/app/illumination/package/IlluminationBinaryPackage.js';
import {
    createStableStaticSunDepthBasis,
    createThreeR183DirectionalShadowFilterAxes,
    partitionStaticSunDepthLayers
} from '../../../../src/app/illumination/static_sun_depth/index.js';
import {
    buildProductionStaticSunDepthChunkInputs
} from '../../../../tools/static_sun_depth/src/ProductionPackage.mjs';
import {
    copyIlluminationPackageResourceBytes,
    createIlluminationPackageChunkReader,
    createIlluminationPackageResourcePlan,
    decodeIlluminationPackageResource,
    hashIlluminationPackageResource,
    isTrustedIlluminationPackageSegmentedBytes
} from '../../../../src/graphics/illumination/runtime/IlluminationPackagePlan.js';
import {
    createIlluminationRuntime,
    markIlluminationPackageFetcherAsTransferOwned
} from '../../../../src/graphics/illumination/runtime/IlluminationRuntime.js';
import { STATIC_SUN_DEPTH_RUNTIME_DEFAULTS } from '../../../../src/graphics/illumination/static_sun_depth/StaticSunDepthRuntimeLimits.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_D = 'd'.repeat(64);
const HASH_E = 'e'.repeat(64);
const HASH_F = 'f'.repeat(64);
const CAPABILITIES = Object.freeze({
    fragment_highp_float: true,
    rg8_unorm: true,
    static_receiver_sampling_v1: true,
    texture_2d_array: true,
    webgl2: true
});

test('static-sun defaults admit 512 MiB packages with bounded residency and atomic replacement', () => {
    assert.deepEqual(STATIC_SUN_DEPTH_RUNTIME_DEFAULTS, {
        maximumPackageBytes: 512 * 1024 * 1024,
        memoryLimits: {
            cpuBytes: 512 * 1024 * 1024,
            gpuBytes: 512 * 1024 * 1024,
            peakCpuBytes: 1536 * 1024 * 1024,
            peakGpuBytes: 1024 * 1024 * 1024
        }
    });
});

async function makeDefinition(layerCount, mutateChunks = null, fixtureOptions = {}) {
    const compilerDescriptor = {
        backend: 'cycles_cpu',
        buildHash: 'multi-window-fixture',
        schema: 'production-static-sun-compiler-v1',
        version: '5.2.1 LTS'
    };
    const compilerSignatureSha256 = await rawSha256Hex(canonicalJsonBytes(compilerDescriptor));
    const storedTexels = fixtureOptions.storedTexels ?? 4;
    const guardTexels = fixtureOptions.guardTexels ?? 1;
    const maximumChunkBytes = fixtureOptions.maximumChunkBytes ?? 64;
    const layerByteLength = storedTexels * storedTexels * 2;
    const payload = new Uint8Array(layerByteLength * layerCount);
    for (let layer = 0; layer < layerCount; layer += 1) {
        payload.fill(240 - layer, layer * layerByteLength, (layer + 1) * layerByteLength);
    }
    const sunPointDirectionWorld = [0, 0, -1];
    const filterAxes = createThreeR183DirectionalShadowFilterAxes(sunPointDirectionWorld);
    const tiles = [];
    for (let index = 0; index < layerCount; index += 1) {
        tiles.push({
            id: `tile.${index}.0`,
            coordinates: [index, 0],
            interiorBoundsLightMeters: {min: [2 * index, 0], max: [2 * (index + 1), 2]},
            storedTexels: [storedTexels, storedTexels],
            contentSha256: await rawSha256Hex(
                payload.subarray(index * layerByteLength, (index + 1) * layerByteLength)
            )
        });
    }
    const descriptor = {
        schema: 'static-sun-depth-tile-set-v1',
        identity: {
            channelId: 'static_sun_depth', channelVersion: 1, cityId: 'window.city',
            casterInventorySha256: HASH_A, channelSourceSha256: HASH_B,
            compilerSignatureSha256, sunPointDirectionWorld,
            basis: createStableStaticSunDepthBasis(sunPointDirectionWorld),
            layout: {
                order: 'row-major-y-then-x-v1', lookup: 'half-open-min-inclusive-max-exclusive-v1',
                rowOrigin: 'min-light-y-v1', guardPolicy: 'copy-adjacent-clamp-exterior-v1',
                tileCount: [layerCount, 1], interiorTexels: [2, 2], guardTexels,
                texelSizeMeters: 1, boundsLightMeters: {min: [0, 0], max: [2 * layerCount, 2]}
            },
            alpha: {
                model: 'evaluated-runtime-coverage-v1',
                coverage: 'opacity-times-vertex-alpha-times-map-a-times-alpha-map-g-v1',
                threshold: 'discard-when-coverage-lt-alpha-test-v1',
                sidedness: 'material-side-and-shadow-side-v1', forcedOpaque: 'shadow-as-opaque-v1',
                semanticsSha256: HASH_D
            },
            encoding: {
                id: 'rg8-packed-linear-depth-v1', quantization: 'linear-endpoints-inclusive-v1',
                redChannel: 'quantized-high-byte-v1', greenChannel: 'quantized-low-byte-v1',
                minDepthMeters: 0, maxDepthMeters: 10, maxQuantized: 65534, emptyQuantized: 65535
            },
            sampling: {
                comparison: 'receiver-depth-minus-bias-lte-caster-depth-v1', emptyPolicy: 'visible-v1',
                outOfBoundsPolicy: 'fail-closed-zero-visibility-v1',
                bias: {constantDepthReliefMeters: 0.0697915, geometricNormalOffsetMeters: 0.0232, model: 'geometric-normal-offset-plus-constant-depth-relief-v1'},
                pcf: {
                    hardwareComparison: 'linear-four-compare-taps-v1', model: 'three-r183-vogel-5-linear-compare-v1',
                    radiusTexels: 1.5, sampleCount: 5,
                    screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
                    shadowMapSizeTexels: [16384, 16384], shadowMapWorldExtentMeters: [680, 680],
                    sourceMapRightAxisWorld: filterAxes.rightAxisWorld, sourceMapUpAxisWorld: filterAxes.upAxisWorld
                }
            }
        },
        tiles
    };
    const dimensions = {
        components: 2,
        depth: layerCount,
        height: storedTexels,
        width: storedTexels
    };
    let chunks = await buildProductionStaticSunDepthChunkInputs(
        descriptor,
        payload,
        dimensions,
        maximumChunkBytes
    );
    if (mutateChunks) {
        chunks = structuredClone(chunks);
        mutateChunks(chunks);
    }
    const options = {
        cityId: descriptor.identity.cityId,
        lightingProfileId: 'window.sun.v1',
        selectedCapabilityProfileId: 'development.static_sun_v1',
        source: {resolvedSourceSha256: HASH_E},
        compilerDescriptor,
        channels: [{
            id: 'static_sun_depth', required: true,
            sourceSha256: HASH_B, profileSha256: HASH_F, schemaVersion: 1
        }],
        chunks
    };
    return {descriptor, dimensions, options, payload};
}

async function buildFixture(layerCount, mutateChunks = null, fixtureOptions = {}) {
    const definition = await makeDefinition(layerCount, mutateChunks, fixtureOptions);
    return {...definition, built: await buildIlluminationBinaryPackage(definition.options)};
}

function requestFor(fixture) {
    return {
        url: 'fixture.ilpkg',
        expectations: {
            cityId: fixture.options.cityId,
            lightingProfileId: fixture.options.lightingProfileId,
            selectedCapabilityProfileId: fixture.options.selectedCapabilityProfileId,
            resolvedSourceSha256: fixture.options.source.resolvedSourceSha256
        }
    };
}

function transferredFetcher(values) {
    let index = 0;
    const fetchPackage = async () => values[Math.min(index++, values.length - 1)].slice();
    return markIlluminationPackageFetcherAsTransferOwned(fetchPackage);
}

test('legacy single-chunk arrays retain the exact direct runtime resource contract', async () => {
    const fixture = await buildFixture(1);
    let createCount = 0;
    let finalPixels = null;
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        capabilities: CAPABILITIES,
        fetchPackage: transferredFetcher([fixture.built.bytes]),
        residentCpuPolicy: 'retain',
        createResource(decoded, descriptor) {
            createCount += 1;
            assert.equal(descriptor.id, 'static_sun_depth.tiles.rg8');
            assert.equal(descriptor.sourceChunks, undefined);
            assert.equal(descriptor.coordinateTransform.schema, 'static-sun-depth-tile-set-v1');
            assert.equal(decoded instanceof Uint8Array, true);
            finalPixels = copyIlluminationPackageResourceBytes(decoded);
            return {
                resource: { pixels: finalPixels },
                cpuBytes: finalPixels.byteLength,
                gpuBytes: finalPixels.byteLength,
                dispose() {}
            };
        }
    });
    await runtime.load(requestFor(fixture));
    assert.equal(runtime.getSnapshot().phase, 'ready_to_commit');
    assert.equal(createCount, 1);
    assert.deepEqual(finalPixels, fixture.payload);
    runtime.commitFrameBoundary();
    assert.equal(runtime.getSnapshot().effectiveMode, 'baked');
    await runtime.teardown();
});

test('three/four authenticated windows resolve to one complete logical texture array', async () => {
    for (const [layerCount, expectedChunkCount] of [[5, 3], [7, 4]]) {
        const fixture = await buildFixture(layerCount);
        const parsed = await parseIlluminationBinaryPackage(fixture.built.bytes, {
            runtimeCapabilities: Object.keys(CAPABILITIES)
        });
        const plan = createIlluminationPackageResourcePlan(parsed, {residentCpuPolicy: 'retain'});
        assert.equal(parsed.chunks.length, expectedChunkCount);
        assert.equal(plan.resources.length, 1);
        assert.equal(plan.resources[0].id, 'static_sun_depth.tiles.rg8');
        assert.equal(plan.resources[0].upload.layers, layerCount);
        assert.equal(plan.resources[0].sourceChunks.length, expectedChunkCount);
        assert.equal(plan.resources[0].byteLength, fixture.payload.byteLength);
        const reader = createIlluminationPackageChunkReader(parsed);
        const fetched = reader.fetchResource(plan.resources[0]);
        assert.ok(fetched instanceof Uint8Array);
        assert.deepEqual(fetched, fixture.payload);
        const decoded = decodeIlluminationPackageResource(fetched, plan.resources[0]);
        assert.notStrictEqual(decoded.decoded, fetched);
        reader.dispose();
    }
});

test('transferred four-window runtime performs one final allocation/upload and retains it atomically', async () => {
    const fixture = await buildFixture(7);
    let createCount = 0;
    let decodedIdentity = null;
    let finalPixels = null;
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        capabilities: CAPABILITIES,
        fetchPackage: transferredFetcher([fixture.built.bytes]),
        residentCpuPolicy: 'retain',
        maximumPackageBytes: ILLUMINATION_MAX_PACKAGE_BYTES,
        memoryLimits: STATIC_SUN_DEPTH_RUNTIME_DEFAULTS.memoryLimits,
        createResource(decoded, descriptor) {
            createCount += 1;
            decodedIdentity = decoded;
            assert.equal(descriptor.upload.layers, 7);
            assert.deepEqual(decoded, fixture.payload);
            finalPixels = copyIlluminationPackageResourceBytes(decoded);
            return {resource: {pixels: finalPixels}, cpuBytes: finalPixels.byteLength, gpuBytes: finalPixels.byteLength, dispose() {}};
        }
    });
    await runtime.load(requestFor(fixture));
    assert.equal(createCount, 1, JSON.stringify(runtime.getSnapshot()));
    assert.equal(runtime.getSnapshot().phase, 'ready_to_commit');
    runtime.commitFrameBoundary();
    assert.equal(runtime.getSnapshot().effectiveMode, 'baked');
    assert.equal(decodedIdentity.byteLength, fixture.payload.byteLength);
    assert.notStrictEqual(finalPixels, decodedIdentity);
    assert.deepEqual(finalPixels, fixture.payload);
    await runtime.teardown();
});

test('transferred windows sharing one package buffer preserve aligned gaps without staging copies', async () => {
    const fixture = await buildFixture(3, null, {
        guardTexels: 2,
        maximumChunkBytes: 72,
        storedTexels: 6
    });
    const lease = transferIlluminationPackageOwnership(fixture.built.bytes.slice());
    const parsed = await parseTransferredIlluminationBinaryPackage(lease, {
        runtimeCapabilities: Object.keys(CAPABILITIES)
    });
    assert.equal(parsed.chunks.length, 3);
    assert.ok(parsed.chunks.every((entry) => entry.data.buffer === parsed.chunks[0].data.buffer));
    assert.ok(
        parsed.chunks[1].data.byteOffset
            > parsed.chunks[0].data.byteOffset + parsed.chunks[0].data.byteLength
    );
    const plan = createIlluminationPackageResourcePlan(parsed, { residentCpuPolicy: 'retain' });
    const reader = createIlluminationPackageChunkReader(parsed);
    const fetched = reader.fetchResource(plan.resources[0]);
    assert.equal(fetched.cpuBytes, 0);
    assert.equal(fetched.ownership, 'borrowed-verified-package-segments-v1');
    assert.equal(isTrustedIlluminationPackageSegmentedBytes(fetched.bytes), true);
    assert.deepEqual(fetched.bytes.segments.map((segment) => segment.byteLength), [72, 72, 72]);
    assert.equal(
        await hashIlluminationPackageResource(fetched.bytes),
        plan.resources[0].sha256
    );
    const decoded = decodeIlluminationPackageResource(fetched.bytes, plan.resources[0]);
    assert.strictEqual(decoded.decoded, fetched.bytes);
    assert.equal(decoded.cpuBytes, 0);
    reader.dispose();

    let createCount = 0;
    let finalPixels = null;
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        capabilities: CAPABILITIES,
        fetchPackage: transferredFetcher([fixture.built.bytes]),
        residentCpuPolicy: 'retain',
        createResource(value) {
            createCount += 1;
            assert.equal(isTrustedIlluminationPackageSegmentedBytes(value), true);
            finalPixels = copyIlluminationPackageResourceBytes(value);
            return {
                resource: { pixels: finalPixels },
                cpuBytes: finalPixels.byteLength,
                gpuBytes: finalPixels.byteLength,
                dispose() {}
            };
        }
    });
    await runtime.load(requestFor(fixture));
    assert.equal(runtime.getSnapshot().phase, 'ready_to_commit');
    assert.equal(createCount, 1);
    assert.deepEqual(finalPixels, fixture.payload);
    runtime.commitFrameBoundary();
    assert.equal(runtime.getSnapshot().effectiveMode, 'baked');
    await runtime.teardown();
});

test('window plans reject reorder, gap, overlap, missing coverage, descriptor drift, and dimension drift', async () => {
    const cases = [
        ['reorder', (chunks) => {
            [chunks[0].coordinateTransform, chunks[1].coordinateTransform]
                = [chunks[1].coordinateTransform, chunks[0].coordinateTransform];
        }],
        ['gap', (chunks) => { chunks[1].coordinateTransform.firstLayer = 3; }],
        ['overlap', (chunks) => { chunks[1].coordinateTransform.firstLayer = 1; }],
        ['missing', (chunks) => { chunks.pop(); }],
        ['descriptor', (chunks) => {
            chunks[1].coordinateTransform.outputDescriptor.identity.cityId = 'other.city';
        }],
        ['dimensions', (chunks) => {
            chunks[1].dimensions.width = 2;
            chunks[1].dimensions.height = 8;
        }]
    ];
    for (const [name, mutate] of cases) {
        const fixture = await buildFixture(5, mutate);
        const parsed = await parseIlluminationBinaryPackage(fixture.built.bytes, {
            runtimeCapabilities: Object.keys(CAPABILITIES)
        });
        assert.throws(
            () => createIlluminationPackageResourcePlan(parsed),
            /layer-window|gap|overlap|reorder|cover|dimensions|inconsistent|chunk ID/i,
            name
        );
    }
});

test('duplicate canonical window IDs fail at the AI 530 package boundary', async () => {
    const definition = await makeDefinition(5, (chunks) => {
        chunks[1].id = chunks[0].id;
    });
    await assert.rejects(
        () => buildIlluminationBinaryPackage(definition.options),
        (error) => error.code === 'build_chunk_id_duplicate'
    );
});

test('assembled-hash tamper never exposes a partial replacement over the active set', async () => {
    const good = await buildFixture(7);
    const bad = await buildFixture(7, (chunks) => {
        for (const chunk of chunks) chunk.coordinateTransform.assembledSha256 = '0'.repeat(64);
    });
    let createCount = 0;
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        capabilities: CAPABILITIES,
        fetchPackage: transferredFetcher([good.built.bytes, bad.built.bytes]),
        residentCpuPolicy: 'retain',
        createResource(decoded) {
            createCount += 1;
            const pixels = decoded.slice();
            return {resource: {pixels}, cpuBytes: pixels.byteLength, gpuBytes: pixels.byteLength, dispose() {}};
        }
    });
    await runtime.load(requestFor(good));
    runtime.commitFrameBoundary();
    const active = runtime.getActiveResourceSet();
    assert.ok(active, JSON.stringify(runtime.getSnapshot()));
    assert.equal(createCount, 1);

    await runtime.load(requestFor(bad));
    assert.equal(createCount, 1);
    assert.strictEqual(runtime.getActiveResourceSet(), active);
    assert.equal(runtime.getSnapshot().effectiveMode, 'baked');
    assert.equal(runtime.getSnapshot().failureCode, 'resource_hash_mismatch');
    await runtime.teardown();
});

test('package, layer, and resident-memory limits fail closed before resource creation', async () => {
    const admittedAboveSingleChunk = partitionStaticSunDepthLayers(1024 * 1024, 65);
    assert.deepEqual(
        admittedAboveSingleChunk.map((window) => window.layerCount),
        [64, 1]
    );
    assert.throws(
        () => partitionStaticSunDepthLayers(ILLUMINATION_MAX_CHUNK_BYTES + 1, 1),
        /layer exceeds/
    );
    assert.throws(
        () => partitionStaticSunDepthLayers(ILLUMINATION_MAX_CHUNK_BYTES, 9),
        /package limit/
    );

    const fixture = await buildFixture(5);
    let createCount = 0;
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        capabilities: CAPABILITIES,
        fetchPackage: transferredFetcher([fixture.built.bytes]),
        residentCpuPolicy: 'retain',
        memoryLimits: {cpuBytes: fixture.payload.byteLength - 1, peakCpuBytes: ILLUMINATION_MAX_PACKAGE_BYTES},
        createResource() {
            createCount += 1;
            throw new Error('must not create an over-budget array');
        }
    });
    await runtime.load(requestFor(fixture));
    assert.equal(createCount, 0);
    assert.equal(runtime.getSnapshot().failureCode, 'unsupported_memory_budget');
    assert.equal(runtime.getSnapshot().capabilityCode, 'memory_budget');
    await runtime.teardown();
});
