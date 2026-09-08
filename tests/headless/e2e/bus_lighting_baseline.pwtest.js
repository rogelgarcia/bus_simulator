// Preserves the pre-AI550 game reference and applied-bake evidence at supplied cameras.
import test, { expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const config = await readFile('tools/baking/blender.local.json', 'utf8').then(JSON.parse).catch(() => ({}));
test.use({ launchOptions: { executablePath: config.browserExecutable }, video: 'off', trace: 'off' });
const root = 'tests/artifacts/screens/ai550_bus_diffuse_probes/baseline-recheck';
const inputs = JSON.parse(await readFile('tests/fixtures/lighting/ai550_camera_poses.json', 'utf8'));

test('preserve original bus lighting and current baked world at all five supplied views', async ({ page }) => {
    test.skip(process.env.AI550_CAPTURE_BASELINE !== '1', 'Explicit reference capture; original before/ evidence is retained separately');
    test.setTimeout(360_000);
    await mkdir(root, { recursive: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(() => localStorage.setItem('bus_sim.bakedLighting.v1', JSON.stringify({
        mode: 'auto', shadows: { enabled: true, dynamicResolution: 'high' }, receivers: { indirect: true }
    })));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const records = [];
    for (const { id, pose } of inputs.poses) {
        await page.goto('/?coreTests=0&gameplayPose=' + encodeURIComponent(JSON.stringify(pose)));
        await page.waitForFunction(() => window.__busSim?.sm?.current?.busAnchor, null, { timeout: 90_000 });
        await page.evaluate(async () => { await window.__busSim.sm.current.busModel.userData.readyPromise; });
        await expect.poll(() => page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo().status.effectiveMode), { timeout: 160_000 }).toBe('baked');
        await page.evaluate(() => new Promise(resolve => { let count = 0; function frame() { if (++count > 45) resolve(); else requestAnimationFrame(frame); } frame(); }));
        const record = await page.evaluate(() => {
            const { engine, sm } = window.__busSim;
            const materials = new Map();
            sm.current.busModel.traverse(o => { for (const m of o.isMesh ? (Array.isArray(o.material) ? o.material : [o.material]) : []) materials.set(m.uuid, { name: m.name, type: m.type, roughness: m.roughness, metalness: m.metalness, environment: !!m.envMap }); });
            return { lighting: engine.lightingSettings, baked: engine.getBakedLightingDebugInfo(), materials: [...materials.values()], renderer: engine.renderer.info };
        });
        await page.locator('canvas').first().screenshot({ path: `${root}/${id}.png` });
        records.push({ id, pose, ...record });
    }
    const index = await readFile('assets/baked_lighting/receivers/enhanced/package_index.json');
    await writeFile(`${root}/manifest.json`, JSON.stringify({ captured: new Date().toISOString(), original: true, indexSha256: createHash('sha256').update(index).digest('hex'), records, errors }, null, 2));
    expect(errors).toEqual([]);
});
