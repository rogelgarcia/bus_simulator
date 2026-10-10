// Paired, warmed GPU measurements above the same soil-only scene; split views are excluded.
// @ts-check
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
// All six triplet permutations balance each case's position over six rounds.
const TRIPLET_ORDERS = [[0, 1, 2], [2, 1, 0], [1, 0, 2], [2, 0, 1], [0, 2, 1], [1, 2, 0]];

/** @param {object} viewer @param {{rounds?:number,frames?:number,rendersPerFrame?:number,onProgress?:Function}} options */
export async function benchmarkGrassBakedLighting(viewer, { rounds = 3, frames = 32, rendersPerFrame = 1, onProgress = () => {} } = {}) {
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20 || !Number.isInteger(frames) || frames < 16 || frames > 240)
        throw new Error('Benchmark requires 1–20 rounds and 16–240 frames per block.');
    if (!Number.isInteger(rendersPerFrame) || rendersPerFrame < 1 || rendersPerFrame > 8) throw new Error('Benchmark requires 1–8 renders per animation frame.');
    if (!viewer.gpu.isSupported) throw new Error('GPU timer queries are unavailable on this browser.');
    const previous = viewer.getSnapshot(), measurements = [];
    const levels = ['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5', 'AUTO'];
    const cases = [['current', 'OFF'], ...levels.flatMap(lod => ['current', 'baked'].map(strategy => [strategy, lod]))];
    viewer.setAnimating(false);
    try {
        // Finish all shader/texture uploads before the first soil baseline is measured.
        for (const [strategy, lod] of cases) {
            onProgress(`Prewarming ${strategy} · ${lod}`); viewer.setStrategy(strategy); viewer.setLod(lod);
            for (let i = 0; i < 24; i++) { if (i % rendersPerFrame === 0) await nextFrame(); viewer.step(0); }
        }
        for (let i = 0; i < 120; i++) { if (i % rendersPerFrame === 0) await nextFrame(); viewer.step(0); }
        for (let round = 0; round < rounds; round++) {
            const levelOrder = round % 2 ? [...levels].reverse() : levels;
            for (const pairedLod of levelOrder) {
                const pair = [['current', 'OFF'], ['current', pairedLod], ['baked', pairedLod]];
                const order = TRIPLET_ORDERS[round % TRIPLET_ORDERS.length].map(index => pair[index]);
                for (const [strategy, lod] of order) {
                    onProgress(`Round ${round + 1}/${rounds} · ${strategy} · ${lod}`);
                    viewer.setStrategy(strategy); viewer.setLod(lod);
                    for (let i = 0; i < 24; i++) { if (i % rendersPerFrame === 0) await nextFrame(); viewer.step(0); }
                    const startDiagnostics = viewer.gpu.getDiagnostics(), start = startDiagnostics.submissionSequence, cpu = [];
                    for (let i = 0; i < frames; i++) { if (i % rendersPerFrame === 0) await nextFrame(); const t = performance.now(); viewer.step(0); cpu.push(performance.now() - t); }
                    const end = viewer.gpu.getDiagnostics().submissionSequence;
                    for (let i = 0; i < 12; i++) { await nextFrame(); viewer.gpu.poll(); }
                    const diagnostics = viewer.gpu.getDiagnostics();
                    const samples = viewer.gpu.getSamplesSince(startDiagnostics.sampleSequence).filter(sample => sample.submissionSequence > start && sample.submissionSequence <= end);
                    if (samples.length < frames * .95 || diagnostics.disjointCount !== startDiagnostics.disjointCount || diagnostics.disabledReason)
                        throw new Error('Incomplete or disjoint GPU measurements; benchmark interrupted.');
                    const state = viewer.getSnapshot();
                    if (state.fields.current.levels.some((count, i) => count !== state.fields.baked.levels[i])) throw new Error('Compared strategies have different LOD assignments.');
                    measurements.push({ round, pairedLod, strategy, lod, gpuMs: mean(samples.map(sample => sample.ms)), cpuMs: mean(cpu), gpuSamplesMs: samples.map(sample => sample.ms),
                        sampleCount: samples.length, draw: state.draw, levels: state.fields[strategy].levels,
                        blendCandidateCells: state.fields[strategy].blendCandidateCells, sideLeafCells: state.fields[strategy].sideLeafCells });
                }
            }
        }
        const results = cases.map(([strategy, lod]) => {
            const rows = measurements.filter(row => row.strategy === strategy && row.lod === lod);
            const baselines = rows.map(row => measurements.find(base => base.round === row.round && base.pairedLod === row.pairedLod && base.lod === 'OFF'));
            const delta = rows.map((row, i) => row.gpuMs - baselines[i].gpuMs);
            const average = mean(delta), variance = delta.length > 1 ? delta.reduce((sum, value) => sum + (value - average) ** 2, 0) / (delta.length - 1) : 0;
            return { strategy, lod, gpuMs: mean(rows.map(row => row.gpuMs)), soilGpuMs: mean(baselines.map(row => row.gpuMs)), aboveSoilMs: average,
                roundRangeMs: [Math.min(...delta), Math.max(...delta)], standardErrorMs: Math.sqrt(variance / delta.length),
                cpuMs: mean(rows.map(row => row.cpuMs)), aboveSoilCpuMs: mean(rows.map((row, i) => row.cpuMs - baselines[i].cpuMs)),
                samples: rows.reduce((sum, row) => sum + row.sampleCount, 0), draw: rows[0].draw };
        });
        return { timestamp: new Date().toISOString(), pose: previous.pose, camera: previous.camera, rounds, frames, rendersPerFrame,
            width: previous.width, height: previous.height, brightness: previous.brightness, shadows: previous.externalShadows,
            protocol: 'All configurations prewarmed; per-LOD soil/current/baked triplets cycle through all six orders; reverse LOD order every round. Times are per render, not per batch.', appearance: previous.appearance,
            selection: previous.selection, shelter: previous.shelter,
            results, measurements, gpu: viewer.gpu.getDiagnostics() };
    } finally { viewer.setStrategy(previous.strategy); viewer.setLod(previous.lod); viewer.setAnimating(previous.animating); }
}
