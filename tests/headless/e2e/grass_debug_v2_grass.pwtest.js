// Checks the fixed grass comparison, atlas content, real draws and benchmark mode isolation.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('Grass Debug compares the same leaves as blades and cards', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__grassTestView = view;\nlet copyFeedbackTimer;') });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/debug_tools/grass_debug_v2.html');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    await page.waitForFunction(() => window.__grassDebugV2.getSnapshot().frame > 120);
    const artifact = 'tests/artifacts/screens/grass_debug_v2/grass';
    await mkdir(artifact, { recursive: true });
    const source = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2Tuft } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Tuft.js');
        const tuft = createGrassDebugV2Tuft();
        const second = createGrassDebugV2Tuft();
        const result = {
            leaves: tuft.slices.reduce((n, slice) => n + slice.leafCount, 0),
            identical: tuft.geometry.attributes.position.array.every((v, i) => v === second.geometry.attributes.position.array[i]),
            bounds: { min: tuft.geometry.boundingBox.min.toArray(), max: tuft.geometry.boundingBox.max.toArray() },
            indices: tuft.geometry.index.count,
            slices: tuft.slices.map(slice => ({ leafCount: slice.leafCount, triangles: slice.geometry.index.count / 3 }))
        };
        const renderer = window.__grassTestView.renderer;
        const coverageTarget = new THREE.WebGLRenderTarget(512, 512);
        const coverageMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
        const coverageScene = new THREE.Scene();
        const coverageMesh = new THREE.InstancedMesh(tuft.geometry, coverageMaterial, 4);
        for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) coverageMesh.setMatrixAt(x * 2 + z, new THREE.Matrix4().makeTranslation(x, 0, z));
        coverageMesh.instanceMatrix.needsUpdate = true;
        coverageScene.add(coverageMesh);
        const coverageCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3);
        coverageCamera.position.set(1, 2, 1);
        coverageCamera.up.set(0, 0, -1);
        coverageCamera.lookAt(1, 0, 1);
        const savedTarget = renderer.getRenderTarget();
        const savedClear = renderer.getClearColor(new THREE.Color());
        const savedAlpha = renderer.getClearAlpha();
        renderer.setRenderTarget(coverageTarget);
        renderer.setClearColor(0, 0);
        renderer.render(coverageScene, coverageCamera);
        const coveragePixels = new Uint8Array(512 * 512 * 4);
        renderer.readRenderTargetPixels(coverageTarget, 0, 0, 512, 512, coveragePixels);
        const coverage = { covered: 0, samples: 0, seamCovered: 0, seamSamples: 0 };
        for (let y = 64; y < 448; y++) for (let x = 64; x < 448; x++) {
            const occupied = coveragePixels[(y * 512 + x) * 4 + 3] > 127 ? 1 : 0;
            coverage.covered += occupied;
            coverage.samples++;
            if (Math.abs(x - 256) < 4 || Math.abs(y - 256) < 4) {
                coverage.seamCovered += occupied;
                coverage.seamSamples++;
            }
        }
        result.coverage = { overall: coverage.covered / coverage.samples, seam: coverage.seamCovered / coverage.seamSamples };
        renderer.setRenderTarget(savedTarget);
        renderer.setClearColor(savedClear, savedAlpha);
        coverageTarget.dispose(); coverageMaterial.dispose(); coverageMesh.dispose();
        for (const source of [tuft, second]) { source.geometry.dispose(); source.slices.forEach(slice => slice.geometry.dispose()); }
        const view = window.__grassTestView;
        const target = new THREE.WebGLRenderTarget(1024, 1024);
        const material = new THREE.MeshBasicMaterial({ map: view.grass.cards.material.map, transparent: true, toneMapped: false });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2);
        camera.position.z = 1;
        const scene = new THREE.Scene();
        scene.add(quad);
        const previous = view.renderer.getRenderTarget();
        const clear = view.renderer.getClearColor(new THREE.Color());
        const alpha = view.renderer.getClearAlpha();
        view.renderer.setRenderTarget(target);
        view.renderer.setClearColor(0, 0);
        view.renderer.render(scene, camera);
        const pixels = new Uint8Array(1024 * 1024 * 4);
        view.renderer.readRenderTargetPixels(target, 0, 0, 1024, 1024, pixels);
        result.slicePixels = Array(64).fill(0);
        for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
            if (pixels[(y * 1024 + x) * 4 + 3] > 127) result.slicePixels[Math.floor(y / 128) * 8 + Math.floor(x / 128)]++;
        }
        view.renderer.setRenderTarget(previous);
        view.renderer.setClearColor(clear, alpha);
        material.dispose(); quad.geometry.dispose(); target.dispose();
        return result;
    });
    expect(source.coverage.overall, 'The leaves should form a dense continuous canopy').toBeGreaterThan(0.9);
    expect(source.coverage.seam, 'Patch joins should be as dense as their interiors').toBeGreaterThan(source.coverage.overall - 0.06);
    expect(source.leaves).toBe(2048);
    expect(source.identical).toBe(true);
    expect(source.indices / 3).toBe(2048 * 14);
    for (const axis of [0, 2]) {
        expect(source.bounds.min[axis]).toBeLessThan(0);
        expect(source.bounds.min[axis]).toBeGreaterThan(-0.23);
        expect(source.bounds.max[axis]).toBeGreaterThan(1);
        expect(source.bounds.max[axis]).toBeLessThan(1.23);
    }
    expect(source.bounds.max[1]).toBeLessThan(0.15);
    expect(source.slicePixels.every(count => count > 30)).toBe(true);
    expect(source.slices.every(slice => slice.triangles === slice.leafCount * 14)).toBe(true);
    const snapshots = {};
    for (const [mode, leaves, triangles] of [['LOD0', 294912, 4128768], ['LOD3', 294912, 18432], ['OFF', 0, 0]]) {
        await page.getByRole('button', { name: mode, exact: true }).click();
        await expect(page.locator(`[data-grass-mode="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#grass-counts')).toHaveText(`${leaves.toLocaleString('en-US')} leaves · ${triangles.toLocaleString('en-US')} tris`);
        const snapshot = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
        expect(snapshot.grass).toMatchObject({ mode, leaves, triangles, patches: 144, placement: { rows: 4, columns: 36 } });
        snapshots[mode] = snapshot.grass;
        await page.getByRole('button', { name: 'Bus camera' }).click();
        await page.waitForFunction(frame => window.__grassDebugV2.getSnapshot().frame > frame + 3, snapshot.frame);
        await page.screenshot({ path: `${artifact}/${mode.toLowerCase()}-bus.png` });
        await page.evaluate(async () => {
            const THREE = await import('three');
            const view = window.__grassTestView;
            const { minX, maxX, minZ } = view.grass.placement;
            view.controls.setLookAt({ position: new THREE.Vector3(maxX + 0.8, 0.48, minZ - 1.1), target: new THREE.Vector3((minX + maxX) / 2, 0.06, minZ + 2.3) });
        });
        await page.screenshot({ path: `${artifact}/${mode.toLowerCase()}-close.png` });
    }
    const countsFit = await page.locator('#grass-counts').evaluate(el => el.scrollWidth <= el.clientWidth);
    expect(countsFit).toBe(true);
    await page.getByRole('button', { name: 'LOD3', exact: true }).click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.locator('[data-grass-mode="LOD0"]')).toBeDisabled();
    expect(await page.evaluate(() => window.__grassDebugV2.setGrassMode('OFF'))).toBe(false);
    await page.waitForFunction(() => window.__grassDebugV2.getSnapshot().benchmark.phase === 'complete', null, { timeout: 45_000 });
    const result = await page.evaluate(() => window.__grassDebugV2.getSnapshot().benchmark.result);
    expect(result.grass).toMatchObject({ mode: 'LOD3', leaves: 294912, triangles: 18432 });
    await expect(page.locator('#benchmark-results output').last()).toHaveAttribute('title', /Grass LOD3: 294,912 leaves/);
    await expect(page.locator('[data-grass-mode="LOD0"]')).toBeEnabled();
    await writeFile(`${artifact}/comparison.json`, JSON.stringify({ source, snapshots, result }, null, 2));
    expect(errors).toEqual([]);
});
