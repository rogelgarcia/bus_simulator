// Verifies shared appearance allowance transactions and exact mip residency costs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LandscapeResidencyBudget } from '../../../src/app/landscape/LandscapeResidencyBudget.js';
import { LandscapeAppearanceBudget, landscapeTextureBytes } from '../../../src/graphics/engine3d/landscape/LandscapeAppearanceBudget.js';

const MIB = 1024 * 1024;

test('Appearance budget: denied growth restores protected credit and leaves no phantom entry', () => {
    const shared = new LandscapeResidencyBudget();
    const appearance = new LandscapeAppearanceBudget(shared, 'test');
    assert.equal(shared.reserve('geometry', { cpuBytes: 64 * MIB, gpuBytes: 56 * MIB, kind: 'geometry' }).admitted, true);
    const before = shared.snapshot();
    const rejected = appearance.reserve('fine-material', { cpuBytes: 2 * MIB, gpuBytes: 9 * MIB, kind: 'material' });
    assert.equal(rejected.admitted, false);
    assert.equal(rejected.reason, 'gpu-budget');
    assert.equal(shared.has('fine-material'), false);
    assert.deepEqual(shared.snapshot().entries, before.entries);
    assert.equal(shared.snapshot().gpuBytes, 64 * MIB);
    appearance.dispose();
    shared.release('geometry');
    assert.equal(shared.snapshot().cpuBytes, 0);
    assert.equal(shared.snapshot().gpuBytes, 0);
});

test('Appearance budget: real pages replace credit and shrinking/release restores the exact floor', () => {
    const shared = new LandscapeResidencyBudget();
    const appearance = new LandscapeAppearanceBudget(shared, 'test');
    assert.equal(appearance.reserve('page', { cpuBytes: 14 * MIB, gpuBytes: 9 * MIB, kind: 'decode' }).admitted, true);
    assert.deepEqual(appearance.snapshot().reserved, { cpuBytes: 0, gpuBytes: 0 });
    assert.equal(appearance.update('page', { cpuBytes: MIB, gpuBytes: MIB, kind: 'resident' }).admitted, true);
    assert.deepEqual(appearance.snapshot().reserved, { cpuBytes: 11 * MIB, gpuBytes: 7 * MIB });
    assert.equal(shared.snapshot().cpuBytes, 12 * MIB);
    assert.equal(shared.snapshot().gpuBytes, 8 * MIB);
    const lease = shared.acquireLease('page', { consumer: 'visible-mask' });
    assert.equal(appearance.release('page'), false);
    assert.equal(appearance.snapshot().gpuBytes, MIB);
    lease.release();
    assert.equal(appearance.release('page'), true);
    assert.deepEqual(appearance.snapshot().reserved, { cpuBytes: 12 * MIB, gpuBytes: 8 * MIB });
    appearance.dispose();
    assert.equal(shared.snapshot().entries.length, 0);
    assert.equal(shared.snapshot().leaseCount, 0);
});

test('Appearance budget: small profiles scale their protected floor and failed minimum cleans up', () => {
    const shared = new LandscapeResidencyBudget({ cpuBytes: 16 * MIB, gpuBytes: 8 * MIB });
    const appearance = new LandscapeAppearanceBudget(shared, 'low');
    assert.deepEqual(appearance.snapshot().reserved, { cpuBytes: 1.5 * MIB, gpuBytes: MIB });
    assert.equal(appearance.reserve('oversized', { cpuBytes: 9 * MIB, gpuBytes: 0, kind: 'mask' }).admitted, false);
    appearance.dispose();
    assert.equal(shared.snapshot().entries.length, 0);
    assert.equal(shared.snapshot().cpuBytes, 0);
    assert.equal(shared.snapshot().gpuBytes, 0);
});

test('Appearance textures: mip accounting includes every real level and shared map layer', () => {
    assert.equal(landscapeTextureBytes(32), 5460);
    assert.equal(landscapeTextureBytes(128), 87380);
    assert.equal(landscapeTextureBytes(512) * 3, 4194300);
    assert.equal(landscapeTextureBytes(1), 4);
    assert.throws(() => landscapeTextureBytes(0), /dimensions/);
});
