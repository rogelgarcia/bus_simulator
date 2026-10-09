// Preserve the legacy line/card asset silhouette check independently of the replaced bus scene.
import test, { expect } from '@playwright/test';

test('Mixed source is one grounded line and curved LOD3 preserves its silhouette at DPR 2', async ({ page }) => {
    await page.route('**/grass-line-check', route => route.fulfill({ contentType: 'text/html', body: '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.183.2/examples/jsm/"}}</script>' }));
    await page.goto('/grass-line-check');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2Line } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Line.js');
        const { createGrassDebugV2Cards } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Cards.js');
        const line = createGrassDebugV2Line();
        const renderer = new THREE.WebGLRenderer();
        renderer.setPixelRatio(2);
        const cards = createGrassDebugV2Cards(renderer, line.slices);
        const roots = [];
        for (let i = 0; i < line.geometry.attributes.position.count; i += 13) {
            roots.push(new THREE.Vector3().fromBufferAttribute(line.geometry.attributes.position, i + 1).toArray());
        }
        const target = new THREE.WebGLRenderTarget(1024, 192);
        const camera = new THREE.OrthographicCamera(-0.52, 0.52, 0.105, -0.015, 0.01, 5);
        camera.position.set(-2, 0, 0.5); camera.lookAt(0.65, 0, 0.5);
        const scene = new THREE.Scene();
        const materials = [new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), new THREE.MeshBasicMaterial({ map: cards.material.map, alphaTest: cards.material.alphaTest, side: THREE.DoubleSide })];
        const silhouettes = [];
        for (const [name, x, y] of [['front', -2, 0], ['incline', -2, 1.3], ['reverse', 3, 1.2]]) {
            camera.position.set(x, y, 0.5); camera.lookAt(0.65, 0, 0.5);
            const masks = [];
            for (const [i, geometry] of [line.geometry, cards.geometry].entries()) {
                const mesh = new THREE.Mesh(geometry, materials[i]);
                scene.add(mesh);
                renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.render(scene, camera);
                const pixels = new Uint8Array(1024 * 192 * 4);
                renderer.readRenderTargetPixels(target, 0, 0, 1024, 192, pixels);
                masks.push(pixels.filter((_, index) => index % 4 === 3).map(alpha => alpha > 0 ? 1 : 0));
                scene.remove(mesh);
            }
            let intersection = 0, union = 0;
            for (let i = 0; i < masks[0].length; i++) {
                intersection += masks[0][i] && masks[1][i] ? 1 : 0;
                union += masks[0][i] || masks[1][i] ? 1 : 0;
            }
            silhouettes.push({ name, overlap: intersection / union });
        }
        const result = { roots, silhouettes, atlasSize: cards.material.map.image.width, leaves: line.slices.reduce((sum, slice) => sum + slice.leafCount, 0), sourceTriangles: line.geometry.index.count / 3, cardTriangles: cards.geometry.index.count / 3 };
        cards.dispose(); cards.geometry.dispose(); cards.material.dispose();
        line.geometry.dispose(); line.slices.forEach(slice => slice.geometry.dispose());
        materials.forEach(material => material.dispose()); target.dispose(); renderer.dispose();
        return result;
    });
    expect(result).toMatchObject({ leaves: 16, sourceTriangles: 224, cardTriangles: 32, atlasSize: 512 });
    expect(result.roots).toHaveLength(16);
    for (const [index, root] of result.roots.entries()) {
        expect(root[0]).toBeCloseTo(0.65, 6);
        expect(root[1]).toBe(0);
        expect(root[2]).toBeCloseTo((index + 0.5) / 16, 6);
    }
    for (const silhouette of result.silhouettes) expect(silhouette.overlap, `The card line must match the 3D silhouette from ${silhouette.name}`).toBeGreaterThan(0.85);
    await mkdir('tests/artifacts/screens/grass_debug_v2/mixed', { recursive: true });
    await writeFile('tests/artifacts/screens/grass_debug_v2/mixed/silhouettes.json', JSON.stringify(result, null, 2));
});
