// Isolate shading and geometric discontinuities at the shared leaf root.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
test.use({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1, video: 'off' });
test('Root join stays smooth through the contact boundary', async ({ page }) => {
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/root_seam');
    await mkdir(folder, { recursive: true });
    await page.goto('/debug_tools/grass_plant_study.html?layout=paired');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await page.addStyleTag({ content: '.plant-study-panel, #grass-authoring-dock { visibility: hidden; }' });
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { plant, camera, controls, lighting } = window.__plantCardsStudy;
        camera.position.set(0.055, 0.092, -0.105); controls.target.set(0, 0.017, 0.018);
        controls.update(); lighting.render(0);
        const profiles = plant.leaves.slice(0, 2).map(leaf => {
            const p = leaf.geometry.attributes.position, n = leaf.geometry.attributes.normal, uv = leaf.geometry.attributes.uv;
            return [0, 8, 16, 24, 32].map(side => {
                const rows = [];
                for (let start = 33; start + 33 <= p.count; start += 33) {
                    const i = start + side;
                    if (uv.getY(i) > 0.35) break;
                    const normal = new THREE.Vector3().fromBufferAttribute(n, i), previous = new THREE.Vector3().fromBufferAttribute(n, i - 33);
                    rows.push({ t: uv.getY(i), p: [p.getX(i), p.getY(i), p.getZ(i)], normal: normal.toArray(), turn: normal.angleTo(previous) * 180 / Math.PI });
                }
                return { side, rows };
            });
        });
        return { profiles, contact: plant.getSnapshot().contact };
    });
    await page.screenshot({ path: path.join(folder, 'after.png') });
    await writeFile(path.join(folder, 'geometry.json'), JSON.stringify(result, null, 2));
    expect(result.contact.maximumPenetrationAfter).toBeLessThan(1e-7);
    const joinTurns = result.profiles.flatMap(profiles => profiles.filter(profile => profile.side >= 16).flatMap(profile =>
        profile.rows.filter(row => row.t >= 0.056 && row.t <= 0.084).map(row => row.turn)));
    expect(Math.max(...joinTurns), 'No concentrated normal turn across the visible collar/body surface').toBeLessThan(2);
});