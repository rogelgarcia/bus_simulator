// Runs inside the comparison browser after the production scene has finished loading.
export async function measureGrassCardHybrid() {
    const THREE = await import('three'), view = window.__grassCoverageView, fields = window.__grassCoverageFields;
    const timer = view.gpuTimer, sun = view.lighting.sun, groups = new Map(), snapshots = {};
    const frame = () => new Promise(requestAnimationFrame), grassShadow = sun.shadow.map;
    function copyGroup() {
        const group = new THREE.Group();
        fields.group.traverseVisible(source => {
            if (!source.isInstancedMesh || !source.count) return;
            const geometry = source.geometry.attributes.grassTransitionOpenEdges ? source.geometry.clone() : source.geometry;
            const mesh = new THREE.InstancedMesh(geometry, source.material, source.count);
            mesh.userData.testOwnsGeometry = geometry !== source.geometry;
            mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(0, source.count * 16));
            mesh.instanceMatrix.needsUpdate = true; mesh.receiveShadow = source.receiveShadow;
            mesh.position.copy(source.position); mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
        });
        group.visible = false; view.scene.add(group); return group;
    }
    for (const mode of ['LOD2', 'LOD3', 'LOD4', 'AUTO']) {
        view.grass.setMode(mode); snapshots[mode] = fields.getSnapshot(); groups.set(mode, copyGroup());
    }
    fields.setSoilOnly(true); groups.set('soil', copyGroup());
    sun.shadow.map = null; view.renderer.shadowMap.needsUpdate = sun.shadow.needsUpdate = true;
    view.renderer.render(view.scene, view.camera); const soilShadow = sun.shadow.map;
    sun.shadow.map = grassShadow; fields.setSoilOnly(false); fields.group.visible = false;
    const labels = [...groups.keys()];
    function select(label) {
        groups.forEach((group, key) => { group.visible = key === label; });
        sun.shadow.map = label === 'soil' ? soilShadow : grassShadow;
    }
    for (const label of labels) {
        select(label); await view.renderer.compileAsync(view.scene, view.camera);
        for (let i = 0; i < 30; i++) { await frame(); view.lighting.render(0); }
    }
    const blocks = [];
    try {
        for (let round = 0; round < 6; round++) {
            const records = [], before = timer.getDiagnostics();
            for (let cycle = 0; cycle < 20; cycle++) {
                await frame(); timer.poll();
                for (let j = 0; j < labels.length; j++) {
                    const index = (cycle + j + round) % labels.length, label = labels[round % 2 ? labels.length - 1 - index : index];
                    select(label); const started = performance.now();
                    timer.beginFrame(); view.lighting.render(0); timer.endFrame();
                    records.push({ label, cpuMs: performance.now() - started, sequence: timer.getDiagnostics().submissionSequence });
                }
                for (let drain = 0; timer.getDiagnostics().pendingQueryCount > 5 && drain < 120; drain++) { await frame(); timer.poll(); }
                if (timer.getDiagnostics().pendingQueryCount > 5) throw new Error('Grass GPU query queue did not drain.');
            }
            for (let drain = 0; timer.getDiagnostics().pendingQueryCount && drain < 120; drain++) { await frame(); timer.poll(); }
            const after = timer.getDiagnostics(), samples = timer.getSamplesSince(before.sampleSequence);
            const lookup = new Map(samples.map(sample => [sample.submissionSequence, sample.ms]));
            if (!after.active || before.disjointCount !== after.disjointCount || records.some(record => !lookup.has(record.sequence)))
                throw new Error('Incomplete grass hardware timings.');
            blocks.push(Object.fromEntries(labels.map(label => {
                const rows = records.filter(record => record.label === label);
                return [label, { gpuMs: rows.reduce((sum, row) => sum + lookup.get(row.sequence), 0) / rows.length,
                    cpuMs: rows.reduce((sum, row) => sum + row.cpuMs, 0) / rows.length }];
            })));
        }
        const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
        const results = Object.fromEntries(labels.filter(label => label !== 'soil').map(label => {
            const delta = blocks.map(block => block[label].gpuMs - block.soil.gpuMs), average = mean(delta);
            const margin = 2.5706 * Math.sqrt(delta.reduce((sum, value) => sum + (value - average) ** 2, 0) / (delta.length - 1) / delta.length);
            return [label, { aboveSoilMs: average, ci95Ms: [average - margin, average + margin],
                totalGpuMs: mean(blocks.map(block => block[label].gpuMs)), cpuMs: mean(blocks.map(block => block[label].cpuMs)),
                triangles: snapshots[label].triangles, batches: snapshots[label].activeBatches }];
        }));
        return { results, blocks, soilGpuMs: mean(blocks.map(block => block.soil.gpuMs)),
            method: '6 paired rounds × 20 samples, rotating/reversed order, cached shadows, hardware GPU queries; delta is above matched soil-only fields.' };
    } finally {
        for (const group of groups.values()) {
            group.removeFromParent(); group.children.forEach(mesh => { if (mesh.userData.testOwnsGeometry) mesh.geometry.dispose(); mesh.dispose(); });
        }
        soilShadow.dispose(); sun.shadow.map = grassShadow; fields.group.visible = true;
    }
}
