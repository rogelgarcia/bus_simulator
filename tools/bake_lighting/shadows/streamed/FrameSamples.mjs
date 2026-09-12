// Measures whole-frame submissions without repeating the last completed GPU query.
// @ts-check

/** Runs inside the isolated game page. */
export async function collectShadowFrameSamples({ sampleFrames = 360, warmupFrames = 60 } = {}) {
    const e = window.__busSim.engine, renderer = e.renderer, timer = e._gpuFrameTimer;
    const originalFrame = e.updateFrame, originalRender = renderer.render;
    const initialTimer = timer.getDiagnostics(), frames = [], samples = [];
    if (!initialTimer.active) throw new Error('GPU timer unavailable');
    let sequence = initialTimer.sampleSequence, cursor = 0, previous = 0, measuring = false;
    let calls = 0, triangles = 0;
    const drain = () => {
        const fresh = timer.getSamplesSince(sequence); samples.push(...fresh);
        if (fresh.length) sequence = fresh.at(-1).sequence;
    };
    // The HUD resets its counters after the hybrid moving-shadow pass. Sum each
    // renderer invocation too, so that pass is included in the comparison table.
    renderer.render = function (...args) {
        const before = { ...renderer.info.render }, resets = renderer.info.autoReset;
        const result = originalRender.apply(this, args);
        if (measuring) {
            calls += renderer.info.render.calls - (resets ? 0 : before.calls);
            triangles += renderer.info.render.triangles - (resets ? 0 : before.triangles);
        }
        return result;
    };
    try {
        await new Promise((resolve, reject) => {
            e.updateFrame = function (...args) {
                if (cursor >= sampleFrames + warmupFrames) return originalFrame.apply(this, args);
                try {
                    const now = performance.now(); calls = 0; triangles = 0; measuring = true;
                    const result = originalFrame.apply(this, args), cpuMs = performance.now() - now;
                    measuring = false; drain();
                    if (cursor >= warmupFrames) frames.push({ frameIndex: e.frameIndex,
                        submission: timer.getDiagnostics().submissionSequence,
                        cpuMs, frameMs: previous ? now - previous : null, gpuMs: null,
                        calls, triangles, hudCalls: renderer.info.render.calls,
                        hudTriangles: renderer.info.render.triangles,
                        textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
                        programs: renderer.info.programs.length });
                    previous = now; cursor++;
                    if (cursor === sampleFrames + warmupFrames) resolve();
                    return result;
                } catch (error) { measuring = false; cursor = sampleFrames + warmupFrames; reject(error); }
            };
        });
        await new Promise(resolve => { let remaining = 24; const tick = () => --remaining ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); });
        drain();
    } finally { e.updateFrame = originalFrame; renderer.render = originalRender; }
    const completed = new Map(samples.map(sample => [sample.submissionSequence, sample.ms]));
    for (const frame of frames) frame.gpuMs = completed.get(frame.submission) ?? null;
    const finalTimer = timer.getDiagnostics();
    if (finalTimer.disjointCount !== initialTimer.disjointCount || !finalTimer.active
        || new Set(frames.map(f => f.submission)).size !== frames.length
        || frames.filter(f => f.gpuMs !== null).length < frames.length * .99) throw new Error('Invalid or insufficient matched GPU queries');
    return { frames, initialTimer, finalTimer, sampleFrames, warmupFrames };
}

/** Linear-interpolated percentiles and explicit fastest/slowest 1% means. */
export function distribution(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) throw new Error('No finite timing samples');
    const percentile = fraction => {
        const index = (sorted.length - 1) * fraction, low = Math.floor(index), high = Math.ceil(index);
        return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
    };
    const mean = a => a.reduce((sum, value) => sum + value, 0) / a.length;
    const tailCount = Math.max(1, Math.ceil(sorted.length * .01));
    return { count: sorted.length, minimum: sorted[0], p01: percentile(.01), median: percentile(.5),
        p95: percentile(.95), p99: percentile(.99), maximum: sorted.at(-1), mean: mean(sorted),
        fastestOnePercentMean: mean(sorted.slice(0, tailCount)), slowestOnePercentMean: mean(sorted.slice(-tailCount)), tailCount };
}

/** Summarizes every recorded field using the same sample population. */
export function summarizeShadowFrames(frames) {
    return Object.fromEntries(['gpuMs', 'cpuMs', 'frameMs', 'calls', 'triangles', 'hudCalls', 'hudTriangles', 'textures', 'geometries', 'programs']
        .map(key => [key, distribution(frames.map(frame => frame[key]))]));
}

/** Local preview ports are transport details, not lighting differences. */
export function comparableShadowSettings(evidence) {
    return JSON.stringify([evidence.lighting, evidence.atmosphere, evidence.graphics], (key, value) => {
        if (typeof value === 'string' && /^http:\/\/127\.0\.0\.1:\d+\//.test(value)) {
            const url = new URL(value); return url.pathname + url.search;
        }
        return value;
    });
}

/** The package controller also owns the parent texture while hooks are detached. */
export function shadowMemoryEstimate(allocations) {
    const parentResidentBytes = allocations.pipeline.runtime.controller.memory.residentGpuBytes;
    const liveBytes = allocations.liveMaps.reduce((sum, map) => sum + map.estimatedGpuBytes, 0);
    const activeLiveBytes = allocations.liveMaps.filter(map => map.castShadow).reduce((sum, map) => sum + map.estimatedGpuBytes, 0);
    const extra = allocations.detailResidentBytes + allocations.movingShadowBytes;
    return { ...allocations, parentResidentBytes,
        retainedShadowBytes: parentResidentBytes + extra + liveBytes,
        activeShadowBytes: (allocations.pipeline.active ? parentResidentBytes : 0) + extra + activeLiveBytes };
}
