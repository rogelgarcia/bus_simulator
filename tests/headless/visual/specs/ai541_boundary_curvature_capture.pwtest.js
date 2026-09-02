// Opt-in UHD evidence capture for AI 541 bay-boundary curvature.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENABLED = process.env.AI541_CAPTURE === '1';
const SHOT_FILTER = String(process.env.AI541_CAPTURE_SHOT ?? '').trim();
const OUT_DIR = path.resolve(
    __dirname,
    '../../../artifacts/screens/ai541-bay-boundary-curvature'
);
const VIEWPORT = Object.freeze({ width: 3840, height: 2160 });
const COMMON = Object.freeze({
    seed: 'ai541-boundary-showcase',
    waitForGroundTextures: true,
    mergeBuildingGeometry: false,
    groundPresentation: Object.freeze({ color: 0xffffff }),
    lighting: Object.freeze({ hemiIntensity: 1.5, sunIntensity: 5.2 }),
    sun: Object.freeze({ azimuthDeg: 48, elevationDeg: 36 }),
    hdri: Object.freeze({
        iblId: 'ibl.hdri.german_town_street_2k',
        envMapIntensity: 0.86,
        backgroundBlurriness: 0,
        backgroundIntensity: 0.92,
        backgroundRotationDeg: 212,
        environmentRotationDeg: 126
    })
});
const SHOTS = Object.freeze([
    {
        name: 'sharp-front-before.png',
        buildingId: 'ai541_boundary_showcase_sharp',
        position: { x: 0, y: 0.58, z: 1.35 },
        target: { x: 0, y: 0.48, z: 0.35 }
    },
    {
        name: 'rounded-front-after.png',
        buildingId: 'ai541_boundary_showcase_rounded',
        position: { x: 0, y: 0.58, z: 1.35 },
        target: { x: 0, y: 0.48, z: 0.35 }
    },
    {
        name: 'rounded-three-quarter.png',
        buildingId: 'ai541_boundary_showcase_rounded',
        position: { x: 0.72, y: 0.62, z: 1.12 },
        target: { x: 0.18, y: 0.48, z: 0.22 }
    },
    {
        name: 'rounded-cross-face-corner-closeup.png',
        buildingId: 'ai541_boundary_showcase_rounded',
        position: { x: 0.82, y: 0.62, z: 0.78 },
        target: { x: 0.43, y: 0.52, z: 0.43 }
    },
    {
        name: 'rounded-sloped-windows-closeup.png',
        buildingId: 'ai541_boundary_showcase_rounded',
        position: { x: -0.08, y: 0.46, z: 0.92 },
        target: { x: 0, y: 0.46, z: 0.43 }
    },
    {
        name: 'rounded-plan-overlay.png',
        buildingId: 'ai541_boundary_showcase_rounded',
        position: { x: 0, y: 1.75, z: 0.08 },
        target: { x: 0, y: 0.18, z: 0 }
    },
    {
        name: 'final-showcase.png',
        buildingId: 'ai541_boundary_showcase_rounded',
        position: { x: -0.64, y: 0.42, z: 1.08 },
        target: { x: -0.08, y: 0.58, z: 0.2 }
    }
]);

function readPngDimensions(bytes) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function loadShot(page, shot) {
    await page.evaluate(async ({ viewport, common, shotValue }) => {
        window.__testHooks.setViewport(viewport.width, viewport.height);
        await window.__testHooks.loadScenario('building_showcase', {
            ...common,
            buildingId: shotValue.buildingId,
            cameraDir: { x: 0, y: 0.1, z: 1 },
            cameraPadding: 0.9,
            cameraTargetYFrac: shotValue.target.y
        });
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { viewport: VIEWPORT, common: COMMON, shotValue: shot });

    await page.waitForFunction(() => {
        const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
        const textures = scenario?.textures ?? null;
        return !!scenario?.building?.present
            && !!textures
            && textures.total > 0
            && textures.ready >= textures.total
            && scenario.environment?.present === true
            && scenario.environment?.backgroundPresent === true;
    }, null, { timeout: 90_000, polling: 250 });

    await page.evaluate(async ({ shotValue }) => {
        const THREE = await import('three');
        const engine = window.__testHooks.getEngine();
        const building = engine.scene.getObjectByName(`showcase_${shotValue.buildingId}`);
        building.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(building);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const resolve = (point) => new THREE.Vector3(
            center.x + point.x * size.x,
            box.min.y + point.y * size.y,
            center.z + point.z * size.z
        );
        engine.camera.position.copy(resolve(shotValue.position));
        engine.camera.lookAt(resolve(shotValue.target));
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(30, { render: true });
        const ui = document.getElementById('harness-ui');
        if (ui) ui.style.display = 'none';
    }, { shotValue: shot });
}

test('Capture: AI 541 matched sharp/rounded showcase with HDRI', async ({ page }) => {
    test.skip(!ENABLED, 'Set AI541_CAPTURE=1 to generate AI 541 evidence.');
    test.setTimeout(900_000);
    await bootHarness(page, { query: '' });
    await fs.mkdir(OUT_DIR, { recursive: true });
    await page.setViewportSize(VIEWPORT);
    const manifest = [];

    const shots = SHOT_FILTER
        ? SHOTS.filter((shot) => shot.name.includes(SHOT_FILTER))
        : SHOTS;
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
        await loadShot(page, shot);
        const metrics = await page.evaluate(() => window.__testHooks.getMetrics());
        expect(metrics?.scenario?.buildingId).toBe(shot.buildingId);
        expect(metrics?.scenario?.environment).toMatchObject({
            present: true,
            backgroundPresent: true,
            iblId: 'ibl.hdri.german_town_street_2k'
        });
        const outputPath = path.join(OUT_DIR, shot.name);
        await page.locator('#harness-canvas').screenshot({ path: outputPath });
        expect(readPngDimensions(await fs.readFile(outputPath))).toEqual(VIEWPORT);
        manifest.push({ ...shot, camera: metrics?.scenario?.camera ?? null });
    }

    await fs.writeFile(
        path.join(OUT_DIR, 'manifest.json'),
        JSON.stringify({ viewport: VIEWPORT, hdri: COMMON.hdri, shots: manifest }, null, 2),
        'utf8'
    );
});
