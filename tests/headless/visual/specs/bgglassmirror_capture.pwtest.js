// Captures the BG Glass Mirror reference poses with one visible HDRI used for both background and reflections.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings/bgglassmirror');
const captureScale = Math.max(1, Math.min(3, Number(process.env.BGGLASSMIRROR_CAPTURE_SCALE) || 3));
const VIEWPORT = Object.freeze({ width: Math.round(1280 * captureScale), height: Math.round(720 * captureScale) });
const HDRI = Object.freeze({
    iblId: 'ibl.hdri.german_town_street_2k',
    envMapIntensity: 0.82,
    backgroundBlurriness: 0,
    backgroundIntensity: 0.88,
    backgroundRotationDeg: 215,
    environmentRotationDeg: 125
});
const COMMON_OPTIONS = Object.freeze({
    seed: 'bgglassmirror-reference',
    buildingId: 'bgglassmirror',
    waitForGroundTextures: true,
    groundPresentation: Object.freeze({ color: 0xffffff }),
    lighting: Object.freeze({ hemiIntensity: 1.46, sunIntensity: 5.75 }),
    sun: Object.freeze({ azimuthDeg: 55, elevationDeg: 38 }),
    hdri: HDRI
});
const SHOTS = Object.freeze([
    {
        name: 'front.png',
        cameraDir: Object.freeze({ x: 0, y: 0.02, z: 1 }),
        cameraPadding: 1.06,
        cameraTargetYFrac: 0.5
    },
    {
        name: 'three-quarter.png',
        cameraDir: Object.freeze({ x: -0.72, y: 0.16, z: 1 }),
        cameraPadding: 1.1,
        cameraTargetYFrac: 0.49
    },
    {
        name: 'low-angle-closeup.png',
        cameraDir: Object.freeze({ x: -0.28, y: -0.38, z: 1 }),
        cameraPadding: 0.72,
        cameraTargetYFrac: 0.52
    }
]);

async function loadShot(page, shot) {
    console.log(`[bgglassmirror_capture] loading ${shot.name} at ${VIEWPORT.width}x${VIEWPORT.height}`);
    await page.evaluate(async ({ viewport, common, camera }) => {
        window.__testHooks.setViewport(viewport.width, viewport.height);
        await Promise.race([
            window.__testHooks.loadScenario('building_showcase', {
                ...common,
                cameraDir: camera.cameraDir,
                cameraPadding: camera.cameraPadding,
                cameraTargetYFrac: camera.cameraTargetYFrac
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('building_showcase load timed out after 120s')), 120_000))
        ]);
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { viewport: VIEWPORT, common: COMMON_OPTIONS, camera: shot });
    console.log(`[bgglassmirror_capture] scenario loaded for ${shot.name}`);

    await page.waitForFunction(() => {
        const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
        const textures = scenario?.textures ?? null;
        return !!scenario?.building?.present
            && !!textures
            && textures.total > 0
            && textures.ready >= textures.total
            && scenario.environment?.expected === true
            && scenario.environment?.present === true
            && scenario.environment?.backgroundExpected === true
            && scenario.environment?.backgroundPresent === true
            && scenario.environment?.iblId === 'ibl.hdri.german_town_street_2k'
            && scenario.ground?.floorMapReady === true
            && scenario.ground?.tileMapReady === true;
    }, null, { timeout: 90_000, polling: 250 });

    await page.evaluate(() => {
        window.__testHooks.step(30, { render: true });
        const ui = document.getElementById('harness-ui');
        if (ui) ui.style.display = 'none';
    });
    console.log(`[bgglassmirror_capture] textures and HDRI ready for ${shot.name}`);
}

function readPngDimensions(bytes) {
    return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20)
    };
}

test('Capture: BG Glass Mirror UHD HDRI reference poses', async ({ page }) => {
    test.setTimeout(600_000);
    page.on('pageerror', (error) => console.log(`[browser:pageerror] ${error.message}`));
    page.on('requestfailed', (request) => console.log(`[browser:requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`));
    await bootHarness(page, { query: '' });
    await fs.mkdir(OUT_DIR, { recursive: true });
    await page.setViewportSize(VIEWPORT);
    const cameraPoses = [];

    for (const shot of SHOTS) {
        await loadShot(page, shot);
        const metrics = await page.evaluate(() => window.__testHooks.getMetrics());
        expect(metrics?.scenarioId).toBe('building_showcase');
        expect(metrics?.scenario?.buildingId).toBe('bgglassmirror');
        expect(metrics?.scenario?.building?.present).toBe(true);
        expect(metrics?.scenario?.environment).toMatchObject({
            expected: true,
            present: true,
            backgroundExpected: true,
            backgroundPresent: true,
            iblId: 'ibl.hdri.german_town_street_2k',
            skyDomeVisible: false
        });
        expect(metrics?.scenario?.ground).toMatchObject({
            materialId: 'pbr.grass_004',
            floorMapPresent: true,
            floorMapReady: true,
            tileMapPresent: true,
            tileMapReady: true,
            visibilityBoostApplied: true
        });

        const pose = metrics?.scenario?.camera?.position ?? null;
        expect(pose).not.toBeNull();
        expect(cameraPoses).not.toContainEqual(pose);
        cameraPoses.push(pose);

        const outputPath = path.join(OUT_DIR, shot.name);
        await page.locator('#harness-canvas').screenshot({ path: outputPath });
        expect(readPngDimensions(await fs.readFile(outputPath))).toEqual(VIEWPORT);
    }
});
