// Sizes the surface cache's per-frame generation batch from its measured GPU cost.
// @ts-check
// AI577 D6 (landscape-surface-cache-runtime-v2). A generation batch costs a fixed part per frame (target switches, the scratch pass, the unpack
// draws) plus a part per page, so the controller fits a line ms = fixed + perPage x pages over the recent timed batches instead of dividing by
// their page counts: a ratio per page charges the fixed part to the pages of small batches, and batches kept small by a lack of candidates then
// shrink the quota further (measured in a 90 degree per second turn: quota stuck at 5 to 9 pages while 900 pages were missing). The quota is the
// page count whose fitted cost plus the residual spread (90th percentile of the batches above the line) meets the frame's target; it grows by at
// most quotaGrowth per timed batch and is cut at once when a batch exceeded the limit.
// AI577 D7 (landscape-surface-cache-controller-v3): the timer of a batch also counts GPU time the batch did not cause. Measured in motion, 10-17% of
// batches took 1.3-5.1 ms where their neighbours took 0.2-0.6 ms, and in those the unpack (a copy of a few pages, 0.015-0.06 ms) took 0.6-4.6 ms with
// an unchanged CPU submission time: another process's GPU work ran inside its timer window. A batch's own cost therefore counts the unpack at most
// unpackCapRatio times its recent median (landscapeSurfaceCacheBatchCost) and reports the rest as external. A least-squares line and a mean-based
// prior followed such spikes (0.38 ms per page in a 30 m/s flight), so the quota fell to one page per frame and stayed there: one-page batches never
// spread enough to fit a line again while hundreds of pages were missing. The line is a Theil-Sen fit (median of pairwise slopes, median intercept),
// batches without spread use a prior per-page cost with a median intercept, and the quota grows by at least minimumGrowthPages per timed batch towards
// the fitted size. Own costs above the line count: the batch meets the target with the 90th percentile of every residual and the limit with their
// 95th (the p95 objective), the tail never taking more than half of the target's batch (a tail that smaller batches do not shrink must not starve
// generation), and a batch whose own cost exceeds the limit cuts the quota at once. Controller v2 set aside residuals more than 0.25 ms above the line
// and held the quota on them: measured in fixed-timestep motion at 1920x1080, 11-18% of its batches exceeded the 1.2 ms limit (timer p95 1.6-2.7 ms);
// v3's own costs exceed it in 2-8% (p95 1.1-1.4 ms), a residual tail that pages, blocks and draws explain little of.

export const LANDSCAPE_SURFACE_CACHE_CONTROLLER = Object.freeze({
    id: 'landscape-surface-cache-controller-v3',
    // prior costs before the batches spread enough to fit a line (the measured fit at 1920x1080: 0.37 ms + 0.021 ms per page)
    priorFixedMs: .35,
    priorPerPageMs: .021,
    minimumPerPageMs: .004,
    // a line needs this many batches spread over at least this many pages
    fitSamples: 6,
    fitSpreadPages: 4,
    // the margin: this quantile of the residuals above the line (page costs vary about threefold with mip, soils and slope; measured in a 90 degree
    // per second turn, a 75th percentile margin left the batch p95 at 1.6 ms against the 1.2 ms limit)
    residualQuantile: .9,
    // the tail: this quantile of the residuals fits under the limit, reducing the target's batch by at most tailMaxReduction
    tailQuantile: .95,
    tailMaxReduction: .5,
    // outliers (reported, not set aside): residuals above outlierMads scaled median absolute deviations of the residuals, and above outlierFloorMs
    outlierMads: 3,
    outlierFloorMs: .25,
    minimumGrowthPages: 2,
    // a batch's own unpack time: at most unpackCapRatio times the median of the recent unpacks, never capped below unpackFloorMs
    unpackCapRatio: 4,
    unpackFloorMs: .25
});

const CONTROLLER = LANDSCAPE_SURFACE_CACHE_CONTROLLER;
const median = values => {
    const sorted = Float64Array.from(values).sort(), n = sorted.length;
    return n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : NaN;
};

/**
 * The GPU time a timed batch itself took: its generation draws plus its unpack, the unpack counted at most unpackCapRatio times the median of the recent
 * unpacks (never capped below unpackFloorMs); the remainder is another process's work that ran inside the unpack's timer window.
 * @param {{generationMs:number,unpackMs:number,unpackMedianMs:number|null}} timing
 * @returns {{ms:number,externalMs:number}}
 */
export function landscapeSurfaceCacheBatchCost({ generationMs, unpackMs, unpackMedianMs }) {
    const typical = typeof unpackMedianMs === 'number' && Number.isFinite(unpackMedianMs) ? unpackMedianMs : 0;
    const own = Math.min(unpackMs, Math.max(CONTROLLER.unpackFloorMs, CONTROLLER.unpackCapRatio * typical));
    return { ms: generationMs + own, externalMs: unpackMs - own };
}

/**
 * Robust line fit of recent batch costs. @param {ReadonlyArray<readonly [number, number]>} samples [pages, ms] of timed batches (their own costs)
 * @returns {{fixedMs:number,perPageMs:number,marginMs:number,tailMs:number,outlierMs:number,outliers:number,samples:number,fitted:boolean}|null} outliers
 *   counts the residuals above outlierMs (a diagnostic: the margin and the tail cover every residual)
 */
export function fitLandscapeSurfaceCacheCost(samples) {
    const n = samples.length;
    if (!n) return null;
    let low = Infinity, high = -Infinity;
    for (const [pages] of samples) { low = Math.min(low, pages); high = Math.max(high, pages); }
    const fitted = n >= CONTROLLER.fitSamples && high - low >= CONTROLLER.fitSpreadPages;
    let perPageMs = CONTROLLER.priorPerPageMs;
    if (fitted) {
        const slopes = [];
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            const pages = samples[j][0] - samples[i][0];
            if (pages) slopes.push((samples[j][1] - samples[i][1]) / pages);
        }
        perPageMs = Math.max(CONTROLLER.minimumPerPageMs, median(slopes));
    }
    const fixedMs = Math.max(0, median(samples.map(([pages, ms]) => ms - perPageMs * pages)));
    const residuals = samples.map(([pages, ms]) => ms - fixedMs - perPageMs * pages), center = median(residuals);
    const outlierMs = Math.max(CONTROLLER.outlierFloorMs, CONTROLLER.outlierMads * 1.4826 * median(residuals.map(value => Math.abs(value - center))));
    const sorted = Float64Array.from(residuals).sort();
    return { fixedMs, perPageMs, marginMs: Math.max(0, sorted[Math.floor((n - 1) * CONTROLLER.residualQuantile)]),
        tailMs: Math.max(0, sorted[Math.floor((n - 1) * CONTROLLER.tailQuantile)]), outlierMs, outliers: residuals.filter(value => value > outlierMs).length, samples: n, fitted };
}

/**
 * The next batch quota. @param {{quota:number,model:ReturnType<typeof fitLandscapeSurfaceCacheCost>,targetMs:number,limitMs:number,lastMs:number,lastPages:number,
 *   maximum:number,growth:number,cut:number}} options lastMs/lastPages are the batch just timed (its own cost, already in the model's samples)
 */
export function nextLandscapeSurfaceCacheQuota({ quota, model, targetMs, limitMs, lastMs, lastPages, maximum, growth, cut }) {
    if (lastMs > limitMs) return Math.max(1, Math.min(quota, lastPages) * cut);
    if (!model) return quota;
    const target = (targetMs - model.fixedMs - model.marginMs) / model.perPageMs, tail = (limitMs - model.fixedMs - model.tailMs) / model.perPageMs;
    const fitted = Math.max(target * (1 - CONTROLLER.tailMaxReduction), Math.min(target, tail));
    return Math.min(maximum, Math.max(1, Math.min(fitted, Math.max(quota * growth, quota + CONTROLLER.minimumGrowthPages))));
}

/**
 * GPU milliseconds a batch targets: the budget, or the headroom the view's frames leave below the frame period and its margin, never below the floor.
 * frameGpuMs is the view's recent frame GPU time (the runtime passes the median of its recent frames, so one slow frame does not starve generation).
 * @param {{frameGpuMs:number|null,budgetMs:number,periodMs:number,marginMs:number,floorMs:number}} options
 */
export function landscapeSurfaceCacheGenerationTarget({ frameGpuMs, budgetMs, periodMs, marginMs, floorMs }) {
    if (frameGpuMs === null || !Number.isFinite(frameGpuMs)) return budgetMs;
    return Math.min(budgetMs, Math.max(floorMs, periodMs - marginMs - frameGpuMs));
}
