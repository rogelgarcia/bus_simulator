// AI 537 matched before/after UHD captures for Terra & Mar balcony continuity.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REQUESTED_PHASE = String(process.env.AI537_CAPTURE_PHASE ?? '').trim().toLowerCase();
const PHASE = REQUESTED_PHASE === 'before' || REQUESTED_PHASE === 'after'
    ? REQUESTED_PHASE : null;
const OUT_DIR = path.resolve(
    __dirname,
    '../../../artifacts/screens/buildings/ai537-balcony-continuity',
    PHASE ?? '__opt_in__'
);
const VIEWPORT = Object.freeze({ width: 3840, height: 2160 });
const SHOT_FILTER = String(process.env.AI537_CAPTURE_SHOT ?? '').trim();
const COMMON_OPTIONS = Object.freeze({
    seed: 'ai537-terramar-balcony-continuity',
    buildingId: 'terramar',
    waitForGroundTextures: true,
    mergeBuildingGeometry: false,
    groundPresentation: Object.freeze({ color: 0xffffff }),
    lighting: Object.freeze({ hemiIntensity: 1.5, sunIntensity: 5.5 }),
    sun: Object.freeze({ azimuthDeg: 55, elevationDeg: 38 }),
    hdri: Object.freeze({
        iblId: 'ibl.hdri.german_town_street_2k',
        envMapIntensity: 0.84,
        backgroundBlurriness: 0,
        backgroundIntensity: 0.9,
        backgroundRotationDeg: 212,
        environmentRotationDeg: 126
    })
});
const SHOTS = Object.freeze([
    {
        name: 'front-balconies.png',
        position: Object.freeze({ x: 0, y: 0.61, z: 1.25 }),
        target: Object.freeze({ x: 0, y: 0.59, z: 0.45 })
    },
    {
        name: 'right-corner-closeup.png',
        position: Object.freeze({ x: -0.67, y: 0.61, z: 0.72 }),
        target: Object.freeze({ x: -0.4, y: 0.59, z: 0.4 })
    },
    {
        name: 'left-corner-closeup.png',
        position: Object.freeze({ x: 0.67, y: 0.61, z: 0.72 }),
        target: Object.freeze({ x: 0.4, y: 0.59, z: 0.4 })
    },
    {
        name: 'low-angle-corner.png',
        position: Object.freeze({ x: -0.65, y: 0.35, z: 0.72 }),
        target: Object.freeze({ x: -0.34, y: 0.6, z: 0.4 })
    },
    {
        name: 'rear-right-corner-closeup.png',
        position: Object.freeze({ x: 0.67, y: 0.61, z: -0.72 }),
        target: Object.freeze({ x: 0.4, y: 0.59, z: -0.4 })
    }
]);

async function loadShot(page, shot) {
    await page.evaluate(async ({ viewport, common, camera, phase }) => {
        window.__testHooks.setViewport(viewport.width, viewport.height);
        let configOverrides = null;
        if (phase === 'before') {
            const { TERRA_MAR_BUILDING_CONFIG } = await import('/src/graphics/content3d/buildings/configs/terramar.js');
            const layers = structuredClone(TERRA_MAR_BUILDING_CONFIG.layers).map((layer) => {
                delete layer.balconyContinuity;
                return layer;
            });
            configOverrides = { layers };
        }
        await Promise.race([
            window.__testHooks.loadScenario('building_showcase', {
                ...common,
                ...(configOverrides ? { configOverrides } : {}),
                cameraDir: { x: 0, y: 0.04, z: 1 },
                cameraPadding: 0.8,
                cameraTargetYFrac: camera.target.y
            }),
            new Promise((_, reject) => setTimeout(
                () => reject(new Error('building_showcase load timed out after 120s')),
                120_000
            ))
        ]);
        window.__testHooks.setFixedDt(1 / 60);
        window.__testHooks.step(5, { render: true });
    }, { viewport: VIEWPORT, common: COMMON_OPTIONS, camera: shot, phase: PHASE });

    await page.waitForFunction(() => {
        const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
        const textures = scenario?.textures ?? null;
        return !!scenario?.building?.present
            && !!textures
            && textures.total > 0
            && textures.ready >= textures.total
            && scenario.environment?.present === true
            && scenario.environment?.backgroundPresent === true
            && scenario.ground?.floorMapReady === true
            && scenario.ground?.tileMapReady === true;
    }, null, { timeout: 90_000, polling: 250 });

    await page.evaluate(() => {
        window.__testHooks.step(30, { render: true });
        const ui = document.getElementById('harness-ui');
        if (ui) ui.style.display = 'none';
    });

    await page.evaluate(async ({ buildingId, camera }) => {
        const THREE = await import('three');
        const engine = window.__testHooks.getEngine();
        const building = engine.scene.getObjectByName(`showcase_${buildingId}`);
        building.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(building);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const resolve = (point) => new THREE.Vector3(
            center.x + point.x * size.x,
            box.min.y + point.y * size.y,
            center.z + point.z * size.z
        );
        engine.camera.position.copy(resolve(camera.position));
        engine.camera.lookAt(resolve(camera.target));
        engine.camera.updateMatrixWorld(true);
        window.__testHooks.step(5, { render: true });
    }, { buildingId: COMMON_OPTIONS.buildingId, camera: shot });
}

function readPngDimensions(bytes) {
    return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20)
    };
}

test(`Capture: AI 537 Terra & Mar ${PHASE ?? 'opt-in'} balcony closeups`, async ({ page }) => {
    test.skip(
        !PHASE,
        'Set AI537_CAPTURE_PHASE=before or AI537_CAPTURE_PHASE=after to generate evidence artifacts.'
    );
    test.setTimeout(600_000);
    await bootHarness(page, { query: '' });
    await fs.mkdir(OUT_DIR, { recursive: true });
    await page.setViewportSize(VIEWPORT);
    const cameraPoses = [];

    const shots = SHOT_FILTER ? SHOTS.filter((shot) => shot.name === SHOT_FILTER) : SHOTS;
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
        await loadShot(page, shot);
        const metrics = await page.evaluate(() => window.__testHooks.getMetrics());
        expect(metrics?.scenarioId).toBe('building_showcase');
        expect(metrics?.scenario?.buildingId).toBe('terramar');
        expect(metrics?.scenario?.environment).toMatchObject({
            expected: true,
            present: true,
            backgroundExpected: true,
            backgroundPresent: true,
            iblId: 'ibl.hdri.german_town_street_2k'
        });

        if (PHASE === 'after') {
            const emittedLinkIds = await page.evaluate((buildingId) => {
                const engine = window.__testHooks.getEngine();
                const building = engine.scene.getObjectByName(`showcase_${buildingId}`);
                const ids = new Set();
                building?.traverse?.((object) => {
                    for (const id of object?.userData?.balconyContinuityLinkIds ?? []) ids.add(id);
                });
                return [...ids].sort();
            }, COMMON_OPTIONS.buildingId);
            expect(emittedLinkIds).toEqual([
                'b8_residential_front_to_left_chamfer',
                'b8_residential_front_to_right_chamfer',
                'b8_residential_rear_to_right_chamfer'
            ]);
        }

        const pose = metrics?.scenario?.camera?.position ?? null;
        expect(pose).not.toBeNull();
        expect(cameraPoses).not.toContainEqual(pose);
        cameraPoses.push(pose);

        const outputPath = path.join(OUT_DIR, shot.name);
        await page.locator('#harness-canvas').screenshot({ path: outputPath });
        expect(readPngDimensions(await fs.readFile(outputPath))).toEqual(VIEWPORT);
    }

    await fs.writeFile(
        path.join(OUT_DIR, 'manifest.json'),
        JSON.stringify({ phase: PHASE, viewport: VIEWPORT, shots, cameraPoses }, null, 2),
        'utf8'
    );
});
