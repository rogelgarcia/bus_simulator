// A card's back face must preserve the light direction of its baked leaves.
// High roughness isolates normal direction from view-dependent specular highlights.
import test, { expect } from '@playwright/test';

test('Curved comparison cards match source-blade lighting above and below the blade', async ({ page }) => {
    await page.route('**/grass-line-lighting', route => route.fulfill({ contentType: 'text/html', body: '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/"}}</script>' }));
    await page.goto('/grass-line-lighting');
    const comparisons = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2Line } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Line.js');
        const { createGrassDebugV2Cards } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Cards.js');
        const { createGrassDebugV2Material } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Material.js');
        const line = createGrassDebugV2Line();
        const renderer = new THREE.WebGLRenderer();
        const cards = createGrassDebugV2Cards(renderer, line.slices);
        const sourceMaterial = createGrassDebugV2Material({ vertexColors: true });
        sourceMaterial.roughness = cards.material.roughness = 1;
        const target = new THREE.WebGLRenderTarget(1024, 256);
        const camera = new THREE.OrthographicCamera(-0.52, 0.52, 0.115, -0.025, 0.01, 5);
        const scene = new THREE.Scene();
        const sun = new THREE.DirectionalLight(0xffffff, Math.PI);
        sun.position.set(0, 3, 0);
        scene.add(sun);
        const meshes = [new THREE.Mesh(line.geometry, sourceMaterial), new THREE.Mesh(cards.geometry, cards.material)];
        const comparisons = [];
        for (const y of [0.35, 2]) {
            camera.position.set(-2, y, 0.5); camera.lookAt(0.65, 0, 0.5);
            const means = [];
            for (const mesh of meshes) {
                scene.add(mesh);
                renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.render(scene, camera);
                const pixels = new Uint8Array(1024 * 256 * 4);
                renderer.readRenderTargetPixels(target, 0, 0, 1024, 256, pixels);
                let sum = 0, count = 0;
                for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 250) { sum += pixels[i + 1]; count++; }
                means.push(sum / count);
                scene.remove(mesh);
            }
            comparisons.push({ y, source: means[0], card: means[1] });
        }
        sourceMaterial.dispose(); cards.dispose(); cards.material.dispose(); cards.geometry.dispose();
        line.geometry.dispose(); line.slices.forEach(slice => slice.geometry.dispose()); target.dispose(); renderer.dispose();
        return comparisons;
    });
    for (const { y, source, card } of comparisons) {
        expect(source).toBeGreaterThan(1);
        expect(Math.abs(card / source - 1), `Blade/card green brightness at camera height ${y}`).toBeLessThan(0.15);
    }
});

for (const pixelRatio of [1, 2]) test(`Grass cards keep baked leaf normals on both sides at pixel ratio ${pixelRatio}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass-normal-check', route => route.fulfill({ contentType: 'text/html', body: '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/"}}</script>' }));
    await page.goto('/grass-normal-check');
    const result = await page.evaluate(async pixelRatio => {
        const THREE = await import('three');
        const { createGrassDebugV2Cards } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Cards.js');
        const renderer = new THREE.WebGLRenderer();
        renderer.setPixelRatio(pixelRatio);
        const geometry = new THREE.PlaneGeometry(0.2, 0.2);
        geometry.rotateX(-Math.PI / 4);
        geometry.translate(0.125, Math.SQRT1_2 * 0.1, 0.125);
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array(4).fill([0.04, 0.3, 0.02]).flat(), 3));
        geometry.computeBoundingBox();
        const cards = createGrassDebugV2Cards(renderer, [{ geometry, rootCenter: new THREE.Vector3(0.125, 0, 0.125 + Math.SQRT1_2 * 0.1), incline: Math.PI / 4, facing: 2, leafCount: 1, cellX: 0, cellZ: 0 }]);
        cards.material.roughness = 1;
        const scene = new THREE.Scene();
        scene.add(new THREE.Mesh(cards.geometry, cards.material));
        const light = new THREE.DirectionalLight(0xffffff, Math.PI);
        light.position.set(0, 3, 0);
        scene.add(light);
        const center = cards.geometry.boundingBox.getCenter(new THREE.Vector3());
        const camera = new THREE.OrthographicCamera(-0.2, 0.2, 0.2, -0.2, 0.01, 5);
        const target = new THREE.WebGLRenderTarget(128, 128);
        renderer.setClearColor(0, 0);
        const means = [];
        for (const side of [-1, 1]) {
            camera.position.copy(center).add(new THREE.Vector3(0, 0.15, side));
            camera.lookAt(center);
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            const pixels = new Uint8Array(128 * 128 * 4);
            renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
            let sum = 0, count = 0;
            for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 250) { sum += pixels[i + 1]; count++; }
            means.push(sum / count);
        }
        const atlasMaterial = new THREE.MeshBasicMaterial({ map: cards.material.normalMap, toneMapped: false, transparent: true, blending: THREE.NoBlending });
        const atlasScene = new THREE.Scene();
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), atlasMaterial);
        atlasScene.add(quad);
        const atlasCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3);
        atlasCamera.position.z = 1;
        renderer.render(atlasScene, atlasCamera);
        const padding = new Uint8Array(4);
        renderer.readRenderTargetPixels(target, 127, 127, 1, 1, padding);
        atlasMaterial.dispose(); quad.geometry.dispose();
        cards.dispose(); cards.geometry.dispose(); cards.material.dispose(); geometry.dispose(); target.dispose(); renderer.dispose();
        return { means, padding: [...padding] };
    }, pixelRatio);
    expect(result.means[0]).toBeGreaterThan(30);
    expect(result.means[1]).toBeGreaterThan(result.means[0] * 0.9);
    expect(result.means[1]).toBeLessThan(result.means[0] * 1.1);
    expect(result.padding[0]).toBeGreaterThanOrEqual(127);
    expect(result.padding[1]).toBe(255);
    expect(result.padding[2]).toBeGreaterThanOrEqual(127);
    expect(result.padding[3]).toBe(0);
    expect(errors).toEqual([]);
});
