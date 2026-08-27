// Capture: AI 507 — deep-set window frames must not show the interior shell's
// reveal ring in front of the recessed sashes. Close-up of one deep-set sash
// (window_black_6_panels_tall, frame.inset 0.094) in a brick wall: before the
// fix the shell's 8cm hole margin reads as a pale plaster surround floating in
// front of the frame; after, the cut is lined by brick reveal walls down to
// the frame plane.
// Output: tests/artifacts/screens/buildings/ai507_deep_inset_sash_<tag>.png
// (tag from AI507_TAG, default 'after' — take the before shot by re-running
// with the pre-fix shell-hole margin in projectFacadeCutoutOntoShell).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const BASE_BUILDING_ID = 'pier_grid_tower_2';
const TAG = /^[a-z0-9_]+$/.test(String(process.env.AI507_TAG ?? '')) ? process.env.AI507_TAG : 'after';

// One brick floor with a single deep-set sash window centered on face A. The
// def's frame.inset (0.094) puts the frame plane 8.4cm behind the interior
// shell, which is exactly the AI 507 case.
const DEEP_SASH_WINDOW = {
    enabled: true,
    defId: 'window_black_6_panels_tall',
    assetType: 'window',
    size: { widthMeters: 1.6, heightMeters: 1.9 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.9,
    width: { minMeters: 1.6, maxMeters: null },
    padding: { leftMeters: 0.2, rightMeters: 0.2 },
    repeat: { count: 1 },
    visual: { disableShades: true, interior: 'res' },
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
};

const DEEP_SASH_CONFIG = {
    name: 'AI507 Deep Inset Sash',
    footprintLoops: [
        [
            { x: -5, z: 5 },
            { x: 5, z: 5 },
            { x: 5, z: -5 },
            { x: -5, z: -5 }
        ]
    ],
    floors: 1,
    floorHeight: 3.6,
    style: 'default',
    windows: null,
    materialSlots: {
        slots: {
            wallPrimary: { material: { kind: 'preset', id: 'brick.red_standard', jitter: true } }
        }
    },
    layers: [
        {
            id: 'floor_ai507',
            type: 'floor',
            floors: 1,
            floorHeight: 3.6,
            planOffset: 0,
            interior: { enabled: true },
            style: 'default',
            material: { kind: 'slot', id: 'wallPrimary' },
            belt: { enabled: false },
            windows: { enabled: false }
        },
        {
            id: 'roof_ai507',
            type: 'roof',
            ring: { enabled: false }
        }
    ],
    facades: {
        floor_ai507: {
            A: {
                layout: {
                    bays: {
                        items: [
                            { id: 'flex_1', size: { mode: 'range', minMeters: 1.0, maxMeters: null }, expandPreference: 'prefer_expand' },
                            {
                                id: 'open_2',
                                size: { mode: 'fixed', widthMeters: 3.0 },
                                expandPreference: 'no_repeat',
                                window: DEEP_SASH_WINDOW
                            },
                            { id: 'flex_3', size: { mode: 'range', minMeters: 1.0, maxMeters: null }, expandPreference: 'prefer_expand' }
                        ]
                    }
                }
            }
        }
    }
};

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

async function loadModel(page, { viewport }) {
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            configOverrides: args.overrides,
            mergeBuildingGeometry: false
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: BASE_BUILDING_ID, overrides: DEEP_SASH_CONFIG, viewport });
    await waitForShowcaseReady(page);
}

// Close-up on the single front (+z) window: find the facade wall's front
// plane and footprint from the role-tagged wall meshes, then park the camera
// a couple of meters out with a slight 3/4 offset so both the pale-ring
// failure (before) and the brick reveal walls (after) read clearly.
async function shootSashCloseup(page, { name }) {
    const found = await page.evaluate(async () => {
        const THREE = await import('three');
        const engine = window.__testHooks.getEngine();
        const box = new THREE.Box3();
        let facades = 0;
        engine.scene.traverse((obj) => {
            if (obj?.userData?.buildingFab2WallKind !== 'facade') return;
            obj.updateMatrixWorld(true);
            box.union(new THREE.Box3().setFromObject(obj));
            facades += 1;
        });
        if (!facades) return 0;

        const cx = (box.min.x + box.max.x) * 0.5;
        const frontZ = box.max.z;
        // Window: cut center 0.9 + 1.9/2 above the floor base (bbox bottom).
        const wy = box.min.y + 0.9 + 0.95;

        engine.camera.position.set(cx + 1.7, wy + 1.1, frontZ + 2.4);
        engine.camera.lookAt(cx - 0.1, wy - 0.15, frontZ - 0.2);
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
        return facades;
    });
    expect(found).toBeGreaterThan(0);
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

test('Capture: AI 507 deep-set sash close-up', async ({ page }) => {
    test.setTimeout(420_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    // Warm-up build: the very first build renders with cold caches.
    await loadModel(page, { viewport });

    await loadModel(page, { viewport });
    await shootSashCloseup(page, { name: `ai507_deep_inset_sash_${TAG}` });
});
