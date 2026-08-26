// Capture: AI 492 rooftop props (water towers, bulkheads, mechanicals).
// Renders a before/after pair for the two showcase configs that turn the
// feature on, plus a roof close-up of each prop kind.
// Output: tests/artifacts/screens/buildings/ai492_*.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const SHOTS = [
    { name: 'ai492_brick_midrise_2_before', buildingId: 'brick_midrise_2', stripProps: true },
    { name: 'ai492_brick_midrise_2_after', buildingId: 'brick_midrise_2' },
    { name: 'ai492_stone_setback_tower_before', buildingId: 'stone_setback_tower', stripProps: true },
    { name: 'ai492_stone_setback_tower_after', buildingId: 'stone_setback_tower' },
    {
        // The bounding-sphere framing never gets near enough for the props, so
        // the close-ups aim the camera at the prop cluster by hand.
        name: 'ai492_brick_midrise_2_closeup_roof',
        buildingId: 'brick_midrise_2',
        closeUp: { offset: { x: -14, y: 9, z: 20 } }
    },
    {
        name: 'ai492_brick_midrise_2_closeup_water_tower',
        buildingId: 'brick_midrise_2',
        closeUp: { offset: { x: -7, y: 3.5, z: 11 }, aimHighest: true }
    },
    {
        name: 'ai492_stone_setback_tower_closeup_roof',
        buildingId: 'stone_setback_tower',
        closeUp: { offset: { x: -13, y: 8, z: 18 } }
    }
];

async function loadLayersWithoutProps(page, buildingId) {
    return page.evaluate(async (id) => {
        const mod = await import('/src/graphics/content3d/catalogs/BuildingConfigCatalog.js');
        const cfg = mod.getBuildingConfigById(id);
        return (cfg?.layers ?? []).map((layer) => {
            const copy = JSON.parse(JSON.stringify(layer));
            delete copy.props;
            return copy;
        });
    }, buildingId);
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

test('Capture: AI 492 rooftop props', async ({ page }) => {
    test.setTimeout(420_000);
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
    }, { buildingId: SHOTS[0].buildingId, viewport });
    await waitForShowcaseReady(page);

    const propMeshCounts = {};

    for (const shot of SHOTS) {
        const configOverrides = shot.stripProps
            ? { layers: await loadLayersWithoutProps(page, shot.buildingId) }
            : null;

        await page.evaluate(async (args) => {
            window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
            await window.__testHooks.loadScenario('building_showcase', {
                seed: 'showcase',
                buildingId: args.buildingId,
                ...(args.configOverrides ? { configOverrides: args.configOverrides } : {}),
                ...(args.options ?? {})
            });
            window.__testHooks.setFixedDt(1 / 60);
            window.__testHooks.step(5, { render: true });
        }, { buildingId: shot.buildingId, options: shot.options ?? null, configOverrides, viewport });

        await waitForShowcaseReady(page);

        await page.evaluate(() => {
            window.__testHooks.step(30, { render: true });
            for (const id of ['harness-status', 'harness-log']) {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            }
        });

        if (shot.closeUp) {
            await page.evaluate((closeUp) => {
                const eng = window.__testHooks.getEngine();
                const city = eng?.context?.city ?? null;
                let box = null;
                let highest = null;
                city?.buildings?.group?.traverse?.((obj) => {
                    if (obj?.userData?.buildingFab2Role !== 'rooftop_prop') return;
                    obj.updateMatrixWorld(true);
                    obj.geometry?.computeBoundingBox?.();
                    const local = obj.geometry?.boundingBox ?? null;
                    if (!local) return;
                    const world = local.clone().applyMatrix4(obj.matrixWorld);
                    box = box ? box.union(world) : world;
                    if (!highest || world.max.y > highest.max.y) highest = world;
                });
                if (!box) throw new Error('No rooftop prop meshes found for the close-up shot');
                const aim = closeUp.aimHighest && highest ? highest : box;
                const center = aim.max.clone().add(aim.min).multiplyScalar(0.5);
                const offset = closeUp.offset;
                eng.camera.position.set(center.x + offset.x, center.y + offset.y, center.z + offset.z);
                eng.camera.lookAt(center.x, center.y, center.z);
                eng.camera.updateProjectionMatrix();
                window.__testHooks.step(2, { render: true });
            }, shot.closeUp);
        }

        const metrics = await page.evaluate(() => window.__testHooks.getMetrics());
        expect(metrics?.scenario?.building?.present).toBe(true);

        // Merged buildings hide the per-prop meshes, so count prop triangles by
        // walking the scene for the rooftop-prop role tag the generator sets.
        propMeshCounts[shot.name] = await page.evaluate(() => {
            const city = window.__testHooks.getEngine?.()?.context?.city ?? null;
            const roles = [];
            let props = 0;
            let triangles = 0;
            city?.buildings?.group?.traverse?.((obj) => {
                if (obj?.userData?.buildingFab2Role !== 'rooftop_prop') return;
                roles.push(obj.userData.rooftopPropMaterialRole);
                props = Math.max(props, Number(obj.userData.rooftopPropCount) || 0);
                const index = obj.geometry?.index ?? null;
                const position = obj.geometry?.attributes?.position ?? null;
                triangles += Math.floor(((index?.count ?? position?.count ?? 0)) / 3);
            });
            return { props, roles, triangles };
        });

        const canvas = page.locator('#harness-canvas');
        await expect(canvas).toBeVisible();
        await canvas.screenshot({ path: path.join(OUT_DIR, `${shot.name}.png`) });
    }

    console.log('[ai492] rooftop prop geometry:', JSON.stringify(propMeshCounts, null, 2));
});
