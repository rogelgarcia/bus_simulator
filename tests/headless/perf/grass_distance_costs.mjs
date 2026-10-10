// Freeze matched grass configurations and compare them with the actual OFF terrain.
export async function measureGrassDistanceCosts({ focus = false } = {}) {
    const THREE = await import('three');
    const { createGrassDebugV2CanopyDiagnostic } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyDiagnostics.js');
    const view = window.__grassCoverageView, fields = window.__grassCoverageFields, timer = view.gpuTimer;
    const sun = view.lighting.sun, grassShadow = sun.shadow.map, cases = new Map(), diagnostics = new Map();
    const frame = () => new Promise(requestAnimationFrame);
    function add(label, filter = () => true, diagnostic = null) {
        const group = new THREE.Group(); let triangles = 0;
        fields.group.traverseVisible(source => {
            if (!source.isInstancedMesh || !source.count || !filter(source)) return;
            let material = source.material;
            if (diagnostic && source.userData.grassCanopy) {
                const key = source.material.uuid + ':' + diagnostic;
                if (!diagnostics.has(key)) diagnostics.set(key, createGrassDebugV2CanopyDiagnostic(source.material, diagnostic));
                material = diagnostics.get(key).material;
            }
            const geometry = source.geometry.attributes.grassTransitionOpenEdges ? source.geometry.clone() : source.geometry;
            const mesh = new THREE.InstancedMesh(geometry, material, source.count);
            mesh.userData.ownsGeometry = geometry !== source.geometry;
            mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(0, source.count * 16));
            mesh.instanceMatrix.needsUpdate = true; mesh.receiveShadow = source.receiveShadow;
            mesh.position.copy(source.position); mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
            triangles += source.count * (source.geometry.index?.count ?? source.geometry.attributes.position.count) / 3;
        });
        group.visible = false; view.scene.add(group); cases.set(label, { group, triangles, batches: group.children.length });
    }
    for (const mode of ['LOD3', 'LOD4', 'LOD5', 'AUTO']) {
        view.grass.setMode(mode); add(mode, () => true, mode === 'LOD5' ? 'runtime_visibility' : null);
        if (mode === 'LOD4') add('card_base', mesh => mesh.userData.grassCardBase);
        if (mode === 'LOD5') {
            add('LOD5_no_sides', mesh => mesh.userData.grassCanopy);
            for (const id of ['single_scale', 'cached_visibility', 'no_visibility', 'no_ibl', 'unlit_albedo', 'unlit_constant']) add('LOD5_' + id, () => true, id);
        }
    }
    sun.shadow.map = null; view.grass.setMode('OFF'); const offShadow = sun.shadow.map;
    fields.group.visible = false; cases.set('OFF', { group: new THREE.Group(), triangles: 0, batches: 0 });
    const labels = focus ? ['OFF', 'LOD3', 'LOD4', 'LOD5', 'LOD5_cached_visibility'] : [...cases.keys()], rounds = [];
    const cycles = focus ? 48 : 16;
    function select(label) {
        for (const [id, value] of cases) value.group.visible = id === label;
        window.__grassCoverageAssets.land.setGrassVisible(label !== 'OFF'); sun.shadow.map = label === 'OFF' ? offShadow : grassShadow;
    }
    try {
        for (const label of labels) {
            select(label); await view.renderer.compileAsync(view.scene, view.camera);
            for (let i = 0; i < 12; i++) { await frame(); view.lighting.render(0); }
        }
        for (let round = 0; round < 6; round++) {
            const records = [], before = timer.getDiagnostics();
            for (let cycle = 0; cycle < cycles; cycle++) {
                await frame(); timer.poll();
                for (let j = 0; j < labels.length; j++) {
                    const index = (cycle + round + j) % labels.length, label = labels[round % 2 ? labels.length - 1 - index : index];
                    select(label); const start = performance.now();
                    timer.beginFrame(); view.lighting.render(0); timer.endFrame();
                    records.push({ label, cpu: performance.now() - start, sequence: timer.getDiagnostics().submissionSequence });
                }
                for (let i = 0; timer.getDiagnostics().pendingQueryCount > 4 && i < 120; i++) { await frame(); timer.poll(); }
            }
            for (let i = 0; timer.getDiagnostics().pendingQueryCount && i < 120; i++) { await frame(); timer.poll(); }
            const after = timer.getDiagnostics(), samples = new Map(timer.getSamplesSince(before.sampleSequence).map(sample => [sample.submissionSequence, sample.ms]));
            if (!after.active || before.disjointCount !== after.disjointCount || records.some(row => !samples.has(row.sequence))) throw new Error('Incomplete grass factor GPU samples.');
            rounds.push(Object.fromEntries(labels.map(label => {
                const rows = records.filter(row => row.label === label);
                return [label, { gpu: rows.reduce((n, row) => n + samples.get(row.sequence), 0) / rows.length,
                    cpu: rows.reduce((n, row) => n + row.cpu, 0) / rows.length }];
            })));
        }
        const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
        const results = Object.fromEntries(labels.map(label => {
            const values = rounds.map(r => r[label].gpu - r.OFF.gpu), delta = mean(values);
            const margin = 2.5706 * Math.sqrt(values.reduce((n, v) => n + (v - delta) ** 2, 0) / (values.length - 1) / values.length);
            return [label, { aboveOffMs: delta, ci95Ms: [delta - margin, delta + margin], totalGpuMs: mean(rounds.map(r => r[label].gpu)),
                cpuMs: mean(rounds.map(r => r[label].cpu)), triangles: cases.get(label).triangles, batches: cases.get(label).batches }];
        }));
        const paired = (a, b) => {
            const values = rounds.map(round => round[a].gpu - round[b].gpu), delta = mean(values);
            const margin = 2.5706 * Math.sqrt(values.reduce((n, value) => n + (value - delta) ** 2, 0) / 5 / 6);
            return { savedMs: delta, ci95Ms: [delta - margin, delta + margin] };
        };
        return { results, rounds, comparisons: { lod4VersusLod3: paired('LOD3', 'LOD4'), cachedVisibility: paired('LOD5', 'LOD5_cached_visibility') },
            method: `6 × ${cycles} paired samples; frozen groups; actual OFF land and shadow baseline; rotating/reversed order; LOD5 retains previous uniform branch for comparison with cached specialization` };
    } finally {
        for (const value of cases.values()) { value.group.removeFromParent(); value.group.children.forEach(mesh => { if (mesh.userData.ownsGeometry) mesh.geometry.dispose(); mesh.dispose(); }); }
        for (const value of diagnostics.values()) value.dispose();
        sun.shadow.map = grassShadow; offShadow.dispose(); view.grass.setMode('AUTO');
    }
}
