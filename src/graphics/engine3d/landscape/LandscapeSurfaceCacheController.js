// Sizes the surface cache's per-frame generation batch from its measured GPU cost.
// @ts-check
// AI577 D6 (landscape-surface-cache-runtime-v2). A generation batch costs a fixed part per frame (target switches, the scratch pass, the unpack
// draws) plus a part per page, so the controller fits a line ms = fixed + perPage x pages over the recent timed batches instead of dividing by
// their page counts: a ratio per page charges the fixed part to the pages of small batches, and batches kept small by a lack of candidates then
// shrink the quota further (measured in a 90 degree per second turn: quota stuck at 5 to 9 pages while 900 pages were missing). The quota is the
// page count whose fitted cost plus the residual spread (90th percentile of the batches above the line) meets the frame's target; it grows by at
// most quotaGrowth per timed batch and is cut at once when a batch exceeded the limit.

export const LANDSCAPE_SURFACE_CACHE_CONTROLLER = Object.freeze({
    id: 'landscape-surface-cache-controller-v1',
    // prior fixed cost before the batches spread enough to fit it (the measured fit at 1920x1080: 0.37 ms + 0.021 ms per page)
    priorFixedMs: .35,
    minimumPerPageMs: .004,
    // least squares needs this many batches spread over at least this many pages
    fitSamples: 6,
    fitSpreadPages: 4,
    // the margin: this quantile of the batches' residuals above the line (page costs vary about threefold with mip, soils and slope; measured in a
    // 90 degree per second turn, a 75th percentile margin left the batch p95 at 1.6 ms against the 1.2 ms limit)
    residualQuantile: .9
});

const CONTROLLER = LANDSCAPE_SURFACE_CACHE_CONTROLLER;

/**
 * Line fit of recent batch costs. @param {ReadonlyArray<readonly [number, number]>} samples [pages, ms] of timed batches
 * @returns {{fixedMs:number,perPageMs:number,marginMs:number,samples:number,fitted:boolean}|null}
 */
export function fitLandscapeSurfaceCacheCost(samples) {
    const n = samples.length;
    if (!n) return null;
    let sumPages = 0, sumMs = 0, low = Infinity, high = -Infinity;
    for (const [pages, ms] of samples) { sumPages += pages; sumMs += ms; low = Math.min(low, pages); high = Math.max(high, pages); }
    const meanPages = sumPages / n, meanMs = sumMs / n;
    let covariance = 0, variance = 0;
    for (const [pages, ms] of samples) { covariance += (pages - meanPages) * (ms - meanMs); variance += (pages - meanPages) ** 2; }
    const fitted = n >= CONTROLLER.fitSamples && high - low >= CONTROLLER.fitSpreadPages && variance > 0;
    let perPageMs, fixedMs;
    if (fitted) {
        perPageMs = Math.max(CONTROLLER.minimumPerPageMs, covariance / variance);
        fixedMs = Math.max(0, meanMs - perPageMs * meanPages);
    } else {
        fixedMs = Math.min(CONTROLLER.priorFixedMs, meanMs);
        perPageMs = Math.max(CONTROLLER.minimumPerPageMs, (meanMs - fixedMs) / Math.max(1, meanPages));
    }
    const residuals = samples.map(([pages, ms]) => ms - fixedMs - perPageMs * pages).sort((a, b) => a - b);
    return { fixedMs, perPageMs, marginMs: Math.max(0, residuals[Math.floor((n - 1) * CONTROLLER.residualQuantile)]), samples: n, fitted };
}

/**
 * The next batch quota. @param {{quota:number,model:ReturnType<typeof fitLandscapeSurfaceCacheCost>,targetMs:number,limitMs:number,lastMs:number,lastPages:number,
 *   maximum:number,growth:number,cut:number}} options lastMs/lastPages are the batch just timed
 */
export function nextLandscapeSurfaceCacheQuota({ quota, model, targetMs, limitMs, lastMs, lastPages, maximum, growth, cut }) {
    if (lastMs > limitMs) return Math.max(1, Math.min(quota, lastPages) * cut);
    if (!model) return quota;
    const fitted = (targetMs - model.fixedMs - model.marginMs) / model.perPageMs;
    return Math.min(maximum, Math.max(1, Math.min(fitted, quota * growth)));
}

/**
 * GPU milliseconds a batch targets: the budget, or the headroom the view's last frame leaves below the frame period and its margin, never below
 * the floor. @param {{frameGpuMs:number|null,budgetMs:number,periodMs:number,marginMs:number,floorMs:number}} options
 */
export function landscapeSurfaceCacheGenerationTarget({ frameGpuMs, budgetMs, periodMs, marginMs, floorMs }) {
    if (frameGpuMs === null || !Number.isFinite(frameGpuMs)) return budgetMs;
    return Math.min(budgetMs, Math.max(floorMs, periodMs - marginMs - frameGpuMs));
}
