// Check ownership, coverage, cached sampler restoration and geometry equivalence for optional experiments.
import test, { expect } from '@playwright/test';
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined } });

test('Experimental grass batches preserve coverage and filtering toggles restore the baseline', async ({ page }) => {
    test.setTimeout(240000); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness); await page.evaluate(() => window.__grassTransitionReadiness);
    const initial = await page.evaluate(() => window.__grassTransitionScene.getSnapshot());
    expect(initial.experiment).toBe('recommended');
    expect(initial.fields.edgeStrips).toBe(true);
    expect(initial.fields.chunks.meters).toBe(32);
    expect(initial.experiments.comparisonTextureCopies).toBe(0);
    const records = await page.evaluate(async () => {
        const s = window.__grassTransitionScene, THREE = await import('three'); s.setAnimating(false); s.setHelpers(false);
        const matrix = new THREE.Matrix4(), ids = new Map(s.fields.cells.map(cell => [cell.centerX + ':' + cell.centerZ, cell.id]));
        const records = [];
        for (const experiment of ['recommended', 'baseline', 'aniso4', 'baseline', 'strips', 'chunks4', 'chunks8', 'recommended', 'baseline']) {
            await s.setExperiment(experiment);
            for (const configuration of ['distance', 'lod4-elevated', 'lod4-flat']) {
                s.setConfiguration(configuration); s.setPose('border'); s.step();
                const main = new Uint8Array(ids.size), ground = new Uint8Array(ids.size), samplers = [], meshes = [];
                s.fields.group.traverse(mesh => {
                    if (!mesh.isInstancedMesh || !mesh.visible) return;
                    const isMain = Number.isInteger(mesh.userData.grassTransitionLevel), isGround = mesh.userData.grassTransitionGround;
                    if (!isMain && !isGround) return;
                    for (let i = 0; i < mesh.count; i++) {
                        mesh.getMatrixAt(i, matrix); const id = ids.get(matrix.elements[12] + ':' + matrix.elements[14]);
                        if (id === undefined) throw new Error('Unknown grass instance');
                        if (isMain) main[id]++; if (isGround || mesh.userData.grassTransitionLevel === 4) ground[id]++;
                    }
                    if (mesh.userData.grassCanopy) {
                        const uniforms = s.renderer.properties.get(mesh.material).uniforms;
                        if (uniforms) samplers.push([mesh.material.map.anisotropy, mesh.material.normalMap.anisotropy,
                            mesh.material.roughnessMap.anisotropy, ...['grassCanopyAlbedoB', 'grassCanopyNormalB', 'grassCanopyRoughnessB', 'grassCanopyTileVisibility', 'grassCanopyVisibilityB'].map(key => uniforms[key].value.anisotropy)]);
                    }
                    meshes.push({ name: mesh.name, triangles: (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, count: mesh.count });
                });
                const before = s.getSnapshot(); for (let i = 0; i < 5; i++) s.step(); const after = s.getSnapshot();
                records.push({ experiment, configuration, missing: [...main].filter(n => n !== 1).length,
                    groundOverlap: [...ground].filter(n => n !== 1).length, samplers, meshes, snapshot: after,
                    steadyUploads: after.fields.instanceUploads - before.fields.instanceUploads,
                    chunkUploads: after.fields.chunks.uploads - before.fields.chunks.uploads,
                    shadowGenerations: after.shadows.generations - before.shadows.generations });
            }
        }
        return records;
    });
    for (const record of records) {
        expect(record.missing).toBe(0); expect(record.groundOverlap).toBe(0); expect(record.snapshot.glError).toBe(0);
        expect(record.steadyUploads).toBe(0); expect(record.chunkUploads).toBe(0); expect(record.shadowGenerations).toBe(0);
        expect(record.samplers.length).toBeGreaterThan(0);
        for (const samplers of record.samplers) expect(samplers).toEqual(Array(8).fill(['aniso4', 'recommended'].includes(record.experiment) ? 4 : 8));
        if (['strips', 'recommended'].includes(record.experiment) && record.configuration === 'lod4-elevated') expect(record.snapshot.fields.triangles).toBe(9248);
        if (record.configuration === 'lod4-flat') expect(record.snapshot.fields.triangles).toBe(8192);
    }
    // Other diagnostic hooks must preserve the retained baseline's sampler overrides.
    const composedSamplers = await page.evaluate(async () => {
        const s = window.__grassTransitionScene;
        const { createGrassDebugV2CanopyDiagnostic } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyDiagnostics.js');
        const originals = [], variants = [], samplers = [];
        s.fields.group.traverse(mesh => {
            if (!mesh.isMesh || !mesh.visible || !mesh.userData.grassCanopy) return;
            const diagnostic = createGrassDebugV2CanopyDiagnostic(mesh.material, 'baked_only');
            originals.push([mesh, mesh.material]); variants.push(diagnostic); mesh.material = diagnostic.material;
        });
        try {
            s.step();
            for (const { material } of variants) {
                const uniforms = s.renderer.properties.get(material).uniforms;
                if (uniforms) samplers.push([material.map.anisotropy, material.normalMap.anisotropy, material.roughnessMap.anisotropy,
                    ...['grassCanopyAlbedoB', 'grassCanopyNormalB', 'grassCanopyRoughnessB', 'grassCanopyTileVisibility', 'grassCanopyVisibilityB'].map(key => uniforms[key].value.anisotropy)]);
            }
        } finally { originals.forEach(([mesh, material]) => { mesh.material = material; }); variants.forEach(value => value.dispose()); }
        return samplers;
    });
    expect(composedSamplers.length).toBeGreaterThan(0);
    for (const samplers of composedSamplers) expect(samplers).toEqual(Array(8).fill(8));
    expect(errors).toEqual([]);
});
