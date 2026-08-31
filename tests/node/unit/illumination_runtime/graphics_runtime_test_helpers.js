// Provides deterministic dependency-injected fixtures for illumination runtime loader tests.

import { createIlluminationResourceLoader } from '../../../../src/graphics/illumination/runtime/index.js';

const HASHES = Object.freeze({
    alpha: 'a'.repeat(64),
    beta: 'b'.repeat(64),
    gamma: 'c'.repeat(64)
});

export function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return Object.freeze({ promise, resolve, reject });
}

export function createFakeClock() {
    let value = 0;
    return Object.freeze({
        now: () => value,
        advance(milliseconds) {
            value += milliseconds;
        }
    });
}

export function createResourceDescriptor(id, {
    sha256 = HASHES[id] ?? HASHES.alpha,
    byteLength = 4,
    decodedCpuBytes = 8,
    residentCpuBytes = 2,
    residentGpuBytes = 16
} = {}) {
    return Object.freeze({
        id,
        source: Object.freeze({ key: id }),
        sha256,
        byteLength,
        memory: Object.freeze({ decodedCpuBytes, residentCpuBytes, residentGpuBytes })
    });
}

export function createResourcePlan({
    id = 'fixture-plan',
    resources = [createResourceDescriptor('alpha')],
    requiredResourceIds = resources.map((resource) => resource.id),
    requiredCapabilities = ['binary-texture'],
    prewarmMemory = { cpuBytes: 0, gpuBytes: 0 }
} = {}) {
    return Object.freeze({
        id,
        identity: Object.freeze({ packageId: `${id}-package` }),
        metadata: Object.freeze({ fixture: true }),
        resources: Object.freeze(resources),
        requiredResourceIds: Object.freeze(requiredResourceIds),
        requiredCapabilities: Object.freeze(requiredCapabilities),
        prewarmMemory: Object.freeze(prewarmMemory)
    });
}

export function createLoadOptions(plan, overrides = {}) {
    return {
        capabilities: Object.fromEntries(plan.requiredCapabilities.map((id) => [id, true])),
        baselineMemory: { cpuBytes: 0, gpuBytes: 0 },
        memoryLimits: {
            cpuBytes: 1_000_000,
            gpuBytes: 1_000_000,
            peakCpuBytes: 1_000_000,
            peakGpuBytes: 1_000_000
        },
        ...overrides
    };
}

export function createLoaderHarness(overrides = {}) {
    const clock = overrides.clock ?? createFakeClock();
    const events = [];
    const disposalCounts = new Map();
    const countDisposal = (id, reason) => {
        disposalCounts.set(id, (disposalCounts.get(id) ?? 0) + 1);
        events.push(`dispose:${id}:${reason}`);
    };
    const dependencies = {
        now: clock.now,
        async fetchResource(descriptor) {
            events.push(`fetch:${descriptor.id}`);
            clock.advance(2);
            return {
                bytes: new Uint8Array(descriptor.byteLength).fill(descriptor.id.charCodeAt(0)),
                dispose: (reason) => countDisposal(`fetch/${descriptor.id}`, reason)
            };
        },
        async hashResource(bytes, context) {
            events.push(`hash:${context.descriptor.id}:${bytes.byteLength}`);
            clock.advance(3);
            return context.descriptor.sha256;
        },
        async decodeResource(bytes, descriptor) {
            events.push(`decode:${descriptor.id}:${bytes.byteLength}`);
            clock.advance(5);
            return {
                decoded: Object.freeze({ id: descriptor.id, bytes }),
                cpuBytes: descriptor.memory.decodedCpuBytes,
                dispose: (reason) => countDisposal(`decode/${descriptor.id}`, reason)
            };
        },
        async createResource(decoded, descriptor) {
            events.push(`create:${descriptor.id}:${decoded.id}`);
            clock.advance(7);
            return {
                resource: Object.freeze({ id: descriptor.id }),
                cpuBytes: descriptor.memory.residentCpuBytes,
                gpuBytes: descriptor.memory.residentGpuBytes,
                dispose: (reason) => countDisposal(`resource/${descriptor.id}`, reason)
            };
        },
        async prewarm(view) {
            events.push(`prewarm:${view.resources.map((entry) => entry.id).join(',')}`);
            clock.advance(11);
        },
        ...overrides
    };
    delete dependencies.clock;
    const loader = createIlluminationResourceLoader(dependencies);
    return Object.freeze({ clock, disposalCounts, events, loader });
}
