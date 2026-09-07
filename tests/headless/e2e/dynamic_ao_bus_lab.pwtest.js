// Fixed-camera, real-model A/B of analytic bus grounding and generic GTAO.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });
const output = 'tests/artifacts/screens/illumination_534/contact_lab';

test('Bus contact lab: sun, shade, wall and matched hybrid/GTAO timings', async ({ page }) => {
    test.setTimeout(180000);
    await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/tests/headless/harness/index.html');
    const context = await page.evaluate(async () => {
        const T = await import('three');
        const { createCityBus } = await import('/src/graphics/assets3d/models/buses/CityBus.js');
        const { findVehicleUnderbodyOccluder } = await import('/src/graphics/visuals/vehicles/VehicleUnderbodyOccluder.js');
        const { DynamicAoRuntime } = await import('/src/graphics/visuals/postprocessing/DynamicAoRuntime.js');
        const { sanitizeAmbientOcclusionSettings } = await import('/src/graphics/visuals/postprocessing/AmbientOcclusionSettings.js');
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        document.body.replaceChildren();
        const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(1280, 720); renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
        renderer.info.autoReset = false; document.body.appendChild(renderer.domElement);
        const scene = new T.Scene(); scene.background = new T.Color(0xa8c9de);
        const camera = new T.PerspectiveCamera(42, 1280 / 720, .1, 100);
        camera.position.set(12, 5, 15); camera.lookAt(0, 1.1, 0);
        const floor = new T.Mesh(new T.PlaneGeometry(80, 80), new T.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 1 }));
        floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
        const wall = new T.Mesh(new T.BoxGeometry(.3, 7, 20), new T.MeshStandardMaterial({ color: 0xc6baa7, roughness: 1 }));
        wall.position.set(-1.9, 3.5, 0); wall.castShadow = wall.receiveShadow = true; wall.visible = false; scene.add(wall);
        const ambient = new T.HemisphereLight(0xffffff, 0xaaaaaa, 1.4); scene.add(ambient);
        const sun = new T.DirectionalLight(0xfff8e9, 3); sun.position.set(10, 12, -8); sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -18;
        sun.shadow.camera.right = sun.shadow.camera.top = 18; sun.shadow.camera.far = 50; sun.shadow.normalBias = .02; scene.add(sun);
        const bus = createCityBus({ id: 'contact-lab' }); await bus.userData.readyPromise;
        bus.updateMatrixWorld(true); bus.position.y = -new T.Box3().setFromObject(bus).min.y; scene.add(bus);
        const descriptor = findVehicleUnderbodyOccluder(bus);
        const participants = [{ id: 'bus', root: bus, cast: true, receive: true, aoUnderbody: descriptor }];
        const runtime = new DynamicAoRuntime();
        const settings = sanitizeAmbientOcclusionSettings({ scope: 'dynamic', dynamic: { quality: 'medium', radius: 1.5, intensity: 1 } });
        const timer = getOrCreateGpuFrameTimer(renderer);
        const frame = (method, debug = false, hideBus = false) => {
            bus.visible = true; settings.dynamic.busMethod = method === 'gtao' ? 'gtao' : 'analytic'; settings.dynamic.debugView = debug;
            renderer.info.reset();
            runtime.update({ renderer, scene, camera, participants, settings, enabled: method !== 'off' });
            bus.visible = !hideBus; renderer.render(scene, camera); runtime.restoreBindings(); bus.visible = true;
        };
        window.contactLab = { renderer, runtime, bus, floor, wall, sun, camera, settings, frame,
            async capture(method, lighting, debug) {
                wall.visible = lighting === 'wall'; sun.visible = lighting === 'sun';
                for (let i = 0; i < 8; i++) frame(method, debug);
                return renderer.domElement.toDataURL('image/png');
            },
            async measure(method) {
                wall.visible = true; sun.visible = true;
                for (let i = 0; i < 20; i++) { frame(method); await new Promise(requestAnimationFrame); }
                timer.resetSamples(); const cpu = [], completed = [];
                for (let i = 0; i < 80; i++) {
                    timer.beginFrame(); const start = performance.now(); frame(method); cpu.push(performance.now() - start);
                    timer.endFrame(); renderer.getContext().finish(); completed.push(performance.now() - start);
                    await new Promise(requestAnimationFrame); timer.poll();
                }
                for (let i = 0; i < 3; i++) { await new Promise(requestAnimationFrame); timer.poll(); }
                return { method, cpu, completed, gpu: timer.getSamplesSince(0).map(s => s.ms), timer: timer.getDiagnostics(),
                    draws: { ...renderer.info.render }, dynamic: { ...runtime.diagnostics }, programs: renderer.info.programs.length };
            },
            footprint() {
                wall.visible = false; sun.visible = false;
                const position = camera.position.clone(), rotation = camera.quaternion.clone();
                camera.position.set(0, 22, 1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
                frame('analytic', true, true); const image = renderer.domElement.toDataURL('image/png');
                camera.position.copy(position); camera.quaternion.copy(rotation); camera.updateMatrixWorld(true);
                return image;
            }
        };
        const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            browser: navigator.userAgent, resolution: [1280,720], aa: 'context MSAA', camera: camera.position.toArray(),
            busY: bus.position.y, descriptor, settings, sun: sun.position.toArray(), timerSupported: timer.isSupported };
    });
    await page.evaluate(async () => { for (let i = 0; i < 240; i++) { window.contactLab.frame(i % 2 ? 'analytic' : 'gtao'); await new Promise(requestAnimationFrame); } });
    const measures = [];
    // Alternate order to reduce thermal/order bias; samples include the color-pass shader cost.
    for (const method of ['off','analytic','gtao','gtao','analytic','off']) {
        measures.push(await page.evaluate(method => window.contactLab.measure(method), method));
    }
    for (const lighting of ['sun','shade','wall']) for (const method of ['off','analytic','gtao']) {
        const data = await page.evaluate(({ method, lighting }) => window.contactLab.capture(method, lighting, false), { method, lighting });
        await writeFile(`${output}/${lighting}-${method}.png`, Buffer.from(data.split(',')[1], 'base64'));
    }
    const footprint = await page.evaluate(() => window.contactLab.footprint());
    await writeFile(`${output}/analytic-footprint.png`, Buffer.from(footprint.split(',')[1], 'base64'));
    const glError = await page.evaluate(() => window.contactLab.renderer.getContext().getError());
    await writeFile(`${output}/results.json`, JSON.stringify({ context, measures, glError, errors }, null, 2));
    expect(errors).toEqual([]); expect(glError).toBe(0);
    expect(context.descriptor).not.toBeNull();
    expect(measures.filter(m => m.method === 'analytic').every(m => m.dynamic.analyticUnderbodies === 1 && !m.dynamic.genericCasters)).toBe(true);
    expect(measures.filter(m => m.method === 'gtao').every(m => m.dynamic.genericCasters)).toBe(true);
});
