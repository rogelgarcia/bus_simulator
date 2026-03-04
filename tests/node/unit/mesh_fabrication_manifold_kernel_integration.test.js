import test from 'node:test';
import assert from 'node:assert/strict';

import {
    ensureBooleanKernelReady,
    getBooleanKernelStatus
} from '../../../src/graphics/gui/mesh_fabrication/meshCommandPipeline.js';

test('MeshBooleanKernelIntegration: manifold import is initialized and probed', () => {
    const before = getBooleanKernelStatus();
    assert.equal(before.kernelId, 'manifold-3d');
    assert.equal(before.initialized, true);

    const module = ensureBooleanKernelReady();
    assert.ok(module && typeof module === 'object');
    assert.equal(typeof module.Manifold?.cube, 'function');
    assert.equal(typeof module.Manifold?.difference, 'function');

    const after = getBooleanKernelStatus();
    assert.equal(after.kernelId, 'manifold-3d');
    assert.equal(after.initialized, true);
    assert.equal(after.probeCompleted, true);
});

