// Capture: AI 514 — angle-preserving stretch and detached push/pull edits.
// Output: tests/artifacts/screens/buildings/ai514_showcase_<variant>.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

async function waitForReady(page) {
    await page.waitForFunction(() => {
        const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
        const textures = scenario?.textures ?? null;
        return !!textures && textures.total > 0 && textures.ready >= textures.total;
    }, null, { timeout: 60_000, polling: 250 });
}

async function loadVariant(page, variant) {
    await page.evaluate(async (variantId) => {
        let configOverrides = null;
        if (variantId !== 'before') {
            const edits = await import('/src/app/buildings/footprint_edits/BuildingFootprintEdits.js');
            const catalog = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
            const config = catalog.getBuildingConfigById('l_warehouse');
            const plan = edits.createFootprintPlan(config.footprintLoops[0]);
            const result = variantId === 'stretched'
                ? edits.stretchFootprint(plan, { faceId: 'A', end: 'end', delta: 8 })
                : edits.pushPullFootprint(plan, { faceId: 'A', delta: 3, detached: true });
            configOverrides = { footprintLoops: [edits.footprintPlanToLoop(result.footprint)] };
        }
        window.__testHooks.setViewport(1280, 720);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'ai514',
            buildingId: 'l_warehouse',
            mergeBuildingGeometry: false,
            configOverrides
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(10, { render: true });
    }, variant);
    await waitForReady(page);
}

async function shoot(page, name, { dx, dy, dz, lx = 0, ly = 5, lz = 0 }) {
    const meshCount = await page.evaluate(async ({ dx, dy, dz, lx, ly, lz }) => {
        const THREE = await import('three');
        const engine = window.__testHooks.getEngine();
        const box = new THREE.Box3();
        let found = 0;
        engine.scene.traverse((object) => {
            if (!object?.isMesh || !object.userData?.buildingFab2Role) return;
            object.updateMatrixWorld(true);
            box.expandByObject(object);
            found += 1;
        });
        if (!found) return 0;
        const center = box.getCenter(new THREE.Vector3());
        engine.camera.position.set(center.x + dx, dy, center.z + dz);
        engine.camera.lookAt(center.x + lx, ly, center.z + lz);
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const element = document.getElementById(id);
            if (element) element.style.display = 'none';
        }
        return found;
    }, { dx, dy, dz, lx, ly, lz });
    expect(meshCount).toBeGreaterThan(0);
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

test('Capture: AI 514 face extension edits', async ({ page }) => {
    test.setTimeout(300_000);
    await bootHarness(page, { query: '' });
    await fs.mkdir(OUT_DIR, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 720 });

    await loadVariant(page, 'before');
    await shoot(page, 'ai514_showcase_before', { dx: 24, dy: 13, dz: 36, ly: 6 });

    await loadVariant(page, 'stretched');
    await shoot(page, 'ai514_showcase_stretched_repeat', { dx: 28, dy: 13, dz: 40, ly: 6 });

    await loadVariant(page, 'pushed');
    await shoot(page, 'ai514_showcase_pushed_connectors', { dx: 28, dy: 14, dz: 34, ly: 6, lz: 3 });
});
