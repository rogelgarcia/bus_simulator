// Exercise immutable grass through the bus lab, including movement, coverage and disposal.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('Patch grass keeps GPU geometry fixed while moving through the bus lab', async ({ page }) => {
    test.setTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__grassTestView = view;\nlet copyFeedbackTimer;') });
    });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/debug_tools/grass_debug_v2.html?grass=patches&curve=30');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    const initial = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
    expect(initial.grass.strategy).toBe('patches');
    expect(initial.grass.field.geometryPolicy).toBe('immutable');
    expect(initial.grass.triangles).toBeGreaterThan(0);
    await expect(page.locator('[data-grass-strategy="patches"]')).toHaveAttribute('aria-current', 'page');
    const output = 'tests/artifacts/screens/grass/runtime_redesign';
    await mkdir(output, { recursive: true });
    for (const pose of ['bus', 'grass', 'overview', 'curve-inner', 'curve-outer']) {
        await page.evaluate(pose => window.__grassDebugV2.setCamera(pose), pose);
        const frame = await page.evaluate(() => window.__grassDebugV2.getSnapshot().frame);
        await page.waitForFunction(frame => window.__grassDebugV2.getSnapshot().frame > frame + 35, frame);
        await page.screenshot({ path: `${output}/patches-${pose}.png` });
    }
    const result = await page.evaluate(async () => {
        const view = window.__grassTestView, renderer = view.renderer, gl = renderer.getContext();
        renderer.setAnimationLoop(null);
        view.setCamera('grass');
        const origin = view.camera.position.clone();
        const draw = () => { view.grass.update(view.camera.position, performance.now(), true); renderer.render(view.scene, view.camera); };
        const far = view.camera.far; view.camera.far = 6; view.camera.updateProjectionMatrix();
        for (const mode of ['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5', 'AUTO']) { view.grass.setMode(mode); draw(); }
        view.camera.far = far; view.camera.updateProjectionMatrix(); draw();
        const before = renderer.info.memory.geometries, programs = renderer.info.programs.length;
        let uploads = 0, creates = 0, maximumTriangles = 0, maximumCalls = 0;
        const originals = ['bufferData', 'bufferSubData', 'createBuffer'].map(name => [name, gl[name]]);
        for (const [name, original] of originals) gl[name] = function (...args) {
            if (name === 'createBuffer') creates++; else uploads++;
            return original.apply(this, args);
        };
        const cpu = [];
        try {
            for (let i = 0; i < 180; i++) {
                view.camera.position.copy(origin);
                view.camera.position.x += Math.sin(i / 13) * 11;
                view.camera.position.z += i < 90 ? i * .7 : (180 - i) * .7;
                if (i >= 120) view.camera.position.y = .25 + Math.sin(i / 9) ** 2 * 4.5;
                view.camera.updateMatrixWorld(true);
                const start = performance.now();
                draw(); cpu.push(performance.now() - start);
                maximumTriangles = Math.max(maximumTriangles, renderer.info.render.triangles);
                maximumCalls = Math.max(maximumCalls, renderer.info.render.calls);
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        } finally { for (const [name, original] of originals) gl[name] = original; }
        const field = view.grass.getSnapshot().field;
        const after = renderer.info.memory.geometries, programsAfterMovement = renderer.info.programs.length;
        const THREE = await import('three'), mask = view.grass.coverage, bounds = mask.bounds;
        const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ, size = 256;
        const capture = new THREE.Scene(), orthographic = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, .01, 4);
        orthographic.position.set((bounds.minX + bounds.maxX) / 2, 2, (bounds.minZ + bounds.maxZ) / 2);
        orthographic.up.set(0, 0, -1); orthographic.lookAt(orthographic.position.x, 0, orthographic.position.z); orthographic.updateMatrixWorld(true);
        view.grass.group.traverse(mesh => { if (mesh.userData.grassCanopy) capture.add(mesh.clone()); });
        const target = new THREE.WebGLRenderTarget(size, size), pixels = new Uint8Array(size * size * 4);
        const previousTarget = renderer.getRenderTarget(), previousColor = renderer.getClearColor(new THREE.Color()), previousAlpha = renderer.getClearAlpha();
        const source = capture.children[0].material, strength = renderer.properties.get(source).uniforms.bakedGrassShadowStrength;
        const originalStrength = strength.value;
        let mismatches = 0, covered = 0, excluded = 0, shadowed = 0;
        try {
            renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.render(capture, orthographic);
            renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
            for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
                const coverage = mask.sample(bounds.minX + (x + .5) / size * width, bounds.maxZ - (z + .5) / size * depth);
                const alpha = pixels[(z * size + x) * 4 + 3];
                if (coverage > .95) { covered++; if (alpha < 250) mismatches++; }
                if (coverage < .05) { excluded++; if (alpha > 5) mismatches++; }
            }
            strength.value = 0; renderer.render(capture, orthographic);
            const unshadowed = new Uint8Array(pixels.length); renderer.readRenderTargetPixels(target, 0, 0, size, size, unshadowed);
            for (let i = 0; i < pixels.length; i += 4) if (unshadowed[i] + unshadowed[i + 1] + unshadowed[i + 2] - pixels[i] - pixels[i + 1] - pixels[i + 2] > 15) shadowed++;
        } finally {
            strength.value = originalStrength; renderer.setRenderTarget(previousTarget); renderer.setClearColor(previousColor, previousAlpha); target.dispose(); capture.clear();
        }
        view.grass.setMode('OFF'); draw();
        const off = view.grass.getSnapshot();
        view.grass.setMode('AUTO'); draw();
        const programsAfter = renderer.info.programs.length, texturesBeforeDisposal = renderer.info.memory.textures;
        view.grass.dispose();
        const disposal = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, texturesBeforeDisposal,
            attached: view.scene.getObjectByName('GrassImmutablePatches') !== undefined };
        return { uploads, creates, before, after, programs, programsAfterMovement, programsAfter, disposal, coverage: { mismatches, covered, excluded, shadowed },
            maximumTriangles, maximumCalls, cpu, field, off, glError: gl.getError() };
    });
    await writeFile(`${output}/patches-validation.json`, JSON.stringify({ initial, result, errors }, null, 2));
    expect(result.uploads).toBe(0);
    expect(result.creates).toBe(0);
    expect(result.after).toBe(result.before);
    expect(result.programsAfterMovement).toBe(result.programs);
    expect(result.coverage.mismatches).toBe(0);
    expect(result.coverage.covered).toBeGreaterThan(1000);
    expect(result.coverage.excluded).toBeGreaterThan(1000);
    expect(result.coverage.shadowed).toBeGreaterThan(25);
    expect(result.disposal.attached).toBe(false);
    expect(result.disposal.geometries).toBeLessThan(result.after);
    expect(result.disposal.textures).toBeLessThan(result.disposal.texturesBeforeDisposal);
    expect(result.off.triangles).toBe(0);
    expect(result.glError).toBe(0);
    expect(errors).toEqual([]);
});

test('Baked and fixed-patch bus-lab comparisons share runtime assets and preserve the camera', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto('/debug_tools/grass_debug_v2.html?grass=baked&curve=18');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    await page.evaluate(() => window.__grassDebugV2.setCamera('grass'));
    const before = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
    expect(before.grass).toMatchObject({ strategy: 'baked', patches: 8640, appearance: { paletteRevision: 'canopy-palette-17' } });
    expect(requests.some(url => url.includes('/assets/public/grass/gameplay/grass.bin'))).toBe(true);
    await page.locator('[data-grass-strategy="patches"]').click();
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    const after = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
    expect(after.grass).toMatchObject({ strategy: 'patches', curve: { radius: 18 } });
    for (let i = 0; i < 3; i++) expect(after.camera.position[i]).toBeCloseTo(before.camera.position[i], 5);
    for (let i = 0; i < 3; i++) expect(after.camera.target[i]).toBeCloseTo(before.camera.target[i], 5);
    expect(errors).toEqual([]);
});

test('grass disposed during shader preparation cannot render or restore stale renderer state', async ({ page }) => {
    await page.route('**/tests/headless/harness/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { loadGrassRuntimeAsset } = await import('/src/graphics/engine3d/grass/runtime/GrassRuntimeAsset.js');
        const { createGrassBoundaryMask } = await import('/src/graphics/engine3d/grass/runtime/GrassBoundaryMask.js');
        const { createGrassPatchRenderer } = await import('/src/graphics/engine3d/grass/runtime/GrassPatchRenderer.js');
        const renderer = new THREE.WebGLRenderer(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
        const asset = await loadGrassRuntimeAsset({ renderer }), bounds = { minX: 0, minZ: 0, maxX: 4, maxZ: 4 };
        const coverage = createGrassBoundaryMask({ bounds, outline: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }], exclusions: [], resolution: 64 });
        const grass = createGrassPatchRenderer({ asset, coverage, bounds });
        let renders = 0;
        renderer.shadowMap.needsUpdate = true;
        renderer.compileAsync = async () => {
            await Promise.resolve(); grass.dispose();
            renderer.setViewport(11, 12, 13, 14); renderer.shadowMap.needsUpdate = false;
        };
        renderer.render = () => { renders++; };
        await grass.prewarm(renderer, scene, camera);
        const result = { renders, viewport: renderer.getViewport(new THREE.Vector4()).toArray(), shadowNeedsUpdate: renderer.shadowMap.needsUpdate };
        coverage.dispose(); asset.dispose(); renderer.dispose(); return result;
    });
    expect(result.renders).toBe(0);
    expect(result.viewport).toEqual([11, 12, 13, 14]);
    expect(result.shadowNeedsUpdate).toBe(false);
});
