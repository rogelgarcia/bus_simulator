// Capture: Bradbury Block — framings matched to the reference model shots
// (downloads/buildings_references/2.png corner view, 3.png long elevation)
// plus close-ups of the storefront base and the arcade top.
// Output: tests/artifacts/screens/buildings/bradbury_<view>.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const BUILDING_ID = 'bradbury_block';

async function waitForShowcaseReady(page) {
    await page.waitForFunction(() => {
        const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
        const textures = scenario?.textures ?? null;
        if (!textures || textures.total <= 0) return false;
        if (textures.ready < textures.total) return false;
        if (scenario.environment?.expected && !scenario.environment.present) return false;
        return true;
    }, null, { timeout: 60_000, polling: 250 });
}

// Cameras in building-box space: fx/fz = fraction of the box extent, ym =
// meters above the box floor, pads in meters beyond the box.
const SHOTS = [
    // ref 2.png: three-quarter from the chamfered street corner, front face
    // sunlit to the right.
    { view: 'corner', eye: { fx: 1.55, ym: 13.0, fz: 2.1 }, target: { fx: 0.35, ym: 8.0, fz: 0.5 } },
    // ref 3.png: down the front face at street level.
    { view: 'front_graze', eye: { fx: 1.25, ym: 4.5, fz: 1.55 }, target: { fx: 0.15, ym: 9.0, fz: 0.95 } },
    { view: 'storefront', eye: { fx: 0.62, ym: 2.2, fz: 1.0, zPad: 11.0 }, target: { fx: 0.5, ym: 3.0, fz: 1.0, zPad: 0 } },
    { view: 'arcade_top', eye: { fx: 0.72, ym: 15.0, fz: 1.0, zPad: 12.0 }, target: { fx: 0.5, ym: 16.6, fz: 1.0, zPad: 0 } },
    { view: 'entry', eye: { fx: 0.5, ym: 1.9, fz: 1.0, zPad: 8.0 }, target: { fx: 0.5, ym: 2.8, fz: 1.0, zPad: 0 } }
];

test('Capture: Bradbury Block reference framings', async ({ page }) => {
    test.setTimeout(420_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    const load = () => page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: BUILDING_ID, viewport });

    // Warm-up build: cold caches render differently on the very first build.
    await load();
    await waitForShowcaseReady(page);
    await load();
    await waitForShowcaseReady(page);

    const warnings = await page.evaluate(() => window.__testHooks.getMetrics()?.scenario?.building ?? null);
    console.log('BUILDING: ' + JSON.stringify(warnings));

    for (const shot of SHOTS) {
        await page.evaluate(async ({ buildingId, shot }) => {
            const THREE = await import('three');
            const engine = window.__testHooks.getEngine();
            const obj = engine.scene.getObjectByName(`showcase_${buildingId}`);
            obj.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(obj);
            const resolve = (p) => new THREE.Vector3(
                box.min.x + (Number(p.fx) || 0) * (box.max.x - box.min.x) + (Number(p.xPad) || 0),
                box.min.y + (Number(p.ym) || 0),
                box.min.z + (Number(p.fz ?? 0.5)) * (box.max.z - box.min.z) + (Number(p.zPad) || 0)
            );
            engine.camera.position.copy(resolve(shot.eye));
            engine.camera.lookAt(resolve(shot.target));
            engine.camera.updateMatrixWorld(true);
            window.__testHooks.step(30, { render: true });
            for (const id of ['harness-status', 'harness-log']) {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            }
        }, { buildingId: BUILDING_ID, shot });
        await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `bradbury_${shot.view}.png`) });
    }
});
