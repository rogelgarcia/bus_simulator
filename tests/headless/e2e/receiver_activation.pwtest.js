// Checks first-load blending, live refresh continuity, and immediate cached reactivation on the GPU.
import test, { expect } from '@playwright/test';
test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });

test('Receiver activation fades once and retains the active bank during refresh', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/tests/headless/harness/index.html');
    const results = await page.evaluate(async () => {
        const THREE = await import('three');
        const { ReceiverLightmapRuntime } = await import('/src/graphics/illumination/receiver_lightmaps/ReceiverLightmapRuntime.js');
        const { EnhancedReceiverLightmapRuntime } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverLightmapRuntime.js');
        const results = [];
        for (const Runtime of [ReceiverLightmapRuntime, EnhancedReceiverLightmapRuntime]) {
            const renderer = new THREE.WebGLRenderer(); renderer.setSize(16, 16);
            const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, .1, 10); camera.position.z = 3;
            const geometry = new THREE.PlaneGeometry(2, 2), material = new THREE.MeshStandardMaterial();
            const mesh = new THREE.Mesh(geometry, material); scene.add(mesh, new THREE.HemisphereLight(0xffffff, 0xffffff, .2));
            const city = { cityId: 'fixture' }, engine = { renderer, scene, camera, context: { city } };
            const runtime = new Runtime(engine);
            let loads = 0, disposals = 0;
            runtime.lightingKey = () => 'fixture'; runtime.makeWatch = () => () => true;
            runtime.getSource = async () => ({ sourceIdentity: { channelSources: ['direct_receiver', 'indirect_irradiance'].map((id) => ({ id, sha256: 'source' })) }, liveObjectReferences: new Map([['plane', mesh]]) });
            const index = { schema: 'bus-sim-receiver-lightmap-index-v1', cityId: 'fixture', profileId: 'fixture',
                channels: Object.fromEntries(['direct_receiver', 'indirect_irradiance'].map((id) => [id, { sourceSha256: 'source', aggregateSha256: 'fixture', url: 'fixture' }])) };
            runtime.fetchIndex = async () => index;
            runtime.loadChannel = async () => {
                loads++;
                const coordinates = new Float32Array(7 * 4);
                for (let i = 1; i < 7; i++) coordinates.set([.5, .5, 0, 1], i * 4);
                const mappingTexture = new THREE.DataTexture(coordinates, 7, 1, THREE.RGBAFormat, THREE.FloatType); mappingTexture.needsUpdate = true;
                const texture = new THREE.DataArrayTexture(new Float32Array([Math.PI, Math.PI, Math.PI, 1]), 1, 1, 1); texture.type = THREE.FloatType; texture.needsUpdate = true;
                return { mappingTexture, texture, mapping: { profile: { mipLevels: 1 }, objects: [{ id: 'plane', referenceCount: 6, base: 1 }] },
                    scale: [new THREE.Vector4(1, 1, 1, 1)], bias: [new THREE.Vector4()], identity: { profileId: 'fixture', aggregateSha256: 'fixture' },
                    metrics: { gpuBytes: 16, cpuBytes: 16 }, dispose() { disposals++; texture.dispose(); mappingTexture.dispose(); } };
            };
            const target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.FloatType }); renderer.setRenderTarget(target);
            const read = () => { renderer.render(scene, camera); const pixel = new Float32Array(4); renderer.readRenderTargetPixels(target, 8, 8, 1, 1, pixel); return pixel[0]; };
            const live = read();
            await runtime.setSettings({ direct: false, indirect: true, debug: 'final' });
            const values = [];
            for (const time of [1000, 1200, 1400]) { runtime.frameBegin(time); values.push({ blend: runtime.getDiagnostics().activationBlend, pixel: read() }); }
            let resolveIndex;
            runtime.fetchIndex = () => new Promise((resolve) => { resolveIndex = resolve; });
            const refresh = runtime.setSettings({ direct: true, indirect: true, debug: 'final' });
            runtime.frameBegin(1500); const duringRefresh = read();
            resolveIndex(index); await refresh; runtime.frameBegin(1600);
            const afterRefresh = read();
            await runtime.setSettings({ direct: false, indirect: false, debug: 'final' }); runtime.frameBegin(1700);
            const off = read(), retained = loads === 2 && disposals === 0;
            runtime.fetchIndex = async () => index;
            await runtime.setSettings({ direct: false, indirect: true, debug: 'final' }); runtime.frameBegin(1800);
            const warm = { blend: runtime.getDiagnostics().activationBlend, pixel: read(), loads };
            runtime.dispose(); material.dispose(); geometry.dispose(); target.dispose(); renderer.dispose();
            results.push({ live, values, duringRefresh, afterRefresh, off, retained, warm, disposals });
        }
        return results;
    });
    expect(errors).toEqual([]);
    for (const result of results) {
        expect(result.values.map((value) => value.blend)).toEqual([0, .5, 1]);
        expect(result.values[0].pixel).toBeCloseTo(result.live, 4);
        expect(result.values[2].pixel).toBeCloseTo(1, 4);
        expect(result.values[1].pixel).toBeCloseTo((result.live + 1) / 2, 4);
        expect(result.duringRefresh).toBeCloseTo(1, 4);
        expect(result.afterRefresh).toBeCloseTo(1, 4);
        expect(result.off).toBeCloseTo(result.live, 4);
        expect(result.retained).toBe(true);
        expect(result.warm.blend).toBe(1); expect(result.warm.pixel).toBeCloseTo(1, 4);
        expect(result.warm.loads).toBe(2); expect(result.disposals).toBe(2);
    }
});
