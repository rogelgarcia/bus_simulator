// Capture: AI 510 (rework) — box + levels portal on the bradbury_block entry.
// The 'after' run swaps the door's appliqué decorations + inline portal for a
// portal def decomposed from the reference (2.png) with the LAYER model: one
// clay-sandstone BOX filling a widened entry bay (its face proud of the
// facade, blind panel insets on the piers, molded base courses), a true
// SEMICIRCULAR arch (rise = half the chord), two inset levels telescoping to
// the deep dark door, an archivolt ring stopping on molded impost courses
// (the borrowed facade-decorator profiles), and the foliate-capital GLB
// face-anchored atop each pier. Same material family as the reference — the
// ground floor's red sandstone, monochrome. AI 513 adopts the def for real.
// Output: tests/artifacts/screens/buildings/ai510_portal_<shot>_<tag>.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const TAG = /^[a-z0-9_]+$/.test(String(process.env.AI510_TAG ?? '')) ? process.env.AI510_TAG : 'after';
const WITH_PORTAL_DEF = TAG !== 'before';

// Decomposed from the reference entry as LAYERS: the box's own face margins
// are the piers (with blind panel insets), the levels are the telescoping
// insets down to the deep door, the archivolt is a ring decorating level 1's
// hole, the imposts/base are borrowed decorator course profiles, and the
// capitals are face-anchored ornaments atop the piers.
const BRADBURY_PORTAL_DEF = {
    id: 'portal_bradbury_entry',
    box: { sideMarginMeters: 0.8, topMarginMeters: 0.25, projectionMeters: 0.15 },
    levels: [
        {
            frameWidthMeters: 0.28,
            depthMeters: 0.3,
            arch: true,
            ring: { widthMeters: 0.2, projectionMeters: 0.08, profile: 'band', jambs: 'stop' }
        },
        { frameWidthMeters: 0.18, depthMeters: 0.5, arch: true }
    ],
    // The wedge impost runs on the outer face AND across the reveal walls
    // inside the void; the skirt foot circulates the entire structure.
    impost: { heightMeters: 0.22, projectionMeters: 0.09, profile: 'wedge', walls: 'both' },
    panels: [
        { xMeters: 2.28, yMeters: 0.5, widthMeters: 0.34, heightMeters: 2.6, depthMeters: 0.06 }
    ],
    base: { heightMeters: 0.5, projectionMeters: 0.05, profile: 'skirt', walls: 'both' },
    steps: { count: 1, riseMeters: 0.12, treadDepthMeters: 0.34, widthPaddingMeters: 0.35, material: { mode: 'pbr', materialId: 'pbr.terracotta_smooth' } },
    custom: [
        // relief mount: the capital sits like a 3D decal on the pier face
        { part: 'foliate_capital', anchor: 'face', mount: 'relief', scaleMeters: 0.6, offsetMeters: { x: 2.24, y: 3.85, out: 0.03 } }
    ],
    // Reference material: the same warm clay sandstone as the ground-floor
    // rustication, monochrome; only the deep recess goes darker.
    palette: {
        box: { mode: 'pbr', materialId: 'pbr.terracotta_smooth' },
        level: { mode: 'pbr', materialId: 'pbr.terracotta_smooth' },
        ring: { mode: 'pbr', materialId: 'pbr.terracotta_smooth' },
        impost: { mode: 'pbr', materialId: 'pbr.terracotta_smooth' },
        panel: { mode: 'pbr', materialId: 'pbr.terracotta_smooth' },
        base: { mode: 'pbr', materialId: 'pbr.terracotta_smooth' },
        recess: { mode: 'pbr', materialId: 'pbr.brownstone' },
        steps: { mode: 'pbr', materialId: 'pbr.terracotta_smooth' },
        custom: { mode: 'pbr', materialId: 'pbr.terracotta_smooth' }
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
        let overrides = null;
        if (args.withPatch) {
            const { BRADBURY_BLOCK_BUILDING_CONFIG } = await import('/src/graphics/content3d/buildings/configs/BradburyBlock.js');
            const clone = (v) => JSON.parse(JSON.stringify(v));
            const windowDefinitions = clone(BRADBURY_BLOCK_BUILDING_CONFIG.windowDefinitions);
            for (const item of windowDefinitions.items ?? []) {
                if (item.id !== 'door_portal_bradbury') continue;
                // The def owns the whole surround now: drop the appliqué
                // arched band AND the simple jamb bands (leaving the jambs on
                // was the pair of dark slabs flanking the arch).
                if (item.decoration?.header) item.decoration.header.enabled = false;
                if (item.decoration?.jambs) item.decoration.jambs.enabled = false;
                // Reference arch is a TRUE SEMICIRCLE: rise = half the chord,
                // circle center exactly on the springing line.
                if (item.settings?.arch) item.settings.arch.heightRatio = 0.5;
                item.portal = { enabled: true, defId: 'portal_bradbury_entry' };
            }
            // The reference's flanking piers ARE the portal box: widen the
            // entry bay to hold the box and drop the two 1m wall piers it
            // replaces.
            const facades = clone(BRADBURY_BLOCK_BUILDING_CONFIG.facades);
            const groundA = facades?.floor_bb1?.A?.layout?.bays ?? null;
            if (groundA) {
                groundA.items = (groundA.items ?? []).filter((bay) => bay.id !== 'pier_7' && bay.id !== 'pier_9');
                for (const bay of groundA.items) {
                    if (bay.id === 'entry_8') bay.size.widthMeters = 5.6;
                }
            }
            overrides = {
                windowDefinitions,
                facades,
                portalDefinitions: { items: [args.portalDef] }
            };
        }
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: 'bradbury_block',
            configOverrides: overrides,
            mergeBuildingGeometry: false
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { withPatch: WITH_PORTAL_DEF, portalDef: BRADBURY_PORTAL_DEF, viewport });
    await waitForShowcaseReady(page);
}

// Anchor on the front portal: portal_order meshes when the def is on, the
// door's header decoration instance otherwise (the 'before' look).
async function shootPortal(page, { name, cam }) {
    const found = await page.evaluate(async ({ cam }) => {
        const THREE = await import('three');
        const engine = window.__testHooks.getEngine();
        const points = [];
        engine.scene.traverse((o) => {
            const role = o?.userData?.buildingFab2Role;
            if (role === 'portal_box' || role === 'portal_order' || role === 'portal_steps') {
                o.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(o);
                points.push(box.getCenter(new THREE.Vector3()));
            }
        });
        if (!points.length) return 0;
        const zMax = Math.max(...points.map((p) => p.z));
        const front = points.filter((p) => p.z > zMax - 2.0);
        front.sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
        const c = front[0];
        const anchorY = 2.4;

        engine.camera.position.set(c.x + cam.dx, anchorY + cam.dy, c.z + cam.dz);
        engine.camera.lookAt(c.x + cam.lx, anchorY + cam.ly, c.z + cam.lz);
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
        return points.length;
    }, { cam });
    expect(found).toBeGreaterThan(0);
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

test('Capture: AI 510 portal fabrication framework', async ({ page }) => {
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
    await shootPortal(page, {
        name: `ai510_portal_front_${TAG}`,
        cam: { dx: 0.3, dy: 0.55, dz: 8.4, lx: 0, ly: 0.0, lz: -0.4 }
    });
    await shootPortal(page, {
        name: `ai510_portal_graze_${TAG}`,
        cam: { dx: 4.2, dy: 0.7, dz: 3.6, lx: -0.4, ly: -0.2, lz: -0.3 }
    });
});
