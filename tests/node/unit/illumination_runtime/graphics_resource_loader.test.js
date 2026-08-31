// Verifies complete inactive staging, capability gates, integrity, diagnostics, and atomic handoff.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createLoadOptions,
    createLoaderHarness,
    createResourceDescriptor,
    createResourcePlan
} from './graphics_runtime_test_helpers.js';

test('graphics illumination loader stages deterministically and hands off one immutable complete snapshot', async () => {
    const beta = createResourceDescriptor('beta', {
        byteLength: 3,
        decodedCpuBytes: 6,
        residentCpuBytes: 3,
        residentGpuBytes: 8
    });
    const alpha = createResourceDescriptor('alpha');
    const plan = createResourcePlan({ resources: [beta, alpha], requiredResourceIds: ['beta', 'alpha'] });
    const harness = createLoaderHarness();

    const staged = await harness.loader.load(plan, createLoadOptions(plan));

    assert.deepEqual(staged.resources.map((entry) => entry.id), ['alpha', 'beta']);
    assert.deepEqual(
        harness.events.filter((entry) => !entry.startsWith('dispose:')),
        [
            'fetch:alpha',
            'hash:alpha:4',
            'decode:alpha:4',
            'create:alpha:alpha',
            'fetch:beta',
            'hash:beta:3',
            'decode:beta:3',
            'create:beta:beta',
            'prewarm:alpha,beta'
        ]
    );
    assert.deepEqual(harness.loader.getStatus(), {
        generation: 1,
        planId: 'fixture-plan',
        state: 'loading',
        phase: 'ready_to_commit',
        reason: null,
        causeState: null,
        capabilityCode: null,
        effectiveMode: 'current',
        error: null
    });
    const readyDiagnostics = staged.getDiagnostics();
    assert.deepEqual(readyDiagnostics.memory.resident, { cpuBytes: 5, gpuBytes: 24 });
    assert.deepEqual(readyDiagnostics.memory.peak, { cpuBytes: 14, gpuBytes: 24 });
    assert.equal(readyDiagnostics.timingsMs.fetchMs, 4);
    assert.equal(readyDiagnostics.timingsMs.hashMs, 6);
    assert.equal(readyDiagnostics.timingsMs.decodeMs, 10);
    assert.equal(readyDiagnostics.timingsMs.uploadMs, 14);
    assert.equal(readyDiagnostics.timingsMs.cpuStagingMs, 0);
    assert.equal(readyDiagnostics.timingsMs.prewarmMs, 11);

    let commitCalls = 0;
    const commit = (snapshot) => {
        commitCalls += 1;
        assert.equal(Object.isFrozen(snapshot), true);
        assert.equal(Object.isFrozen(snapshot.resources), true);
        assert.deepEqual(snapshot.requiredResourceIds, ['alpha', 'beta']);
        assert.equal(snapshot.getResource('alpha').id, 'alpha');
        assert.equal(snapshot.hasResource('beta'), true);
        assert.equal(snapshot.diagnostics.phase, 'ready_to_commit');
        harness.clock.advance(13);
        return Object.freeze({ accepted: true, frame: 42 });
    };
    assert.equal(staged.activationSnapshot, staged.activationSnapshot);
    assert.deepEqual(staged.commitPrepared(commit), { accepted: true, frame: 42 });
    assert.deepEqual(staged.activateAtFrameBoundary(() => {
        throw new Error('second commit callback must never run');
    }), { accepted: true, frame: 42 });
    const firstHandoff = staged.handoff(() => {
        throw new Error('handoff callback must not rerun a committed stage');
    });
    const repeatedHandoff = staged.handoff(() => false);
    assert.equal(firstHandoff, repeatedHandoff);
    assert.deepEqual(await firstHandoff, { accepted: true, frame: 42 });
    assert.equal(commitCalls, 1);
    assert.equal(staged.disposition, 'committed');
    assert.equal(harness.loader.getStatus().state, 'active');
    assert.equal(staged.getDiagnostics().timingsMs.activationMs, 13);

    const firstDispose = staged.deactivate();
    const repeatedDispose = staged.dispose('ignored-repeat');
    assert.equal(firstDispose, repeatedDispose);
    await firstDispose;
    assert.equal(staged.disposition, 'disposed');
    assert.equal(harness.disposalCounts.get('resource/alpha'), 1);
    assert.equal(harness.disposalCounts.get('resource/beta'), 1);
    assert.equal(harness.disposalCounts.get('decode/alpha'), 1);
    assert.equal(harness.disposalCounts.get('fetch/alpha'), 1);
    assert.deepEqual(staged.getDiagnostics().memory.current, { cpuBytes: 0, gpuBytes: 0 });
    assert.equal(staged.getDiagnostics().disposal.passCount, 1);
    assert.equal(harness.loader.getStatus().state, 'unavailable');
    assert.equal(harness.loader.getStatus().phase, 'disposed');
});

test('graphics illumination loader treats a missing plan as quiet unavailability', async () => {
    const harness = createLoaderHarness();

    assert.equal(await harness.loader.load(null), null);
    assert.equal(harness.loader.getStatus().state, 'unavailable');
    assert.equal(harness.loader.getStatus().reason, 'package_not_configured');
    assert.deepEqual(harness.events, []);
});

test('graphics illumination loader rejects unsupported capability and memory plans before fetch', async (context) => {
    await context.test('missing capability', async () => {
        const plan = createResourcePlan();
        const harness = createLoaderHarness();

        await assert.rejects(
            harness.loader.load(plan, createLoadOptions(plan, { capabilities: {} })),
            (error) => error.state === 'unavailable' && error.reason === 'unsupported_capability'
        );
        assert.deepEqual(harness.events, []);
        assert.equal(harness.loader.getStatus().state, 'unavailable');
        assert.equal(harness.loader.getStatus().capabilityCode, 'binary-texture');
    });

    await context.test('declared memory budget', async () => {
        const plan = createResourcePlan();
        const harness = createLoaderHarness();
        const options = createLoadOptions(plan, {
            memoryLimits: {
                cpuBytes: 1,
                gpuBytes: 1,
                peakCpuBytes: 1,
                peakGpuBytes: 1
            }
        });

        await assert.rejects(
            harness.loader.load(plan, options),
            (error) => error.code === 'unsupported_memory_budget'
                && error.state === 'unavailable'
                && error.reason === 'unsupported_capability'
        );
        assert.deepEqual(harness.events, []);
        assert.equal(harness.loader.getStatus().capabilityCode, 'memory_budget');
    });
});

test('graphics illumination loader reports hash corruption and releases fetched staging memory once', async () => {
    const plan = createResourcePlan();
    const harness = createLoaderHarness({
        async hashResource() {
            harness.clock.advance(3);
            return 'f'.repeat(64);
        }
    });

    await assert.rejects(
        harness.loader.load(plan, createLoadOptions(plan)),
        (error) => error.code === 'resource_hash_mismatch'
            && error.state === 'failed'
            && error.phase === 'validating'
            && error.reason === 'integrity_failure'
    );
    assert.equal(harness.disposalCounts.get('fetch/alpha'), 1);
    assert.equal(harness.disposalCounts.has('decode/alpha'), false);
    assert.equal(harness.disposalCounts.has('resource/alpha'), false);
    assert.equal(harness.loader.getStatus().state, 'failed');
    assert.equal(harness.loader.getStatus().reason, 'integrity_failure');
    assert.deepEqual(harness.loader.getDiagnostics().memory.current, { cpuBytes: 0, gpuBytes: 0 });
});
