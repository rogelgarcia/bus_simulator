// Temporary spike-study capture and verification of its full-detail instances and rollback path.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

test('Spike study renders 1000 randomized grounded leaves and retains the card-study rollback', async ({ page }) => {
    test.setTimeout(90000);
    const phase = process.env.GRASS_SURFACE_CAPTURE;
    if (phase && !['before', 'after'].includes(phase)) throw new Error('Expected a before or after surface capture.');
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/spike_experiment_1k', phase ? `surface_tuning/${phase}` : '.');
    await mkdir(folder, { recursive: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1800, height: 1200 });
    await page.route('**/debug_tools/grass_plant_study.html?layout=row', async route => {
        const response = await route.fetch();
        const body = (await response.text()).replace('GrassDebugV2PlantStudy.js', 'GrassDebugV2SpikeExperiment.js');
        await route.fulfill({ response, body });
    }, { times: 1 });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__grassSpikeReadiness);
    await page.evaluate(() => window.__grassSpikeReadiness);
    await expect(page.locator('#plant-loading')).toBeHidden();
    await expect(page.getByRole('heading', { name: '1,000 Leaf Study' })).toBeVisible();
    await expect(page.locator('#plant-counts')).toHaveText('1,000 leaves · 4,832,000 tris');
    await expect(page.getByLabel('Square bounds')).toBeChecked();
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), study = window.__grassSpikeStudy;
        const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
        const instances = [];
        for (const mesh of study.field.children) for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
            instances.push({ position: position.toArray(), rotation: rotation.toArray(), scale: scale.toArray() });
        }
        let submittedLeaves = 0;
        for (const mesh of study.field.children) mesh.onBeforeRender = () => { submittedLeaves += mesh.count; };
        study.render(); study.renderer.getContext().finish();
        for (const mesh of study.field.children) mesh.onBeforeRender = () => {};
        const bounds = new THREE.Box3().setFromObject(study.field);
        const material = study.field.children[0].material, roughness = material.roughnessMap.image.data;
        let minimumRoughness = 1, maximumRoughness = 0;
        for (let i = 1; i < roughness.length; i += 4) {
            minimumRoughness = Math.min(minimumRoughness, roughness[i] / 255);
            maximumRoughness = Math.max(maximumRoughness, roughness[i] / 255);
        }
        return { snapshot: study.getSnapshot(), instances, submittedLeaves,
            material: { normalScale: material.normalScale.toArray(), roughness: material.roughness, minimumRoughness, maximumRoughness },
            hasShadowMap: !!study.scene.children.find(object => object.isDirectionalLight).shadow.map,
            bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
    });
    expect(result.instances).toHaveLength(1000); expect(result.submittedLeaves).toBe(1000);
    expect(result.hasShadowMap).toBe(true);
    expect(new Set(result.instances.map(instance => instance.rotation.join(','))).size).toBe(1000);
    for (const instance of result.instances) {
        expect(instance.position[1]).toBe(0);
        expect(instance.scale[1]).toBeGreaterThanOrEqual(0.84999); expect(instance.scale[1]).toBeLessThanOrEqual(1.15001);
    }
    expect(Math.max(...result.instances.map(instance => instance.scale[1])) - Math.min(...result.instances.map(instance => instance.scale[1]))).toBeGreaterThan(0.28);
    for (const axis of [0, 2]) { expect(result.bounds.min[axis]).toBeGreaterThanOrEqual(-0.50001); expect(result.bounds.max[axis]).toBeLessThanOrEqual(0.50001); }
    expect(result.bounds.min[1]).toBeLessThan(0); expect(result.bounds.max[1]).toBeGreaterThan(0.1);
    await page.screenshot({ path: path.join(folder, 'study_ui.jpg'), quality: 90 });
    const cameras = {};
    for (const pose of ['three_quarter', 'elevated', 'side', 'crown_close']) {
        const capture = await page.evaluate(({ pose, phase }) => { const study = window.__grassSpikeStudy;
            study.setPose(pose); study.render(); return { data: study.renderer.domElement.toDataURL(phase ? 'image/png' : 'image/jpeg', 0.92),
                camera: { position: study.camera.position.toArray(), quaternion: study.camera.quaternion.toArray(),
                    fov: study.camera.fov, aspect: study.camera.aspect, pixelRatio: study.renderer.getPixelRatio() } }; }, { pose, phase });
        cameras[pose] = capture.camera;
        await writeFile(path.join(folder, `${pose}.${phase ? 'png' : 'jpg'}`), Buffer.from(capture.data.split(',')[1], 'base64'));
    }
    result.cameras = cameras;
    if (phase === 'after') {
        const before = JSON.parse(await readFile(path.join(folder, '../before/capture.json'), 'utf8'));
        expect(result.instances).toEqual(before.instances);
        expect(result.cameras).toEqual(before.cameras);
        expect(result.snapshot.lighting).toEqual(before.snapshot.lighting);
        expect(result.snapshot.land).toEqual(before.snapshot.land);
        expect(result.snapshot.leafTriangles).toBe(before.snapshot.leafTriangles);
        expect(result.material.minimumRoughness).toBeGreaterThan(before.material.minimumRoughness);
        expect(result.material.maximumRoughness).toBeGreaterThan(before.material.maximumRoughness);
        expect(result.material.normalScale[0]).toBeLessThan(before.material.normalScale[0]);
    }
    await writeFile(path.join(folder, 'capture.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result.snapshot, submittedLeaves: result.submittedLeaves, errors }));
    await page.goto('/debug_tools/grass_plant_study.html?layout=row&experiment=off');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await expect(page.getByRole('heading', { name: 'LOD3 Study' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'LOD3 · 4 cards', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'LOD3 · 6 cards', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
});
