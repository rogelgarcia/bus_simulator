// Paired soil-relative cost of fixed card configurations; preparation and warm-up are excluded.
export async function measureGrassBakedMidrangeCost(viewer, { pose = 'bus_20m_front', rendersPerFrame = 1, levels = ['LOD2', 'LOD3', 'LOD4'] } = {}) {
    if (!levels.length || levels.some(lod => !['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5'].includes(lod)) || new Set(levels).size !== levels.length) throw new Error('Select distinct grass LODs for paired timing.');
    if (!viewer.gpu.isSupported) throw new Error('GPU timer queries are unavailable.');
    const measurements = [], frame = () => new Promise(requestAnimationFrame);
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    const previous = viewer.getSnapshot(); viewer.setAnimating(false); viewer.setStrategy('baked'); viewer.setPose(pose);
    try {
        for (let round = 0; round < 4; round++) for (const pairedLod of round % 2 ? [...levels].reverse() : levels) {
            for (const lod of round % 2 ? [pairedLod, 'OFF'] : ['OFF', pairedLod]) {
                viewer.setLod(lod);
                for (let i = 0; i < 16; i++) { await frame(); for (let render = 0; render < rendersPerFrame; render++) viewer.step(0); }
                const start = viewer.gpu.getDiagnostics(), cpu = [];
                for (let i = 0; i < 32; i++) { await frame(); const time = performance.now(); for (let render = 0; render < rendersPerFrame; render++) viewer.step(0); cpu.push((performance.now() - time) / rendersPerFrame); }
                const end = viewer.gpu.getDiagnostics().submissionSequence;
                for (let i = 0; i < 12; i++) { await frame(); viewer.gpu.poll(); }
                const diagnostics = viewer.gpu.getDiagnostics();
                const samples = viewer.gpu.getSamplesSince(start.sampleSequence).filter(row => row.submissionSequence > start.submissionSequence && row.submissionSequence <= end);
                if (samples.length < 28 * rendersPerFrame || diagnostics.disjointCount !== start.disjointCount) throw new Error('Incomplete or disjoint midrange GPU samples.');
                measurements.push({ round, pairedLod, lod, gpuMs: mean(samples.map(row => row.ms)), cpuMs: mean(cpu), samples: samples.length, draw: viewer.getSnapshot().draw });
            }
        }
        return { pose, width: previous.width, height: previous.height, rounds: 4, frames: 32, rendersPerFrame,
            protocol: 'Per-LOD soil/baked pairs with reversed LOD and pair order each round; reports milliseconds per render, not per batch; excludes preparation and warm-up. Batched runs are a sustained workload, not game FPS.',
            measurements, results: levels.map(lod => {
                const rows = measurements.filter(row => row.lod === lod);
                const soil = rows.map(row => measurements.find(value => value.round === row.round && value.pairedLod === lod && value.lod === 'OFF'));
                const delta = rows.map((row, i) => row.gpuMs - soil[i].gpuMs);
                return { lod, soilGpuMs: mean(soil.map(row => row.gpuMs)), gpuMs: mean(rows.map(row => row.gpuMs)), aboveSoilMs: mean(delta),
                    roundRangeMs: [Math.min(...delta), Math.max(...delta)], cpuMs: mean(rows.map(row => row.cpuMs)),
                    aboveSoilCpuMs: mean(rows.map((row, i) => row.cpuMs - soil[i].cpuMs)), samples: rows.reduce((sum, row) => sum + row.samples, 0), draw: rows[0].draw };
            }) };
    } finally { viewer.setPose(previous.pose); viewer.setLod(previous.lod); viewer.setStrategy(previous.strategy); viewer.setAnimating(previous.animating); }
}
