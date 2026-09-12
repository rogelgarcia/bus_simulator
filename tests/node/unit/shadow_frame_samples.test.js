import test from 'node:test';
import assert from 'node:assert/strict';
import { distribution, comparableShadowSettings, shadowMemoryEstimate } from '../../../tools/bake_lighting/shadows/streamed/FrameSamples.mjs';

test('frame timing percentiles distinguish thresholds from tail means', () => {
    const values = Array.from({ length: 1000 }, (_, i) => i + 1);
    const d = distribution([...values.reverse(), null, undefined, NaN]);
    assert.equal(d.count, 1000);
    assert.equal(d.median, 500.5);
    assert.equal(d.p01, 10.99);
    assert.equal(d.p99, 990.01);
    assert.equal(d.fastestOnePercentMean, 5.5);
    assert.equal(d.slowestOnePercentMean, 995.5);
    assert.equal(d.tailCount, 10);
});

test('single timing observation has finite identical percentiles; empty data fails', () => {
    const d = distribution([12]);
    for (const key of ['p01', 'median', 'p99', 'mean', 'fastestOnePercentMean', 'slowestOnePercentMean']) assert.equal(d[key], 12);
    assert.throws(() => distribution([null, NaN]), /No finite timing/);
});

test('isolated preview ports do not change lighting identity; asset and intensity edits do', () => {
    const evidence = (port, asset = 'sky.hdr', power = 12) => ({ lighting: { power, hdrUrl: `http://127.0.0.1:${port}/assets/${asset}` }, atmosphere: {}, graphics: {} });
    assert.equal(comparableShadowSettings(evidence(1234)), comparableShadowSettings(evidence(4567)));
    assert.notEqual(comparableShadowSettings(evidence(1234)), comparableShadowSettings(evidence(1234, 'other.hdr')));
    assert.notEqual(comparableShadowSettings(evidence(1234)), comparableShadowSettings(evidence(1234, 'sky.hdr', 13)));
});

test('disabled material hooks retain cached parent memory but not active shadow cost', () => {
    const base = { pipeline: { active: null, runtime: { controller: { memory: { residentGpuBytes: 448 } } } },
        detailResidentBytes: 0, movingShadowBytes: 0, liveMaps: [{ castShadow: true, estimatedGpuBytes: 2048 }] };
    assert.equal(shadowMemoryEstimate(base).retainedShadowBytes, 2496);
    assert.equal(shadowMemoryEstimate(base).activeShadowBytes, 2048);
    assert.equal(shadowMemoryEstimate({ ...base, pipeline: { ...base.pipeline, active: {} },
        movingShadowBytes: 128, detailResidentBytes: 52, liveMaps: [] }).activeShadowBytes, 628);
});
