// Exercises real GPU program reuse and uniform ownership across illumination bindings.
import test, { expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

test.use({ launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11'] } });
test('Receiver programs remain bounded and use the current bank after repeated toggles', async ({ page }) => {
    if (process.env.RECEIVER_CACHE_BASELINE === '1') await page.route('**/ReceiverLightmapMaterialAdapter.js', async (route) =>
        route.fulfill({ contentType: 'text/javascript', body: await readFile('tests/artifacts/screens/illumination_optimization/original-adapter.js', 'utf8') }));
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { installReceiverLightmapBindings } = await import('/src/graphics/illumination/receiver_lightmaps/ReceiverLightmapMaterialAdapter.js');
        const renderer = new THREE.WebGLRenderer(); renderer.setSize(16, 16);
        const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, .1, 10); camera.position.z = 3;
        const material = new THREE.MeshStandardMaterial(), originalRender = material.onBeforeRender;
        const geometry = new THREE.PlaneGeometry(2, 2), mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
        const coordinates = new Float32Array(7 * 4);
        for (let i = 1; i < 7; i++) coordinates.set([.5, .5, 0, 1], i * 4);
        const table = new THREE.DataTexture(coordinates, 7, 1, THREE.RGBAFormat, THREE.FloatType); table.needsUpdate = true;
        const atlas = new THREE.DataArrayTexture(new Float32Array([1, 1, 1, 1]), 1, 1, 1); atlas.type = THREE.FloatType; atlas.needsUpdate = true;
        const target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.FloatType }); renderer.setRenderTarget(target);
        const read = () => { renderer.render(scene, camera); const pixel = new Float32Array(4); renderer.readRenderTargetPixels(target, 8, 8, 1, 1, pixel); return pixel[0]; };
        const counts = [], pixels = [], restored = [];
        read();
        for (let cycle = 0; cycle < 12; cycle++) {
            const uniforms = { receiverAtlasMapping: { value: table }, receiverDirectAtlas: { value: atlas }, receiverIndirectAtlas: { value: atlas },
                receiverDirectEnabled: { value: 0 }, receiverIndirectEnabled: { value: 1 }, receiverDebugMode: { value: 0 }, receiverMaxMip: { value: 0 }, receiverAtlasEnabled: { value: 1 } };
            const binding = installReceiverLightmapBindings({ objects: [{ id: 'plane', referenceCount: 6, base: 1 }] }, new Map([['plane', mesh]]), uniforms);
            const on = read(); uniforms.receiverIndirectEnabled.value = 0; const off = read();
            counts.push(renderer.info.programs.length); pixels.push({ on, off });
            binding.restore(); read();
            restored.push(mesh.geometry === geometry && material.onBeforeRender === originalRender);
        }
        material.dispose(); const releasedPrograms = renderer.info.programs.length;
        geometry.dispose(); table.dispose(); atlas.dispose(); target.dispose(); renderer.dispose();
        return { counts, pixels, restored, releasedPrograms };
    });
    await mkdir('tests/artifacts/screens/illumination_optimization', { recursive: true });
    await writeFile(`tests/artifacts/screens/illumination_optimization/programs-${process.env.RECEIVER_CACHE_BASELINE === '1' ? 'before' : 'after'}.json`, JSON.stringify(result, null, 2));
    expect(result.counts, 'Identical shader code must reuse the same programs on every activation').toEqual(Array(12).fill(result.counts[0]));
    expect(result.restored.every(Boolean)).toBe(true);
    expect(result.releasedPrograms).toBe(0);
    for (const pixel of result.pixels) { expect(pixel.on).toBeGreaterThan(.1); expect(pixel.off).toBeLessThan(.0001); }
});
