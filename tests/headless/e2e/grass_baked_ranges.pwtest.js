// Compare individual-blade reductions with their preceding LOD within their actual distance bands.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass_debug_v2/baked_lighting/ranges';
test.use({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });

test('distant representations preserve blade-scale detail inside their assigned ranges', async ({ page }) => {
    test.setTimeout(240000); await mkdir(output, { recursive: true });
    const errors = [], rows = [], appearances = {}, costs = {};
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/GrassDebugV2BakedLightingScene.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const api = Object.freeze', 'window.__rangeTest = { renderer, camera, sets, bakedAssets };\nconst api = Object.freeze') });
    });
    for (const version of process.env.GRASS_RANGE_QUICK ? ['ranged'] : ['midrange', 'ranged']) {
        await page.goto(`/debug_tools/grass_baked_lighting_scene.html?strategy=baked&shelter=0&appearance=${version}`);
        const initial = await page.evaluate(() => window.__grassBakedReadiness); appearances[version] = initial.appearance;
        if (version === 'ranged') {
            expect(initial.selection.effectiveDistances).toEqual([.6, .8, 20, 30, 40]);
            expect(initial.selection.transitionBands[3]).toEqual({ from: 3, to: 4, start: 29, end: 30 });
            expect(initial.selection.transitionBands[4]).toEqual({ from: 4, to: 5, start: 39, end: 40 });
        }
        await page.evaluate(() => {
            window.__grassBakedScene.setAnimating(false);
            for (const id of ['scene-panel', 'split-labels', 'scene-performance']) document.getElementById(id).hidden = true;
        });
        for (const distance of [20, 25, 30, 35, 40, 45]) for (const direction of process.env.GRASS_RANGE_QUICK ? ['front'] : ['front', 'rear', 'side']) for (const lod of ['LOD2', 'LOD3', 'LOD4', 'LOD5']) {
            const pose = `bus_${distance}m_${direction}`;
            const measurements = await page.evaluate(({ pose, lod, distance }) => {
                const viewer = window.__grassBakedScene, { renderer, camera, sets } = window.__rangeTest;
                viewer.setPose(pose); viewer.setLod(lod); viewer.step(0);
                const gl = renderer.getContext(), { width, height } = renderer.domElement, pixels = new Uint8Array(width * height * 4);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const fields = sets.baked.getSnapshot().fields, point = camera.position.clone(), rgb = [0, 0, 0];
                const luma = i => pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
                let count = 0, detail = 0, lowSum = 0, lowSquared = 0, green = 0, dark = 0;
                for (let y = 6; y < height - 6; y += 2) for (let x = 6; x < width - 6; x += 2) {
                    point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                    const t = (.07 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                    const range = Math.hypot(wx - camera.position.x, wz - camera.position.z);
                    if (t <= 0 || range < distance - 5 || range > distance + 5 || !fields.some(field => wx > field.minX + .8 && wx < field.maxX - .8 && wz > field.minZ + .8 && wz < field.maxZ - .8)) continue;
                    const i = (y * width + x) * 4;
                    for (let c = 0; c < 3; c++) rgb[c] += pixels[i + c];
                    count++; detail += (luma(i) - luma(i + 4)) ** 2;
                    if (pixels[i + 1] > pixels[i] * 1.04 && pixels[i + 1] > pixels[i + 2] * 1.2) green++;
                    let low = 0;
                    for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) low += luma(((y + dy) * width + x + dx) * 4) / 25;
                    lowSum += low; lowSquared += low * low; if (low < 70) dark++;
                }
                return { rgb: rgb.map(value => value / count), pixels: count, greenCoverage: green / count, darkPatchFraction: dark / count,
                    detailContrast: Math.sqrt(detail / count), clumpContrast: Math.sqrt(Math.max(0, lowSquared / count - (lowSum / count) ** 2)), draw: viewer.getSnapshot().draw };
            }, { pose, lod, distance });
            rows.push({ version, pose, distance, lod, ...measurements });
            await page.locator('#scene-canvas').screenshot({ path: `${output}/${pose}-${version}-${lod}.png` });
        }
        if (process.env.GRASS_RANGE_PERF) costs[version] = await page.evaluate(async () => {
            const { measureGrassBakedMidrangeCost } = await import('/tests/headless/perf/grass_baked_midrange_cost.mjs');
            return measureGrassBakedMidrangeCost(window.__grassBakedScene, { pose: 'bus_25m_front', rendersPerFrame: 4 });
        });
    }
    await writeFile(`${output}/results.json`, JSON.stringify({ timestamp: new Date().toISOString(), rows, appearances, costs, errors }, null, 2));
    expect(errors).toEqual([]);
    for (const row of rows) expect(row.pixels).toBeGreaterThan(500);
    for (const direction of process.env.GRASS_RANGE_QUICK ? ['front'] : ['front', 'rear', 'side']) for (const [distance, previous, lod] of [[25, 'LOD2', 'LOD3'], [35, 'LOD3', 'LOD4']]) {
        const pose = `bus_${distance}m_${direction}`;
        const reference = rows.find(row => row.version === 'ranged' && row.pose === pose && row.lod === previous);
        const current = rows.find(row => row.version === 'ranged' && row.pose === pose && row.lod === lod);
        expect(Math.max(...current.rgb.map((value, c) => Math.abs(value - reference.rgb[c]))), `${pose}: adjacent color`).toBeLessThan(5);
        expect(current.detailContrast / reference.detailContrast, `${pose}: fine blade detail`).toBeGreaterThan(.85);
        expect(current.detailContrast / reference.detailContrast, `${pose}: avoid chunky exaggerated detail`).toBeLessThan(1.16);
        expect(current.clumpContrast / reference.clumpContrast, `${pose}: avoid broad clumps`).toBeLessThan(1.3);
        expect(current.greenCoverage).toBeGreaterThan(.96);
        expect(current.draw.triangles).toBeLessThan(reference.draw.triangles * .75);
    }
});
