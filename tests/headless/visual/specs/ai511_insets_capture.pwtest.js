// Capture: AI 511 — nested wall insets on the bradbury_block. The 'after'
// run swaps the top-floor arcade's appliqué archivolt (arched_band header)
// for REAL carved nesting: an arched recessed panel around each window and a
// second, deeper recess where the window sits — the archivolt reading comes
// from the arch-topped inset edges stepping in depth, exactly like the
// reference (2.png). The brick-floor sash windows get the same nesting
// rectangular: the pier strip stays proud, the window + spandrel strip
// recesses. AI 513 adopts the insets into the real config.
// Output: tests/artifacts/screens/buildings/ai511_<shot>_<tag>.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

const TAG = /^[a-z0-9_]+$/.test(String(process.env.AI511_TAG ?? '')) ? process.env.AI511_TAG : 'after';
const WITH_INSETS = TAG !== 'before';

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
                if (item.id === 'window_bradbury_arch') {
                    // The nested insets replace the appliqué archivolt: the
                    // arched reading must come from the stepped edges. The
                    // authored paddings are generous — the repeat-slot clamp
                    // shrinks them so neighbouring arcs JUST touch at the
                    // springing points, the reference's continuous rhythm.
                    if (item.decoration?.header) item.decoration.header.enabled = false;
                    item.insets = [
                        { widthPaddingMeters: 0.09, bottomPaddingMeters: 0.0, depthMeters: 0.08 },
                        { widthPaddingMeters: 0.06, bottomPaddingMeters: 0.0, depthMeters: 0.08 }
                    ];
                }
                if (item.id === 'window_bradbury_sash') {
                    // Brick floors: the window + spandrel strip recesses as one
                    // rectangular panel; the piers between stay proud. The sash
                    // sill sits at 0.55, so 0.45 reaches almost to the floor
                    // line without crossing it (a crossing would clamp the cut
                    // and suppress the stack).
                    item.insets = [
                        { widthPaddingMeters: 0.12, topPaddingMeters: 0.12, bottomPaddingMeters: 0.45, depthMeters: 0.06 }
                    ];
                }
            }
            overrides = { windowDefinitions };
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
    }, { withPatch: WITH_INSETS, viewport });
    await waitForShowcaseReady(page);
}

// Anchor on window SILL decoration instances (present in both variants —
// the 'after' patch disables the arch windows' header, so headers cannot
// anchor). 'arcade' picks the topmost front row (window_bradbury_arch),
// 'sash' the topmost brick-floor row (window_bradbury_sash).
async function shootAnchored(page, { pick, name, cam }) {
    const found = await page.evaluate(async ({ pick, cam }) => {
        const THREE = await import('three');
        const engine = window.__testHooks.getEngine();
        const wantDef = pick === 'arcade' ? 'window_bradbury_arch' : 'window_bradbury_sash';
        const anchors = [];
        engine.scene.traverse((o) => {
            if (o?.userData?.windowDecorationPart !== 'sill') return;
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
        const rowTopY = Math.max(...front.map((p) => p.y));
        const row = front.filter((p) => Math.abs(p.y - rowTopY) < 0.5).sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
        const c = row[0];

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

test('Capture: AI 511 nested wall insets', async ({ page }) => {
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
        pick: 'arcade',
        name: `ai511_arcade_${TAG}`,
        cam: { dx: 1.4, dy: 1.2, dz: 6.2, lx: 0, ly: 1.35, lz: -0.5 }
    });
    await shootAnchored(page, {
        pick: 'arcade',
        name: `ai511_arcade_graze_${TAG}`,
        cam: { dx: 4.4, dy: 1.4, dz: 2.4, lx: -0.8, ly: 1.3, lz: -0.2 }
    });
    await shootAnchored(page, {
        pick: 'sash',
        name: `ai511_sash_${TAG}`,
        cam: { dx: 0.9, dy: 1.1, dz: 4.6, lx: 0, ly: 1.05, lz: -0.4 }
    });
});
