// Summarizes unfiltered benchmark samples using the nearest-rank P99 definition.
// @ts-check

/** @param {number[]} samples Millisecond samples. */
export function summarizeBenchmarkTimings(samples) {
    if (!samples.length) return null;
    const sorted = [...samples].sort((a, b) => a - b);
    return Object.freeze({
        count: sorted.length,
        averageMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
        p99Ms: sorted[Math.ceil(sorted.length * 0.99) - 1]
    });
}
