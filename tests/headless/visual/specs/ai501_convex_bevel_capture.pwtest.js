// Capture: AI 501 edge bevel scope `all_convex_edges` — chamfers on the convex
// arrises the bay relief itself creates (pier edges, relief steps), shown on a
// pier grid with the window bays recessed so the piers stand proud.
// Output: tests/artifacts/screens/buildings/ai501_*.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const BUILDING_ID = 'pier_grid_tower_2';

// The stock config pushes its window strips proud (+0.22); the convex-arris
// showcase wants the opposite relief — window bays recessed, piers standing
// proud of them — so the pier arrises are the convex edges the scope cuts.
const RELIEF_DEPTH = -0.35;
const BEVEL = { enabled: true, scope: 'all_convex_edges', widthMeters: 0.08 };

async function makeReliefFacades(page) {
    return page.evaluate(async ({ buildingId, depth }) => {
        const catalog = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
        const cfg = catalog.getBuildingConfigById(buildingId);
        const facades = JSON.parse(JSON.stringify(cfg.facades));
        for (const face of Object.values(facades.floor_502 ?? {})) {
            for (const item of face?.layout?.bays?.items ?? []) {
                if (item?.depth) item.depth = { left: depth, right: depth, linked: true };
            }
        }
        return facades;
    }, { buildingId: BUILDING_ID, depth: RELIEF_DEPTH });
}

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

async function shoot(page, { name, configOverrides = null, camera = null, graze = false, viewport }) {
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

    if (graze) {
        // A true close-up: stand by the A facade and look down it at a grazing
        // angle, so pier front, chamfer facet and return each catch their own
        // light value. `cameraPadding` cannot get this close (it frames the
        // whole bounding sphere).
        await page.evaluate(async (args) => {
            const THREE = await import('three');
            const engine = window.__testHooks.getEngine();
            const building = engine.scene.getObjectByName(`showcase_${args.buildingId}`);
            building.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(building);
            const y = box.min.y + 8.2;
            engine.camera.position.set(box.min.x + 2.0, y + 1.2, box.max.z + 2.6);
            engine.camera.lookAt(box.max.x - 4.0, y, box.max.z - 0.6);
            engine.camera.updateMatrixWorld(true);
        }, { buildingId: BUILDING_ID });
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

test('Capture: AI 501 all_convex_edges bevels', async ({ page }) => {
    test.setTimeout(420_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    const facades = await makeReliefFacades(page);

    // Warm-up build: cold caches render differently on the very first build, so
    // the first shot is taken twice and only the second one is kept.
    await shoot(page, { name: 'ai501_convex_before', viewport, configOverrides: { facades } });
    await shoot(page, { name: 'ai501_convex_before', viewport, configOverrides: { facades } });
    await shoot(page, {
        name: 'ai501_convex_after',
        viewport,
        configOverrides: { facades, edgeBevel: BEVEL }
    });

    await shoot(page, { name: 'ai501_convex_closeup_before', viewport, graze: true, configOverrides: { facades } });
    await shoot(page, {
        name: 'ai501_convex_closeup_after',
        viewport,
        graze: true,
        configOverrides: { facades, edgeBevel: BEVEL }
    });

    // The chamfers are real silhouette vertices, and the scope no longer warns:
    // the beveled build must gain facet vertices and keep every bevel warning
    // out of the log.
    const probe = await page.evaluate(async ({ buildingId, facadesJson, bevel }) => {
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
            facades: JSON.parse(JSON.stringify(facadesJson)),
            windowDefinitions: JSON.parse(JSON.stringify(cfg.windowDefinitions ?? null)),
            materialSlots: JSON.parse(JSON.stringify(cfg.materialSlots ?? null)),
            edgeBevel,
            overlays: { wire: false, floorplan: false, border: false, floorDivisions: false },
            walls: { inset: 0.0 }
        });
        const facadeTris = (parts) => (parts?.solidMeshes ?? [])
            .filter((m) => m?.userData?.buildingFab2WallKind === 'facade')
            .reduce((sum, m) => sum + (m.geometry.getAttribute('position')?.count ?? 0) / 3, 0);
        const off = build(null);
        const on = build(bevel);
        return {
            offTris: facadeTris(off),
            onTris: facadeTris(on),
            bevelWarnings: (on?.warnings ?? []).filter((w) => /bevel/i.test(String(w)))
        };
    }, { buildingId: BUILDING_ID, facadesJson: facades, bevel: BEVEL });

    console.log('AI501 probe: ' + JSON.stringify(probe));
    expect(probe.onTris).toBeGreaterThan(probe.offTris);
    expect(probe.bevelWarnings).toEqual([]);
});
