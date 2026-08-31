// Verifies cancellation, supersession, prewarm rejection, and exactly-once retirement.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createDeferred,
    createLoadOptions,
    createLoaderHarness,
    createResourceDescriptor,
    createResourcePlan
} from './graphics_runtime_test_helpers.js';

test('graphics illumination loader cancellation disposes every partially staged owner exactly once', async () => {
    const alpha = createResourceDescriptor('alpha');
    const beta = createResourceDescriptor('beta');
    const plan = createResourcePlan({ resources: [alpha, beta] });
    const reachedBetaDecode = createDeferred();
    const harness = createLoaderHarness({
        async decodeResource(bytes, descriptor, { signal }) {
            if (descriptor.id === 'alpha') {
                harness.clock.advance(5);
                return {
                    decoded: { id: descriptor.id, bytes },
                    cpuBytes: descriptor.memory.decodedCpuBytes,
                    dispose: (reason) => {
                        harness.disposalCounts.set('decode/alpha', (harness.disposalCounts.get('decode/alpha') ?? 0) + 1);
                        harness.events.push(`dispose:decode/alpha:${reason}`);
                    }
                };
            }
            reachedBetaDecode.resolve();
            await new Promise((resolve, reject) => {
                signal.addEventListener('abort', () => reject(new Error('decode aborted')), { once: true });
            });
        }
    });

    const loading = harness.loader.load(plan, createLoadOptions(plan));
    await reachedBetaDecode.promise;
    assert.equal(harness.loader.cancel(), true);

    await assert.rejects(
        loading,
        (error) => error.state === 'fallback' && error.reason === 'cancelled'
    );
    assert.equal(harness.disposalCounts.get('resource/alpha'), 1);
    assert.equal(harness.disposalCounts.get('decode/alpha'), 1);
    assert.equal(harness.disposalCounts.get('fetch/alpha'), 1);
    assert.equal(harness.disposalCounts.get('fetch/beta'), 1);
    assert.deepEqual(harness.loader.getDiagnostics().memory.current, { cpuBytes: 0, gpuBytes: 0 });
    assert.equal(harness.loader.getStatus().state, 'fallback');
    assert.equal(harness.loader.getStatus().reason, 'cancelled');

    await harness.loader.dispose();
    assert.equal(harness.disposalCounts.get('resource/alpha'), 1);
});

test('graphics illumination loader supersedes an uncommitted set without touching the replacement', async () => {
    const firstPlan = createResourcePlan({ id: 'first-plan' });
    const secondPlan = createResourcePlan({ id: 'second-plan' });
    const harness = createLoaderHarness();
    const first = await harness.loader.load(firstPlan, createLoadOptions(firstPlan));

    const second = await harness.loader.load(secondPlan, createLoadOptions(secondPlan));
    await first.dispose('superseded');

    assert.equal(first.disposition, 'disposed');
    assert.equal(second.disposition, 'ready_to_commit');
    assert.equal(harness.disposalCounts.get('resource/alpha'), 1);
    await assert.rejects(first.handoff(() => true), (error) => error.code === 'resource_set_disposed');

    await second.handoff(() => ({ accepted: true }));
    assert.equal(second.disposition, 'committed');
    assert.equal(harness.disposalCounts.get('resource/alpha'), 1);
    await second.deactivate();
    assert.equal(harness.disposalCounts.get('resource/alpha'), 2);
});

test('graphics illumination loader owns resources registered during prewarm and cleans them on rejection', async () => {
    const plan = createResourcePlan({ prewarmMemory: { cpuBytes: 1, gpuBytes: 5 } });
    const harness = createLoaderHarness({
        async prewarm(view, { registerResource }) {
            assert.equal(view.hasResource('alpha'), true);
            registerResource('prepared-program', {
                resource: { id: 'prepared-program' },
                cpuBytes: 1,
                gpuBytes: 5,
                dispose(reason) {
                    harness.disposalCounts.set('prepared-program', (harness.disposalCounts.get('prepared-program') ?? 0) + 1);
                    harness.events.push(`dispose:prepared-program:${reason}`);
                }
            });
            throw new Error('program preparation failed');
        }
    });

    await assert.rejects(
        harness.loader.load(plan, createLoadOptions(plan)),
        (error) => error.state === 'failed' && error.reason === 'program_preparation_failure'
    );
    assert.equal(harness.disposalCounts.get('prepared-program'), 1);
    assert.equal(harness.disposalCounts.get('resource/alpha'), 1);
    assert.deepEqual(harness.loader.getDiagnostics().memory.current, { cpuBytes: 0, gpuBytes: 0 });
});

test('graphics illumination loader detects actual resident memory drift and disposes the allocation', async () => {
    const plan = createResourcePlan();
    const harness = createLoaderHarness({
        async createResource(decoded, descriptor) {
            harness.clock.advance(7);
            return {
                resource: { id: decoded.id },
                cpuBytes: descriptor.memory.residentCpuBytes,
                gpuBytes: descriptor.memory.residentGpuBytes + 1,
                dispose(reason) {
                    harness.disposalCounts.set('resource/alpha', (harness.disposalCounts.get('resource/alpha') ?? 0) + 1);
                    harness.events.push(`dispose:resource/alpha:${reason}`);
                }
            };
        }
    });

    await assert.rejects(
        harness.loader.load(plan, createLoadOptions(plan)),
        (error) => error.code === 'resident_memory_mismatch' && error.reason === 'allocation_failure'
    );
    assert.equal(harness.disposalCounts.get('resource/alpha'), 1);
    assert.equal(harness.disposalCounts.get('decode/alpha'), 1);
    assert.equal(harness.disposalCounts.get('fetch/alpha'), 1);
    assert.deepEqual(harness.loader.getDiagnostics().memory.current, { cpuBytes: 0, gpuBytes: 0 });
});

test('graphics illumination loader disposes allocations rejected for malformed accounting', async (context) => {
    await context.test('uploaded resource result', async () => {
        const plan = createResourcePlan();
        let rejectedDisposals = 0;
        const harness = createLoaderHarness({
            async createResource(decoded) {
                return {
                    resource: { id: decoded.id },
                    cpuBytes: -1,
                    gpuBytes: 16,
                    dispose(reason) {
                        rejectedDisposals += 1;
                        assert.equal(reason, 'invalid_resource_result');
                    }
                };
            }
        });

        await assert.rejects(
            harness.loader.load(plan, createLoadOptions(plan)),
            (error) => error.code === 'resource_factory_result_invalid' && error.reason === 'upload_failure'
        );
        assert.equal(rejectedDisposals, 1);
        assert.equal(harness.disposalCounts.get('decode/alpha'), 1);
        assert.equal(harness.disposalCounts.get('fetch/alpha'), 1);
    });

    await context.test('prewarmed resource result', async () => {
        const plan = createResourcePlan();
        let rejectedDisposals = 0;
        const harness = createLoaderHarness({
            async prewarm(view, { registerResource }) {
                assert.equal(view.hasResource('alpha'), true);
                registerResource('invalid-program', {
                    resource: { id: 'invalid-program' },
                    cpuBytes: 0,
                    gpuBytes: Number.NaN,
                    dispose(reason) {
                        rejectedDisposals += 1;
                        assert.equal(reason, 'invalid_prewarm_result');
                    }
                });
            }
        });

        await assert.rejects(
            harness.loader.load(plan, createLoadOptions(plan)),
            (error) => error.code === 'resource_factory_result_invalid'
                && error.reason === 'program_preparation_failure'
        );
        assert.equal(rejectedDisposals, 1);
        assert.equal(harness.disposalCounts.get('resource/alpha'), 1);
    });

    await context.test('prewarmed resource with an invalid registration id', async () => {
        const plan = createResourcePlan();
        let rejectedDisposals = 0;
        const harness = createLoaderHarness({
            async prewarm(view, { registerResource }) {
                assert.equal(view.hasResource('alpha'), true);
                registerResource(' invalid-program', {
                    resource: { id: 'invalid-program' },
                    cpuBytes: 0,
                    gpuBytes: 0,
                    dispose(reason) {
                        rejectedDisposals += 1;
                        assert.equal(reason, 'invalid_prewarm_result');
                    }
                });
            }
        });

        await assert.rejects(
            harness.loader.load(plan, createLoadOptions(plan)),
            (error) => error.reason === 'program_preparation_failure'
        );
        assert.equal(rejectedDisposals, 1);
        assert.equal(harness.disposalCounts.get('resource/alpha'), 1);
    });
});

test('graphics illumination loader honors an already-aborted external signal without fetching', async () => {
    const plan = createResourcePlan();
    const controller = new AbortController();
    controller.abort();
    const harness = createLoaderHarness();

    await assert.rejects(
        harness.loader.load(plan, createLoadOptions(plan, { signal: controller.signal })),
        (error) => error.state === 'fallback' && error.reason === 'cancelled'
    );
    assert.deepEqual(harness.events, []);
    assert.equal(harness.loader.getStatus().state, 'fallback');
});

test('graphics illumination loader preserves superseded from an external abort signal', async () => {
    const plan = createResourcePlan();
    const controller = new AbortController();
    controller.abort('superseded');
    const harness = createLoaderHarness();

    await assert.rejects(
        harness.loader.load(plan, createLoadOptions(plan, { signal: controller.signal })),
        (error) => error.code === 'resource_load_superseded'
            && error.state === 'fallback'
            && error.reason === 'superseded'
    );
    assert.deepEqual(harness.events, []);
    assert.equal(harness.loader.getStatus().reason, 'superseded');
});

test('graphics illumination staged activation rejects thenables at the synchronous controller boundary', async () => {
    const plan = createResourcePlan();
    const harness = createLoaderHarness();
    const staged = await harness.loader.load(plan, createLoadOptions(plan));

    assert.throws(
        () => staged.commitPrepared(() => Promise.resolve({ accepted: true })),
        (error) => error.code === 'resource_handoff_thenable' && error.reason === 'activation_rejected'
    );
    await staged.dispose();
    assert.equal(staged.disposition, 'disposed');
    assert.equal(harness.disposalCounts.get('resource/alpha'), 1);
});

test('graphics illumination staged retirement synchronously prevents a same-turn activation', async () => {
    const plan = createResourcePlan();
    const harness = createLoaderHarness();
    const staged = await harness.loader.load(plan, createLoadOptions(plan));

    const disposal = staged.dispose('cancelled');
    assert.equal(staged.disposition, 'retiring');
    assert.throws(
        () => staged.commitPrepared(() => ({ accepted: true })),
        (error) => error.code === 'resource_set_disposed' && error.reason === 'activation_rejected'
    );

    await disposal;
    assert.equal(staged.disposition, 'disposed');
    assert.equal(harness.disposalCounts.get('resource/alpha'), 1);
});
