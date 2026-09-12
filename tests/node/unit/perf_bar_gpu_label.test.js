import test from 'node:test';
import assert from 'node:assert/strict';
import { PerfBar, simplifyGpuLabel } from '../../../src/graphics/gui/perf_bar/PerfBar.js';

test('PerfBar reads GPU identity when attached, not on every measured frame', () => {
    let reads = 0;
    const gl = { getParameter() { reads++; return 'GPU'; }, getExtension: () => null };
    const renderer = { getContext: () => gl }, bar = new PerfBar();
    bar.setRenderer(renderer); const initialReads = reads;
    for (let frame = 1; frame <= 100; frame++) bar.onFrame({ renderer, dt: .016, nowMs: frame * 16 });
    assert.equal(reads, initialReads);
    bar.onFrame({ renderer: { getContext: () => gl }, dt: .016, nowMs: 2000 });
    assert.ok(reads > initialReads);
});

test('PerfBar GPU label removes the hexadecimal device identifier', () => {
    const label = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)';
    assert.equal(simplifyGpuLabel(label), 'NVIDIA GeForce RTX 3060');
});

test('PerfBar GPU label preserves non-identifier model text', () => {
    assert.equal(simplifyGpuLabel('Intel(R) Iris(R) Xe Graphics'), 'Intel(R) Iris(R) Xe Graphics');
});
