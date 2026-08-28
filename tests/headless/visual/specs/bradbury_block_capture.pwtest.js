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

// Floor-by-floor review mode: BRADBURY_FLOORS=N renders only the first N
// floor layers (no roof) with ground-level cameras, writing
// bradbury_l<N>_<view>.png so the full-building captures stay untouched.
const FLOOR_LAYERS = /^[0-9]+$/.test(String(process.env.BRADBURY_FLOORS ?? ''))
    ? Number(process.env.BRADBURY_FLOORS)
    : 0;
const OUT_PREFIX = FLOOR_LAYERS > 0 ? `bradbury_l${FLOOR_LAYERS}_` : 'bradbury_';

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
// meters above the box floor, pads in meters beyond the box. The entry face
// is the +x face (C) since the reference-matching side swap; the corner
// chamfer joins it to the +z side street face (A).
const SHOTS = [
    // ref 2.png: three-quarter from the chamfered street corner, entry face
    // to the right of the chamfer.
    { view: 'corner', eye: { fx: 1.0, xPad: 14.0, ym: 12.0, fz: 1.0, zPad: 16.0 }, target: { fx: 0.45, ym: 8.5, fz: 0.45 } },
    // ref 3.png: down the entry face at street level.
    { view: 'front_graze', eye: { fx: 1.0, xPad: 12.0, ym: 4.5, fz: 1.0, zPad: 6.0 }, target: { fx: 1.0, xPad: 0, ym: 9.0, fz: 0.15 } },
    { view: 'storefront', eye: { fx: 1.0, xPad: 11.0, ym: 2.2, fz: 0.62 }, target: { fx: 1.0, xPad: 0, ym: 3.0, fz: 0.62 } },
    { view: 'arcade_top', eye: { fx: 1.0, xPad: 12.0, ym: 15.0, fz: 0.72 }, target: { fx: 1.0, xPad: 0, ym: 16.6, fz: 0.72 } },
    { view: 'entry', eye: { fx: 1.0, xPad: 8.0, ym: 1.9, fz: 0.5 }, target: { fx: 1.0, xPad: 0, ym: 2.8, fz: 0.5 } },
    // The chamfer corner entry door, head-on down the chamfer normal.
    { view: 'corner_door', eye: { fx: 1.0, xPad: 5.0, ym: 2.0, fz: 1.0, zPad: 5.0 }, target: { fx: 0.95, ym: 2.5, fz: 0.94 } }
];

// Ground-focused framings for the floor-by-floor review passes.
const GROUND_SHOTS = [
    { view: 'corner', eye: { fx: 1.0, xPad: 11.0, ym: 4.5, fz: 1.0, zPad: 13.0 }, target: { fx: 0.55, ym: 2.6, fz: 0.55 } },
    { view: 'entry', eye: { fx: 1.0, xPad: 8.0, ym: 1.9, fz: 0.5 }, target: { fx: 1.0, xPad: 0, ym: 2.8, fz: 0.5 } },
    { view: 'storefront', eye: { fx: 1.0, xPad: 9.0, ym: 2.2, fz: 0.68 }, target: { fx: 1.0, xPad: 0, ym: 2.9, fz: 0.68 } },
    { view: 'corner_door', eye: { fx: 1.0, xPad: 5.0, ym: 2.0, fz: 1.0, zPad: 5.0 }, target: { fx: 0.95, ym: 2.5, fz: 0.94 } },
    // Both corner doors at once: the chamfer door and the entry-face door
    // beside the corner post, with the first storefronts of each face.
    // Camera RIGHT of the chamfer normal, then aimed LEFT so the central
    // chamfer door is the focus and more of its left inner reveal shows
    // (the reference viewpoint).
    { view: 'corner_doors', eye: { fx: 1.0, xPad: 13.0, ym: 3.2, fz: 1.0, zPad: 5.5 }, target: { fx: 0.955, ym: 2.0, fz: 0.955 } },
    { view: 'side_graze', eye: { fx: 0.6, ym: 2.2, fz: 1.0, zPad: 9.0 }, target: { fx: 0.42, ym: 2.9, fz: 1.0, zPad: 0 } }
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
        let configOverrides = null;
        if (args.floorLayers > 0) {
            const { BRADBURY_BLOCK_BUILDING_CONFIG } = await import('/src/graphics/content3d/buildings/configs/BradburyBlock.js');
            const clone = (v) => JSON.parse(JSON.stringify(v));
            const floors = BRADBURY_BLOCK_BUILDING_CONFIG.layers.filter((l) => l.type === 'floor');
            // A trailing band strip (id suffix after its parent floor, e.g.
            // floor_bb1b) belongs to the floor below it in the review count.
            let take = 0;
            let counted = 0;
            for (const layer of floors) {
                const isBand = /b$/.test(String(layer.id ?? ''));
                if (!isBand) counted += 1;
                if (counted > args.floorLayers) break;
                take += 1;
            }
            configOverrides = { layers: clone(floors.slice(0, take)) };
        }
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            configOverrides
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: BUILDING_ID, viewport, floorLayers: FLOOR_LAYERS });

    // Warm-up build: cold caches render differently on the very first build.
    await load();
    await waitForShowcaseReady(page);
    await load();
    await waitForShowcaseReady(page);

    const warnings = await page.evaluate(() => window.__testHooks.getMetrics()?.scenario?.building ?? null);
    console.log('BUILDING: ' + JSON.stringify(warnings));

    for (const shot of (FLOOR_LAYERS > 0 ? GROUND_SHOTS : SHOTS)) {
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
        await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${OUT_PREFIX}${shot.view}.png`) });
    }
});
