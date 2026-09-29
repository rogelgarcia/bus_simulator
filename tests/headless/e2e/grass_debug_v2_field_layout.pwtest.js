// Validate shared multi-field layout, one-metre gaps, LOD/layer changes, and camera-visible counters.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/lod1_ten_triangles/field_layout');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off' });

test('One to nine fields share geometry and count the meshes in the camera view', async ({ page }) => {
    test.setTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await mkdir(folder, { recursive: true });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=fields-1#01_overview');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    const snapshot = () => page.evaluate(() => window.__grassLitterScene.getSnapshot());
    const control = page.getByRole('combobox', { name: 'Fields', exact: true });
    await expect(control.locator('option')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    const initial = await snapshot();
    expect(initial).toMatchObject({ leaves: 96000, fields: { count: 1, gapMeters: 1 }, lod: 'LOD0' });
    const layouts = await page.evaluate(() => {
        const s = window.__grassLitterScene, result = [];
        for (let count = 1; count <= 9; count++) {
            s.setFieldCount(count);
            const state = s.getSnapshot();
            const active = state.fields.tiles.filter(tile => tile.active);
            result.push({ count, state, roots: active.map(tile => {
                const root = s.scene.getObjectByName('GrassFieldTile_' + (tile.index + 1));
                return { visible: root.visible, position: root.position.toArray() };
            }) });
        }
        return result;
    });
    for (const layout of layouts) {
        const { count, state, roots } = layout;
        expect(state.leaves).toBe(count * 96000);
        expect(state.triangles).toBe(count * 4235466);
        expect(state.sceneTriangles).toBe(count * (4235466 + 98) + 590);
        expect(roots).toHaveLength(count);
        expect(roots.every(root => root.visible)).toBe(true);
        expect(roots[0].position).toEqual([0, 0, 0]);
        expect(state.position).toEqual(initial.position);
        expect(state.quaternion).toEqual(initial.quaternion);
        for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
            const a = roots[i].position, b = roots[j].position;
            expect(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[2] - b[2])) - 12).toBeGreaterThanOrEqual(1);
        }
    }
    const sharing = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__grassLitterScene;
        const roots = Array.from({ length: 9 }, (_, i) => s.scene.getObjectByName('GrassFieldTile_' + (i + 1)));
        const meshLists = roots.map(root => { const meshes = []; root.traverse(mesh => { if (mesh.isMesh) meshes.push(mesh); }); return meshes; });
        const source = meshLists[0];
        s.scene.updateMatrixWorld(true); s.lighting.sun.shadow.updateMatrices(s.lighting.sun);
        const shadow = s.lighting.sun.shadow.camera, points = [];
        for (const root of roots) for (const x of [-6, 6]) for (const z of [-6, 6]) {
            points.push(new THREE.Vector3(root.position.x + x, 0.2, root.position.z + z).project(shadow).toArray());
        }
        return {
            shared: meshLists.every(meshes => meshes.length === source.length && meshes.every((mesh, i) => mesh.geometry === source[i].geometry && mesh.material === source[i].material)),
            roots: roots.length, tableMeshes: s.scene.getObjectByName('Perforated_shade_screen').children.length,
            cornersInsideShadow: points.every(point => point.every(value => Math.abs(value) <= 1)),
            bias: s.lighting.sun.shadow.bias, far: shadow.far
        };
    });
    expect(sharing.shared).toBe(true);
    expect(sharing.tableMeshes).toBe(49);
    expect(sharing.cornersInsideShadow).toBe(true);
    expect(sharing.bias * (sharing.far - 0.05)).toBeCloseTo(-0.0002 * 39.95, 9);
    await page.getByRole('combobox', { name: 'LOD', exact: true }).selectOption('LOD1');
    await page.getByRole('button', { name: 'Frame fields', exact: true }).click();
    const full = await snapshot();
    expect(full).toMatchObject({
        lod: 'LOD1', leaves: 864000, visibleFields: 9, visibleLeaves: 864000,
        triangles: 8640000, visibleTriangles: 8641472, fields: { bounds: { minX: -19, maxX: 19, minZ: -19, maxZ: 19 } }
    });
    await expect(page.locator('#scene-counts')).toHaveText('9 fields · 12 × 12 m each · 864,000 leaves · 8,641,472 triangles');
    await page.screenshot({ path: path.join(folder, 'nine_fields_LOD1.png') });
    await page.getByRole('combobox', { name: 'LOD', exact: true }).selectOption('LOD0');
    expect(await snapshot()).toMatchObject({ visibleLeaves: 864000, visibleTriangles: 38120666, position: full.position, quaternion: full.quaternion });
    await page.screenshot({ path: path.join(folder, 'nine_fields_LOD0.png') });
    await page.getByRole('combobox', { name: 'LOD', exact: true }).selectOption('LOD1');
    for (const [label, mode, leaves, triangles] of [
        ['Grass only', 'grass', 864000, 8640590], ['Soil', 'soil', 0, 590], ['All', 'all', 864000, 8641472]
    ]) {
        await page.getByRole('radio', { name: label, exact: true }).check();
        expect(await snapshot()).toMatchObject({ mode, visibleLeaves: leaves, visibleTriangles: triangles });
    }
    await page.getByRole('radio', { name: 'Soil', exact: true }).check();
    await control.selectOption('4');
    expect(await snapshot()).toMatchObject({ fields: { count: 4 }, visibleLeaves: 0, visibleTriangles: 590, position: full.position });
    await page.getByRole('radio', { name: 'All', exact: true }).check();
    expect(await snapshot()).toMatchObject({ visibleLeaves: 384000, visibleTriangles: 3840982 });
    await control.selectOption('9');
    await page.evaluate(() => {
        const s = window.__grassLitterScene;
        s.camera.position.set(13, 15, -13); s.camera.up.set(0, 0, -1); s.camera.lookAt(13, 0, -13);
        s.camera.fov = 10; s.camera.updateProjectionMatrix();
    });
    await expect.poll(async () => (await snapshot()).visibleFields).toBe(1);
    const corner = await snapshot();
    expect(corner.visibleLeaves).toBe(96000);
    expect(corner.visibleTriangles).toBeGreaterThanOrEqual(960000);
    expect(corner.visibleTriangles).toBeLessThanOrEqual(960688);
    await page.screenshot({ path: path.join(folder, 'one_corner_in_view.png') });
    await page.evaluate(() => {
        const camera = window.__grassLitterScene.camera;
        camera.up.set(0, 0, 1); camera.lookAt(13, 30, -13);
    });
    await expect.poll(async () => (await snapshot()).visibleLeaves).toBe(0);
    const sky = await snapshot();
    expect(sky.visibleTriangles).toBeLessThanOrEqual(2);
    await control.selectOption('1');
    await page.locator('#scene-view').selectOption('0');
    const restored = await snapshot();
    expect(restored.position).toEqual(initial.position); expect(restored.quaternion).toEqual(initial.quaternion);
    expect(restored).toMatchObject({ fields: { count: 1 }, visibleLeaves: 96000, visibleTriangles: 960688 });
    const invalid = await page.evaluate(() => [0, 10, 2.5, NaN, '2'].map(value => {
        try { window.__grassLitterScene.setFieldCount(value); return false; } catch { return true; }
    }));
    expect(invalid.every(Boolean)).toBe(true);
    expect((await snapshot()).fields.count).toBe(1);
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ layouts, sharing, full, corner, sky, restored }, null, 2));
    expect(errors).toEqual([]);
});
