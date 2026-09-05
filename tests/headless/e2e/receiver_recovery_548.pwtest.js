import test, { expect } from '@playwright/test';
test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });
test('AI 548: actual WebGL context restoration reloads and rebinds receiver resources', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { EnhancedReceiverLightmapRuntime } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverLightmapRuntime.js');
        const renderer = new THREE.WebGLRenderer(); renderer.setSize(32, 32);
        const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, .1, 10); camera.position.z = 3;
        const original = new THREE.PlaneGeometry(2, 2), material = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const mesh = new THREE.Mesh(original, material); scene.add(mesh);
        const city = { cityId: 'fixture' }, engine = { renderer, scene, camera, context: { city } };
        const runtime = new EnhancedReceiverLightmapRuntime(engine);
        let loads = 0, disposals = 0;
        runtime.lightingKey = () => 'fixture'; runtime.makeWatch = () => () => true;
        runtime.getSource = async () => ({ sourceIdentity: { channelSources: [{ id: 'indirect_irradiance', sha256: 'source' }] }, liveObjectReferences: new Map([['plane', mesh]]) });
        runtime.fetchIndex = async () => ({ schema: 'bus-sim-receiver-lightmap-index-v1', cityId: 'fixture', profileId: 'fixture',
            channels: { indirect_irradiance: { sourceSha256: 'source', aggregateSha256: 'fixture', url: 'fixture' } } });
        runtime.loadChannel = async () => {
            loads++;
            const coordinates = new Float32Array(7 * 4);
            for (let i = 0; i < 6; i++) { const index = original.index.getX(i); coordinates.set([original.attributes.uv.getX(index), original.attributes.uv.getY(index), 0, 1], (i + 1) * 4); }
            const mappingTexture = new THREE.DataTexture(coordinates, 7, 1, THREE.RGBAFormat, THREE.FloatType); mappingTexture.needsUpdate = true;
            const texture = new THREE.DataArrayTexture(new Float32Array([Math.PI, .1, .1, 1]), 1, 1, 1); texture.type = THREE.FloatType; texture.needsUpdate = true;
            return { mappingTexture, texture, mapping: { profile: { mipLevels: 1 }, objects: [{ id: 'plane', referenceCount: 6, base: 1 }] },
                scale: [new THREE.Vector4(1, 1, 1, 1)], bias: [new THREE.Vector4()], identity: { profileId: 'fixture', aggregateSha256: 'fixture' },
                metrics: { gpuBytes: 16, cpuBytes: 16 }, dispose() { disposals++; texture.dispose(); mappingTexture.dispose(); } };
        };
        await runtime.setSettings({ direct: false, indirect: true, debug: 'final' }); runtime.frameBegin(); renderer.render(scene, camera);
        const activeBefore = runtime.getDiagnostics().effective.indirect;
        const extension = renderer.getContext().getExtension('WEBGL_lose_context');
        const lost = new Promise((resolve) => renderer.domElement.addEventListener('webglcontextlost', resolve, { once: true }));
        extension.loseContext(); await lost;
        const afterLoss = { state: runtime.status.state, restored: mesh.geometry === original, resources: Object.keys(runtime.resources).length, disposals };
        await new Promise((resolve) => setTimeout(resolve, 100));
        const restored = new Promise((resolve) => renderer.domElement.addEventListener('webglcontextrestored', resolve, { once: true }));
        extension.restoreContext(); await restored;
        for (let i = 0; i < 120 && !runtime.active; i++) { runtime.frameBegin(); await new Promise(requestAnimationFrame); }
        renderer.render(scene, camera);
        const activeAfter = runtime.getDiagnostics().effective.indirect;
        const error = renderer.getContext().getError(); runtime.dispose(); material.dispose(); original.dispose(); renderer.dispose();
        return { activeBefore, activeAfter, afterLoss, loads, disposals, error };
    });
    expect(result).toEqual({ activeBefore: true, activeAfter: true, afterLoss: { state: 'fallback', restored: true, resources: 0, disposals: 1 }, loads: 2, disposals: 2, error: 0 });
});
