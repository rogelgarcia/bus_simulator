// Capture: AI 512 — N-face facade model showcases. The L warehouse (six
// faces incl. two courtyard faces the quad model could not address, per-face
// painted-brick override, C linked to B, fire escape on face E) and the hex
// pavilion (six 14m faces, every corner a 120° arbitrary-angle mitre), plus
// close-ups of an angled corner join on each.
// Output: tests/artifacts/screens/buildings/ai512_<shot>.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings');

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

async function loadModel(page, { buildingId, viewport }) {
    await page.evaluate(async (args) => {
        window.__testHooks.setViewport(args.viewport.width, args.viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            seed: 'showcase',
            buildingId: args.buildingId,
            mergeBuildingGeometry: false
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { buildingId, viewport });
    await waitForShowcaseReady(page);
}

// Frame shots relative to the building's world bounding box center: the
// showcase places the config's authored footprint unrotated, so authored
// face directions (front = +z) hold in world space.
async function shoot(page, { name, dx, dy, dz, lx = 0, ly = 4, lz = 0 }) {
    const ok = await page.evaluate(async ({ dx, dy, dz, lx, ly, lz }) => {
        const THREE = await import('three');
        const engine = window.__testHooks.getEngine();
        const box = new THREE.Box3();
        let found = 0;
        engine.scene.traverse((o) => {
            if (!o?.isMesh || !o.userData?.buildingFab2Role) return;
            o.updateMatrixWorld(true);
            box.expandByObject(o);
            found++;
        });
        if (!found) return 0;
        const c = box.getCenter(new THREE.Vector3());
        engine.camera.position.set(c.x + dx, dy, c.z + dz);
        engine.camera.lookAt(c.x + lx, ly, c.z + lz);
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(30, { render: true });
        for (const id of ['harness-status', 'harness-log']) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
        return found;
    }, { dx, dy, dz, lx, ly, lz });
    expect(ok).toBeGreaterThan(0);
    await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

test('Capture: AI 512 N-face showcases', async ({ page }) => {
    test.setTimeout(420_000);
    await bootHarness(page, { query: '' });

    await fs.mkdir(OUT_DIR, { recursive: true });
    const scaleRaw = Number(process.env.CAPTURE_SCALE ?? '1');
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.min(scaleRaw, 4) : 1;
    const viewport = { width: Math.round(1280 * scale), height: Math.round(720 * scale) };
    await page.setViewportSize(viewport);

    // Warm-up build (cold caches).
    await loadModel(page, { buildingId: 'l_warehouse', viewport });

    await loadModel(page, { buildingId: 'l_warehouse', viewport });
    // Street corner: faces A (front) and B (right).
    await shoot(page, { name: 'ai512_l_front', dx: 22, dy: 12, dz: 34, ly: 6 });
    // The courtyard: faces D (notch side, painted) and E (notch back,
    // painted + fire escape) — the faces a quad model could not carry.
    await shoot(page, { name: 'ai512_l_courtyard', dx: -20, dy: 10, dz: -30, lx: -3, ly: 5, lz: -5 });
    // Close-up of the concave notch corner join (D meets E at 90° inward).
    await shoot(page, { name: 'ai512_l_notch_corner', dx: -8, dy: 7, dz: -18, lx: 1, ly: 5, lz: -4 });

    await loadModel(page, { buildingId: 'hex_pavilion', viewport });
    // High three-quarter so the hexagonal plan itself reads (three faces
    // and two 120° corners in view).
    await shoot(page, { name: 'ai512_hex_front', dx: 22, dy: 26, dz: 30, ly: 1 });
    // Close-up of one 120° corner join (A meets B).
    await shoot(page, { name: 'ai512_hex_corner', dx: 11, dy: 6, dz: 19, lx: 7, ly: 4.5, lz: 11 });
});
