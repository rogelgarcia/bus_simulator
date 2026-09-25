// Compare LOD shadows against LOD0 with the same sun, receiver, camera and shadow-map settings.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const phase = process.env.GRASS_SHADOW_CAPTURE ?? 'after';
const root = path.resolve('tests/artifacts/screens/grass_debug_v2/shadow_fit');
const folder = path.join(root, phase);

test('Card shadows approximate the curved source near the roots', async ({ page }) => {
    test.setTimeout(90000);
    await mkdir(folder, { recursive: true });
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const measurements = await page.evaluate(async () => {
        const THREE = await import('three');
        const { renderer, plant, cards, soil, lighting } = window.__plantCardsStudy;
        const size = 1536, extent = 0.30;
        const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 0.001, 2);
        camera.position.set(0, 1, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
        const scene = new THREE.Scene(), sun = lighting.sun.clone();
        scene.add(sun, sun.target); sun.shadow.needsUpdate = true;
        const sourceMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
        const cardMaterial = sourceMaterial.clone(); cardMaterial.map = cards.material.map; cardMaterial.alphaTest = cards.material.alphaTest;
        const source = plant.group.clone(true);
        source.traverse(object => { if (object.isMesh) { object.material = sourceMaterial; object.receiveShadow = false; } });
        const card = new THREE.Mesh(cards.refined.mesh.geometry, cardMaterial); card.castShadow = true;
        const receiverMaterial = new THREE.ShadowMaterial({ color: 0 });
        const receiver = new THREE.Mesh(soil.surface.geometry, receiverMaterial); receiver.receiveShadow = true;
        scene.add(source, card, receiver);
        const target = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
        const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()),
            alpha: renderer.getClearAlpha(), toneMapping: renderer.toneMapping };
        renderer.toneMapping = THREE.NoToneMapping; renderer.setClearColor(0xffffff, 1);
        const results = [], masks = {};
        for (const mode of ['LOD0', 'refined', 'detailed', 'curved', 'split']) {
            source.visible = mode === 'LOD0'; card.visible = !source.visible;
            if (card.visible) card.geometry = cards[mode].mesh.geometry;
            renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true;
            renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
            const pixels = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
            masks[mode] = pixels;
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
            const context = canvas.getContext('2d'), image = context.createImageData(size, size);
            for (let y = 0; y < size; y++) image.data.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), (size - y - 1) * size * 4);
            context.putImageData(image, 0, 0);
            let error = 0, energy = 0, rootError = 0, rootEnergy = 0;
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const i = (y * size + x) * 4, reference = 255 - masks.LOD0[i], difference = Math.abs(pixels[i] - masks.LOD0[i]);
                const z = extent - (y + 0.5) / size * extent * 2;
                error += difference; energy += reference;
                if (Math.abs(z) < 0.035) { rootError += difference; rootEnergy += reference; }
            }
            results.push({ mode, error: error / energy, rootError: rootError / rootEnergy, energy,
                image: canvas.toDataURL('image/png') });
        }
        const samples = plant.leaves.slice(0, 2).map(leaf => {
            const p = leaf.geometry.attributes.position, uv = leaf.geometry.attributes.uv;
            return Array.from({ length: p.count }, (_, i) => i).filter(i => uv.getX(i) === 0.5 && uv.getY(i) > 0 && uv.getY(i) < 0.09)
                .map(i => ({ t: uv.getY(i), x: p.getX(i), y: p.getY(i), z: p.getZ(i) }));
        });
        renderer.setRenderTarget(previous.target); renderer.setClearColor(previous.color, previous.alpha); renderer.toneMapping = previous.toneMapping;
        target.dispose(); sourceMaterial.dispose(); cardMaterial.dispose(); receiverMaterial.dispose(); sun.dispose();
        return { results, samples };
    });
    for (const result of measurements.results) {
        await writeFile(path.join(folder, `${result.mode}_shadow.png`), Buffer.from(result.image.split(',')[1], 'base64'));
        delete result.image;
    }
    for (const pose of ['three_quarter', 'side']) for (const mode of ['LOD0', 'refined']) {
        await page.evaluate(({ pose, mode }) => { const study = window.__plantCardsStudy; study.setPose(pose); study.setMode(mode); }, { pose, mode });
        await page.screenshot({ path: path.join(folder, `${pose}_${mode}.jpg`), quality: 94 });
    }
    await writeFile(path.join(folder, 'metrics.json'), JSON.stringify(measurements, null, 2));
    console.log(JSON.stringify(measurements.results));
    for (const result of measurements.results) expect(result.energy).toBeGreaterThan(100000);
    if (phase === 'after') {
        const current = measurements.results.find(result => result.mode === 'refined');
        expect(current.rootError).toBeLessThan(0.10);
        expect(current.error).toBeLessThan(0.07);
    }
});
