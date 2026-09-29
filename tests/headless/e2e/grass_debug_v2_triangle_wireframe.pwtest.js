// Inspect real triangle edges and per-leaf counts without changing the shaded leaf geometry.
import test, { expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1, video: 'off' });
test('Shoot triangle wireframe includes diagonals and shows each leaf count', async ({ page }) => {
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/triangle_wireframe');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot&revision=triangle-wireframe-2');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const checkbox = page.getByRole('checkbox', { name: 'Wireframe', exact: true });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeEnabled();
    await expect(checkbox).not.toBeChecked();
    const before = await page.evaluate(() => {
        const study = window.__plantCardsStudy;
        return { source: study.plant.getSnapshot(), overlay: study.getSnapshot().wireframe,
            fill: study.plant.leaves[0].material.polygonOffset };
    });
    expect(before.overlay.visible).toBe(false);
    expect(before.overlay.meshes).toBe(3);
    expect(before.source.trianglesPerLeaf).toEqual([44, 44, 44]);
    await expect(page.locator('#leaf-counts')).toBeVisible();
    await expect(page.locator('#leaf-counts')).toHaveText('Single leaf: 44 tris\nPair left: 44 tris\nPair right: 44 tris');
    await expect(page.locator('#plant-counts')).toHaveText('3 leaves · 132 tris');

    const fixture = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2TriangleWireframe } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2TriangleWireframe.js');
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 0, 0, .3, 1, 0, 0, -1, 1, 0, 0, 1, .4, 1, 1, 0], 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, .5, 0, 1, 0, 0, .8, .5, .8, 1, .8], 2));
        geometry.setIndex([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]);
        const material = new THREE.MeshStandardMaterial({ polygonOffsetFactor: 2, polygonOffsetUnits: 3 });
        const mesh = new THREE.Mesh(geometry, material), overlay = createGrassDebugV2TriangleWireframe({ meshes: [mesh] });
        const index = mesh.children[0].geometry.index.array, edges = [];
        for (let i = 0; i < index.length; i += 2) edges.push([index[i], index[i + 1]].sort().join(':'));
        overlay.setVisible(true); overlay.dispose();
        const restored = !material.polygonOffset && material.polygonOffsetFactor === 2 && material.polygonOffsetUnits === 3;
        const children = mesh.children.length;
        geometry.dispose(); material.dispose();
        return { edges: edges.sort(), restored, children };
    });
    expect(fixture.edges).toEqual(['0:1', '0:3', '1:2', '1:3', '1:4', '2:4', '2:5', '3:4', '4:5']);
    expect(fixture.restored).toBe(true);
    expect(fixture.children).toBe(0);

    await page.getByRole('button', { name: 'Base', exact: true }).click();
    await checkbox.check();
    const enabled = await page.evaluate(async () => {
        const THREE = await import('three'), study = window.__plantCardsStudy;
        let minimumSoilClearance = Infinity;
        const lines = study.plant.bakeMeshes.flatMap(mesh => mesh.children.filter(child => child.isLineSegments));
        for (const line of lines) for (const i of new Set(line.geometry.index.array)) {
            const point = new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.position, i).applyMatrix4(line.matrixWorld);
            minimumSoilClearance = Math.min(minimumSoilClearance, point.y - study.soil.getHeightAt(point.x, point.z));
        }
        return { leafOverlays: lines.length, crowns: study.plant.crowns.length, source: study.plant.getSnapshot(), snapshot: study.getSnapshot().wireframe, minimumSoilClearance,
            visible: lines.every(line => line.visible && line.material.depthTest && !line.material.depthWrite),
            fill: study.plant.leaves[0].material.polygonOffset };
    });
    expect(enabled.source).toEqual(before.source);
    expect(enabled.snapshot.visible).toBe(true);
    expect(enabled.snapshot.segments).toBeGreaterThan(enabled.source.leafTriangles);
    expect(enabled.minimumSoilClearance).toBeGreaterThanOrEqual(-1e-7);
    expect(enabled.visible && enabled.fill).toBe(true);
    expect(enabled.leafOverlays).toBe(3);
    expect(enabled.crowns).toBe(0);
    await page.screenshot({ path: path.join(folder, 'base_triangles.png') });
    await page.evaluate(() => {
        const study = window.__plantCardsStudy;
        study.camera.position.set(0.032, 0.045, 0.070);
        study.controls.target.set(0.0175, 0.018, 0); study.controls.update(); study.lighting.render(0);
    });
    await page.screenshot({ path: path.join(folder, 'fold_comparison.png') });
    await page.evaluate(() => {
        const study = window.__plantCardsStudy;
        study.camera.position.set(0.078, 0.020, 0.004);
        study.controls.target.set(0.035, 0.014, 0); study.controls.update(); study.lighting.render(0);
    });
    await page.screenshot({ path: path.join(folder, 'side_base_triangles.png') });
    await page.evaluate(() => {
        const study = window.__plantCardsStudy;
        study.camera.position.set(0.055, 0.038, -0.055);
        study.controls.target.set(0.035, 0.018, 0); study.controls.update(); study.lighting.render(0);
    });
    await page.screenshot({ path: path.join(folder, 'rear_base_triangles.png') });
    await page.evaluate(() => {
        const study = window.__plantCardsStudy;
        study.camera.position.set(0.145, 0.038, 0.013);
        study.controls.target.set(0.035, 0.033, -0.003); study.controls.update(); study.lighting.render(0);
    });
    await page.screenshot({ path: path.join(folder, 'spine_bend_triangles.png') });
    await page.getByRole('button', { name: 'Front', exact: true }).click();
    await page.screenshot({ path: path.join(folder, 'front_triangles.png') });
    await checkbox.uncheck();
    const disabled = await page.evaluate(() => {
        const study = window.__plantCardsStudy;
        return { snapshot: study.getSnapshot().wireframe, fill: study.plant.leaves[0].material.polygonOffset,
            visibleLines: study.plant.bakeMeshes.flatMap(mesh => mesh.children).filter(line => line.visible).length };
    });
    expect(disabled.snapshot.visible).toBe(false);
    expect(disabled.snapshot.segments).toBe(before.overlay.segments);
    expect(disabled.fill).toBe(before.fill);
    expect(disabled.visibleLines).toBe(0);
    expect(errors).toEqual([]);
});
