// Verifies package validation, staged upload, and mode control compose without a mixed frame.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ILLUMINATION_AGGREGATE_HASH_OFFSET,
    ILLUMINATION_HEADER_OFFSETS
} from '../../../../src/app/illumination/package/index.js';
import { rawSha256Hex, sha256HexToBytes } from '../../../../src/app/illumination/package/RawSha256.js';
import { createIlluminationRuntime } from '../../../../src/graphics/illumination/runtime/IlluminationRuntime.js';
import { baseBuildOptions, buildPackageFixture } from '../illumination_package/package_fixture.js';

function fixtureRuntime(packageBytes, overrides = {}) {
    const commits = [];
    const disposals = [];
    let fetchCount = 0;
    const runtime = createIlluminationRuntime({
        initialMode: overrides.initialMode ?? 'current',
        cacheInactiveResources: overrides.cacheInactiveResources,
        capabilities: overrides.capabilities ?? {},
        fetchPackage: overrides.fetchPackage ?? (async () => {
            fetchCount += 1;
            return packageBytes;
        }),
        createResource(decoded, descriptor) {
            const resource = Object.freeze({ id: descriptor.id });
            return {
                resource,
                cpuBytes: 0,
                gpuBytes: decoded.byteLength,
                dispose: () => disposals.push(descriptor.id)
            };
        },
        commitSnapshot(snapshot) {
            commits.push(snapshot);
            return true;
        }
    });
    return { runtime, commits, disposals, getFetchCount: () => fetchCount };
}

function requestFor(built, expectationOverrides = {}) {
    return {
        url: 'fixture.ilpkg',
        expectations: {
            cityId: built.manifest.cityId,
            lightingProfileId: built.manifest.lightingProfileId,
            selectedCapabilityProfileId: built.manifest.selectedCapabilityProfileId,
            resolvedSourceSha256: built.manifest.source.resolvedSourceSha256,
            ...expectationOverrides
        }
    };
}

async function resealUnsupportedResourceType(packageBytes) {
    const unsupported = packageBytes.slice();
    const view = new DataView(unsupported.buffer, unsupported.byteOffset, unsupported.byteLength);
    const tableOffset = view.getUint32(ILLUMINATION_HEADER_OFFSETS.tableOffset, true);
    const tableLength = view.getUint32(ILLUMINATION_HEADER_OFFSETS.tableLength, true);
    const tableBytes = unsupported.subarray(tableOffset, tableOffset + tableLength);
    const tableText = new TextDecoder().decode(tableBytes);
    const replacedText = tableText.replace('"resourceType":"texture_2d"', '"resourceType":"texture_xd"');
    assert.notEqual(replacedText, tableText);
    const replacedBytes = new TextEncoder().encode(replacedText);
    assert.equal(replacedBytes.byteLength, tableBytes.byteLength);
    tableBytes.set(replacedBytes);
    unsupported.set(
        sha256HexToBytes(await rawSha256Hex(tableBytes)),
        ILLUMINATION_HEADER_OFFSETS.tableSha256
    );
    const aggregateInput = unsupported.slice();
    aggregateInput.fill(0, ILLUMINATION_AGGREGATE_HASH_OFFSET, ILLUMINATION_AGGREGATE_HASH_OFFSET + 32);
    const aggregateSha256 = await rawSha256Hex(aggregateInput);
    unsupported.set(sha256HexToBytes(aggregateSha256), ILLUMINATION_AGGREGATE_HASH_OFFSET);
    return Object.freeze({ bytes: unsupported, aggregateSha256 });
}

test('current mode never fetches and a baked set activates only at one explicit frame boundary', async () => {
    const built = await buildPackageFixture();
    const callerPackageSnapshot = built.bytes.slice();
    const callerBackingByteLength = built.bytes.buffer.byteLength;
    const fixture = fixtureRuntime(built.bytes);
    await fixture.runtime.load({ url: 'fixture.ilpkg' });
    assert.equal(fixture.getFetchCount(), 0);
    assert.equal(fixture.runtime.getSnapshot().effectiveMode, 'current');

    await fixture.runtime.setMode('auto', requestFor(built));
    assert.equal(built.bytes.buffer.byteLength, callerBackingByteLength);
    assert.deepEqual(built.bytes, callerPackageSnapshot);
    assert.equal(fixture.getFetchCount(), 1);
    assert.equal(fixture.runtime.getSnapshot().state, 'loading');
    assert.equal(fixture.runtime.getSnapshot().phase, 'ready_to_commit');
    assert.equal(fixture.runtime.getSnapshot().effectiveMode, 'current');
    assert.equal(fixture.commits.length, 0);

    fixture.runtime.commitFrameBoundary();
    assert.equal(fixture.runtime.getSnapshot().state, 'active');
    assert.equal(fixture.runtime.getSnapshot().effectiveMode, 'baked');
    assert.equal(fixture.commits.length, 1);
    assert.equal(fixture.commits[0].mode, 'baked');
    assert.equal(fixture.commits[0].resources.resources.length, 2);
    assert.ok(fixture.runtime.getSnapshot().memory.peakCpuBytes >= built.bytes.byteLength + built.metrics.decodedByteLength);

    await fixture.runtime.setMode('current');
    assert.equal(fixture.runtime.getSnapshot().effectiveMode, 'baked');
    fixture.runtime.commitFrameBoundary();
    await fixture.runtime.waitForIdle();
    assert.equal(fixture.runtime.getSnapshot().effectiveMode, 'current');
    assert.equal(fixture.commits.at(-1).mode, 'current');
    assert.deepEqual(fixture.disposals.sort(), ['direct.rgba32f', 'mapping.ids']);
    await fixture.runtime.teardown();
});

test('capability inventories reject ambiguous strings and non-boolean maps', () => {
    const createResource = () => ({ resource: {}, cpuBytes: 0, gpuBytes: 0, dispose() {} });
    assert.throws(
        () => createIlluminationRuntime({ createResource, capabilities: 'webgl2' }),
        /boolean map or an iterable/
    );
    assert.throws(
        () => createIlluminationRuntime({ createResource, capabilities: { webgl2: 1 } }),
        /boolean values/
    );
});

test('wrong identity becomes stale then a stable current-engine fallback without upload', async () => {
    const built = await buildPackageFixture();
    let creates = 0;
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        fetchPackage: async () => built.bytes,
        createResource() {
            creates += 1;
            throw new Error('must not upload');
        }
    });
    await runtime.load(requestFor(built, { cityId: 'other.city' }));
    assert.equal(runtime.getSnapshot().state, 'stale');
    assert.equal(runtime.getSnapshot().reason, 'city_mismatch');
    assert.equal(runtime.getSnapshot().effectiveMode, 'current');
    assert.equal(creates, 0);
    runtime.commitFrameBoundary();
    assert.equal(runtime.getSnapshot().state, 'fallback');
    assert.equal(runtime.getSnapshot().causeState, 'stale');
    assert.equal(runtime.getSnapshot().reason, 'city_mismatch');
    await runtime.teardown();
});

test('corruption maps to failed integrity and keeps current lighting active', async () => {
    const built = await buildPackageFixture();
    const corrupt = built.bytes.slice();
    corrupt[corrupt.length - 1] ^= 1;
    const runtime = createIlluminationRuntime({
        initialMode: 'auto',
        fetchPackage: async () => corrupt,
        createResource() {
            throw new Error('must not upload corrupt bytes');
        }
    });
    await runtime.load({ ...requestFor(built), url: 'corrupt.ilpkg' });
    assert.equal(runtime.getSnapshot().state, 'failed');
    assert.equal(runtime.getSnapshot().reason, 'integrity_failure');
    assert.equal(runtime.getSnapshot().failureCode, 'chunk_padding_nonzero');
    assert.equal(runtime.getSnapshot().retryTrigger, 'payload_change');
    assert.equal(runtime.getSnapshot().effectiveMode, 'current');
    runtime.commitFrameBoundary();
    assert.equal(runtime.getSnapshot().state, 'fallback');
    assert.equal(runtime.getSnapshot().causeState, 'failed');
    await runtime.teardown();
});

test('an oversized package is rejected before parsing or upload with a precise code', async () => {
    const built = await buildPackageFixture();
    let creates = 0;
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        maximumPackageBytes: built.bytes.byteLength - 1,
        fetchPackage: async () => built.bytes,
        createResource() {
            creates += 1;
            throw new Error('must not upload oversized package');
        }
    });
    await runtime.load(requestFor(built));
    assert.equal(runtime.getSnapshot().state, 'failed');
    assert.equal(runtime.getSnapshot().reason, 'validation_failure');
    assert.equal(runtime.getSnapshot().failureCode, 'package_size_exceeded');
    assert.equal(creates, 0);
    await runtime.teardown();
});

test('the package trust-boundary working set is rejected before parsing or upload', async () => {
    const built = await buildPackageFixture();
    let creates = 0;
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        memoryLimits: { peakCpuBytes: built.bytes.byteLength * 3 - 1 },
        fetchPackage: async () => built.bytes,
        createResource() {
            creates += 1;
            throw new Error('must not upload a package above the CPU working-set limit');
        }
    });
    await runtime.load(requestFor(built));
    const snapshot = runtime.getSnapshot();
    assert.equal(snapshot.state, 'unavailable');
    assert.equal(snapshot.reason, 'unsupported_capability');
    assert.equal(snapshot.failureCode, 'package_working_set_exceeded');
    assert.equal(snapshot.capabilityCode, 'memory_budget');
    assert.equal(creates, 0);
    await runtime.teardown();
});

test('the package trust-boundary budget counts an oversized backing buffer behind a narrow view', async () => {
    const built = await buildPackageFixture();
    const paddingBytes = 256;
    const backing = new Uint8Array(built.bytes.byteLength + paddingBytes);
    const packageView = backing.subarray(paddingBytes / 2, paddingBytes / 2 + built.bytes.byteLength);
    packageView.set(built.bytes);
    let creates = 0;
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        memoryLimits: { peakCpuBytes: built.bytes.byteLength * 3 + 1 },
        fetchPackage: async () => packageView,
        createResource() {
            creates += 1;
            throw new Error('must not upload a narrow view with an over-budget backing buffer');
        }
    });

    await runtime.load(requestFor(built));
    assert.equal(runtime.getSnapshot().state, 'unavailable');
    assert.equal(runtime.getSnapshot().failureCode, 'package_working_set_exceeded');
    assert.equal(runtime.getSnapshot().capabilityCode, 'memory_budget');
    assert.equal(creates, 0);
    await runtime.teardown();
});

test('the default browser fetch consumes a declared-length body without manual streaming', async () => {
    const built = await buildPackageFixture();
    const originalFetch = globalThis.fetch;
    let arrayBufferCalls = 0;
    let creates = 0;
    globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        headers: { get: (name) => name === 'content-length' ? String(built.bytes.byteLength) : null },
        body: null,
        async arrayBuffer() {
            arrayBufferCalls += 1;
            return built.bytes.slice().buffer;
        }
    });
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        createResource(decoded, descriptor) {
            creates += 1;
            return {
                resource: {id: descriptor.id},
                cpuBytes: 0,
                gpuBytes: decoded.byteLength,
                dispose() {}
            };
        }
    });
    try {
        await runtime.load(requestFor(built));
        assert.equal(runtime.getSnapshot().phase, 'ready_to_commit');
        runtime.commitFrameBoundary();
        assert.equal(runtime.getSnapshot().state, 'active');
        assert.equal(arrayBufferCalls, 1);
        assert.equal(creates, 2);
    } finally {
        await runtime.teardown();
        globalThis.fetch = originalFetch;
    }
});

test('the default browser fetch still requires a bounded stream without a declared length', async () => {
    const built = await buildPackageFixture();
    const originalFetch = globalThis.fetch;
    let arrayBufferCalls = 0;
    globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        headers: {get: () => null},
        body: null,
        async arrayBuffer() {
            arrayBufferCalls += 1;
            return built.bytes.slice().buffer;
        }
    });
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        createResource() {
            throw new Error('must not upload an unbounded package response');
        }
    });
    try {
        await runtime.load(requestFor(built));
        assert.equal(runtime.getSnapshot().failureCode, 'package_streaming_unavailable');
        assert.equal(arrayBufferCalls, 0);
    } finally {
        await runtime.teardown();
        globalThis.fetch = originalFetch;
    }
});

test('a completed browser package fetch detaches from later profile cancellation', async () => {
    const built = await buildPackageFixture();
    const originalFetch = globalThis.fetch;
    const fetchSignals = [];
    globalThis.fetch = async (_url, options) => {
        fetchSignals.push(options.signal);
        return new Response(built.bytes, {
            headers: {'content-length': String(built.bytes.byteLength)}
        });
    };
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        createResource(decoded, descriptor) {
            return {
                resource: Object.freeze({id: descriptor.id}),
                cpuBytes: 0,
                gpuBytes: decoded.byteLength,
                dispose() {}
            };
        }
    });
    try {
        await runtime.load(requestFor(built));
        runtime.commitFrameBoundary();
        await runtime.load(requestFor(built));
        assert.equal(fetchSignals.length, 2);
        assert.equal(fetchSignals[0].aborted, false);
    } finally {
        await runtime.teardown();
        globalThis.fetch = originalFetch;
    }
});

test('replacement staging budgets include the currently active baked resource set', async () => {
    const built = await buildPackageFixture();
    let creates = 0;
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        memoryLimits: { peakGpuBytes: 40 },
        fetchPackage: async () => built.bytes,
        createResource(decoded, descriptor) {
            creates += 1;
            return {
                resource: Object.freeze({ id: descriptor.id }),
                cpuBytes: 0,
                gpuBytes: decoded.byteLength,
                dispose() {}
            };
        }
    });

    await runtime.load(requestFor(built));
    runtime.commitFrameBoundary();
    assert.equal(runtime.getSnapshot().effectiveMode, 'baked');
    assert.equal(creates, 2);

    await runtime.load(requestFor(built));
    const beforeBoundary = runtime.getSnapshot();
    assert.equal(beforeBoundary.effectiveMode, 'baked');
    assert.equal(beforeBoundary.causeState, 'unavailable');
    assert.equal(beforeBoundary.reason, 'unsupported_capability');
    assert.equal(beforeBoundary.failureCode, 'unsupported_memory_budget');
    assert.equal(beforeBoundary.capabilityCode, 'memory_budget');
    assert.equal(creates, 2);

    runtime.commitFrameBoundary();
    assert.equal(runtime.getSnapshot().state, 'fallback');
    assert.equal(runtime.getSnapshot().effectiveMode, 'current');
    await runtime.teardown();
});

test('overlapping superseded staging reserves its full plan until partial allocations unwind', async () => {
    const built = await buildPackageFixture();
    let releaseSecondUpload;
    const secondUploadGate = new Promise((resolve) => {
        releaseSecondUpload = resolve;
    });
    let reportSecondUpload;
    const secondUploadStarted = new Promise((resolve) => {
        reportSecondUpload = resolve;
    });
    let createCount = 0;
    let allocatedGpuBytes = 0;
    let peakAllocatedGpuBytes = 0;
    const disposalReasons = [];
    const runtime = createIlluminationRuntime({
        initialMode: 'auto',
        memoryLimits: { peakGpuBytes: 40 },
        fetchPackage: async () => built.bytes,
        async createResource(decoded, descriptor) {
            createCount += 1;
            allocatedGpuBytes += decoded.byteLength;
            peakAllocatedGpuBytes = Math.max(peakAllocatedGpuBytes, allocatedGpuBytes);
            if (createCount === 2) {
                reportSecondUpload();
                await secondUploadGate;
            }
            let disposed = false;
            return {
                resource: Object.freeze({ id: descriptor.id }),
                cpuBytes: 0,
                gpuBytes: decoded.byteLength,
                dispose(reason) {
                    if (disposed) return;
                    disposed = true;
                    disposalReasons.push(reason);
                    allocatedGpuBytes -= decoded.byteLength;
                }
            };
        }
    });

    const firstLoad = runtime.load(requestFor(built));
    await secondUploadStarted;
    const replacement = await runtime.load(requestFor(built));
    assert.equal(replacement.state, 'unavailable');
    assert.equal(replacement.reason, 'unsupported_capability');
    assert.equal(replacement.failureCode, 'unsupported_memory_budget');
    assert.equal(replacement.capabilityCode, 'memory_budget');
    assert.equal(createCount, 2);
    assert.equal(peakAllocatedGpuBytes, 28);

    releaseSecondUpload();
    await firstLoad;
    await runtime.waitForIdle();
    assert.equal(allocatedGpuBytes, 0);
    assert.deepEqual(disposalReasons, ['superseded', 'superseded']);
    await runtime.teardown();
});

test('unsupported package capabilities retain the capability code and candidate identity', async () => {
    const base = baseBuildOptions();
    const built = await buildPackageFixture({
        chunks: base.chunks.map((chunk) => chunk.id === 'direct.rgba32f'
            ? { ...chunk, requiredRuntimeCapabilities: ['fixture_float_upload_v1'] }
            : chunk)
    });
    const runtime = createIlluminationRuntime({
        initialMode: 'auto',
        capabilities: {},
        fetchPackage: async () => built.bytes,
        createResource() {
            throw new Error('must not upload an unsupported package');
        }
    });
    await runtime.load(requestFor(built));
    const snapshot = runtime.getSnapshot();
    assert.equal(snapshot.state, 'unavailable');
    assert.equal(snapshot.reason, 'unsupported_capability');
    assert.equal(snapshot.failureCode, 'package_incompatible');
    assert.equal(snapshot.capabilityCode, 'fixture_float_upload_v1');
    assert.equal(snapshot.retryTrigger, 'context_change');
    const candidate = runtime.getDiagnostics().package;
    assert.equal(candidate.aggregateSha256, built.aggregateSha256);
    assert.equal(candidate.cityId, built.manifest.cityId);
    assert.deepEqual(candidate.selectedChunkIds, ['mapping.ids']);
    await runtime.teardown();
});

test('unsupported package formats retain a deterministic capability code and never upload', async () => {
    const built = await buildPackageFixture();
    const unsupported = await resealUnsupportedResourceType(built.bytes);
    let creates = 0;
    const runtime = createIlluminationRuntime({
        initialMode: 'auto',
        fetchPackage: async () => unsupported.bytes,
        createResource() {
            creates += 1;
            throw new Error('must not upload an unsupported resource format');
        }
    });
    await runtime.load(requestFor(built));
    let snapshot = runtime.getSnapshot();
    assert.equal(snapshot.state, 'unavailable');
    assert.equal(snapshot.phase, 'disposed');
    assert.equal(snapshot.reason, 'unsupported_capability');
    assert.equal(snapshot.failureCode, 'package_incompatible');
    assert.equal(snapshot.capabilityCode, 'resource_format:texture_xd:rgba32f_le');
    assert.equal(snapshot.retryTrigger, 'context_change');
    assert.equal(snapshot.effectiveMode, 'current');
    assert.equal(creates, 0);
    const candidate = runtime.getDiagnostics().package;
    assert.equal(candidate.aggregateSha256, unsupported.aggregateSha256);
    assert.equal(candidate.cityId, built.manifest.cityId);
    assert.deepEqual(candidate.selectedChunkIds, ['mapping.ids']);

    runtime.commitFrameBoundary();
    snapshot = runtime.getSnapshot();
    assert.equal(snapshot.state, 'fallback');
    assert.equal(snapshot.causeState, 'unavailable');
    assert.equal(snapshot.reason, 'unsupported_capability');
    assert.equal(snapshot.capabilityCode, 'resource_format:texture_xd:rgba32f_le');
    assert.equal(snapshot.effectiveMode, 'current');
    await runtime.teardown();
});

test('renderer plan preflight rejects device limits before decode or resource creation', async () => {
    const built = await buildPackageFixture();
    let creates = 0;
    const createResource = () => {
        creates += 1;
        throw new Error('must not create a resource after failed preflight');
    };
    createResource.validatePlan = () => {
        throw new RangeError('texture width exceeds MAX_TEXTURE_SIZE');
    };
    const runtime = createIlluminationRuntime({
        initialMode: 'baked',
        fetchPackage: async () => built.bytes,
        createResource
    });
    await runtime.load(requestFor(built));
    const snapshot = runtime.getSnapshot();
    assert.equal(snapshot.state, 'unavailable');
    assert.equal(snapshot.reason, 'unsupported_capability');
    assert.equal(snapshot.failureCode, 'resource_plan_unsupported');
    assert.equal(snapshot.capabilityCode, 'webgl2_resource_plan');
    assert.equal(creates, 0);
    await runtime.teardown();
});

test('package-facade cancellation keeps current active and never uploads late bytes', async () => {
    const built = await buildPackageFixture();
    let resolveFetch;
    const pendingBytes = new Promise((resolve) => {
        resolveFetch = resolve;
    });
    let creates = 0;
    const runtime = createIlluminationRuntime({
        initialMode: 'auto',
        fetchPackage: async () => pendingBytes,
        createResource() {
            creates += 1;
            throw new Error('must not upload a cancelled package');
        }
    });
    const loading = runtime.load(requestFor(built));
    await Promise.resolve();
    assert.equal(runtime.cancel(), true);
    resolveFetch(built.bytes);
    await loading;
    await runtime.waitForIdle();
    assert.equal(creates, 0);
    assert.equal(runtime.getSnapshot().state, 'fallback');
    assert.equal(runtime.getSnapshot().reason, 'cancelled');
    assert.equal(runtime.getSnapshot().effectiveMode, 'current');
    await runtime.teardown();
});

test('repeated package-facade activation and deactivation disposes every WebGL owner once per cycle', async () => {
    const built = await buildPackageFixture();
    const fixture = fixtureRuntime(built.bytes, { initialMode: 'auto' });
    for (let cycle = 0; cycle < 2; cycle += 1) {
        await fixture.runtime.setMode('auto', requestFor(built));
        fixture.runtime.commitFrameBoundary();
        assert.equal(fixture.runtime.getSnapshot().effectiveMode, 'baked');
        await fixture.runtime.setMode('current');
        fixture.runtime.commitFrameBoundary();
        await fixture.runtime.waitForIdle();
        assert.equal(fixture.runtime.getSnapshot().effectiveMode, 'current');
    }
    assert.equal(fixture.getFetchCount(), 2);
    assert.deepEqual(fixture.disposals.sort(), [
        'direct.rgba32f',
        'direct.rgba32f',
        'mapping.ids',
        'mapping.ids'
    ]);
    await fixture.runtime.teardown();
});

test('package facade keeps an opt-in inactive publication resident and reuses it without fetch or upload', async () => {
    const built = await buildPackageFixture();
    const fixture = fixtureRuntime(built.bytes, {
        initialMode: 'auto',
        cacheInactiveResources: true
    });
    const request = requestFor(built);
    await fixture.runtime.setMode('auto', request);
    fixture.runtime.commitFrameBoundary();
    assert.equal(fixture.getFetchCount(), 1);

    await fixture.runtime.setMode('current');
    fixture.runtime.commitFrameBoundary();
    await fixture.runtime.waitForIdle();
    assert.equal(fixture.runtime.getSnapshot().effectiveMode, 'current');
    assert.equal(fixture.runtime.getSnapshot().resources.cached, 'cached');
    assert.deepEqual(fixture.disposals, []);
    assert.equal(fixture.commits.at(-1).retainResources, true);

    const reorderedRequest = {
        expectations: {
            resolvedSourceSha256: request.expectations.resolvedSourceSha256,
            selectedCapabilityProfileId: request.expectations.selectedCapabilityProfileId,
            lightingProfileId: request.expectations.lightingProfileId,
            cityId: request.expectations.cityId
        },
        url: request.url
    };
    await fixture.runtime.setMode('auto', reorderedRequest);
    assert.equal(fixture.runtime.getSnapshot().phase, 'ready_to_commit');
    fixture.runtime.commitFrameBoundary();
    assert.equal(fixture.runtime.getSnapshot().effectiveMode, 'baked');
    assert.equal(fixture.getFetchCount(), 1);
    assert.deepEqual(fixture.disposals, []);
    const bakedCommits = fixture.commits.filter((entry) => entry.mode === 'baked');
    assert.equal(bakedCommits.length, 2);
    assert.strictEqual(bakedCommits[1].resources, bakedCommits[0].resources);
    assert.equal(bakedCommits[1].reused, true);

    await fixture.runtime.teardown();
    assert.deepEqual(fixture.disposals.sort(), ['direct.rgba32f', 'mapping.ids']);
});

test('a configured URL without live identity expectations stays current and never fetches', async () => {
    let fetchCount = 0;
    const runtime = createIlluminationRuntime({
        initialMode: 'auto',
        fetchPackage: async () => {
            fetchCount += 1;
            throw new Error('must not fetch without identity');
        },
        createResource() {
            throw new Error('must not upload without identity');
        }
    });
    await runtime.load({ url: 'fixture.ilpkg' });
    assert.equal(fetchCount, 0);
    assert.equal(runtime.getSnapshot().state, 'unavailable');
    assert.equal(runtime.getSnapshot().reason, 'not_configured');
    assert.match(runtime.getSnapshot().failureCode, /^missing_identity:/);
    runtime.commitFrameBoundary();
    assert.equal(runtime.getSnapshot().state, 'fallback');
    assert.equal(runtime.getSnapshot().causeState, 'unavailable');
    await runtime.teardown();
});

test('no configured package remains a quiet unavailable/fallback condition', async () => {
    const runtime = createIlluminationRuntime({
        initialMode: 'auto',
        fetchPackage: async () => {
            throw new Error('must not fetch');
        },
        createResource() {
            throw new Error('must not upload');
        }
    });
    await runtime.load({});
    assert.equal(runtime.getSnapshot().state, 'unavailable');
    assert.equal(runtime.getSnapshot().reason, 'not_configured');
    runtime.commitFrameBoundary();
    assert.equal(runtime.getSnapshot().state, 'fallback');
    assert.equal(runtime.getSnapshot().reason, 'not_configured');
    await runtime.teardown();
});
