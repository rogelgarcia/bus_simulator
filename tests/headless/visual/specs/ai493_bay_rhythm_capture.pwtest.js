// Capture: AI 493 bay rhythm — arcade grouping and the column stacking lock.
// Renders a before/after pair for each feature plus a close-up of the arcade.
// Output: tests/artifacts/screens/buildings/ai493_*.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const ARCADE_BUILDING_ID = 'brick_bank_2';
const STACKING_BUILDING_ID = 'pier_grid_tower_2';

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

// A ground-floor loggia: wide and narrow arched openings alternating between
// piers, so the shared springing line has real work to do.
function arcadeFacadeOverrides(arcadeOn) {
    const archWindow = (widthMeters) => ({
        enabled: true,
        defId: 'window_arch_civic',
        assetType: 'window',
        size: { widthMeters, heightMeters: 3.2 },
        heightMode: 'fixed',
        verticalOffsetMeters: 0.5,
        width: { minMeters: widthMeters, maxMeters: null },
        padding: { leftMeters: 0.2, rightMeters: 0.2 },
        repeat: { count: 1 },
        muntins: { bottomEnabled: true, topEnabled: true },
        visual: { disableShades: true, interior: 'none' }
    });
    const pier = (id, widthMeters, expands = false) => ({
        id,
        size: expands
            ? { mode: 'range', minMeters: widthMeters, maxMeters: null }
            : { mode: 'fixed', widthMeters },
        expandPreference: expands ? 'prefer_expand' : 'no_repeat',
        wallMaterialOverride: { kind: 'slot', id: 'trim' }
    });
    const opening = (id, widthMeters, windowWidth) => ({
        id,
        size: { mode: 'fixed', widthMeters },
        expandPreference: 'no_repeat',
        window: archWindow(windowWidth)
    });
    const layout = (leadWidth) => ({
        bays: {
            items: [
                pier('bay_1', leadWidth, true),
                opening('bay_2', 2.9, 2.4),
                pier('bay_3', 0.9),
                opening('bay_4', 2.1, 1.6),
                pier('bay_5', leadWidth, true)
            ],
            nextBayIndex: 6
        },
        groups: {
            items: [{
                id: 'group_1',
                bayIds: ['bay_2', 'bay_3', 'bay_4'],
                repeat: { minRepeats: 1, maxRepeats: 'auto' },
                ...(arcadeOn ? { arcade: { enabled: true } } : {})
            }],
            nextGroupIndex: 2
        }
    });
    return { A: { layout: layout(1.0) }, B: { layout: layout(0.9) } };
}

async function loadArcadeConfig(page, { arcadeOn }) {
    return page.evaluate(async ({ buildingId, faces }) => {
        const mod = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
        const cfg = mod.getBuildingConfigById(buildingId);
        const facades = JSON.parse(JSON.stringify(cfg.facades));
        facades.floor_301 = faces;
        return { facades };
    }, { buildingId: ARCADE_BUILDING_ID, faces: arcadeFacadeOverrides(arcadeOn) });
}

// A setback layer that repeats the layer below's bay layout: with the lock on,
// both layers keep one column count and the windows stack.
async function loadStackingConfig(page, { lock }) {
    return page.evaluate(async ({ buildingId, lock }) => {
        const mod = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
        const cfg = mod.getBuildingConfigById(buildingId);
        const layers = JSON.parse(JSON.stringify(cfg.layers));
        const facades = JSON.parse(JSON.stringify(cfg.facades));

        const upperIndex = layers.findIndex((l) => l?.id === 'floor_502');
        const upper = layers[upperIndex];
        const setback = JSON.parse(JSON.stringify(upper));
        setback.id = 'floor_503';
        setback.floors = 3;
        setback.planOffset = 2.0;
        upper.floors = 3;
        if (upper.cornice) upper.cornice = { enabled: false };
        layers.splice(upperIndex + 1, 0, setback);
        facades.floor_503 = JSON.parse(JSON.stringify(facades.floor_502));

        if (!lock) {
            for (const layerId of ['floor_502', 'floor_503']) {
                for (const faceId of Object.keys(facades[layerId] ?? {})) {
                    facades[layerId][faceId].layout.stacking = { mode: 'per_layer' };
                }
            }
        }
        return { layers, facades };
    }, { buildingId: STACKING_BUILDING_ID, lock });
}

async function shoot(page, { name, buildingId, configOverrides, camera = null, viewport }) {
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            configOverrides: args.configOverrides,
            ...(args.camera ?? {})
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId, configOverrides, viewport, camera });
    await waitForShowcaseReady(page);

    // Settle half-rate GTAO / temporal effects before presenting the frame,
    // and drop the harness HUD out of the shot.
    await page.evaluate(() => {
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
    });
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

test('Capture: AI 493 bay rhythm patterns and arcade grouping', async ({ page }) => {
    test.setTimeout(420_000);
    const consoleErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    // Warm-up build: cold caches render differently on the very first build.
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', { seed: 'showcase', buildingId: args.buildingId });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: ARCADE_BUILDING_ID, viewport });
    await waitForShowcaseReady(page);

    const ARCADE_CLOSEUP = { cameraDir: { x: -0.35, y: 0.14, z: 1 }, cameraPadding: 0.5, cameraTargetYFrac: 0.08 };

    const arcadeOff = await loadArcadeConfig(page, { arcadeOn: false });
    await shoot(page, { name: 'ai493_arcade_before', buildingId: ARCADE_BUILDING_ID, configOverrides: arcadeOff, viewport });
    await shoot(page, {
        name: 'ai493_arcade_closeup_before',
        buildingId: ARCADE_BUILDING_ID,
        configOverrides: arcadeOff,
        viewport,
        camera: ARCADE_CLOSEUP
    });

    const arcadeOn = await loadArcadeConfig(page, { arcadeOn: true });
    await shoot(page, { name: 'ai493_arcade_after', buildingId: ARCADE_BUILDING_ID, configOverrides: arcadeOn, viewport });

    const impostCount = await page.evaluate(() => {
        const engine = window.__testHooks.getEngine?.();
        let count = 0;
        engine?.scene?.traverse?.((obj) => {
            if (obj?.userData?.buildingFab2Role === 'bay_arcade_impost') count += 1;
        });
        return count;
    });
    expect(impostCount).toBeGreaterThan(0);

    await shoot(page, {
        name: 'ai493_arcade_closeup_after',
        buildingId: ARCADE_BUILDING_ID,
        configOverrides: arcadeOn,
        viewport,
        camera: ARCADE_CLOSEUP
    });

    const stackingOff = await loadStackingConfig(page, { lock: false });
    await shoot(page, { name: 'ai493_stacking_before', buildingId: STACKING_BUILDING_ID, configOverrides: stackingOff, viewport });

    const stackingOn = await loadStackingConfig(page, { lock: true });
    await shoot(page, { name: 'ai493_stacking_after', buildingId: STACKING_BUILDING_ID, configOverrides: stackingOn, viewport });

    await shoot(page, {
        name: 'ai493_stacking_closeup',
        buildingId: STACKING_BUILDING_ID,
        configOverrides: stackingOn,
        viewport,
        camera: { cameraDir: { x: -0.5, y: 0.18, z: 1 }, cameraPadding: 0.75, cameraTargetYFrac: 0.62 }
    });

    console.log('AI493 console errors:', JSON.stringify(consoleErrors.slice(0, 10), null, 2));
});
