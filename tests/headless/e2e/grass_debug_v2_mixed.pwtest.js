// Compare a controlled source line with its card silhouette and the four-block mixed scene.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('Mixed source is one grounded line and curved LOD3 preserves its silhouette at DPR 2', async ({ page }) => {
    await page.route('**/grass-line-check', route => route.fulfill({ contentType: 'text/html', body: '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/"}}</script>' }));
    await page.goto('/grass-line-check');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2Line } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Line.js');
        const { createGrassDebugV2Cards } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Cards.js');
        const line = createGrassDebugV2Line();
        const renderer = new THREE.WebGLRenderer();
        renderer.setPixelRatio(2);
        const cards = createGrassDebugV2Cards(renderer, line.slices);
        const roots = [];
        for (let i = 0; i < line.geometry.attributes.position.count; i += 13) {
            roots.push(new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.position, i + 1).toArray());
        }
        const target = new THREE.WebGLRenderTarget(1024, 192);
        const camera = new THREE.OrthographicCamera(-0.52, 0.52, 0.105, -0.015, 0.01, 5);
        camera.position.set(-2, 0, 0.5); camera.lookAt(0.65, 0, 0.5);
        const scene = new THREE.Scene();
        const materials = [new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), new THREE.MeshBasicMaterial({ map: cards.material.map, alphaTest: cards.material.alphaTest, side: THREE.DoubleSide })];
        const silhouettes = [];
        for (const [name, x, y] of [['front', -2, 0], ['incline', -2, 1.3], ['reverse', 3, 1.2]]) {
            camera.position.set(x, y, 0.5); camera.lookAt(0.65, 0, 0.5);
            const masks = [];
            for (const [i, geometry] of [line.geometry, cards.geometry].entries()) {
                const mesh = new THREE.Mesh(geometry, materials[i]);
                scene.add(mesh);
                renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.render(scene, camera);
                const pixels = new Uint8Array(1024 * 192 * 4);
                renderer.readRenderTargetPixels(target, 0, 0, 1024, 192, pixels);
                masks.push(pixels.filter((_, index) => index % 4 === 3).map(alpha => alpha > 0 ? 1 : 0));
                scene.remove(mesh);
            }
            let intersection = 0, union = 0;
            for (let i = 0; i < masks[0].length; i++) {
                intersection += masks[0][i] && masks[1][i] ? 1 : 0;
                union += masks[0][i] || masks[1][i] ? 1 : 0;
            }
            silhouettes.push({ name, overlap: intersection / union });
        }
        const result = { roots, silhouettes, atlasSize: cards.material.map.image.width, leaves: line.slices.reduce((sum, slice) => sum + slice.leafCount, 0), sourceTriangles: line.geometry.index.count / 3, cardTriangles: cards.geometry.index.count / 3 };
        cards.dispose(); cards.geometry.dispose(); cards.material.dispose();
        line.geometry.dispose(); line.slices.forEach(slice => slice.geometry.dispose());
        materials.forEach(material => material.dispose()); target.dispose(); renderer.dispose();
        return result;
    });
    expect(result).toMatchObject({ leaves: 16, sourceTriangles: 224, cardTriangles: 32, atlasSize: 512 });
    expect(result.roots).toHaveLength(16);
    for (const [index, root] of result.roots.entries()) {
        expect(root[0]).toBeCloseTo(0.65, 6);
        expect(root[1]).toBe(0);
        expect(root[2]).toBeCloseTo((index + 0.5) / 16, 6);
    }
    for (const silhouette of result.silhouettes) expect(silhouette.overlap, `The card line must match the 3D silhouette from ${silhouette.name}`).toBeGreaterThan(0.85);
    await mkdir('tests/artifacts/screens/grass_debug_v2/mixed', { recursive: true });
    await writeFile('tests/artifacts/screens/grass_debug_v2/mixed/silhouettes.json', JSON.stringify(result, null, 2));
});

test('Mixed mode shows four separated blocks in LOD rows and records their benchmark configuration', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__mixedTestView = view;\nlet copyFeedbackTimer;') });
    });
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.goto('/debug_tools/grass_debug_v2.html');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    await page.getByRole('button', { name: 'MIX', exact: true }).click();
    await page.getByRole('button', { name: 'Grass comparison', exact: true }).click();
    await expect(page.locator('#grass-counts')).toHaveText('LOD0 · 32 leaves · 448 tris\nLOD3 · 32 leaves · 64 tris');
    const boundsToggle = page.getByRole('checkbox', { name: 'Card bounds', exact: true });
    await expect(boundsToggle).not.toBeChecked();
    await boundsToggle.check();
    expect(await page.evaluate(() => window.__mixedTestView.grass.mixed.cardBounds.visible)).toBe(true);
    await boundsToggle.uncheck();
    expect(await page.evaluate(() => window.__mixedTestView.grass.mixed.cardBounds.visible)).toBe(false);
    await boundsToggle.check();
    const state = await page.evaluate(() => {
        const view = window.__mixedTestView;
        return {
            snapshot: view.grass.getSnapshot(),
            fieldVisible: Object.values(view.grass.meshes).some(mesh => mesh.visible),
            mixedVisible: view.grass.mixed.group.visible,
            instances: Object.values(view.grass.mixed.meshes).map(mesh => mesh.count),
            guides: view.grass.mixed.outlines.geometry.attributes.position.count / 2,
            cardBoundarySegments: view.grass.mixed.cardBounds.geometry.attributes.position.count / 2,
            countsFit: document.getElementById('grass-counts').scrollWidth <= document.getElementById('grass-counts').clientWidth
        };
    });
    expect(state).toMatchObject({ fieldVisible: false, mixedVisible: true, instances: [2, 2], guides: 16, countsFit: true, snapshot: { mode: 'MIXED', patches: 4, leaves: 64, triangles: 512, layout: 'single-line', placement: { rows: 2, columns: 2, gapMeters: 0.5 } } });
    expect(state).toMatchObject({ cardBoundarySegments: 80, snapshot: {
        cardBoundsVisible: true, lods: { LOD0: { leaves: 32, triangles: 448 }, LOD3: { leaves: 32, triangles: 64 } }
    } });
    const blocks = state.snapshot.blocks;
    expect(blocks.map(block => block.mode)).toEqual(['LOD0', 'LOD0', 'LOD3', 'LOD3']);
    expect(blocks[0].x).toBe(blocks[1].x);
    expect(blocks[2].x).toBe(blocks[3].x);
    expect(blocks[0].x - blocks[2].x - 1).toBeCloseTo(0.5, 6);
    expect(blocks[1].z - blocks[0].z - 1).toBeCloseTo(0.5, 6);
    const output = 'tests/artifacts/screens/grass_debug_v2/mixed';
    await mkdir(output, { recursive: true });
    const captureFrame = await page.evaluate(() => window.__grassDebugV2.getSnapshot().frame);
    await page.waitForFunction(frame => window.__grassDebugV2.getSnapshot().frame > frame + 60, captureFrame);
    await page.screenshot({ path: `${output}/four-blocks.png` });
    await page.setViewportSize({ width: 750, height: 816 });
    await page.getByRole('button', { name: 'Grass comparison', exact: true }).click();
    const allCornersVisible = await page.evaluate(async () => {
        const THREE = await import('three');
        const view = window.__mixedTestView;
        view.camera.updateMatrixWorld();
        return view.grass.mixed.blocks.every(block => [[0, 0], [0, 1], [1, 0], [1, 1]].every(([x, z]) => {
            const ndc = new THREE.Vector3(block.x + x, 0, block.z + z).project(view.camera);
            return Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && ndc.z > -1 && ndc.z < 1;
        }));
    });
    expect(allCornersVisible, 'The comparison camera must frame all four blocks in a narrow viewport').toBe(true);
    await page.screenshot({ path: `${output}/four-blocks-narrow.png` });
    for (const mode of ['OFF', 'LOD0', 'LOD3', 'MIXED']) {
        await page.evaluate(mode => window.__grassDebugV2.setGrassMode(mode), mode);
        expect(await page.evaluate(() => window.__mixedTestView.grass.mixed.group.visible)).toBe(mode === 'MIXED');
        if (mode === 'MIXED') await expect(boundsToggle).toBeEnabled();
        else await expect(boundsToggle).toBeDisabled();
    }
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.locator('[data-grass-mode="MIXED"]')).toBeDisabled();
    await expect(page.locator('#grass-view')).toBeDisabled();
    await expect(boundsToggle).toBeDisabled();
    expect(await page.evaluate(() => window.__grassDebugV2.setMixedCardBounds(false))).toBe(false);
    expect(await page.evaluate(() => window.__grassDebugV2.setGrassMode('LOD0'))).toBe(false);
    await page.waitForFunction(() => window.__grassDebugV2.getSnapshot().benchmark.phase === 'complete', null, { timeout: 70_000 });
    const result = await page.evaluate(() => window.__grassDebugV2.getSnapshot().benchmark.result);
    expect(result.grass).toMatchObject({ mode: 'MIXED', patches: 4, leaves: 64, triangles: 512, cardBoundsVisible: true, lods: state.snapshot.lods });
    await expect(page.locator('#benchmark-results output').last()).toHaveText(/^MIXED · (GPU|Frame) /);
    await expect(page.locator('#grass-view')).toBeEnabled();
    await expect(boundsToggle).toBeEnabled();
    await writeFile(`${output}/verification.json`, JSON.stringify({ state, result }, null, 2));
    expect(errors).toEqual([]);
});
