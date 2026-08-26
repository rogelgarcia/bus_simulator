// Capture: AI 499 plan edge bevels — main-corner chamfers, before/after plus a
// corner close-up. The chamfer is a masonry detail, so the demo width is the
// kind of value a facade would actually use.
// Output: tests/artifacts/screens/buildings/ai499_*.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

// A pier-grid tower: square plan corners, and proud pier bays whose relief
// steps are exactly the convex arrises the wider scope is for.
const BUILDING_ID = 'pier_grid_tower_2';

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

async function shoot(page, { name, configOverrides = null, camera = null, manualCamera = null, viewport }) {
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            ...(args.configOverrides ? { configOverrides: args.configOverrides } : {}),
            ...(args.camera ?? {})
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: BUILDING_ID, configOverrides, camera, viewport });
    await waitForShowcaseReady(page);

    if (manualCamera) {
        await page.evaluate((cam) => {
            const engine = window.__testHooks.getEngine?.();
            const camera = engine?.camera;
            if (!camera) return;
            camera.position.set(cam.eye.x, cam.eye.y, cam.eye.z);
            camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
            camera.updateMatrixWorld(true);
        }, manualCamera);
    }

    await page.evaluate(() => {
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
    });
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

const CORNER_CLOSEUP = { cameraDir: { x: 0.85, y: 0.16, z: 1 }, cameraPadding: 0.55, cameraTargetYFrac: 0.25 };

test('Capture: AI 499 plan edge bevels', async ({ page }) => {
    test.setTimeout(420_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    // Warm-up build: cold caches render differently on the very first build, so
    // the first shot is taken twice and only the second one is kept.
    await shoot(page, { name: 'ai499_corners_before', viewport });
    await shoot(page, { name: 'ai499_corners_before', viewport });
    await shoot(page, {
        name: 'ai499_corners_after',
        viewport,
        configOverrides: { edgeBevel: { enabled: true, scope: 'main_corners', widthMeters: 0.12 } }
    });

    await shoot(page, { name: 'ai499_corner_closeup_before', viewport, camera: CORNER_CLOSEUP });
    await shoot(page, {
        name: 'ai499_corner_closeup_after',
        viewport,
        camera: CORNER_CLOSEUP,
        configOverrides: { edgeBevel: { enabled: true, scope: 'main_corners', widthMeters: 0.12 } }
    });

    // The facets are real geometry, not a shader trick: the beveled build must
    // report its corner frames.
    const facets = await page.evaluate(async ({ buildingId }) => {
        const catalog = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
        const gen = await import('/src/graphics/assets3d/generators/building_fabrication/BuildingFabricationGenerator.js');
        const cfg = catalog.getBuildingConfigById(buildingId);
        const tileSize = 24;
        const map = {
            tileSize,
            kind: new Uint8Array([0]),
            inBounds: (x, y) => x === 0 && y === 0,
            index: () => 0,
            tileToWorldCenter: () => ({ x: 0, z: 0 })
        };
        const generatorConfig = {
            road: { surfaceY: 0, curb: { height: 0, extraHeight: 0, thickness: 0 }, sidewalk: { extraWidth: 0, lift: 0 } },
            ground: { surfaceY: 0 }
        };
        const build = (edgeBevel) => gen.buildBuildingFabricationVisualParts({
            map,
            tiles: [[0, 0]],
            generatorConfig,
            tileSize,
            occupyRatio: 1.0,
            layers: JSON.parse(JSON.stringify(cfg.layers)),
            facades: JSON.parse(JSON.stringify(cfg.facades)),
            materialSlots: JSON.parse(JSON.stringify(cfg.materialSlots ?? null)),
            edgeBevel,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 }
        });
        const off = build(null);
        const on = build({ enabled: true, scope: 'main_corners', widthMeters: 0.12 });
        return {
            off: off?.edgeBevelCornerFacets ?? null,
            on: Object.entries(on?.edgeBevelCornerFacets ?? {}).map(([id, f]) => ({ id, width: Number(f.widthMeters.toFixed(3)) })),
            warnings: (on?.warnings ?? []).filter((w) => /bevel/i.test(String(w)))
        };
    }, { buildingId: BUILDING_ID });

    console.log('AI499 facets: ' + JSON.stringify(facets));
    expect(facets.off).toBeNull();
    expect(facets.on.map((f) => f.id).sort()).toEqual(['AB', 'BC', 'CD', 'DA']);
    for (const facet of facets.on) expect(facet.width).toBeCloseTo(0.12, 2);
});
