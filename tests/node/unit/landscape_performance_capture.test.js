// Verifies optional telemetry cannot exceed or leak the shared resource ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LandscapeResidencyBudget } from '../../../src/app/landscape/LandscapeResidencyBudget.js';
import { LandscapePerformanceCapture, LANDSCAPE_PERFORMANCE_COLUMNS } from '../../../src/graphics/gui/landscape_fabrication/LandscapePerformanceCapture.js';

function timer() {
    const samples = [];
    return { samples,
        getDiagnostics: () => ({ sampleSequence: samples.at(-1)?.sequence ?? 0, submissionSequence: 10, isSupported: true }),
        getSamplesSince: sequence => samples.filter(sample => sample.sequence > sequence) };
}
const frame = nowMs => ({ nowMs, intervalMs: 16, cpuFrameMs: 2, geometryStreamingMs: .5, appearanceStreamingMs: .4,
    uploadedBytes: 64, render: { calls: 2, triangles: 100 }, memory: { geometries: 3, textures: 4 } });

test('Landscape performance: denied capture admission leaves existing resources intact', () => {
    const budget = new LandscapeResidencyBudget({ cpuBytes: 1000, gpuBytes: 1000 });
    budget.reserve('terrain', { cpuBytes: 900, gpuBytes: 200, kind: 'terrain' });
    assert.throws(() => new LandscapePerformanceCapture({ budget, gpuTimer: timer(), nowMs: 0, maxFrames: 2 }), /cannot fit/);
    assert.equal(budget.snapshot().cpuBytes, 900);
    assert.equal(budget.snapshot().entries.length, 1);
    assert.throws(() => new LandscapePerformanceCapture({ budget, gpuTimer: timer(), nowMs: 0, maxFrames: 16385 }), /1..16384/);
    assert.equal(budget.snapshot().entries.length, 1);
});

test('Landscape performance: samples are bounded, unique GPU queries exclude prior frames, finish releases buffers', () => {
    const budget = new LandscapeResidencyBudget(), gpuTimer = timer();
    const capture = new LandscapePerformanceCapture({ budget, gpuTimer, nowMs: 100, maxFrames: 2 });
    assert.equal(budget.snapshot().cpuBytes, 2 * (LANDSCAPE_PERFORMANCE_COLUMNS.length + 3) * 8);
    gpuTimer.samples.push({ sequence: 1, submissionSequence: 10, ms: 20 }, { sequence: 2, submissionSequence: 11, ms: 3 });
    capture.record(frame(116)); capture.record(frame(132));
    gpuTimer.samples.push({ sequence: 3, submissionSequence: 12, ms: 4 }, { sequence: 4, submissionSequence: 13, ms: 5 });
    capture.record(frame(148));
    const result = capture.finish();
    assert.equal(result.frameCount, 2); assert.equal(result.droppedFrames, 1);
    assert.deepEqual(result.gpu, [2, 11, 3, 3, 12, 4]);
    assert.equal(result.droppedGpuSamples, 1);
    assert.equal(result.frames[0], 16); assert.equal(result.frames[LANDSCAPE_PERFORMANCE_COLUMNS.length], 32);
    assert.equal(budget.snapshot().cpuBytes, 0); assert.equal(capture.frames, null); assert.equal(capture.gpu, null);
    assert.throws(() => capture.finish(), /already ended/);
});

test('Landscape performance: abandoning a capture is idempotent and does not release terrain', () => {
    const budget = new LandscapeResidencyBudget();
    budget.reserve('terrain', { cpuBytes: 100, gpuBytes: 200, kind: 'terrain' });
    const capture = new LandscapePerformanceCapture({ budget, gpuTimer: timer(), nowMs: 0 });
    capture.record(frame(16)); capture.dispose(); capture.dispose(); capture.record(frame(32));
    assert.equal(budget.snapshot().cpuBytes, 100); assert.equal(budget.snapshot().gpuBytes, 200);
    assert.equal(budget.snapshot().entries.length, 1);
});
