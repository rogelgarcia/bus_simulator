// Validate upper alpha silhouettes and fixed-LOD perimeter leaves without opaque borders.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Grass texture blocks have sliced alpha tips and an independent LOD3-2 edge comparison', async ({ page }) => {
    test.setTimeout(180000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/edge_silhouettes');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const state = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy, c = s.comparison, v = c.volume;
        const matrix = new THREE.Matrix4();
        const entries = c.edgeLeaves.entries.map((entry, index) => {
            const original = s.patch.representations.split.group.children.filter(mesh => mesh.isInstancedMesh)[index];
            const expected = [];
            for (let i = 0; i < original.count; i++) {
                original.getMatrixAt(i, matrix);
                if (Math.max(Math.abs(matrix.elements[12]), Math.abs(matrix.elements[14])) >= 0.45) expected.push(i);
            }
            return { expected, indices: entry.indices, triangles: entry.mesh.geometry.index.count / 3,
                sameMatrices: entry.indices.every((i, j) => {
                    original.getMatrixAt(i, matrix);
                    return matrix.elements.every((value, k) => value === entry.mesh.instanceMatrix.array[j * 16 + k]);
                }), sharedMaterial: entry.mesh.material === original.material, shadow: !!entry.mesh.customDepthMaterial };
        });
        return { snapshot: c.getSnapshot(), entries, alphaDetails: c.getPatchDetails('texture4k'), edgeDetails: c.getPatchDetails('edge4k'),
            cards: v.silhouettes.map(mesh => { const bounds = new THREE.Box3().setFromObject(mesh);
                return { min: bounds.min.toArray(), max: bounds.max.toArray(), castShadow: mesh.castShadow, alphaToCoverage: mesh.material.alphaToCoverage }; }),
            alpha: v.silhouetteBake.views.map(view => {
                const { data, width, height } = view.textures.albedo.image;
                let solid = 0, clear = 0, partial = 0;
                for (let i = 3; i < data.length; i += 4) {
                    if (!data[i]) clear++; else if (data[i] === 255) solid++; else partial++;
                }
                return { id: view.id, width, height, solid, clear, partial };
            })
        };
    });
    const v = state.snapshot.volume;
    expect(state.snapshot.fields).toHaveLength(8);
    expect(v.silhouette).toMatchObject({ minHeightFraction: 0.8, edgeDepth: 0.05, source: '4K LOD3 · 10' });
    expect(v.walls).toBe(12); expect(v.silhouettes).toBe(8);
    expect(state.alphaDetails.triangles).toBe(18);
    const edge = state.snapshot.edgeLeaves;
    expect(edge.leaves).toBeGreaterThan(650); expect(edge.leaves).toBeLessThan(900);
    expect(edge.lod).toBe('LOD3 · 2'); expect(edge.edgeDepth).toBe(0.05);
    expect(state.edgeDetails.leavesByLod).toEqual({ 'LOD3 · 2': edge.leaves });
    expect(state.edgeDetails.triangles).toBe(edge.leaves * 4 + 10);
    expect(state.snapshot.fields.find(field => field.id === 'edge4k')).toMatchObject({ x: 0, z: -1.3, surfaceHeight: v.surfaceHeight });
    for (const entry of state.entries) {
        expect(entry.indices).toEqual(entry.expected); expect(entry.sameMatrices).toBe(true);
        expect(entry.triangles).toBe(4); expect(entry.sharedMaterial).toBe(false); expect(entry.shadow).toBe(true);
    }
    for (const card of state.cards) {
        expect(card.min[1]).toBeCloseTo(v.wallHeight, 7); expect(card.max[1]).toBeCloseTo(v.sourceHeight, 7);
        expect(card.castShadow).toBe(false); expect(card.alphaToCoverage).toBe(true);
    }
    for (const alpha of state.alpha) {
        expect(alpha.solid).toBeGreaterThan(100);
        expect(alpha.clear).toBeGreaterThan(alpha.width * alpha.height * 0.6);
        expect(alpha.partial).toBeGreaterThan(100);
    }
    await page.evaluate(() => { const s = window.__plantCardsStudy; s.setMode('split'); s.setNormalFacing(false); s.setAlphaCoverage(false); });
    const corrections = await page.evaluate(() => {
        const c = window.__plantCardsStudy.comparison;
        return { details: c.getPatchDetails('edge4k'), entries: c.edgeLeaves.entries.map(e => ({
            ...e.shading.getCorrections(), sameMap: e.shading.material.map === e.originalMaterial.map
        })) };
    });
    expect(corrections.details).toEqual(state.edgeDetails);
    for (const entry of corrections.entries) expect(entry).toEqual({ normalFacing: false, alphaCoverage: false, sameMap: true });
    await page.evaluate(() => { const s = window.__plantCardsStudy; s.setMode('refined'); s.setNormalFacing(true); s.setAlphaCoverage(true); });
    await page.addStyleTag({ content: '.plant-study-panel { display: none; }' });
    const poses = [
        ['overview', [-0.4, 3.2, 2.3], [-0.1, 0.04, -1.3]],
        ['edge-comparison', [-0.65, 0.65, 0.8], [-0.65, 0.065, -1.3]],
        ['edge-low', [-0.65, 0.17, 0.8], [-0.65, 0.065, -1.3]],
        ['edge-top', [-0.65, 3.3, -1.299], [-0.65, 0.04, -1.3]]
    ];
    for (const [name, position, target] of poses) {
        await page.evaluate(({ position, target }) => {
            const s = window.__plantCardsStudy; s.camera.position.set(...position); s.controls.target.set(...target);
            s.controls.update(); s.comparison.updateLabels(s.camera, s.renderer.domElement); s.lighting.render(0);
        }, { position, target });
        await page.screenshot({ path: path.join(folder, name + '.png') });
    }
    const sliceFixture = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2SideBake } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2SideBake.js');
        const source = new THREE.Group(), geometry = new THREE.PlaneGeometry(0.12, 0.02);
        const red = new THREE.MeshStandardMaterial({ color: 0xff0000, side: THREE.DoubleSide });
        const blue = new THREE.MeshStandardMaterial({ color: 0x0000ff, side: THREE.DoubleSide });
        const outer = new THREE.Mesh(geometry, red), inner = new THREE.Mesh(geometry, blue);
        outer.position.set(-0.2, 0.09, 0.48); inner.position.set(0.2, 0.09, 0.40); source.add(outer, inner);
        const bake = await createGrassDebugV2SideBake({ renderer: window.__plantCardsStudy.renderer, source, edgeDepth: 0.05, minHeightFraction: 0.8 });
        const pixels = bake.views[0].textures.albedo.image.data;
        let redPixels = 0, bluePixels = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 200) {
            if (pixels[i] > 100) redPixels++;
            if (pixels[i + 2] > 100) bluePixels++;
        }
        bake.dispose(); geometry.dispose(); red.dispose(); blue.dispose();
        return { redPixels, bluePixels };
    });
    expect(sliceFixture.redPixels).toBeGreaterThan(1000); expect(sliceFixture.bluePixels).toBe(0);
    await page.evaluate(() => {
        const s = window.__plantCardsStudy, c = s.comparison;
        s.patch.representations.refined.group.visible = false; c.ringPatch.group.visible = false;
        c.tiles.forEach(tile => { tile.visible = ['GrassV2Floor-texture4k', 'GrassV2Floor-edge4k'].includes(tile.name); });
        for (const variants of [c.hybrid, c.hybrid2K, c.reference]) Object.values(variants).forEach(group => { group.visible = false; });
        for (const mesh of [...c.volume.walls, ...c.volume.silhouettes]) if (mesh.name.includes('texture2k')) mesh.visible = false;
        s.renderer.shadowMap.needsUpdate = true; s.lighting.sun.shadow.needsUpdate = true;
        s.camera.position.set(-0.4, 1.25, 1.8); s.controls.target.set(-0.65, 0.045, -1.3);
        s.controls.update(); c.setLabelsVisible(false); c.updateLabels(s.camera, s.renderer.domElement); s.lighting.render(0);
    });
    await page.screenshot({ path: path.join(folder, 'two-edge-methods.png') });
    expect(errors).toEqual([]);
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ state, corrections, sliceFixture, errors }, null, 2));
});
