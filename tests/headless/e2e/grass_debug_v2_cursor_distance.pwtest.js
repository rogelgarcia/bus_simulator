// Validate cursor distance against known surfaces, camera motion and scene visibility.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off' });
test('Field cursor measures visible surfaces without a triangle raycast', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/cursor_distance');
    await mkdir(folder, { recursive: true });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=cursor-distance-1#06_closeup');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    const state = () => page.evaluate(() => window.__grassLitterScene.getSnapshot().cursorDistance);
    const hover = async (x, y) => {
        const before = await state();
        await page.mouse.move(x, y);
        await expect.poll(async () => (await state()).samples).toBeGreaterThan(before.samples);
        return state();
    };
    const soilDistance = (x, y) => page.evaluate(async ({ x, y }) => {
        const THREE = await import('three'), s = window.__grassLitterScene, camera = s.camera;
        const size = s.renderer.getDrawingBufferSize(new THREE.Vector2()), rect = s.renderer.domElement.getBoundingClientRect();
        const px = Math.floor((x - rect.left) / rect.width * size.x);
        const py = Math.floor((y - rect.top) / rect.height * size.y);
        camera.updateMatrixWorld();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2((px + 0.5) / size.x * 2 - 1, 1 - (py + 0.5) / size.y * 2), camera);
        const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
        return { distance: hit.distanceTo(camera.position), axisDepth: -hit.clone().applyMatrix4(camera.matrixWorldInverse).z };
    }, { x, y });
    await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__grassLitterScene;
        THREE.Mesh.prototype.raycast = () => { throw new Error('Cursor distance must not scan mesh triangles.'); };
        s.setMode('soil'); s.camera.position.set(0, 3, 8); s.camera.up.set(0, 1, 0); s.camera.lookAt(0, 0, 0);
        s.camera.near = 0.045; s.camera.updateProjectionMatrix();
    });
    const soil = await hover(800, 500), expectedCenter = await soilDistance(800, 500);
    expect(soil.error).toBeNull();
    expect(Math.abs(soil.distanceMeters - expectedCenter.distance)).toBeLessThan(0.01);
    const offAxis = await hover(1450, 600), expectedOffAxis = await soilDistance(1450, 600);
    expect(Math.abs(offAxis.distanceMeters - expectedOffAxis.distance)).toBeLessThan(0.01);
    expect(Math.abs(offAxis.distanceMeters - expectedOffAxis.axisDepth)).toBeGreaterThan(0.1);
    await expect(page.locator('#scene-performance')).toHaveText(/FPS .* · GPU .* · Distance \d+\.\d{2} m/);
    await page.screenshot({ path: path.join(folder, 'soil_distance.png') });

    await page.locator('#scene-canvas').focus();
    await page.keyboard.down('w');
    try {
        await expect.poll(async () => (await state()).distanceMeters).toBeLessThan(offAxis.distanceMeters - 0.03);
    } finally { await page.keyboard.up('w'); }
    const moved = await state();
    expect(moved.active).toBe(true);
    await page.mouse.move(80, 50);
    await expect.poll(async () => (await state()).distanceMeters).toBeNull();
    await expect(page.locator('#scene-performance')).toHaveText(/ · Distance —$/);
    const tablePoint = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__grassLitterScene;
        const mesh = s.scene.getObjectByName('Perforated_shade_screen').children[0];
        const bounds = new THREE.Box3().setFromObject(mesh), point = bounds.getCenter(new THREE.Vector3());
        point.y = bounds.max.y;
        s.camera.position.copy(point).add(new THREE.Vector3(0, 5, 0));
        s.camera.up.set(0, 0, -1); s.camera.lookAt(point);
        s.camera.near = 0.1; s.camera.updateProjectionMatrix();
        return point.toArray();
    });
    const table = await hover(800, 500);
    expect(Math.abs(table.distanceMeters - 5)).toBeLessThan(0.01);
    await page.screenshot({ path: path.join(folder, 'table_distance.png') });

    await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__grassLitterScene;
        s.setMode('grass');
        const mesh = s.scene.getObjectByName('Offline_96000_Leaves').children[0], geometry = mesh.geometry;
        const p = geometry.attributes.position, index = geometry.index, point = new THREE.Vector3();
        for (let i = 0; i < index.count; i += 3) {
            point.set(0, 0, 0);
            for (let j = 0; j < 3; j++) point.add(new THREE.Vector3().fromBufferAttribute(p, index.getX(i + j)));
            point.multiplyScalar(1 / 3);
            if (point.y > 0.08) break;
        }
        mesh.updateWorldMatrix(true, false); point.applyMatrix4(mesh.matrixWorld);
        s.camera.position.copy(point).add(new THREE.Vector3(0.15, 0.25, 0.15));
        s.camera.up.set(0, 1, 0); s.camera.lookAt(point);
        s.camera.near = s.camera.position.y * 0.015; s.camera.updateProjectionMatrix();
    });
    const grass = await hover(800, 500), groundBehindGrass = await soilDistance(800, 500);
    expect(grass.distanceMeters).toBeGreaterThan(0);
    expect(grass.distanceMeters).toBeLessThan(groundBehindGrass.distance - 0.04);
    await page.screenshot({ path: path.join(folder, 'grass_distance.png') });
    const grassByLod = {};
    for (const lod of ['LOD1', 'LOD0']) {
        await page.getByRole('combobox', { name: 'LOD', exact: true }).selectOption(lod);
        grassByLod[lod] = await hover(800, 500);
        expect(grassByLod[lod].distanceMeters).toBeLessThan(groundBehindGrass.distance - 0.04);
    }
    await page.getByRole('radio', { name: 'Soil', exact: true }).check();
    const bare = await hover(800, 500);
    expect(Math.abs(bare.distanceMeters - groundBehindGrass.distance)).toBeLessThan(0.01);
    await page.getByRole('radio', { name: 'All', exact: true }).check();
    const all = await hover(800, 500);
    expect(all.distanceMeters).toBeLessThan(bare.distanceMeters - 0.04);

    await page.getByRole('combobox', { name: 'Fields', exact: true }).selectOption('9');
    await page.evaluate(() => {
        const s = window.__grassLitterScene;
        s.camera.position.x += 13; s.camera.position.z -= 13;
    });
    const copy = await hover(800, 500);
    expect(Math.abs(copy.distanceMeters - all.distanceMeters)).toBeLessThan(0.01);
    await page.getByRole('combobox', { name: 'Fields', exact: true }).selectOption('1');
    const absentCopy = await hover(800, 500);
    expect(Math.abs(absentCopy.distanceMeters - groundBehindGrass.distance)).toBeLessThan(0.01);
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForFunction(() => window.__grassLitterScene.renderer.domElement.width === 1200
        && window.__grassLitterScene.renderer.domElement.height === 800);
    await hover(1000, 550);
    const expectedResize = await soilDistance(1000, 550);
    await expect.poll(async () => {
        const value = (await state()).distanceMeters;
        return value === null ? Infinity : Math.abs(value - expectedResize.distance);
    }).toBeLessThan(0.01);
    const resized = await state();
    await page.evaluate(() => {
        const s = window.__grassLitterScene;
        s.camera.position.set(0, 3, 8); s.camera.up.set(0, 0, -1); s.camera.lookAt(0, 20, 8);
    });
    const background = await hover(600, 400);
    expect(background.distanceMeters).toBeNull();
    await expect(page.locator('#scene-performance')).toHaveText(/ · Distance —$/);
    await page.mouse.move(100, 20);
    expect((await state()).active).toBe(false);
    expect((await state()).error).toBeNull();
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({
        soil, expectedCenter, offAxis, expectedOffAxis, moved, tablePoint, table, grass, groundBehindGrass,
        grassByLod, bare, all, copy, absentCopy, resized, expectedResize, background
    }, null, 2));
    expect(errors).toEqual([]);
});
