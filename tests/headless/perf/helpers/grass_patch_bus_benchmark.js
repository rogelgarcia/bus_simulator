// Replay the same forward bus-camera poses with one full lab render per animation frame.
export async function measureGrassBusPass(view, { mode, frames = 360, distance = 71.06 }) {
    const { renderer, camera, gpuTimer } = view, gl = renderer.getContext();
    renderer.setAnimationLoop(null);
    view.benchmark.cancel(); view.keyboard.clear(); view.controls.enabled = false;
    view.grass.setMode(mode);
    const origin = view.busPose.position.clone(), target = view.busPose.target.clone();
    camera.position.copy(origin); camera.lookAt(target); camera.updateMatrixWorld(true);
    const rotation = camera.quaternion.clone();
    const pose = fraction => {
        camera.position.copy(origin); camera.position.z += distance * fraction;
        camera.quaternion.copy(rotation); camera.updateMatrixWorld(true);
    };
    const raf = () => new Promise(resolve => requestAnimationFrame(resolve));
    // Warm every part of the route before measurement, then settle back at the bus.
    for (let i = 0; i < 96; i++) { pose(i / 95); view.render(await raf()); }
    for (let i = 0; i < 90; i++) { pose(0); view.render(await raf()); }
    const start = gpuTimer.getDiagnostics(), memory = { ...renderer.info.memory, programs: renderer.info.programs.length };
    const snapshot = view.getSnapshot(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuName = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null;
    const rows = [], bySubmission = new Map(), uploads = { buffers: 0, textures: 0, bufferCreates: 0 }, longTasks = [];
    let cursor = start.sampleSequence;
    const consume = () => {
        gpuTimer.poll();
        for (const sample of gpuTimer.getSamplesSince(cursor)) {
            const row = bySubmission.get(sample.submissionSequence);
            if (row) row.gpuMs = sample.ms;
            cursor = sample.sequence;
        }
    };
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration }))));
    observer.observe({ type: 'longtask' });
    const names = ['bufferData', 'bufferSubData', 'createBuffer', 'texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'generateMipmap'];
    const originals = names.map(name => [name, gl[name]]);
    for (const [name, original] of originals) gl[name] = function (...args) {
        uploads[name === 'createBuffer' ? 'bufferCreates' : name.startsWith('buffer') ? 'buffers' : 'textures']++;
        return original.apply(this, args);
    };
    let previous = null, firstTime = null, lastTime = null, measuredStart, measuredEnd;
    try {
        for (let i = 0; i < frames; i++) {
            const time = await raf(), arrival = performance.now();
            if (firstTime === null) { firstTime = time; measuredStart = arrival; }
            pose(i / (frames - 1)); consume();
            const beforeSubmission = gpuTimer.getDiagnostics().submissionSequence;
            const cpuStart = performance.now(); view.render(time); const cpuMs = performance.now() - cpuStart;
            const afterSubmission = gpuTimer.getDiagnostics().submissionSequence;
            const row = { i, distance: distance * i / (frames - 1), timestamp: time - firstTime, cpuMs,
                frameMs: previous === null ? null : time - previous, gpuMs: null,
                submission: afterSubmission > beforeSubmission ? afterSubmission : null,
                calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
            rows.push(row); if (row.submission !== null) bySubmission.set(row.submission, row);
            previous = time; lastTime = time;
        }
        measuredEnd = performance.now();
    } finally { for (const [name, original] of originals) gl[name] = original; }
    const deadline = performance.now() + 4000;
    while (rows.some(row => row.gpuMs === null) && performance.now() < deadline) { await raf(); consume(); }
    const end = gpuTimer.getDiagnostics(); observer.disconnect();
    const afterMemory = { ...renderer.info.memory, programs: renderer.info.programs.length };
    return { mode, frames, distance, pacing: 'one matched pose per animation frame; wall-clock duration may differ by case',
        origin: origin.toArray(), target: target.toArray(), endPosition: camera.position.toArray(), quaternion: rotation.toArray(),
        viewport: snapshot.viewport, lighting: snapshot.lighting, grass: snapshot.grass,
        gpuName, timer: { start, end, coverage: rows.filter(row => row.gpuMs !== null).length / rows.length,
            valid: start.active && end.active && start.disjointCount === end.disjointCount && rows.every(row => row.gpuMs !== null) },
        memory: { before: memory, after: afterMemory }, uploads, durationMs: lastTime - firstTime,
        longTasks: longTasks.filter(task => task.start >= measuredStart && task.start < measuredEnd),
        rows, glError: gl.getError() };
}
