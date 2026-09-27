// Keep the experimental wall at its actual capture height without painting top-soil pixels onto it.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('70 percent wall retains side foliage and excludes the source tips and top soil', async ({ page }) => {
    test.setTimeout(180000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/wall_height');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2SideBake } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2SideBake.js');
        const s = window.__plantCardsStudy, source = new THREE.Group();
        for (const [height, y, color] of [[0.7, 0.35, 0x008000], [0.3, 0.85, 0xff0000]]) {
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, height), new THREE.MeshStandardMaterial({ color }));
            mesh.position.y = y; source.add(mesh);
        }
        const bake = await createGrassDebugV2SideBake({ renderer: s.renderer, source, maxHeightFraction: 0.7 });
        const fixture = { snapshot: bake.getSnapshot(), upperPixel: Array.from(bake.views[0].textures.albedo.image.data.slice(
            (Math.floor(256 * 0.9) * 2048 + 1024) * 4, (Math.floor(256 * 0.9) * 2048 + 1024) * 4 + 4)) };
        bake.dispose(); source.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
        const walls = s.comparison.ringPatch.walls.map(wall => {
            const { data, width, height } = wall.material.map.image;
            let opaque = 0, brown = 0, samples = 0;
            for (let y = Math.floor(height * 0.85); y < height; y++) for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4; samples++;
                if (data[i + 3] > 200) {
                    opaque++;
                    if (data[i + 1] < data[i] * 1.1 || data[i + 1] < data[i + 2] * 1.1) brown++;
                }
            }
            return { name: wall.name, opaqueFraction: opaque / samples, brownFraction: brown / Math.max(opaque, 1) };
        });
        return { fixture, walls, patch: s.comparison.ringPatch.getSnapshot() };
    });
    await page.addStyleTag({ content: '.plant-study-panel, .grass-comparison-label, .grass-patch-distance { display:none!important; }' });
    await page.evaluate(() => {
        const s = window.__plantCardsStudy;
        const { x, z } = s.comparison.ringPatch.group.position;
        s.camera.position.set(x, 0.105, z - 0.98); s.controls.target.set(x, 0.069, z - 0.5);
        s.controls.update(); s.lighting.render(0);
    });
    await page.screenshot({ path: path.join(folder, 'wall-close.png') });
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ result, errors }, null, 2));
    expect.soft(result.fixture.snapshot.captureHeight).toBeCloseTo(0.7, 6);
    expect.soft(result.fixture.upperPixel[1]).toBeGreaterThan(result.fixture.upperPixel[0] * 2);
    for (const wall of result.walls) {
        expect.soft(wall.brownFraction, wall.name + ' should contain side leaves, not soil').toBeLessThan(0.001);
        expect.soft(wall.opaqueFraction, wall.name + ' should retain dense lower-canopy foliage').toBeGreaterThan(0.95);
    }
    expect(errors).toEqual([]);
});
