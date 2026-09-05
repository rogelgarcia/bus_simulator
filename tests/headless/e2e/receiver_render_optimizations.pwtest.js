// Verifies that enhanced pass pruning preserves color, cached AO, and renderer ownership.
import test, { expect } from '@playwright/test';
test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });

test('Enhanced receiver pass pruning preserves GPU output and restores state', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js');
        const { PostProcessingPipeline } = await import('/src/graphics/visuals/postprocessing/PostProcessingPipeline.js');
        const { installEnhancedReceiverRenderOptimizations: install } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverRenderOptimizations.js');
        const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true }); renderer.setSize(128, 128);
        const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, .1, 100); camera.position.set(3, 3, 5); camera.lookAt(0, 0, 0);
        const group = new THREE.Group(); scene.add(group, new THREE.HemisphereLight(0xffffff, 0xffffff, 2));
        const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial({ color: 0xcc8844 });
        const cube = new THREE.Mesh(geometry, material); cube.position.y = .5; group.add(cube);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), material); floor.rotation.x = -Math.PI / 2; group.add(floor);
        const hiddenMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
        const helper = new THREE.Mesh(geometry, hiddenMaterial); helper.userData.isShadowCasterMerge = true; helper.position.copy(cube.position); group.add(helper);
        const pipeline = new PostProcessingPipeline({ renderer, scene, camera, bloom: { enabled: false }, sunBloom: { enabled: false },
            ambientOcclusion: { mode: 'gtao', gtao: { updateMode: 'every_frame' } }, antiAliasing: { mode: 'off' } });
        pipeline.setSize(128, 128, 1);
        const engine = { _post: { pipeline }, context: { city: { group } } };
        const read = () => { pipeline.render(0); const pixels = new Uint8Array(128 * 128 * 4); renderer.getContext().readPixels(0, 0, 128, 128, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, pixels); return pixels; };
        const cases = [];
        for (const updateMode of ['every_frame', 'when_camera_moves']) for (const debugView of [false, true]) {
            pipeline.setAmbientOcclusion({ mode: 'gtao', gtao: { updateMode, debugView } });
            for (let i = 0; i < 3; i++) read();
            const before = read(), beforeDraws = renderer.info.render.calls, beforeTriangles = renderer.info.render.triangles;
            const original = pipeline.render, output = pipeline._ao.pass.output, swap = pipeline._ao.pass.needsSwap;
            const restore = install(engine);
            const after = read(), afterDraws = renderer.info.render.calls, afterTriangles = renderer.info.render.triangles;
            const difference = before.reduce((maximum, value, i) => Math.max(maximum, Math.abs(value - after[i])), 0);
            const stateRestored = helper.visible && pipeline._ao.pass.output === output && pipeline._ao.pass.needsSwap === swap;
            restore();
            cases.push({ updateMode, debugView, difference, stateRestored, methodRestored: pipeline.render === original, beforeDraws, afterDraws, beforeTriangles, afterTriangles });
        }
        // Active live shadow helpers and debug outputs survive the wrapper; exceptions restore temporary state.
        const original = pipeline.render;
        let inside;
        pipeline._ao.pass.output = GTAOPass.OUTPUT.Diffuse;
        helper.castShadow = true;
        pipeline.render = () => { inside = helper.visible; throw new Error('fixture'); };
        const restore = install(engine);
        try { pipeline.render(); } catch (error) { if (error.message !== 'fixture') throw error; }
        const liveVisible = inside && helper.visible && pipeline._ao.pass.output === GTAOPass.OUTPUT.Diffuse;
        restore(); pipeline.render = original;
        pipeline.dispose(); geometry.dispose(); floor.geometry.dispose(); material.dispose(); hiddenMaterial.dispose(); renderer.dispose();
        return { cases, liveVisible };
    });
    expect(errors).toEqual([]);
    expect(result.liveVisible).toBe(true);
    for (const item of result.cases) {
        expect(item.difference, JSON.stringify(item)).toBe(0);
        expect(item.stateRestored).toBe(true); expect(item.methodRestored).toBe(true);
        expect(item.afterDraws).toBeLessThan(item.beforeDraws);
        expect(item.afterTriangles).toBeLessThan(item.beforeTriangles);
    }
});
