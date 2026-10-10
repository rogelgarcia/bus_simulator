// Diagnose flat-canopy detail in the 40–50 m band at the game bus camera angle.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass_debug_v2/baked_lighting/canopy_detail';
test.use({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('flat canopy retains detail at bus distance', async ({ page }) => {
    test.setTimeout(240000); await mkdir(output, { recursive: true });
    const errors = [], rows = [], appearances = {}, costs = {};
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/GrassDebugV2BakedLightingScene.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const api = Object.freeze', 'window.__canopyDetail = { renderer, camera, sets, bakedAssets };\nconst api = Object.freeze') });
    });
    for (const [variant, appearance] of [['before', 'ranged'], ['after', 'detailed']]) {
        await page.goto('/debug_tools/grass_baked_lighting_scene.html?strategy=baked&shelter=0&appearance=' + appearance);
        appearances[variant] = (await page.evaluate(() => window.__grassBakedReadiness)).appearance;
        await page.evaluate(() => { window.__grassBakedScene.setAnimating(false); for (const id of ['scene-panel', 'split-labels', 'scene-performance']) document.getElementById(id).hidden = true; });
        for (const distance of [45, 64]) for (const direction of ['front', 'rear', 'side']) for (const lod of variant === 'before' ? ['LOD4', 'LOD5'] : ['LOD5']) {
            const pose = `bus_${distance}m_${direction}`;
            const measurement = await page.evaluate(({ pose, lod, distance }) => {
                const viewer = window.__grassBakedScene, { renderer, camera, sets } = window.__canopyDetail;
                viewer.setPose(pose); viewer.setLod(lod); viewer.step(0);
                const gl = renderer.getContext(), { width, height } = renderer.domElement, pixels = new Uint8Array(width * height * 4);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const fields = sets.baked.getSnapshot().fields, point = camera.position.clone(), rgb = [0, 0, 0];
                let count = 0, detail = 0, minY = height, maxY = 0;
                for (let y = 2; y < height - 2; y += 2) for (let x = 2; x < width - 2; x += 2) {
                    point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                    const t = (.07 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                    const range = Math.hypot(wx - camera.position.x, wz - camera.position.z);
                    if (t <= 0 || range < distance - 5 || range > distance + 5 || !fields.some(field => wx > field.minX + .8 && wx < field.maxX - .8 && wz > field.minZ + .8 && wz < field.maxZ - .8)) continue;
                    const i = (y * width + x) * 4;
                    for (let c = 0; c < 3; c++) rgb[c] += pixels[i + c];
                    const d = (pixels[i] - pixels[i + 4]) * .2126 + (pixels[i + 1] - pixels[i + 5]) * .7152 + (pixels[i + 2] - pixels[i + 6]) * .0722;
                    count++; detail += d * d;
                    if (x >= width / 4 && x <= width * .75) { minY = Math.min(minY, height - y); maxY = Math.max(maxY, height - y); }
                }
                const map = window.__canopyDetail.bakedAssets.canopy.materials.all.map;
                return { rgb: rgb.map(value => value / count), detailContrast: Math.sqrt(detail / count), pixels: count, crop: { top: minY - 8, height: maxY - minY + 16 }, draw: viewer.getSnapshot().draw,
                    appliedAnisotropy: renderer.properties.get(map).__currentAnisotropy ?? 1 };
            }, { pose, lod, distance });
            rows.push({ variant, pose, lod, ...measurement });
            await page.screenshot({ path: `${output}/${pose}-${variant}-${lod}.png`, clip: { x: 340, y: measurement.crop.top, width: 680, height: measurement.crop.height } });
        }
        if (process.env.GRASS_CANOPY_PERF) costs[variant] = await page.evaluate(async () => {
            const { measureGrassBakedMidrangeCost } = await import('/tests/headless/perf/grass_baked_midrange_cost.mjs');
            return measureGrassBakedMidrangeCost(window.__grassBakedScene, { pose: 'bus_45m_front', rendersPerFrame: 4, levels: ['LOD5'] });
        });
    }
    await writeFile(`${output}/results.json`, JSON.stringify({ rows, appearances, costs, errors }, null, 2));
    if (process.env.GRASS_CANOPY_PERF) await writeFile(`${output}/performance.json`, JSON.stringify(costs, null, 2));
    expect(errors).toEqual([]); for (const row of rows) expect(row.pixels).toBeGreaterThan(500);
    expect(appearances.after.colorTextureBytes).toBe(appearances.before.colorTextureBytes);
    expect(appearances.after.canopyFiltering.size).toBe(1024);
    expect(appearances.after.canopyFiltering.linearMagnification).toBe(true);
    for (const row of rows.filter(row => row.variant === 'after')) {
        const before = rows.find(other => other.pose === row.pose && other.variant === 'before' && other.lod === 'LOD5');
        const reference = rows.find(other => other.pose === row.pose && other.lod === 'LOD4');
        expect(row.appliedAnisotropy).toBe(appearances.after.canopyFiltering.anisotropy);
        expect(row.detailContrast).toBeGreaterThan(before.detailContrast * 5);
        expect(row.detailContrast).toBeGreaterThan(8);
        expect(row.detailContrast).toBeLessThan(reference.detailContrast * 1.1);
        expect(Math.max(...row.rgb.map((value, c) => Math.abs(value - reference.rgb[c])))).toBeLessThan(10);
        expect(row.draw).toEqual(before.draw);
    }
});
