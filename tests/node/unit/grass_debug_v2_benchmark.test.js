// Checks benchmark percentile convention, hitch retention and unavailable samples.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBenchmarkTimings } from '../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2BenchmarkStats.js';

test('benchmark timings retain hitches and use nearest-rank P99', () => {
    const samples = [...Array(98).fill(2), 20, 100];
    const stats = summarizeBenchmarkTimings(samples);
    assert.equal(stats.averageMs, 3.16);
    assert.equal(stats.p99Ms, 20);
    assert.equal(stats.count, 100);
    assert.deepEqual(samples, [...Array(98).fill(2), 20, 100]);
    assert.equal(summarizeBenchmarkTimings([7, 1, 4]).p99Ms, 7);
    assert.equal(summarizeBenchmarkTimings([]), null);
});
