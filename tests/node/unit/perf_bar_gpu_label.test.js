import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifyGpuLabel } from '../../../src/graphics/gui/perf_bar/PerfBar.js';

test('PerfBar GPU label removes the hexadecimal device identifier', () => {
    const label = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)';
    assert.equal(simplifyGpuLabel(label), 'NVIDIA GeForce RTX 3060');
});

test('PerfBar GPU label preserves non-identifier model text', () => {
    assert.equal(simplifyGpuLabel('Intel(R) Iris(R) Xe Graphics'), 'Intel(R) Iris(R) Xe Graphics');
});
