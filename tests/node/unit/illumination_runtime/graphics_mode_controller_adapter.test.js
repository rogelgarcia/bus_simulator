// Verifies that the graphics stage composes with the app controller at one synchronous frame boundary.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createIlluminationModeController } from '../../../../src/app/illumination/runtime/index.js';
import { createIlluminationControllerStagingResult } from '../../../../src/graphics/illumination/runtime/index.js';
import {
    createLoadOptions,
    createLoaderHarness,
    createResourcePlan
} from './graphics_runtime_test_helpers.js';

test('graphics illumination stage activates only inside the app controller frame-boundary commit', async () => {
    const plan = createResourcePlan();
    const harness = createLoaderHarness();
    let activeSnapshot = null;
    const controller = createIlluminationModeController({
        initialMode: 'baked',
        commitResources({ mode, resourceSet }) {
            if (mode === 'current') {
                activeSnapshot = null;
                return;
            }
            resourceSet.commitPrepared((snapshot) => {
                activeSnapshot = snapshot;
                return true;
            });
        }
    });
    const hooks = controller.startLoad({ packageId: 'fixture-plan-package' });
    const staged = await harness.loader.load(plan, createLoadOptions(plan, { signal: hooks.signal }));
    const result = createIlluminationControllerStagingResult(staged, {
        profileId: 'fixture-profile',
        cityId: 'fixture-city',
        compilerSignature: 'fixture-compiler',
        selectedChannels: ['fixture-channel'],
        sourceHashes: { source: 'a'.repeat(64) },
        integrityHashes: { aggregate: 'b'.repeat(64) }
    });

    assert.equal(hooks.accept(result), true);
    assert.equal(staged.disposition, 'ready_to_commit');
    assert.equal(activeSnapshot, null);
    assert.equal(controller.getSnapshot().phase, 'ready_to_commit');
    assert.equal(controller.getSnapshot().effectiveMode, 'current');

    const active = controller.commitFrameBoundary();
    assert.equal(active.effectiveMode, 'baked');
    assert.equal(staged.disposition, 'committed');
    assert.equal(activeSnapshot, staged.activationSnapshot);
    assert.equal(controller.getActiveResourceSet(), staged);
    assert.deepEqual(active.memory, {
        residentCpuBytes: 2,
        residentGpuBytes: 16,
        peakCpuBytes: 14,
        peakGpuBytes: 16
    });

    controller.deactivate('test_complete');
    assert.equal(staged.disposition, 'committed');
    controller.commitFrameBoundary();
    await controller.waitForIdle();
    assert.equal(staged.disposition, 'disposed');
    assert.equal(harness.disposalCounts.get('resource/alpha'), 1);
});
