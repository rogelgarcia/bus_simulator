// Regress an opaque geometric LOD4 exit while retaining forced detail and the ordinary dissolve path.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass/lod4_rise_transition';
for (const transition of ['rise', 'trim', 'shorten']) test(`${transition}: LOD4 exits geometrically and stays unchanged when forced`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/tests/headless/harness/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async transition => {
        const THREE = await import('three');
        const { loadGrassRuntimeAsset } = await import('/src/graphics/engine3d/grass/runtime/GrassRuntimeAsset.js');
        const { createGrassPatchRenderer } = await import('/src/graphics/engine3d/grass/runtime/GrassPatchRenderer.js');
        const { createGrassBoundaryMask } = await import('/src/graphics/engine3d/grass/runtime/GrassBoundaryMask.js');
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(960, 640); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .0511;
        const asset = await loadGrassRuntimeAsset({ renderer }), bounds = { minX: -8, maxX: 8, minZ: 0, maxZ: 48 };
        const coverage = createGrassBoundaryMask({ bounds, outline: [{ x: -8, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 48 }, { x: -8, z: 48 }], exclusions: [], resolution: 256 });
        const variants = Object.fromEntries(['dissolve', transition].map(terminalTransition => [terminalTransition, createGrassPatchRenderer({ asset, coverage, bounds, terminalTransition })]));
        const scene = new THREE.Scene(); Object.values(variants).forEach(grass => scene.add(grass.group));
        const soil = new THREE.Mesh(new THREE.PlaneGeometry(256, 256), new THREE.MeshBasicMaterial({ color: 0x382918 }));
        soil.rotation.x = -Math.PI / 2; soil.position.y = -.01; scene.add(soil);
        const camera = new THREE.PerspectiveCamera(55, 1.5, .1, 150); camera.position.set(0, 6.883, -8); camera.lookAt(0, .393, 10.63); camera.updateMatrixWorld(true);
        for (const grass of Object.values(variants)) await grass.prewarm(renderer, scene, camera);
        const gl = renderer.getContext(), captures = {};
        function draw(variant, mode, buried = false) {
            const grass = variants[variant];
            Object.values(variants).forEach(instance => { instance.group.visible = instance === grass; });
            grass.setMode(mode); grass.update(camera);
            if (buried) {
                grass.material.mode.value = -1; grass.material.camera.value.set(0, 1000, 0);
            }
            renderer.render(scene, camera);
            const pixels = new Uint8Array(960 * 640 * 4); gl.readPixels(0, 0, 960, 640, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            captures[variant + '-' + (buried ? 'buried' : mode)] = renderer.domElement.toDataURL('image/png');
            return pixels;
        }
        const difference = (a, b) => a.reduce((sum, value, i) => sum + Number(value !== b[i]), 0);
        const forcedDissolve = draw('dissolve', 'LOD4'), forcedGeometric = draw(transition, 'LOD4');
        const autoDissolve = draw('dissolve', 'AUTO'), autoGeometric = draw(transition, 'AUTO');
        // Select the full LOD4 geometry, then move only its distance uniform beyond the cutoff.
        const buried = draw(transition, 'LOD4', true), canopy = draw(transition, 'LOD5');
        const grass = variants[transition];
        draw(transition, 'AUTO');
        const definitions = { ...grass.material.leaves[4].defines }, initialMemory = { ...renderer.info.memory };
        let uploads = 0, allocations = 0;
        const originals = ['bufferData', 'bufferSubData', 'createBuffer', 'texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D'].map(name => [name, gl[name]]);
        for (const [name, original] of originals) gl[name] = function (...args) { if (name === 'createBuffer') allocations++; else uploads++; return original.apply(this, args); };
        try {
            for (let i = 0; i < 120; i++) {
                camera.position.z = -8 + Math.sin(i * Math.PI / 60) * 24; camera.updateMatrixWorld(true);
                grass.update(camera); renderer.render(scene, camera);
            }
        } finally { for (const [name, original] of originals) gl[name] = original; }
        const result = { forcedChanged: difference(forcedDissolve, forcedGeometric), autoChanged: difference(autoDissolve, autoGeometric),
            buriedChanged: difference(buried, canopy), uploads, allocations, initialMemory, finalMemory: { ...renderer.info.memory }, definitions,
            snapshot: grass.getSnapshot(), glError: gl.getError(), captures };
        Object.values(variants).forEach(instance => instance.dispose()); soil.geometry.dispose(); soil.material.dispose(); coverage.dispose(); asset.dispose(); renderer.dispose();
        return result;
    }, transition);
    await mkdir(output, { recursive: true });
    for (const [name, image] of Object.entries(result.captures)) await writeFile(`${output}/${name}.png`, Buffer.from(image.split(',')[1], 'base64'));
    delete result.captures;
    await writeFile(`${output}/validation-${transition}.json`, JSON.stringify({ result, errors }, null, 2));
    expect(result.forcedChanged).toBe(0);
    expect(result.autoChanged).toBeGreaterThan(1000);
    expect(result.buriedChanged).toBe(0);
    expect(result.definitions[{ rise: 'GRASS_PATCH_RISE', trim: 'GRASS_PATCH_TRIM', shorten: 'GRASS_PATCH_SHORTEN' }[transition]]).toBe(1);
    expect(result.definitions.GRASS_PATCH_HANDOFF).toBeUndefined();
    expect(result.uploads).toBe(0); expect(result.allocations).toBe(0);
    expect(result.finalMemory).toEqual(result.initialMemory);
    expect(result.snapshot.terminalTransition).toBe(transition);
    expect(result.glError).toBe(0); expect(errors).toEqual([]);
});

test('Capture the geometric handoff from the bus and field cameras', async ({ browser }) => {
    test.setTimeout(180000);
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
        for (const transition of ['dissolve', 'rise', 'trim', 'shorten']) {
            await page.goto('/debug_tools/grass_debug_v2.html?grass=patches&handoff=' + transition);
            await page.waitForFunction(() => !!window.__grassDebugV2);
            await page.evaluate(() => window.__grassDebugV2.readiness);
            for (const pose of ['bus', 'field', 'close']) {
                const snapshot = await page.evaluate(pose => {
                    const view = window.__grassTestView; view.renderer.setAnimationLoop(null); view.controls.enabled = false;
                    const field = view.grass.getSnapshot().placement, x = (field.minX + field.maxX) / 2;
                    const position = view.busPose.position.clone(), target = view.busPose.target.clone();
                    if (pose === 'field') { const shift = x - position.x; position.x += shift; target.x += shift; }
                    if (pose === 'close') { position.set(x, 4.5, field.minZ - 5); target.set(x, 0, field.minZ + 4); }
                    view.controls.setLookAt({ position, target }); view.camera.updateMatrixWorld(true);
                    view.grass.setMode('AUTO'); view.render(performance.now());
                    const snapshot = view.getSnapshot();
                    return { camera: snapshot.camera, viewport: snapshot.viewport, grass: snapshot.grass.field, lighting: snapshot.lighting };
                }, pose);
                snapshots.push({ transition, pose, ...snapshot });
                await page.screenshot({ path: `${output}/${pose}-${transition}.png`, clip: await page.locator('#game-canvas').boundingBox() });
                if (pose === 'close') await page.screenshot({ path: `${output}/transition-${transition}.png`, clip: { x: 570, y: 155, width: 900, height: 620 } });
                if (pose === 'field' && process.env.GRASS_RISE_CAPTURE_MOTION === '1') {
                    const video = await page.evaluate(async () => {
                        const view = window.__grassTestView, origin = view.camera.position.clone();
                        const stream = view.renderer.domElement.captureStream(30), chunks = [];
                        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 12000000 });
                        recorder.ondataavailable = event => chunks.push(event.data);
                        const stopped = new Promise(resolve => { recorder.onstop = resolve; });
                        recorder.start();
                        const start = performance.now();
                        let elapsed = 0;
                        while (elapsed < 8000) {
                            const time = await new Promise(resolve => requestAnimationFrame(resolve));
                            elapsed = Math.max(0, time - start);
                            view.camera.position.copy(origin); view.camera.position.z += 24 * Math.min(1, elapsed / 8000);
                            view.camera.updateMatrixWorld(true); view.render(time);
                        }
                        recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
                        const blob = new Blob(chunks, { type: recorder.mimeType });
                        return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
                    });
                    await writeFile(`${output}/field-forward-${transition}.webm`, Buffer.from(video.split(',')[1], 'base64'));
                }
            }
            await page.evaluate(() => window.__grassTestView.destroy());
        }
        for (const pose of ['bus', 'field', 'close']) {
            const [before, ...after] = snapshots.filter(row => row.pose === pose);
            for (const snapshot of after) {
                expect(before.camera).toEqual(snapshot.camera); expect(before.lighting).toEqual(snapshot.lighting);
                expect(snapshot.grass.terminalTransition).toBe(snapshot.transition);
            }
        }
        await writeFile(`${output}/lab-cameras.json`, JSON.stringify({ snapshots, errors }, null, 2));
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});
