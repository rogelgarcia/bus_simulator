// Replays visual transforms, not physics history. Metrics join completed GPU
// queries to their submission; the recorded configuration is not silently applied.
export async function measureStreamedRoute(input) {
    const { engine: e, sm } = window.__busSim, state = sm.current;
    const originalFrame = e.updateFrame, originalCamera = state._applyGameplayPoseCamera;
    const frames = [], samples = [], timer = e._gpuFrameTimer;
    let cursor = 0, previous = 0, sequence = timer.getDiagnostics().sampleSequence;
    state.gameLoop.pause(); state._applyGameplayPoseCamera = () => {};
    const drain = () => {
        const fresh = timer.getSamplesSince(sequence); samples.push(...fresh);
        if (fresh.length) sequence = fresh.at(-1).sequence;
    };
    try {
        await new Promise((resolve, reject) => {
            e.updateFrame = function (...args) {
                if (cursor >= input.length) { const result = originalFrame.apply(this, args); drain(); return result; }
                try {
                    const pose = input[cursor], now = performance.now();
                    state.busAnchor.position.fromArray(pose.bus); state.busAnchor.quaternion.fromArray(pose.bus, 3);
                    e.camera.position.fromArray(pose.camera); e.camera.quaternion.fromArray(pose.camera, 3);
                    [e.camera.fov, e.camera.zoom, e.camera.near, e.camera.far] = pose.projection;
                    e.camera.updateProjectionMatrix();
                    const result = originalFrame.apply(this, args), cpu = performance.now() - now;
                    drain();
                    const d = e._bakedLighting.shadows.getDiagnostics().pipeline.streamedShadows;
                    frames.push({ sourceFrame: pose.frame, cpu, frameMs: previous ? now - previous : null,
                        submission: timer.getDiagnostics().submissionSequence,
                        gpu: null, calls: e.renderer.info.render.calls, triangles: e.renderer.info.render.triangles,
                        programs: e.renderer.info.programs.length, textures: e.renderer.info.memory.textures,
                        resident: d.resident, pending: d.pending, gpuBytes: d.gpuBytes, requests: d.requests,
                        evictions: d.evictions, uploadMs: d.uploadMs, selectionFallbacks: d.selectionFallbacks,
                        mode: e._bakedLighting.effectiveMode, generation: e._bakedLighting.generation });
                    previous = now; cursor++;
                    if (cursor === input.length) resolve();
                    return result;
                } catch (error) { cursor = input.length; reject(error); }
            };
        });
        await new Promise(resolve => { let count = 12; const tick = () => --count ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); });
        drain();
    } finally { e.updateFrame = originalFrame; state._applyGameplayPoseCamera = originalCamera; }
    const gpu = new Map(samples.map(sample => [sample.submissionSequence, sample.ms]));
    for (const frame of frames) frame.gpu = gpu.get(frame.submission) ?? null;
    const stats = values => {
        const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
        const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        return { count: sorted.length, median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * .95)],
            maximum: sorted.at(-1), mean, standardDeviation: Math.sqrt(sorted.reduce((n, v) => n + (v - mean) ** 2, 0) / sorted.length) };
    };
    const regions = [0xb00, 0xc00, 0xd00].map(start => {
        const region = frames.filter(frame => frame.sourceFrame >= start && frame.sourceFrame < start + 256);
        return { hex: start.toString(16), count: region.length, gpu: stats(region.map(f => f.gpu)), cpu: stats(region.map(f => f.cpu)) };
    });
    if (frames.some(f => f.mode !== 'baked') || new Set(frames.map(f => f.generation)).size !== 1) throw new Error('Route interrupted baked illumination');
    if (frames.some(f => f.resident > 16 || f.pending > 2)) throw new Error('Route exceeded residency bounds');
    if (frames.filter(f => f.gpu !== null).length < frames.length * .95) throw new Error('Insufficient matched GPU samples');
    return { frames, regions, gpu: stats(frames.map(f => f.gpu)), cpu: stats(frames.map(f => f.cpu)),
        frameMs: stats(frames.map(f => f.frameMs)), timingPolicy: 'One recorded visual pose per rendered frame, completed GPU query joined by submission; original wall-clock pacing and other actors not replayed' };
}
