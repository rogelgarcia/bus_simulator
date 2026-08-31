// Captures Terra & Mar with one visible HDRI used for both background and reflections.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/buildings/terramar');
const REFERENCE_SOURCE = path.resolve(__dirname, '../../../../downloads/references_ideas/b8.png');
const REFERENCE_DIR = path.join(OUT_DIR, 'references');
const REFERENCE_SHA256 = 'EA6A43791C68CA199D43869833B8A7BC16AF7927FEC7010AD5147A47095D160B';
const REFERENCE_BYTES = 2_555_434;
const VIEWPORT = Object.freeze({ width: 3840, height: 2160 });
const HDRI = Object.freeze({
    iblId: 'ibl.hdri.german_town_street_2k',
    envMapIntensity: 0.84,
    backgroundBlurriness: 0,
    backgroundIntensity: 0.9,
    backgroundRotationDeg: 212,
    environmentRotationDeg: 126
});
const COMMON_OPTIONS = Object.freeze({
    seed: 'terramar-reference',
    buildingId: 'terramar',
    waitForGroundTextures: true,
    groundPresentation: Object.freeze({ color: 0xffffff }),
    lighting: Object.freeze({ hemiIntensity: 1.5, sunIntensity: 5.5 }),
    sun: Object.freeze({ azimuthDeg: 55, elevationDeg: 38 }),
    hdri: HDRI
});
const SHOTS = Object.freeze([
    {
        name: 'front.png',
        cameraDir: Object.freeze({ x: 0, y: 0.02, z: 1 }),
        cameraPadding: 1.05,
        cameraTargetYFrac: 0.48
    },
    {
        name: 'three-quarter.png',
        cameraDir: Object.freeze({ x: -0.72, y: 0.12, z: 1 }),
        cameraPadding: 1.08,
        cameraTargetYFrac: 0.47
    },
    {
        name: 'low-angle-closeup.png',
        cameraDir: Object.freeze({ x: -0.3, y: -0.42, z: 1 }),
        cameraPadding: 0.7,
        cameraTargetYFrac: 0.52
    },
    {
        name: 'entrance-detail.png',
        cameraDir: Object.freeze({ x: -0.35, y: 0.1, z: 1 }),
        cameraPadding: 0.38,
        cameraTargetYFrac: 0.13
    }
]);

async function preserveReferenceCopy() {
    const bytes = await fs.readFile(REFERENCE_SOURCE);
    expect(bytes.byteLength).toBe(REFERENCE_BYTES);
    expect(createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(REFERENCE_SHA256);
    await fs.mkdir(REFERENCE_DIR, { recursive: true });
    await fs.copyFile(REFERENCE_SOURCE, path.join(REFERENCE_DIR, 'b8.png'));
}

async function loadShot(page, shot) {
    console.log(`[terramar_capture] loading ${shot.name} at ${VIEWPORT.width}x${VIEWPORT.height}`);
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
            && typeof scenario.environment?.hdrUrl === 'string'
            && scenario.environment.hdrUrl.length > 0
            && scenario.ground?.floorMapReady === true
            && scenario.ground?.tileMapReady === true;
    }, null, { timeout: 90_000, polling: 250 });

    await page.evaluate(() => {
        window.__testHooks.step(30, { render: true });
        const ui = document.getElementById('harness-ui');
        if (ui) ui.style.display = 'none';
    });
}

function readPngDimensions(bytes) {
    return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20)
    };
}

test('Capture: Terra & Mar UHD HDRI reference poses', async ({ page }) => {
    test.setTimeout(600_000);
    page.on('pageerror', (error) => console.log(`[browser:pageerror] ${error.message}`));
    page.on('requestfailed', (request) => console.log(`[browser:requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`));
    await bootHarness(page, { query: '' });
    await fs.mkdir(OUT_DIR, { recursive: true });
    await preserveReferenceCopy();
    await page.setViewportSize(VIEWPORT);
    const cameraPoses = [];

    for (const shot of SHOTS) {
        await loadShot(page, shot);
        const metrics = await page.evaluate(() => window.__testHooks.getMetrics());
        expect(metrics?.scenarioId).toBe('building_showcase');
        expect(metrics?.scenario?.buildingId).toBe('terramar');
        expect(metrics?.scenario?.building?.present).toBe(true);
        expect(metrics?.scenario?.environment).toMatchObject({
            expected: true,
            present: true,
            backgroundExpected: true,
            backgroundPresent: true,
            iblId: 'ibl.hdri.german_town_street_2k',
            skyDomeVisible: false
        });
        expect(metrics?.scenario?.environment?.hdrUrl).toBeTruthy();
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
