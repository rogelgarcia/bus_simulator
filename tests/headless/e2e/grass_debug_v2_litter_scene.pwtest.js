// Exercise the exported grass scene through real mouse and keyboard navigation.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, video: 'off' });
test('Live litter scene preserves the field and supports mouse plus WASDQE', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html#06_closeup');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    const snapshot = () => page.evaluate(() => window.__grassLitterScene.getSnapshot());
    const initial = await snapshot();
    expect(initial).toMatchObject({ leaves: 96000, triangles: 4235466, sceneTriangles: 4236154, views: 8,
        substrate: { elevationMeters: 0.005, rampWidthMeters: 0.02, edgeInsetMeters: 0.05, albedoMultiplier: 0.3 } });
    await expect(page.locator('#scene-loading')).toBeHidden();
    await expect(page.locator('#scene-view option')).toHaveCount(8);
    await expect(page.locator('#scene-counts')).toHaveText('12 × 12 m · 96,000 leaves · 4,235,512 triangles');
    await expect.poll(async () => (await snapshot()).performance.fps).toBeGreaterThan(0);
    const measured = (await snapshot()).performance;
    expect(measured.renderedFrames).toBeGreaterThan(initial.performance.renderedFrames);
    if (measured.gpuTimer.isSupported) {
        expect(measured.gpuTimer.active, measured.gpuTimer.disabledReason ?? 'GPU timer is active').toBe(true);
        await expect.poll(async () => (await snapshot()).performance.gpuTimeMs).toBeGreaterThan(0);
        await expect(page.locator('#scene-performance')).toHaveText(/FPS \d+\.\d · GPU \d+\.\d{2} ms/);
        expect((await snapshot()).performance.gpuTimer.sampleCount).toBeGreaterThan(0);
    } else {
        expect(measured.gpuTimeMs).toBeNull();
        await expect(page.locator('#scene-performance')).toHaveText(/FPS \d+\.\d · GPU unavailable/);
    }
    const fullScenePerformance = (await snapshot()).performance;
    const materials = await page.evaluate(() => {
        const scene = window.__grassLitterScene.scene;
        const field = scene.getObjectByName('Offline_96000_Leaves');
        const litter = scene.getObjectByName('GrassV2DryLitterSubstrate');
        const blades = field.children[0];
        const heights = litter.children.flatMap(mesh => {
            const positions = mesh.geometry.attributes.position, values = [];
            for (let i = 0; i < positions.count; i++) values.push(positions.getY(i) + mesh.position.y + litter.position.y);
            return values;
        });
        return { rampMinY: Math.min(...heights), rampMaxY: Math.max(...heights),
            groundContactBias: litter.children.every(mesh => mesh.material.polygonOffset && mesh.material.polygonOffsetFactor === -1 && mesh.material.polygonOffsetUnits === -1),
            grassTranslucency: blades.material.defines.GRASS_LEAF_TRANSLUCENCY,
            litterY: litter.position.y, litterColor: litter.children[0].material.color.toArray(),
            grassShadow: blades.receiveShadow && blades.castShadow };
    });
    expect(materials).toMatchObject({ grassTranslucency: 1, litterY: 0.005, litterColor: [0.3, 0.3, 0.3], grassShadow: true, groundContactBias: true });
    expect(materials.rampMinY).toBeCloseTo(0, 8); expect(materials.rampMaxY).toBeCloseTo(0.005, 8);
    const artifact = path.resolve('tests/artifacts/screens/grass_debug_v2/litter_scene');
    await mkdir(artifact, { recursive: true });
    await page.screenshot({ path: path.join(artifact, 'live_closeup.png') });
    for (const [key, direction] of [['w', [0, 0, -1]], ['s', [0, 0, 1]], ['a', [-1, 0, 0]], ['d', [1, 0, 0]], ['q', [0, -1, 0]], ['e', [0, 1, 0]]]) {
        await page.evaluate(() => window.__grassLitterScene.setView(5));
        await page.locator('#scene-canvas').focus();
        const before = await snapshot();
        await page.keyboard.down(key);
        try {
            await expect.poll(async () => {
                const after = await snapshot();
                return Math.hypot(...after.position.map((value, index) => value - before.position[index]));
            }).toBeGreaterThan(0.008);
        } finally { await page.keyboard.up(key); }
        const projected = await page.evaluate(({ before, direction, key }) => {
            const camera = window.__grassLitterScene.camera;
            const expected = camera.position.clone().fromArray(direction);
            if (key !== 'q' && key !== 'e') expected.applyQuaternion(camera.quaternion);
            return camera.position.clone().sub(camera.position.clone().fromArray(before.position)).dot(expected);
        }, { before, direction, key });
        expect(projected, key + ' moves in its expected direction').toBeGreaterThan(0.008);
    }
    await page.getByRole('button', { name: 'Reset view' }).click();
    expect((await snapshot()).position).toEqual(initial.position);
    await page.mouse.move(950, 600); await page.mouse.down();
    await page.mouse.move(1080, 550, { steps: 8 }); await page.mouse.up();
    const turned = await snapshot();
    expect(turned.position).toEqual(initial.position);
    expect(Math.hypot(...turned.quaternion.map((value, index) => value - initial.quaternion[index]))).toBeGreaterThan(0.1);
    for (const deltaY of [-100, 100]) {
        const before = await snapshot();
        await page.mouse.wheel(0, deltaY);
        await expect.poll(async () => {
            const after = await snapshot();
            return Math.hypot(...after.position.map((value, index) => value - before.position[index]));
        }).toBeGreaterThan(0.02);
        const movement = await page.evaluate(({ before, deltaY }) => {
            const s = window.__grassLitterScene;
            const expected = s.camera.position.clone().set(0, 0, Math.sign(deltaY)).applyQuaternion(s.camera.quaternion);
            return s.camera.position.clone().sub(s.camera.position.clone().fromArray(before.position)).dot(expected);
        }, { before, deltaY });
        expect(movement, 'Wheel moves along the viewing direction').toBeGreaterThan(0.02);
        expect((await snapshot()).speed).toBe(turned.speed);
        expect((await snapshot()).quaternion).toEqual(turned.quaternion);
    }
    await page.mouse.wheel(0, -2000);
    await expect.poll(async () => (await snapshot()).position[1]).toBeCloseTo(0.008, 7);
    await page.locator('#scene-speed').fill('0');
    expect((await snapshot()).speed).toBe(1);
    await page.locator('#scene-view').selectOption('2');
    const rear = await snapshot();
    expect(Math.hypot(rear.position[0], rear.position[1] - 0.06, rear.position[2])).toBeCloseTo(22, 7);
    await page.screenshot({ path: path.join(artifact, 'live_rear.png') });
    await page.locator('#scene-view').selectOption('7');
    await page.screenshot({ path: path.join(artifact, 'live_sun_and_shade.png') });
    await page.locator('#scene-view').selectOption('0');
    const beforeToggle = await snapshot(), modeResults = [];
    const modeGroup = page.getByRole('radiogroup', { name: 'Scene layers' });
    await expect(modeGroup.getByRole('radio')).toHaveCount(3);
    await expect(modeGroup.getByRole('radio', { name: 'All', exact: true })).toBeChecked();
    let soilPerformance, soilShadow;
    for (const [label, mode, leaves, triangles, litterTriangles] of [
        ['Grass only', 'grass', 96000, 4236056, 0],
        ['Soil', 'soil', 0, 590, 0],
        ['All', 'all', 96000, 4236154, 98]
    ]) {
        await modeGroup.getByRole('radio', { name: label, exact: true }).check();
        await expect(page.locator('#scene-counts')).toHaveText('12 × 12 m · ' + leaves.toLocaleString('en-US')
            + ' leaves · ' + triangles.toLocaleString('en-US') + ' triangles');
        expect(await snapshot()).toMatchObject({ mode, visibleLeaves: leaves, visibleTriangles: triangles,
            position: beforeToggle.position, quaternion: beforeToggle.quaternion });
        const visible = await page.evaluate(() => {
            const s = window.__grassLitterScene, field = s.scene.getObjectByName('Offline_96000_Leaves');
            const grass = new Set(); field.traverse(mesh => grass.add(mesh));
            let root = field;
            while (root.parent !== s.scene) root = root.parent;
            const counts = { grass: 0, litter: 0, soil: 0, table: 0, tableCasters: 0 };
            root.traverseVisible(mesh => {
                if (!mesh.isMesh) return;
                const kind = grass.has(mesh) ? 'grass' : mesh.material.name.startsWith('DryLitter') ? 'litter'
                    : mesh.material.name === 'Brown Earth' ? 'soil' : 'table';
                counts[kind] += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
                if (kind === 'table' && mesh.castShadow) counts.tableCasters++;
            });
            return counts;
        });
        expect(visible).toEqual({ grass: leaves ? 4235466 : 0, litter: litterTriangles, soil: 2, table: 588, tableCasters: 49 });
        modeResults.push({ mode, ...visible });
        if (mode === 'soil') {
            await expect.poll(async () => (await snapshot()).performance.fps).toBeGreaterThan(0);
            if (measured.gpuTimer.isSupported) {
                await expect.poll(async () => (await snapshot()).performance.gpuTimeMs).toBeGreaterThan(0);
            }
            soilPerformance = (await snapshot()).performance;
            soilShadow = await page.evaluate(() => {
                const s = window.__grassLitterScene, ground = [];
                s.scene.traverse(mesh => { if (mesh.isMesh && mesh.material.name === 'Brown Earth') ground.push(mesh); });
                const canvas = document.createElement('canvas');
                canvas.width = s.renderer.domElement.width; canvas.height = s.renderer.domElement.height;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                const capture = () => {
                    s.lighting.render(0); context.clearRect(0, 0, canvas.width, canvas.height);
                    context.drawImage(s.renderer.domElement, 0, 0);
                    return context.getImageData(0, 0, canvas.width, canvas.height).data;
                };
                const displayed = capture();
                s.lighting.sun.shadow.needsUpdate = true; s.renderer.shadowMap.needsUpdate = true;
                const refreshed = capture();
                ground.forEach(mesh => { mesh.receiveShadow = false; });
                const unshadowed = capture();
                ground.forEach(mesh => { mesh.receiveShadow = true; });
                let refreshError = 0, shadeDifference = 0;
                for (let i = 0; i < displayed.length; i += 4) {
                    refreshError += Math.abs(displayed[i + 1] - refreshed[i + 1]);
                    shadeDifference += Math.abs(refreshed[i + 1] - unshadowed[i + 1]);
                }
                return { refreshError: refreshError / (displayed.length / 4), shadeDifference: shadeDifference / (displayed.length / 4) };
            });
            expect(soilShadow.refreshError, 'Mode change refreshes the shadow map').toBeLessThan(0.1);
            expect(soilShadow.shadeDifference, 'The table still casts shade on bare soil').toBeGreaterThan(0.1);
        }
        await page.screenshot({ path: path.join(artifact, 'live_mode_' + mode + '.png') });
    }
    await modeGroup.getByRole('radio', { name: 'All', exact: true }).focus();
    for (const [label, mode] of [['Grass only', 'grass'], ['Soil', 'soil'], ['All', 'all']]) {
        await page.keyboard.press('ArrowRight');
        await expect(modeGroup.getByRole('radio', { name: label, exact: true })).toBeChecked();
        await expect(modeGroup.getByRole('radio', { name: label, exact: true })).toBeFocused();
        expect((await snapshot()).mode).toBe(mode);
    }
    await writeFile(path.join(artifact, 'telemetry_validation.json'), JSON.stringify({
        fullScenePerformance, soilPerformance, soilShadow, modes: modeResults
    }, null, 2));
    expect(errors).toEqual([]);
});
