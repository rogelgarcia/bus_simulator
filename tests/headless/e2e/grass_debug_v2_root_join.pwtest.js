// Paired leaves must remain connected above the same soil in LOD0 and every card variant.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/root_join', process.env.GRASS_ROOT_JOIN_CAPTURE ?? 'after');

test('All grass card variants retain the visible connection between paired roots', async ({ page }) => {
    test.setTimeout(90000);
    await mkdir(folder, { recursive: true });
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const results = await page.evaluate(async () => {
        const THREE = await import('three');
        const { renderer, plant, cards, soil } = window.__plantCardsStudy;
        const root = plant.roots[5], size = 512;
        const camera = new THREE.OrthographicCamera(-0.006, 0.006, 0.006, -0.006, 0.001, 1);
        camera.position.set(root, 0.1, 0); camera.up.set(0, 0, -1); camera.lookAt(root, 0, 0);
        const scene = new THREE.Scene();
        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0, side: THREE.DoubleSide, toneMapped: false });
        const sourceMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
        const cardMaterial = new THREE.MeshBasicMaterial({ map: cards.atlas.albedo, alphaTest: cards.material.alphaTest,
            side: THREE.DoubleSide, toneMapped: false });
        scene.add(new THREE.Mesh(soil.surface.geometry, groundMaterial));
        const source = plant.group.clone(true);
        source.traverse(object => { if (object.isMesh) object.material = sourceMaterial; });
        scene.add(source);
        const card = new THREE.Mesh(cards.refined.mesh.geometry, cardMaterial); scene.add(card);
        const target = new THREE.WebGLRenderTarget(size, size), pixels = new Uint8Array(size * size * 4);
        const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()),
            alpha: renderer.getClearAlpha(), toneMapping: renderer.toneMapping };
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.setRenderTarget(target); renderer.setClearColor(0, 1);
        const results = [];
        for (const mode of ['LOD0', 'refined', 'detailed', 'curved', 'split']) {
            source.visible = mode === 'LOD0'; card.visible = !source.visible;
            if (card.visible) card.geometry = cards[mode].mesh.geometry;
            renderer.clear(); renderer.render(scene, camera);
            renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
            const mask = new Uint8Array(size * size), queue = [];
            for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4] + pixels[i * 4 + 1] + pixels[i * 4 + 2] > 30 ? 1 : 0;
            for (let x = 0; x < size; x++) if (mask[x]) { queue.push(x); mask[x] = 2; }
            for (let next = 0; next < queue.length; next++) {
                const i = queue[next], x = i % size, y = Math.floor(i / size);
                for (const j of [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, y > 0 ? i - size : -1, y < size - 1 ? i + size : -1]) {
                    if (j >= 0 && mask[j] === 1) { mask[j] = 2; queue.push(j); }
                }
            }
            const connected = queue.some(i => i >= size * (size - 1));
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
            const context = canvas.getContext('2d'), image = context.createImageData(size, size);
            for (let y = 0; y < size; y++) image.data.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), (size - y - 1) * size * 4);
            context.putImageData(image, 0, 0);
            results.push({ mode, connected, reachedPixels: queue.length, image: canvas.toDataURL('image/png') });
        }
        renderer.setRenderTarget(previous.target); renderer.setClearColor(previous.color, previous.alpha); renderer.toneMapping = previous.toneMapping;
        target.dispose(); groundMaterial.dispose(); sourceMaterial.dispose(); cardMaterial.dispose();
        return results;
    });
    for (const result of results) {
        await writeFile(path.join(folder, `${result.mode}_root_mask.png`), Buffer.from(result.image.split(',')[1], 'base64'));
        await page.evaluate(mode => {
            const study = window.__plantCardsStudy; study.setPose('crown_close'); study.setMode(mode);
        }, result.mode);
        await page.screenshot({ path: path.join(folder, `${result.mode}_close.jpg`), quality: 94 });
        delete result.image;
    }
    await writeFile(path.join(folder, 'connections.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
    for (const result of results) expect(result.connected, `${result.mode}: both blades must connect across the visible root`).toBe(true);
});
