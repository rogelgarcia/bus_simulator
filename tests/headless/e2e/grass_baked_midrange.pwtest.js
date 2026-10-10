// Compare upright leaf detail and broad card clumps at a fixed bus height near 20 m.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass_debug_v2/baked_lighting/midrange';
test.use({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });

test('card strip spacing and projection approach LOD2 at 20 metres', async ({ page }) => {
    test.setTimeout(240000); await mkdir(output, { recursive: true });
    const errors = [], rows = [], appearances = {}, costs = {};
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/GrassDebugV2BakedLightingScene.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const api = Object.freeze', 'window.__midrangeTest = { renderer, camera, sets, bakedAssets };\nconst api = Object.freeze') });
    });
    for (const version of ['natural', 'midrange']) {
        await page.goto(`/debug_tools/grass_baked_lighting_scene.html?strategy=baked&shelter=0&appearance=${version}`);
        const initial = await page.evaluate(() => window.__grassBakedReadiness); appearances[version] = initial.appearance;
        await page.evaluate(() => {
            window.__grassBakedScene.setAnimating(false);
            for (const id of ['scene-panel', 'split-labels', 'scene-performance']) document.getElementById(id).hidden = true;
        });
        for (const pose of ['bus_20m_front', 'bus_20m_rear', 'bus_20m_side']) for (const lod of ['LOD2', 'LOD3', 'LOD4']) {
            const measurements = await page.evaluate(({ pose, lod }) => {
                const viewer = window.__grassBakedScene, { renderer, camera, sets } = window.__midrangeTest;
                viewer.setPose(pose); viewer.setLod(lod); viewer.step(0);
                const gl = renderer.getContext(), { width, height } = renderer.domElement, pixels = new Uint8Array(width * height * 4);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const fields = sets.baked.getSnapshot().fields, point = camera.position.clone(), rgb = [0, 0, 0];
                const luma = i => pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
                let count = 0, detail = 0, lowSum = 0, lowSquared = 0, green = 0;
                for (let y = 6; y < height - 6; y += 3) for (let x = 6; x < width - 6; x += 3) {
                    point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                    const t = (.07 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                    const distance = Math.hypot(wx - camera.position.x, wz - camera.position.z);
                    if (t <= 0 || distance < 16 || distance > 24 || !fields.some(field => wx > field.minX + .8 && wx < field.maxX - .8 && wz > field.minZ + .8 && wz < field.maxZ - .8)) continue;
                    const i = (y * width + x) * 4;
                    for (let c = 0; c < 3; c++) rgb[c] += pixels[i + c];
                    count++; detail += (luma(i) - luma(i + 4)) ** 2;
                    if (pixels[i + 1] > pixels[i] * 1.04 && pixels[i + 1] > pixels[i + 2] * 1.2) green++;
                    let low = 0;
                    for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) low += luma(((y + dy) * width + x + dx) * 4) / 25;
                    lowSum += low; lowSquared += low * low;
                }
                return { rgb: rgb.map(value => value / count), pixels: count, greenCoverage: green / count,
                    detailContrast: Math.sqrt(detail / count), clumpContrast: Math.sqrt(Math.max(0, lowSquared / count - (lowSum / count) ** 2)), draw: viewer.getSnapshot().draw };
            }, { pose, lod });
            rows.push({ version, pose, lod, ...measurements });
            await page.locator('#scene-canvas').screenshot({ path: `${output}/${pose}-${version}-${lod}.png` });
        }
        if (process.env.GRASS_MIDRANGE_PERF) {
            costs[version] = await page.evaluate(async () => {
                const { measureGrassBakedMidrangeCost } = await import('/tests/headless/perf/grass_baked_midrange_cost.mjs');
                return measureGrassBakedMidrangeCost(window.__grassBakedScene);
            });
            await writeFile(`${output}/performance.json`, JSON.stringify(costs, null, 2));
        }
    }
    await writeFile(`${output}/results.json`, JSON.stringify({ rows, appearances, costs, errors }, null, 2));
    expect(errors).toEqual([]);
    for (const row of rows) expect(row.pixels).toBeGreaterThan(500);
    expect(appearances.midrange.colorTextureBytes).toBe(appearances.natural.colorTextureBytes);
    for (const pose of ['bus_20m_front', 'bus_20m_rear', 'bus_20m_side']) for (const lod of ['LOD3', 'LOD4']) {
        const reference = rows.find(row => row.version === 'natural' && row.pose === pose && row.lod === 'LOD2');
        const before = rows.find(row => row.version === 'natural' && row.pose === pose && row.lod === lod);
        const after = rows.find(row => row.version === 'midrange' && row.pose === pose && row.lod === lod);
        expect(Math.abs(after.clumpContrast - reference.clumpContrast), `${pose} ${lod}: broad clumps approach LOD2`).toBeLessThan(Math.abs(before.clumpContrast - reference.clumpContrast) * .65);
        expect(Math.abs(after.detailContrast - reference.detailContrast), `${pose} ${lod}: blade detail approaches LOD2`).toBeLessThan(Math.abs(before.detailContrast - reference.detailContrast) * .94);
        expect(Math.max(...after.rgb.map((value, c) => Math.abs(value - reference.rgb[c]))), `${pose} ${lod}: matching prepared palette`).toBeLessThan(8);
        expect(after.draw.calls).toBe(before.draw.calls);
        expect(after.draw.triangles).toBeLessThan(reference.draw.triangles * .06);
    }
});
