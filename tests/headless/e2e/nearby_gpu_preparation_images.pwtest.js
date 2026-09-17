// Compares prepared and ordinary effects after real camera/lifecycle transitions.
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ video: 'off', trace: 'off' });

test('Prepared bloom preserves visible, occluded, large-disc, turn, teleport and resize images', async ({ page }) => {
    test.setTimeout(120_000);
    const root = 'tests/artifacts/screens/ai572_nearby_resource_preparation/effects';
    await mkdir(root, { recursive: true });
    const images = new Map(), measurements = [];
    for (const prepared of [false, true]) {
        await page.goto('/tests/headless/harness/index.html?ibl=0&ao=off&shadows=off&aa=off&bloom=0&sunBloom=1&sunBloomRays=1&sunBloomDiscRadiusDeg=6&grade=off');
        await page.waitForFunction(() => window.__testHooks?.version === 1);
        const setup = await page.evaluate(async prepared => {
            const T = await import('three');
            const { SunBloomRig } = await import('/src/graphics/visuals/sun/SunBloomRig.js');
            const engine = window.__testHooks.getEngine(); engine.clearScene();
            window.__testHooks.setViewport(960, 540);
            const sun = { direction: new T.Vector3(0, 0, -1) };
            engine.setSunBloomSettings({ ...engine.sunBloomSettings, enabled: true, discRadiusDeg: 6 });
            const rig = new SunBloomRig({ sun, settings: engine.sunBloomSettings });
            const group = new T.Group(); engine.scene.add(group, rig.group);
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 4, 8);
            const alpha = new T.CanvasTexture(canvas);
            const cutout = new T.Mesh(new T.PlaneGeometry(7, 7), new T.MeshBasicMaterial({ color: 0x666666, map: alpha, alphaTest: .5, side: T.DoubleSide }));
            cutout.position.set(0, 0, -15); cutout.visible = false; group.add(cutout);
            engine.context.city = { group, sunRef: sun, sunBloom: rig };
            const prep = engine._nearbyGpuPreparation; prep.enabled = prepared;
            engine.camera.position.set(0, 0, 0); engine.camera.lookAt(1.3, 0, -1); engine.camera.updateMatrixWorld(true);
            for (let i = 0; i < 4; i++) engine.renderFrame();
            const costs = [];
            if (prepared) for (let i = 0; i < 100; i++) {
                const start = performance.now();
                prep.update(engine.context.city, engine.camera, { elapsedMs: 0, ready: true, pipeline: engine._post.pipeline, scene: engine.scene });
                costs.push(performance.now() - start); await new Promise(requestAnimationFrame);
            }
            window.preparationImageCase = { engine, rig, cutout, T };
            return { prepared, costs, diagnostics: prep.diagnostics() };
        }, prepared);
        measurements.push(setup);
        for (const state of ['visible', 'cutout', 'turned-away', 'teleport', 'resized']) {
            const sample = await page.evaluate(async state => {
                const { engine, cutout, T } = window.preparationImageCase;
                const camera = engine.camera;
                cutout.visible = state === 'cutout' || state === 'resized';
                camera.position.set(0, 0, 0); camera.lookAt(0, 0, -1);
                if (state === 'turned-away') camera.lookAt(0, 0, 1);
                if (state === 'teleport') { camera.position.set(900, 40, -800); camera.lookAt(900, 40, -801); }
                if (state === 'resized') window.__testHooks.setViewport(640, 480);
                camera.updateMatrixWorld(true);
                const r = engine.renderer, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
                const query = ext ? gl.createQuery() : null;
                const programs = r.info.programs.length;
                if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
                const start = performance.now(); engine.renderFrame(); const cpuMs = performance.now() - start;
                if (query) gl.endQuery(ext.TIME_ELAPSED_EXT);
                let gpuMs = null;
                if (query) {
                    for (let i = 0; i < 120 && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE); i++) await new Promise(requestAnimationFrame);
                    if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
                    gl.deleteQuery(query);
                }
                engine.renderFrame();
                return { state, cpuMs, gpuMs, addedPrograms: r.info.programs.length - programs, bloom: engine.getSunBloomDebugInfo().occlusionFiltering, error: gl.getError() };
            }, state);
            expect(sample.error).toBe(0);
            expect(sample.bloom.rendered).toBe(state !== 'turned-away');
            const name = `${prepared ? 'prepared' : 'ordinary'}-${state}`;
            measurements.push({ name, ...sample });
            const image = await page.locator('#harness-canvas').screenshot({ path: `${root}/${name}.png` });
            if (prepared) expect(image.equals(images.get(state)), state).toBe(true);
            else images.set(state, image);
        }
    }
    await writeFile(`${root}/measurements.json`, JSON.stringify(measurements, null, 2));
});
