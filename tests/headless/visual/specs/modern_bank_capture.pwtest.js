// Capture: Modern Bank — framings matched to the reference render
// (downloads/buildings_references/"10 front.png", a flat front elevation),
// plus close-ups of the base openings, the entry and the curtain wall.
//
// The `elevation` shot is the one used for proportion checks: a long lens far
// from the building approximates the reference's rectified elevation, so the
// two images can be measured against each other pixel for pixel.
//
// Output: tests/artifacts/screens/buildings/modern_bank_<view>.png
// Usage: VISUAL_BASE_URL=... CAPTURE_SCALE=2 playwright test -c tests/headless/visual/visual.config.mjs modern_bank_capture
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const BUILDING_ID = 'modern_bank';
// Set to write modern_bank_<view>_<tag>.png instead, for before/after runs.
const TAG = String(process.env.TAG ?? '').trim();
// MERGE=0 keeps per-mesh materials, for comparing merged vs unmerged shading.
const MERGE_GEOMETRY = String(process.env.MERGE ?? '1') !== '0';

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

// Cameras in building-box space: fx/fy/fz = fraction of the box extent,
// pads in meters beyond the box, fov in degrees. The reference face is the
// +z front (face A).
const SHOTS = [
    // The reference framing: dead-on front, long lens, far back.
    { view: 'elevation', fov: 12, noFog: true, eye: { fx: 0.5, fy: 0.5, fz: 1.0, zPad: 250 }, target: { fx: 0.5, fy: 0.5, fz: 1.0 } },
    // Same lens on the base alone, for the opening rhythm.
    { view: 'base', fov: 11, noFog: true, eye: { fx: 0.5, fy: 0.145, fz: 1.0, zPad: 130 }, target: { fx: 0.5, fy: 0.145, fz: 1.0 } },
    // Curtain wall grid at the top of the shaft.
    { view: 'curtain', fov: 8, noFog: true, eye: { fx: 0.5, fy: 0.82, fz: 1.0, zPad: 110 }, target: { fx: 0.5, fy: 0.82, fz: 1.0 } },
    // Street-level three-quarter, the way the building reads in the city.
    { view: 'corner', fov: 42, eye: { fx: 1.0, xPad: 26, fy: 0.16, fz: 1.0, zPad: 34 }, target: { fx: 0.45, fy: 0.42, fz: 0.45 } },
    // The entry bay, close.
    { view: 'entry', fov: 30, eye: { fx: 0.13, fy: 0.14, fz: 1.0, zPad: 24 }, target: { fx: 0.13, fy: 0.14, fz: 1.0 } },
    // Grazing along the front, showing the mullion relief and base reveals.
    { view: 'graze', fov: 30, eye: { fx: 1.0, xPad: 9, fy: 0.05, fz: 1.0, zPad: 7 }, target: { fx: 0.15, fy: 0.14, fz: 1.0 } }
];

test('Capture: Modern Bank reference framings', async ({ page }) => {
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
            buildingId: args.buildingId,
            mergeBuildingGeometry: args.mergeGeometry
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: BUILDING_ID, viewport, mergeGeometry: MERGE_GEOMETRY });

    // Warm-up build: cold caches render differently on the very first build.
    await load();
    await waitForShowcaseReady(page);
    await load();
    await waitForShowcaseReady(page);

    const diagnostics = await page.evaluate(() => window.__testHooks.getMetrics()?.scenario?.building ?? null);
    console.log('BUILDING: ' + JSON.stringify(diagnostics));

    for (const shot of SHOTS) {
        await page.evaluate(async ({ buildingId, shot }) => {
            const THREE = await import('three');
            const engine = window.__testHooks.getEngine();
            const obj = engine.scene.getObjectByName(`showcase_${buildingId}`);
            obj.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(obj);
            const resolve = (p) => new THREE.Vector3(
                box.min.x + (Number(p.fx) ?? 0.5) * (box.max.x - box.min.x) + (Number(p.xPad) || 0),
                box.min.y + (Number(p.fy) ?? 0.5) * (box.max.y - box.min.y) + (Number(p.yPad) || 0),
                box.min.z + (Number(p.fz) ?? 0.5) * (box.max.z - box.min.z) + (Number(p.zPad) || 0)
            );
            // Measurement shots stand 100-250m back so the lens is long enough
            // to read as an elevation; at that range the scene haze adds a large
            // constant to every surface and flattens the tonal comparison, so
            // those shots render without it.
            if (shot.noFog) {
                window.__mbFog = window.__mbFog ?? engine.scene.fog;
                engine.scene.fog = null;
            } else if (window.__mbFog) {
                engine.scene.fog = window.__mbFog;
            }
            if (Number.isFinite(shot.fov)) {
                engine.camera.fov = shot.fov;
                engine.camera.updateProjectionMatrix();
            }
            engine.camera.position.copy(resolve(shot.eye));
            engine.camera.lookAt(resolve(shot.target));
            engine.camera.updateMatrixWorld(true);
            window.__testHooks.step(30, { render: true });
            for (const id of ['harness-status', 'harness-log']) {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            }
        }, { buildingId: BUILDING_ID, shot });
        const suffix = TAG ? `_${TAG}` : '';
        await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `modern_bank_${shot.view}${suffix}.png`) });
    }
});
