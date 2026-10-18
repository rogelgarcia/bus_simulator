// Captures Terra & Mar (recessed balconies) in the game from the AI 614 inspection-rig cameras, so the game
// frames sit 1:1 beside the Blender baseline's renders of the same cameras.
//
// The cameras live in src/graphics/content3d/buildings/authoring/terramar_recessed/rig_cameras.json in the
// Blender config frame (z up, front run A at -Y); each is converted to the showcase's three.js world here
// (x3 = xb + offset.x, y3 = zb, z3 = offset.z - yb, with the build-site offset read from the city map the way the
// export spec reads it). Lighting is the game's own default (CALIBRATED_DAYLIGHT: calibrated sky, sun az 45 /
// el 55, exposure 0.0511), with no overrides: the older capture specs' sun/hemi/HDRI intensities belong to the
// pre-2026-09-10 lighting scale and render nearly black now. The Blender rig mirrors the same lighting.
//
// The engine holds the view (draws nothing) while the baked-lighting runtime prepares it asynchronously, which
// takes a few seconds and needs the event loop: frames are rendered one per task until the hold clears.
//
// Usage:
//   VISUAL_BASE_URL=http://127.0.0.1:<port> node node_modules/@playwright/test/cli.js test -c tests/headless/visual/visual.config.mjs terramar_recessed_blender_export_capture
// Output: tests/artifacts/screens/buildings/terramar_recessed/blender_export/game/<camera>.png (+ poses.json)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');
const RIG_PATH = path.join(ROOT, 'blender/scripts/terramar/building/rig_cameras.json');
const OUT_DIR = path.join(ROOT, 'tests/artifacts/screens/buildings/terramar_recessed/blender_export/game');
const BUILDING_ID = 'terramar_recessed';
const COMMON_OPTIONS = Object.freeze({
    seed: 'terramar-recessed-reference',
    buildingId: BUILDING_ID,
    waitForGroundTextures: true
});

function readPngDimensions(bytes) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function renderUntilViewReady(page) {
    for (let k = 0; k < 480; k++) {
        const hold = await page.evaluate(() => {
            window.__testHooks.step(1, { render: true });
            return !!window.__testHooks.getEngine()._bakedLighting?.shouldHoldView?.();
        });
        if (!hold) return k;
        await page.waitForTimeout(250);
    }
    throw new Error('the baked-lighting view never became ready (2 min)');
}

test('Capture: Terra & Mar recessed from the AI 614 rig cameras', async ({ page }) => {
    test.setTimeout(600_000);
    page.on('pageerror', (error) => console.log(`[browser:pageerror] ${error.message}`));
    const rig = JSON.parse(await fs.readFile(RIG_PATH, 'utf8'));
    await bootHarness(page, { query: '' });
    await fs.mkdir(OUT_DIR, { recursive: true });
    const poses = [];

    for (const cam of rig.cameras) {
        const [width, height] = cam.resolution;
        await page.setViewportSize({ width, height });
        await page.evaluate(async ({ common, width, height }) => {
            window.__testHooks.setViewport(width, height);
            await window.__testHooks.loadScenario('building_showcase', common);
            window.__testHooks.setFixedDt(1 / 60);
            window.__testHooks.step(5, { render: true });
        }, { common: COMMON_OPTIONS, width, height });

        await page.waitForFunction(() => {
            const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
            const textures = scenario?.textures ?? null;
            return !!scenario?.building?.present
                && !!textures && textures.total > 0 && textures.ready >= textures.total
                && (!scenario.environment?.expected || scenario.environment?.present === true)
                && scenario.ground?.floorMapReady === true
                && scenario.ground?.tileMapReady === true;
        }, null, { timeout: 90_000, polling: 250 });

        const pose = await page.evaluate(async ({ cam, buildingId }) => {
            const { getBuildingConfigById } = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
            const engine = window.__testHooks.getEngine();
            const entryId = `showcase_${buildingId}`;
            const config = getBuildingConfigById(buildingId);
            const placed = (engine.context.city?.map?.buildings ?? []).find((b) => b?.id === entryId);
            const a = config.footprintLoops[0][0];
            const b = placed.footprintLoops[0][0];
            const offset = { x: b.x - a.x, z: b.z - a.z };
            const toThree = (p) => [p[0] + offset.x, p[2], offset.z - p[1]];
            const position = toThree(cam.location);
            const target = toThree(cam.target);
            const camera = engine.camera;
            camera.fov = cam.vfov_deg;
            camera.near = 0.1;
            camera.position.set(...position);
            camera.lookAt(...target);
            camera.updateProjectionMatrix();
            const ui = document.getElementById('harness-ui');
            if (ui) ui.style.display = 'none';
            return { name: cam.name, offset, position, target, fov: camera.fov, aspect: camera.aspect };
        }, { cam, buildingId: BUILDING_ID });
        expect(pose.aspect).toBeCloseTo(width / height, 3);
        pose.holdFrames = await renderUntilViewReady(page);
        // Settle the half-rate AO / temporal passes before the shot (a cold frame renders dark).
        pose.render = await page.evaluate(() => {
            window.__testHooks.step(30, { render: true });
            return window.__testHooks.getMetrics()?.scenario?.render ?? null;
        });
        poses.push(pose);

        const outputPath = path.join(OUT_DIR, `${cam.name}.png`);
        await page.locator('#harness-canvas').screenshot({ path: outputPath });
        expect(readPngDimensions(await fs.readFile(outputPath))).toEqual({ width, height });
        console.log(`captured ${cam.name} ${width}x${height}`);
    }
    await fs.writeFile(path.join(OUT_DIR, 'poses.json'), JSON.stringify(poses, null, 2));
});
