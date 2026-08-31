// Verifies optional illumination lifecycle transitions, cancellation, and resource ownership.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ILLUMINATION_MODES,
    ILLUMINATION_PHASES,
    ILLUMINATION_STATES,
    createIlluminationModeController
} from '../../../../src/app/illumination/runtime/index.js';

function createReadyResult(id, overrides = {}) {
    return {
        complete: true,
        compatible: true,
        resourceSet: { id },
        packageId: 'package.' + id,
        profileId: 'development.static_sun_v1',
        cityId: 'city.fixture',
        compilerSignature: 'compiler.fixture',
        selectedChannels: ['static_sun_depth'],
        sourceHashes: { resolvedSource: 'a'.repeat(64) },
        integrityHashes: { aggregate: 'b'.repeat(64) },
        ...overrides
    };
}

test('lifecycle catalog exposes only the fixed modes, states, and phases', () => {
    assert.deepEqual(Object.values(ILLUMINATION_MODES), ['current', 'baked', 'auto']);
    assert.deepEqual(Object.values(ILLUMINATION_STATES), [
        'unavailable',
        'loading',
        'active',
        'stale',
        'failed',
        'fallback'
    ]);
    assert.deepEqual(Object.values(ILLUMINATION_PHASES), [
        'locating',
        'fetching',
        'validating',
        'decoding',
        'uploading',
        'prewarming',
        'ready_to_commit',
        'committed',
        'retiring',
        'disposed'
    ]);
});

test('current mode is quiet, never loads, and never exposes baked resources', () => {
    let loadCalls = 0;
    const controller = createIlluminationModeController({
        loadStagedResources() {
            loadCalls += 1;
            return createReadyResult('unexpected');
        }
    });
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.requestedMode, 'current');
    assert.equal(snapshot.effectiveMode, 'current');
    assert.equal(snapshot.state, 'unavailable');
    assert.equal(snapshot.reason, 'not_configured');
    assert.equal(controller.getActiveResourceSet(), null);
    assert.throws(() => controller.startLoad(), /requested mode is "current"/);
    assert.equal(loadCalls, 0);
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot.timings));
    assert.ok(Object.isFrozen(snapshot.resources));
});

test('a complete staged set remains inactive until one frame-boundary commit', () => {
    const commits = [];
    const controller = createIlluminationModeController({
        initialMode: 'baked',
        commitResources(snapshot) {
            commits.push(snapshot);
        }
    });
    const hooks = controller.startLoad({ packageId: 'package.fixture' });
    hooks.reportPhase('fetching');
    hooks.reportPhase('validating');
    const resources = createReadyResult('ready');
    assert.equal(hooks.accept(resources), true);

    const staged = controller.getDiagnostics();
    assert.equal(staged.state, 'loading');
    assert.equal(staged.phase, 'ready_to_commit');
    assert.equal(staged.effectiveMode, 'current');
    assert.equal(staged.resources.staging, 'staged');
    assert.equal(controller.getActiveResourceSet(), null);
    assert.equal(commits.length, 0);

    const active = controller.commitFrameBoundary();
    assert.equal(active.state, 'active');
    assert.equal(active.phase, 'committed');
    assert.equal(active.effectiveMode, 'baked');
    assert.equal(controller.getActiveResourceSet(), resources.resourceSet);
    assert.deepEqual(commits.map((entry) => entry.mode), ['baked']);
    assert.ok(Object.isFrozen(commits[0]));
});

test('staging acceptance enforces complete and compatible resource sets', () => {
    const controller = createIlluminationModeController({ initialMode: 'auto' });
    const incomplete = controller.startLoad();
    assert.throws(() => incomplete.accept({
        ...createReadyResult('incomplete'),
        complete: false
    }), /must be complete/);
    incomplete.reject({ state: 'failed', reason: 'validation_failure' });

    const incompatible = controller.startLoad();
    assert.throws(() => incompatible.accept({
        ...createReadyResult('incompatible'),
        compatible: false
    }), /must be compatible/);
});

test('stale and failed outcomes publish exact causes before stable fallback', () => {
    const staleController = createIlluminationModeController({ initialMode: 'baked' });
    const staleLoad = staleController.startLoad();
    staleLoad.reject({
        state: 'stale',
        reason: 'source_mismatch',
        failureCode: 'resolved_source_sha256',
        retryTrigger: 'source_change'
    });
    const stale = staleController.getSnapshot();
    assert.equal(stale.state, 'stale');
    assert.equal(stale.reason, 'source_mismatch');
    assert.equal(stale.failureCode, 'resolved_source_sha256');
    const staleFallback = staleController.commitFrameBoundary();
    assert.equal(staleFallback.state, 'fallback');
    assert.equal(staleFallback.causeState, 'stale');
    assert.equal(staleFallback.reason, 'source_mismatch');

    const failedController = createIlluminationModeController({ initialMode: 'auto' });
    const failedLoad = failedController.startLoad();
    failedLoad.reject({
        state: 'failed',
        reason: 'integrity_failure',
        failureCode: 'chunk_sha256_mismatch',
        retryTrigger: 'payload_change'
    });
    assert.equal(failedController.getSnapshot().state, 'failed');
    const failedFallback = failedController.commitFrameBoundary();
    assert.equal(failedFallback.state, 'fallback');
    assert.equal(failedFallback.causeState, 'failed');
    assert.equal(failedFallback.reason, 'integrity_failure');
    assert.equal(failedFallback.failureCode, 'chunk_sha256_mismatch');
});

test('unsupported capability uses unavailable plus capability code, then fallback', () => {
    const controller = createIlluminationModeController({ initialMode: 'baked' });
    const hooks = controller.startLoad();
    hooks.reject({
        state: 'unavailable',
        reason: 'unsupported_capability',
        capabilityCode: 'texture_format_rgba16f',
        retryTrigger: 'context_change'
    });
    assert.deepEqual(
        pick(controller.getSnapshot(), ['state', 'reason', 'capabilityCode', 'effectiveMode']),
        {
            state: 'unavailable',
            reason: 'unsupported_capability',
            capabilityCode: 'texture_format_rgba16f',
            effectiveMode: 'current'
        }
    );
    const fallback = controller.commitFrameBoundary();
    assert.equal(fallback.state, 'fallback');
    assert.equal(fallback.causeState, 'unavailable');
});

test('superseded generations abort and dispose late resource results exactly once', async () => {
    const disposed = [];
    const controller = createIlluminationModeController({
        initialMode: 'auto',
        disposeResources(resource, context) {
            disposed.push([resource.id, context.reason]);
        }
    });
    const first = controller.startLoad({ packageId: 'old' });
    const second = controller.startLoad({ packageId: 'new' });
    assert.equal(first.signal.aborted, true);
    assert.equal(first.isCurrent(), false);
    assert.equal(second.isCurrent(), true);

    const old = createReadyResult('old');
    assert.equal(first.accept(old), false);
    const current = createReadyResult('new');
    assert.equal(second.accept(current), true);
    controller.commitFrameBoundary();
    await controller.waitForIdle();
    assert.deepEqual(disposed, [['old', 'superseded']]);
    assert.equal(controller.getActiveResourceSet(), current.resourceSet);
});

test('switching from baked to current is atomic and retirement waits for safety', async () => {
    let releaseRetirement;
    const retirementGate = new Promise((resolve) => {
        releaseRetirement = resolve;
    });
    const commits = [];
    const disposed = [];
    const controller = createIlluminationModeController({
        initialMode: 'baked',
        commitResources(snapshot) {
            commits.push(snapshot.mode);
        },
        waitUntilSafeToDispose() {
            return retirementGate;
        },
        disposeResources(resource) {
            disposed.push(resource.id);
        }
    });
    const hooks = controller.startLoad();
    const ready = createReadyResult('active');
    hooks.accept(ready);
    controller.commitFrameBoundary();

    controller.setRequestedMode('current');
    assert.equal(controller.getSnapshot().effectiveMode, 'baked');
    assert.equal(controller.getActiveResourceSet(), ready.resourceSet);
    const current = controller.commitFrameBoundary();
    assert.equal(current.effectiveMode, 'current');
    assert.equal(controller.getActiveResourceSet(), null);
    assert.deepEqual(commits, ['baked', 'current']);
    await Promise.resolve();
    assert.deepEqual(disposed, []);
    releaseRetirement();
    await controller.waitForIdle();
    assert.deepEqual(disposed, ['active']);
    assert.equal(controller.getSnapshot().resources.disposed, 1);
});

test('a later baked or auto request cancels a pending current transition before the frame boundary', async () => {
    const commits = [];
    const disposed = [];
    const controller = createIlluminationModeController({
        initialMode: 'baked',
        commitResources(snapshot) {
            commits.push(snapshot.mode);
        },
        disposeResources(resource) {
            disposed.push(resource.id);
        }
    });
    const hooks = controller.startLoad();
    const ready = createReadyResult('still-active');
    hooks.accept(ready);
    controller.commitFrameBoundary();

    controller.setRequestedMode('current');
    assert.equal(controller.getSnapshot().pendingTransition, 'current');
    const baked = controller.setRequestedMode('baked');
    assert.equal(baked.pendingTransition, null);
    controller.commitFrameBoundary();

    controller.setRequestedMode('current');
    assert.equal(controller.getSnapshot().pendingTransition, 'current');
    const automatic = controller.setRequestedMode('auto');
    assert.equal(automatic.pendingTransition, null);
    controller.commitFrameBoundary();

    await controller.waitForIdle();
    assert.equal(controller.getSnapshot().effectiveMode, 'baked');
    assert.equal(controller.getActiveResourceSet(), ready.resourceSet);
    assert.deepEqual(commits, ['baked']);
    assert.deepEqual(disposed, []);
});

test('a failed retirement safety gate retains possibly in-use resources without disposing them', async () => {
    const disposed = [];
    const controller = createIlluminationModeController({
        initialMode: 'baked',
        waitUntilSafeToDispose() {
            throw new Error('gpu_fence_failed');
        },
        disposeResources(resource) {
            disposed.push(resource.id);
        }
    });
    const hooks = controller.startLoad();
    hooks.accept(createReadyResult('retained', {
        memory: { residentGpuBytes: 2048, peakGpuBytes: 2048 }
    }));
    controller.commitFrameBoundary();
    controller.setRequestedMode('current');
    controller.commitFrameBoundary();
    await controller.waitForIdle();

    const snapshot = controller.getSnapshot();
    assert.deepEqual(disposed, []);
    assert.equal(snapshot.effectiveMode, 'current');
    assert.equal(snapshot.resources.retiring, 0);
    assert.equal(snapshot.resources.retained, 1);
    assert.equal(snapshot.resources.disposed, 0);
    assert.deepEqual(snapshot.resources.disposalErrors, ['retirement:gpu_fence_failed']);
    assert.equal(snapshot.memory.residentGpuBytes, 2048);
});

test('cancellation reports the specified fallback reason and disposes staging', async () => {
    const disposed = [];
    const controller = createIlluminationModeController({
        initialMode: 'baked',
        disposeResources(resource, context) {
            disposed.push([resource.id, context.reason]);
        }
    });
    const hooks = controller.startLoad();
    const staged = createReadyResult('cancelled');
    hooks.accept(staged);
    assert.equal(controller.cancelLoad(), true);
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.state, 'fallback');
    assert.equal(snapshot.reason, 'cancelled');
    assert.equal(snapshot.effectiveMode, 'current');
    await controller.waitForIdle();
    assert.deepEqual(disposed, [['cancelled', 'cancelled']]);
});

test('cancellation tracks an abort-ignoring async loader until its late set is disposed', async () => {
    let resolveLoad;
    const pendingResult = new Promise((resolve) => {
        resolveLoad = resolve;
    });
    const disposed = [];
    const controller = createIlluminationModeController({
        initialMode: 'auto',
        loadStagedResources(_request, hooks) {
            assert.equal(hooks.signal.aborted, false);
            return pendingResult;
        },
        disposeResources(resource, context) {
            disposed.push([resource.id, context.reason]);
        }
    });
    const loading = controller.load();
    await Promise.resolve();
    assert.equal(controller.cancelLoad(), true);
    resolveLoad(createReadyResult('late'));
    await loading;
    await controller.waitForIdle();
    assert.deepEqual(disposed, [['late', 'cancelled']]);
    assert.equal(controller.getSnapshot().state, 'fallback');
    assert.equal(controller.getSnapshot().reason, 'cancelled');
});

test('injected async loader reports immutable timings, memory, identity, and channels', async () => {
    let now = 100;
    const controller = createIlluminationModeController({
        initialMode: 'auto',
        now: () => now,
        async loadStagedResources(request, hooks) {
            assert.ok(Object.isFrozen(request));
            hooks.reportPhase('fetching');
            hooks.recordTiming('fetchReadMs', 2.5);
            hooks.recordTiming('hashMs', 1.25);
            hooks.recordMemory('peakCpuBytes', 4096);
            hooks.recordMemory('residentGpuBytes', 2048);
            return createReadyResult('async', {
                selectedChannels: ['static_sun_depth', 'receiver_mapping'],
                timings: { decodeMs: 3 },
                memory: { peakGpuBytes: 3072 }
            });
        },
        commitResources() {
            now += 0.75;
        }
    });
    const ready = await controller.load({ packageId: 'package.async', nested: { value: 1 } });
    assert.equal(ready.phase, 'ready_to_commit');
    assert.equal(ready.timings.fetchReadMs, 2.5);
    assert.equal(ready.timings.hashMs, 1.25);
    assert.equal(ready.timings.decodeMs, 3);
    assert.equal(ready.memory.peakCpuBytes, 4096);
    assert.equal(ready.memory.residentGpuBytes, 2048);
    assert.equal(ready.memory.peakGpuBytes, 3072);
    assert.deepEqual(ready.selectedChannels, ['static_sun_depth', 'receiver_mapping']);
    assert.ok(Object.isFrozen(ready.selectedChannels));
    const active = controller.commitFrameBoundary();
    assert.equal(active.timings.activationMs, 0.75);
});

test('activation failures keep current effective and dispose rejected resources', async () => {
    const disposed = [];
    const controller = createIlluminationModeController({
        initialMode: 'baked',
        commitResources(snapshot) {
            if (snapshot.mode === 'baked') throw new Error('shader_prewarm_failed');
        },
        disposeResources(resource) {
            disposed.push(resource.id);
        }
    });
    const hooks = controller.startLoad();
    hooks.accept(createReadyResult('rejected'));
    const failed = controller.commitFrameBoundary();
    assert.equal(failed.state, 'failed');
    assert.equal(failed.reason, 'activation_failure');
    assert.equal(failed.failureCode, 'shader_prewarm_failed');
    assert.equal(failed.effectiveMode, 'current');
    assert.equal(controller.getActiveResourceSet(), null);
    await controller.waitForIdle();
    assert.deepEqual(disposed, ['rejected']);
});

test('frame-boundary commit callbacks must be synchronous', () => {
    const controller = createIlluminationModeController({
        initialMode: 'baked',
        commitResources() {
            return Promise.resolve();
        }
    });
    const hooks = controller.startLoad();
    hooks.accept(createReadyResult('async-commit'));
    const failed = controller.commitFrameBoundary();
    assert.equal(failed.state, 'failed');
    assert.equal(failed.reason, 'activation_failure');
    assert.match(failed.failureCode, /must be synchronous/);
});

test('repeated activate/deactivate and teardown dispose every set exactly once', async () => {
    const disposalCounts = new Map();
    const controller = createIlluminationModeController({
        initialMode: 'auto',
        disposeResources(resource) {
            disposalCounts.set(resource.id, (disposalCounts.get(resource.id) ?? 0) + 1);
        }
    });

    const first = controller.startLoad();
    first.accept(createReadyResult('first'));
    controller.commitFrameBoundary();
    controller.deactivate();
    controller.commitFrameBoundary();
    controller.setRequestedMode('auto');
    const second = controller.startLoad();
    second.accept(createReadyResult('second'));
    controller.commitFrameBoundary();

    const teardownA = controller.teardown();
    const teardownB = controller.teardown();
    assert.equal(teardownA, teardownB);
    await teardownA;
    assert.deepEqual(Object.fromEntries(disposalCounts), { first: 1, second: 1 });
    assert.equal(controller.getSnapshot().phase, 'disposed');
    assert.equal(controller.getSnapshot().effectiveMode, 'current');
    assert.throws(() => controller.setRequestedMode('auto'), /torn down/);
});

test('teardown still disposes active resources when the current-path commit hook fails', async () => {
    const disposed = [];
    const controller = createIlluminationModeController({
        initialMode: 'baked',
        commitResources(snapshot) {
            if (snapshot.mode === 'current') throw new Error('current_bind_failed');
        },
        disposeResources(resource) {
            disposed.push(resource.id);
        }
    });
    const hooks = controller.startLoad();
    hooks.accept(createReadyResult('teardown-safe'));
    controller.commitFrameBoundary();
    await controller.teardown();
    assert.deepEqual(disposed, ['teardown-safe']);
    assert.deepEqual(controller.getSnapshot().resources.disposalErrors, [
        'teardown_commit:current_bind_failed'
    ]);
});

test('diagnostic snapshots do not change when later load metrics advance', () => {
    const controller = createIlluminationModeController({ initialMode: 'auto' });
    const hooks = controller.startLoad();
    hooks.recordTiming('hashMs', 1);
    const before = controller.getDiagnostics();
    hooks.recordTiming('hashMs', 2);
    hooks.recordMemory('peakCpuBytes', 512);
    const after = controller.getDiagnostics();
    assert.equal(before.timings.hashMs, 1);
    assert.equal(before.memory.peakCpuBytes, 0);
    assert.equal(after.timings.hashMs, 3);
    assert.equal(after.memory.peakCpuBytes, 512);
    assert.ok(Object.isFrozen(after.memory));
});

function pick(value, keys) {
    return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
