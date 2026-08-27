// Capture: AI 509 — classical ornament kit. Close-ups of the bradbury_block
// entry portal (archivolt bands, colonettes, frieze, recess material) and the
// top-floor arcade (molded capitals, continuous impost band).
// Output: tests/artifacts/screens/buildings/ai509_<shot>_<tag>.png
// (tag from AI509_TAG, default 'after'; AI509_OVERRIDES_JSON may inject
// config overrides for feature demos before AI 511 adopts them.)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const TAG = /^[a-z0-9_]+$/.test(String(process.env.AI509_TAG ?? '')) ? process.env.AI509_TAG : 'after';
// The 'after' run demos the AI 509 kit on bradbury_block via config overrides
// (patched in-page from the catalog config); AI 511 adopts them for real.
const WITH_ORNAMENT_PATCH = TAG !== 'before' && process.env.AI509_PLAIN !== '1';

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
                if (item.id === 'door_portal_bradbury') {
                    // Multi-band archivolt at its authored 0.24m depth, coupled
                    // terracotta colonettes, a frieze panel over the archivolt,
                    // and a dark recess so the entry reads shadowed.
                    item.decoration.header.bands = 3;
                    item.decoration.header.bandStepMeters = 0.05;
                    item.portal.recessMaterial = { mode: 'pbr', materialId: 'pbr.brownstone' };
                    item.portal.colonettes = {
                        enabled: true,
                        countPerSide: 2,
                        radiusMeters: 0.09,
                        gapMeters: 0.06,
                        material: { mode: 'pbr', materialId: 'pbr.terracotta_smooth' }
                    };
                    item.portal.frieze = {
                        enabled: true,
                        heightMeters: 0.26,
                        depthMeters: 0.06,
                        widthPaddingMeters: 0.5,
                        yOffsetMeters: 0.58,
                        material: { mode: 'pbr', materialId: 'pbr.red_sandstone_block' }
                    };
                }
                if (item.id === 'window_bradbury_arch' && item.decoration?.header) {
                    item.decoration.header.bands = 2;
                    item.decoration.header.bandStepMeters = 0.04;
                }
            }
            const facades = clone(BRADBURY_BLOCK_BUILDING_CONFIG.facades);
            const arcFace = facades.floor_bb3?.A?.layout;
            if (arcFace) {
                const bayIds = (arcFace.bays?.items ?? []).map((b) => b.id);
                arcFace.groups = {
                    items: [{
                        id: 'g_arcade',
                        bayIds,
                        repeat: { minRepeats: 1, maxRepeats: 1 },
                        arcade: {
                            enabled: true,
                            springing: { mode: 'auto', offsetMeters: null },
                            impost: {
                                enabled: true,
                                continuous: true,
                                heightMeters: 0.14,
                                projectionMeters: 0.07,
                                overhangMeters: 0.0,
                                material: { kind: 'texture', id: 'pbr.terracotta_smooth' }
                            }
                        }
                    }],
                    nextGroupIndex: 2
                };
            }
            // Molded capitals on the pilaster floors (AI 509 profile).
            const layers = clone(BRADBURY_BLOCK_BUILDING_CONFIG.layers);
            overrides = { windowDefinitions, facades, layers };
            for (const [, byFace] of Object.entries(facades)) {
                for (const [, facade] of Object.entries(byFace)) {
                    for (const bay of facade?.layout?.bays?.items ?? []) {
                        if (bay?.capital?.top) bay.capital.top.profile = 'molded';
                        if (bay?.capital?.bottom) bay.capital.bottom.profile = 'molded';
                    }
                }
            }
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
    }, { withPatch: WITH_ORNAMENT_PATCH, viewport });
    await waitForShowcaseReady(page);
}

// Portal: anchor on the door header decoration instance on the front (+z,
// max-z) face; arcade: anchor on the topmost front arched-window header row.
async function shootAnchored(page, { pick, name, cam }) {
    const found = await page.evaluate(async ({ pick, cam }) => {
        const THREE = await import('three');
        const engine = window.__testHooks.getEngine();
        const anchors = [];
        engine.scene.traverse((o) => {
            if (o?.userData?.windowDecorationPart !== 'header') return;
            const wantDef = pick === 'portal' ? 'door_portal_bradbury' : 'window_bradbury_arch';
            if (o.userData.windowDefinitionId !== wantDef) return;
            const m = new THREE.Matrix4();
            const p = new THREE.Vector3();
            const q = new THREE.Quaternion();
            const s = new THREE.Vector3();
            for (let i = 0; i < o.count; i++) {
                o.getMatrixAt(i, m);
                m.decompose(p, q, s);
                anchors.push(p.clone());
            }
        });
        if (!anchors.length) return 0;
        const zMax = Math.max(...anchors.map((p) => p.z));
        const front = anchors.filter((p) => p.z > zMax - 1.0);
        front.sort((a, b) => (pick === 'portal' ? Math.abs(a.x) - Math.abs(b.x) : b.y - a.y));
        let c = front[0];
        if (pick === 'arcade') {
            const rowY = front[0].y;
            const row = front.filter((p) => Math.abs(p.y - rowY) < 0.5).sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
            c = row[0];
        }

        engine.camera.position.set(c.x + cam.dx, c.y + cam.dy, c.z + cam.dz);
        engine.camera.lookAt(c.x + cam.lx, c.y + cam.ly, c.z + cam.lz);
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
        return anchors.length;
    }, { pick, cam });
    expect(found).toBeGreaterThan(0);
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

test('Capture: AI 509 portal and arcade ornament', async ({ page }) => {
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
    await shootAnchored(page, {
        pick: 'portal',
        name: `ai509_portal_${TAG}`,
        cam: { dx: 0.4, dy: -0.6, dz: 5.2, lx: 0, ly: -0.9, lz: -0.4 }
    });
    await shootAnchored(page, {
        pick: 'portal',
        name: `ai509_portal_graze_${TAG}`,
        cam: { dx: 3.4, dy: 0.3, dz: 2.6, lx: -0.4, ly: -0.5, lz: -0.2 }
    });
    await shootAnchored(page, {
        pick: 'arcade',
        name: `ai509_arcade_${TAG}`,
        cam: { dx: 2.0, dy: -1.0, dz: 6.0, lx: 0, ly: 0.2, lz: -0.5 }
    });
});
