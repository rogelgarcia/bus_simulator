// Verify that paired blade ribs continue into their shared root without sideways S-bends.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
test.use({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1, video: 'off' });
test('Paired root ribs keep a continuous source curve', async ({ page }) => {
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/root_continuity');
    await mkdir(folder, { recursive: true });
    await page.goto('/debug_tools/grass_plant_study.html?layout=paired');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const { createGrassDebugV2Plant } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Plant.js');
        const { plant, camera, controls, lighting } = window.__plantCardsStudy;
        camera.position.set(0, 0.078, -0.115); controls.target.set(0, 0.012, 0.010);
        controls.update(); lighting.render(0);
        const original = createGrassDebugV2Plant({ material: plant.leaves[0].material, bodySegments: 96 });
        const p = plant.leaves[1].geometry.attributes.position, upper = plant.leaves[0].geometry.attributes.position;
        const source = original.leaves[0].geometry.attributes.position, uv = original.leaves[0].geometry.attributes.uv;
        const rows = [];
        for (let start = 0; start + 33 <= p.count; start += 33) {
            const i = start + 16, t = uv.getY(i);
            if (t > 0.30) break;
            rows.push({ t, source: [source.getX(i), source.getY(i), source.getZ(i)], upper: [upper.getX(i), upper.getY(i), upper.getZ(i)], lower: [p.getX(i), p.getY(i), p.getZ(i)] });
        }
        original.dispose();
        return { rows, contact: plant.getSnapshot().contact };
    });
    await page.addStyleTag({ content: '.plant-study-panel, #grass-authoring-dock { visibility: hidden; }' });
    await page.screenshot({ path: path.join(folder, 'root-front.png') });
    await writeFile(path.join(folder, 'profiles.json'), JSON.stringify(result, null, 2));
    const body = result.rows.filter(row => row.t >= 0.25);
    for (const name of ['upper', 'lower']) {
        const a = body[0][name], b = body.at(-1)[name];
        const slope = (b[0] - a[0]) / (b[2] - a[2]);
        const deviation = Math.max(...result.rows.filter(row => row.t >= 0.07 && row.t <= 0.20)
            .map(row => Math.abs(row[name][0] - (a[0] + slope * (row[name][2] - a[2])))));
        expect(deviation, name + ' rib must continue toward the shared root without a sideways S-bend').toBeLessThan(0.0002);
    }
});