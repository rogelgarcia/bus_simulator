// Check missing-leaf placement at baked and intermediate views, then exercise immutable movement.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass/lod4_offline_leaf_fill';

test('Offline leaf textures recover LOD3 detail without uploading grass while the camera moves', async ({ page }) => {
    test.setTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/tests/headless/harness/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { loadGrassRuntimeAsset } = await import('/src/graphics/engine3d/grass/runtime/GrassRuntimeAsset.js');
        const { createGrassBoundaryMask } = await import('/src/graphics/engine3d/grass/runtime/GrassBoundaryMask.js');
        const { createGrassPatchRenderer } = await import('/src/graphics/engine3d/grass/runtime/GrassPatchRenderer.js');
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        const width = 768, height = 512;
        renderer.setSize(width, height); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .0511;
        const asset = await loadGrassRuntimeAsset({ renderer, leafFill: true });
        const bounds = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 };
        const coverage = createGrassBoundaryMask({ bounds, outline: [{ x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 }], exclusions: [], resolution: 256 });
        const grass = createGrassPatchRenderer({ asset, coverage, bounds }), scene = new THREE.Scene(); scene.add(grass.group);
        const camera = new THREE.OrthographicCamera(-4.5, 4.5, 3, -3, .1, 2000), gl = renderer.getContext();
        const capture = (mode, strength) => {
            grass.setMode(mode); grass.update(camera); renderer.render(scene, camera);
            renderer.properties.get(grass.material.surface).uniforms.grassLeafFillStrength.value = strength;
            renderer.render(scene, camera);
            const pixels = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return { pixels, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls,
                image: renderer.domElement.toDataURL('image/png') };
        };
        const rows = [], point = new THREE.Vector3(), ray = new THREE.Vector3(), luma = (pixels, i) => .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
        for (let view = 0; view < 16; view++) {
            const angle = view * Math.PI / 8, elevation = 20 * Math.PI / 180;
            camera.position.set(Math.cos(angle) * 1000, Math.tan(elevation) * 1000, Math.sin(angle) * 1000);
            camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true); camera.getWorldDirection(ray);
            const lod3 = capture('LOD3', 0), bare = capture('LOD4', 0), filled = capture('LOD4', 1);
            const values = [];
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, -1).unproject(camera);
                point.addScaledVector(ray, (.005 - point.y) / ray.y);
                if (Math.abs(point.x) > 5 || Math.abs(point.z) > 5) continue;
                const i = (y * width + x) * 4;
                values.push([luma(lod3.pixels, i), luma(bare.pixels, i), luma(filled.pixels, i)]);
            }
            const meanDelta = values.reduce((sum, v) => sum + v[2] - v[1], 0) / values.length;
            let bareError = 0, filledError = 0, uniformError = 0, missing = 0, missingRecovery = 0, changed = 0;
            for (const [ref, before, after] of values) {
                bareError += Math.abs(ref - before); filledError += Math.abs(ref - after); uniformError += Math.abs(ref - before - meanDelta);
                if (ref - before > 20) { missing++; missingRecovery += Math.abs(ref - before) - Math.abs(ref - after); }
                if (Math.abs(after - before) > 2) changed++;
            }
            const captures = view === 0 || view === 1 ? { lod3, bare, filled } : {};
            for (const capture of Object.values(captures)) delete capture.pixels;
            rows.push({ azimuth: view * 22.5, intermediate: view % 2 === 1, pixels: values.length, meanDelta,
                bareError: bareError / values.length, filledError: filledError / values.length, uniformError: uniformError / values.length,
                missing, missingRecovery: missingRecovery / missing, changed, triangles: filled.triangles, bareTriangles: bare.triangles,
                referenceTriangles: lod3.triangles, calls: filled.calls, bareCalls: bare.calls, captures });
        }
        // Warm every program before intercepting geometry/texture uploads.
        for (const mode of ['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5', 'AUTO']) capture(mode, 1);
        const before = { ...renderer.info.memory, programs: renderer.info.programs.length }, counts = { buffer: 0, texture: 0, creates: 0 };
        const originals = ['bufferData', 'bufferSubData', 'createBuffer', 'texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'generateMipmap'].map(name => [name, gl[name]]);
        for (const [name, original] of originals) gl[name] = function (...args) {
            counts[name === 'createBuffer' ? 'creates' : name.startsWith('buffer') ? 'buffer' : 'texture']++;
            return original.apply(this, args);
        };
        try {
            for (let i = 0; i < 72; i++) {
                const angle = i * Math.PI / 36;
                camera.position.set(Math.cos(angle) * 14, 5, Math.sin(angle) * 14); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
                grass.setMode(i < 36 ? 'LOD4' : 'AUTO'); grass.update(camera); renderer.render(scene, camera);
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        } finally { for (const [name, original] of originals) gl[name] = original; }
        const after = { ...renderer.info.memory, programs: renderer.info.programs.length };
        const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = { supported: !!extension, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, pairs: [], disjoint: false };
        if (extension) {
            renderer.setSize(2720, 1904);
            const originalAsset = await loadGrassRuntimeAsset({ renderer });
            const originalGrass = createGrassPatchRenderer({ asset: originalAsset, coverage, bounds }), originalScene = new THREE.Scene(); originalScene.add(originalGrass.group);
            const bus = new THREE.PerspectiveCamera(55, 2720 / 1904, .1, 100);
            const draw = which => {
                const instance = which === 'baked' ? grass : originalGrass;
                instance.update(bus); renderer.render(which === 'baked' ? scene : originalScene, bus);
            };
            const pending = [];
            try {
                for (const mode of ['LOD4', 'AUTO']) {
                    grass.setMode(mode); originalGrass.setMode(mode);
                    bus.position.set(0, 6.88, -18.63); bus.lookAt(0, .39, 0); bus.updateMatrixWorld(true);
                    for (let warm = 0; warm < 8; warm++) { draw('previous'); draw('baked'); }
                    for (let sample = 0; sample < 24; sample++) {
                        const angle = sample * Math.PI / 12;
                        bus.position.set(Math.sin(angle) * 18.63, 6.88, -Math.cos(angle) * 18.63); bus.lookAt(0, .39, 0); bus.updateMatrixWorld(true);
                        const pair = { mode, sample }; gpu.pairs.push(pair);
                        for (const which of sample % 2 ? ['baked', 'previous'] : ['previous', 'baked']) {
                            const query = gl.createQuery(); gl.beginQuery(extension.TIME_ELAPSED_EXT, query); draw(which); gl.endQuery(extension.TIME_ELAPSED_EXT);
                            pending.push({ query, pair, which });
                        }
                        await new Promise(resolve => requestAnimationFrame(resolve));
                    }
                }
                const deadline = performance.now() + 10000;
                while (pending.some(item => !gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE))) {
                    if (performance.now() > deadline) throw new Error('Leaf-fill GPU query timeout.');
                    await new Promise(resolve => requestAnimationFrame(resolve));
                }
                gpu.disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
                if (!gpu.disjoint) for (const item of pending) item.pair[item.which] = gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6;
            } finally { pending.forEach(item => gl.deleteQuery(item.query)); originalGrass.dispose(); originalAsset.dispose(); }
        }
        const glError = gl.getError(); grass.dispose(); coverage.dispose(); asset.dispose();
        const disposed = { ...renderer.info.memory }; renderer.dispose();
        return { rows, counts, before, after, disposed, glError, gpu };
    });
    await mkdir(output, { recursive: true });
    for (const row of result.rows) for (const [name, capture] of Object.entries(row.captures)) {
        await writeFile(`${output}/azimuth-${row.azimuth}-${name}.png`, Buffer.from(capture.image.split(',')[1], 'base64')); delete capture.image;
    }
    await writeFile(`${output}/spatial-validation.json`, JSON.stringify({ result, errors }, null, 2));
    for (const row of result.rows) {
        expect(row.pixels).toBeGreaterThan(10000);
        expect(row.changed).toBeGreaterThan(1000);
        expect(row.triangles).toBe(row.bareTriangles);
        expect(row.triangles).toBeLessThan(row.referenceTriangles);
        expect(row.calls).toBe(row.bareCalls);
        expect(row.missingRecovery, `azimuth ${row.azimuth}: recover omitted bright pixels`).toBeGreaterThan(10);
        expect(row.filledError, `azimuth ${row.azimuth}: outperform a uniform brightness increase`).toBeLessThan(row.uniformError);
        // The eight-view interpolation is an approximation, not a fidelity gate at intermediate angles.
        if (!row.intermediate) expect(row.filledError).toBeLessThan(row.bareError * .8);
    }
    expect(result.counts).toEqual({ buffer: 0, texture: 0, creates: 0 });
    expect(result.after).toEqual(result.before);
    expect(result.disposed).toEqual({ geometries: 0, textures: 0 });
    expect(result.glError).toBe(0);
    expect(errors).toEqual([]);
});

test('Offline leaf-fill lab captures retain the field camera beside the bus', async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
    const page = await context.newPage(), errors = [], snapshots = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__grassTestView = view;\nlet copyFeedbackTimer;') });
    });
    await mkdir(output, { recursive: true });
    try {
        for (const [name, offline, mode] of [['reference', true, 'LOD3'], ['baked', true, 'LOD4'], ['previous', false, 'LOD4']]) {
            await page.goto('/debug_tools/grass_debug_v2.html?grass=patches' + (offline ? '&leafFill=baked' : ''));
            await page.waitForFunction(() => !!window.__grassDebugV2);
            await page.evaluate(() => window.__grassDebugV2.readiness);
            for (const pose of ['bus', 'close']) {
                const snapshot = await page.evaluate(({ pose, mode }) => {
                    const view = window.__grassTestView;
                    view.renderer.setAnimationLoop(null);
                    const field = view.grass.getSnapshot().placement, x = (field.minX + field.maxX) / 2;
                    const position = view.busPose.position.clone(), target = view.busPose.target.clone();
                    if (pose === 'bus') { const offset = x - position.x; position.x += offset; target.x += offset; }
                    else { position.set(x, 4.5, field.minZ - 5); target.set(x, 0, field.minZ + 4); }
                    view.controls.setLookAt({ position, target });
                    window.__grassDebugV2.setGrassMode(mode); view.render(performance.now());
                    const { camera, viewport, grass } = window.__grassDebugV2.getSnapshot();
                    return { camera, viewport, grass: { mode: grass.mode, leafFill: grass.leafFill } };
                }, { pose, mode });
                snapshots.push({ name, pose, ...snapshot });
                await page.screenshot({ path: `${output}/${pose}-${name}.png`, clip: { x: 240, y: 48, width: 1360, height: 952 } });
                if (pose === 'close') await page.screenshot({ path: `${output}/close-${name}-crop.png`, clip: { x: 780, y: 470, width: 460, height: 270 } });
            }
        }
        await writeFile(`${output}/lab-capture.json`, JSON.stringify({ snapshots, errors }, null, 2));
        for (const pose of ['bus', 'close']) {
            const rows = snapshots.filter(row => row.pose === pose);
            for (const row of rows) expect(row.camera).toEqual(rows[0].camera);
            expect(rows[1].grass.leafFill).toMatchObject({ source: 'offline', views: 8, bytes: 8388608 });
            expect(rows[2].grass.leafFill).toBeNull();
        }
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});
