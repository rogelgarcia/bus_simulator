// Normal atlas padding must remain valid outside the alpha silhouette at every filter footprint.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Grass card edges filter valid normals without adding geometry or changing alpha coverage', async ({ page }) => {
    test.setTimeout(120000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/card_edges');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const padding = await page.evaluate(() => {
        const s = window.__plantCardsStudy;
        return s.patch.representations.refined.group.children.filter(m => m.isInstancedMesh).map(mesh => {
            const material = mesh.material, { data, width, height } = material.normalMap.image;
            let invalidNormals = 0, transparent = 0, opaque = 0;
            for (let i = 0; i < data.length; i += 4) {
                const length = Math.hypot(data[i] / 127.5 - 1, data[i + 1] / 127.5 - 1, data[i + 2] / 127.5 - 1);
                if (Math.abs(length - 1) > 0.015) invalidNormals++;
                if (material.map.image.data[i + 3] === 0) transparent++;
                if (material.map.image.data[i + 3] === 255) opaque++;
            }
            return { invalidNormals, transparent, opaque, width, height, cards: mesh.geometry.index.count / 6,
                coverageMipmaps: material.map.mipmaps.length };
        });
    });
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ padding, errors }, null, 2));
    for (const atlas of padding) {
        expect(atlas.invalidNormals, 'Filtering must not blend black transparent texels into leaf normals').toBe(0);
        expect(atlas.transparent).toBeGreaterThan(100000);
        expect(atlas.opaque).toBeGreaterThan(100000);
        expect(atlas.cards).toBe(10);
        expect(atlas.coverageMipmaps).toBeGreaterThan(1);
    }
    await page.evaluate(() => {
        const s = window.__plantCardsStudy;
        s.camera.position.set(0.18, 0.16, 0.26); s.controls.target.set(0, 0.045, 0); s.controls.update();
        s.setSquareBounds(false); s.comparison.group.visible = false;
    });
    for (const [mode, label] of [['LOD0', 'LOD0'], ['refined', 'LOD3-10'], ['detailed', 'LOD3-5'], ['curved', 'LOD3-3'], ['split', 'LOD3-2']]) {
        await page.evaluate(mode => window.__plantCardsStudy.setMode(mode), mode);
        await page.screenshot({ path: path.join(folder, 'after-' + label + '.png') });
    }
    await page.evaluate(() => {
        const s = window.__plantCardsStudy;
        s.camera.position.set(0.42, 0.31, 0.61); s.controls.target.set(0, 0.045, 0); s.controls.update();
        s.setMode('refined');
    });
    await page.screenshot({ path: path.join(folder, 'after-distant.png') });
    await page.locator('#normal-facing').uncheck(); await page.locator('#alpha-coverage').uncheck();
    await page.screenshot({ path: path.join(folder, 'after-corrections-off.png') });
    expect(errors).toEqual([]);
});
