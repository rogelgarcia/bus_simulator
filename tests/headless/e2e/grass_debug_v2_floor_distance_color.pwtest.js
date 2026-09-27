// Keep texture-patch color stable as mip filtering combines grass and soil at distance.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Grass texture shading tracks the leaf patches as the camera moves away', async ({ page }) => {
    test.setTimeout(120000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/floor_distance_color');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy, { renderer, camera, controls } = s;
        s.setMode('refined'); s.setSquareBounds(false);
        const canvas = document.createElement('canvas');
        canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height;
        const context = canvas.getContext('2d', { willReadFrequently: true }), probe = new THREE.Vector3();
        const width = canvas.width, height = canvas.height, sun = s.lighting.sunRef.direction;
        const heading = Math.atan2(sun.x, sun.z), poses = [];
        for (const turn of [0, 180]) for (const distance of [1.4, 4, 8, 12, 24]) {
            const angle = heading + turn * Math.PI / 180, pitch = 35 * Math.PI / 180;
            const row = { turn, distance };
            for (const [name, x, z] of [['source4K', 0, 0], ['floor4K', 0, -1.3], ['source2K', 1.3, 0], ['floor2K', 1.3, -1.3]]) {
                const surface = name.startsWith('floor') ? s.comparison.volume.surfaceHeight : 0.03;
                controls.target.set(x, surface, z);
                camera.position.set(x + Math.sin(angle) * distance * Math.cos(pitch), surface + distance * Math.sin(pitch),
                    z + Math.cos(angle) * distance * Math.cos(pitch));
                controls.update(); s.lighting.render(0); context.drawImage(renderer.domElement, 0, 0);
                const pixels = context.getImageData(0, 0, width, height).data;
                const sum = [0, 0, 0], leaves = [0, 0, 0]; let count = 0, leafCount = 0;
                for (let a = 0; a < 60; a++) for (let b = 0; b < 60; b++) {
                    probe.set(x - 0.3 + 0.6 * a / 59, surface, z - 0.3 + 0.6 * b / 59).project(camera);
                    const px = Math.floor((probe.x * 0.5 + 0.5) * width), py = Math.floor((-probe.y * 0.5 + 0.5) * height);
                    const i = (py * width + px) * 4;
                    for (let c = 0; c < 3; c++) sum[c] += pixels[i + c]; count++;
                    if (pixels[i + 1] > pixels[i] * 1.25 && pixels[i + 1] > pixels[i + 2] * 1.25) {
                        for (let c = 0; c < 3; c++) leaves[c] += pixels[i + c]; leafCount++;
                    }
                }
                row[name] = { color: sum.map(value => value / count), leaves: leaves.map(value => value / leafCount), coverage: leafCount / count };
            }
            poses.push(row);
        }
        s.camera.position.set(5.1, 4.5, 5.5); s.controls.target.set(0.65, 0, -1.3); s.controls.update(); s.lighting.render(0);
        return poses;
    });
    const name = process.env.GRASS_DISTANCE_CAPTURE ?? 'after';
    await writeFile(path.join(folder, name + '.json'), JSON.stringify({ poses: result, errors }, null, 2));
    await page.addStyleTag({ content: '.plant-study-panel, .grass-comparison-label, .grass-patch-distance { display:none!important; }' });
    for (const [label, distance] of [['near', 6], ['far', 12]]) {
        await page.evaluate(distance => {
            const s = window.__plantCardsStudy, heading = Math.atan2(s.lighting.sunRef.direction.x, s.lighting.sunRef.direction.z) + Math.PI;
            const pitch = 35 * Math.PI / 180, x = 0.65, z = -1.3;
            s.controls.target.set(x, 0.02, z);
            s.camera.position.set(x + Math.sin(heading) * distance * Math.cos(pitch), 0.02 + distance * Math.sin(pitch),
                z + Math.cos(heading) * distance * Math.cos(pitch));
            s.controls.update(); s.lighting.render(0);
        }, distance);
        await page.screenshot({ path: path.join(folder, name + '-' + label + '.png') });
    }
    for (const turn of [0, 180]) for (const density of ['4K', '2K']) {
        const poses = result.filter(p => p.turn === turn);
        for (const pose of poses) {
            const ratio = pose['floor' + density].leaves[1] / pose['source' + density].leaves[1];
            const combinedRatio = pose['floor' + density].color[1] / pose['source' + density].color[1];
            if (pose.distance <= 4) expect(Math.abs(ratio - 1), density + ' near leaf color').toBeLessThan(0.12);
            expect(ratio, density + ' excess leaf brightness at ' + pose.distance + ' m, turn ' + turn).toBeLessThan(1.12);
            expect(combinedRatio, density + ' whole patch brighter than geometry').toBeLessThan(1.04);
        }
    }
    expect(errors).toEqual([]);
});
