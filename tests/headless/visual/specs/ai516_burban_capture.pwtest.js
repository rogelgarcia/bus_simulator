// Captures the Burban overall massing and curved-window close-up.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';
import { bootHarness } from './_harness_visual_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../../artifacts/screens/ai516');
const VIEWPORT = { width: 1280, height: 720 };
const SHOTS = Object.freeze([
    { view: 'overall', hdri: true, scenarioId: 'ai516_burban', name: 'burban_overall.png' },
    { view: 'overall', hdri: false, scenarioId: 'ai516_burban_neutral', name: 'burban_overall_neutral.png' },
    { view: 'closeup', hdri: true, scenarioId: 'ai516_burban_closeup', name: 'burban_curved_corner_closeup.png' },
    { view: 'closeup', hdri: false, scenarioId: 'ai516_burban_closeup_neutral', name: 'burban_curved_corner_closeup_neutral.png' }
]);

test('Capture: Burban reference-matching facade', async ({ page }) => {
    test.setTimeout(180_000);
    await bootHarness(page, { query: '' });
    await fs.mkdir(OUT_DIR, { recursive: true });
    await page.setViewportSize(VIEWPORT);
    const cameraByView = new Map();

    for (const shot of SHOTS) {
        await page.evaluate(async ({ scenarioId, viewport }) => {
            window.__testHooks.setViewport(viewport.width, viewport.height);
            await window.__testHooks.loadScenario(scenarioId, { seed: 'burban-reference' });
            window.__testHooks.setFixedDt(1 / 60);
            window.__testHooks.step(30, { render: true });
        }, { scenarioId: shot.scenarioId, viewport: VIEWPORT });

        await page.waitForFunction(() => {
            const scenario = window.__testHooks.getMetrics()?.scenario ?? null;
            const textures = scenario?.textures ?? null;
            return !!scenario?.building?.present
                && !!textures
                && textures.total > 0
                && textures.ready >= textures.total
                && (!scenario.environment?.expected || scenario.environment.present)
                && (!scenario.environment?.backgroundExpected || scenario.environment.backgroundPresent)
                && scenario.ground?.materialId === 'pbr.grass_004'
                && scenario.ground?.floorMapReady
                && scenario.ground?.tileMapReady;
        }, null, { timeout: 60_000, polling: 250 });

        await page.evaluate(() => {
            window.__testHooks.step(30, { render: true });
            const ui = document.getElementById('harness-ui');
            if (ui) ui.style.display = 'none';
        });

        const metrics = await page.evaluate(() => window.__testHooks.getMetrics());
        expect(metrics?.scenario?.building?.present).toBe(true);
        expect(metrics?.scenario?.ground).toMatchObject({
            materialId: 'pbr.grass_004',
            floorMapPresent: true,
            floorMapReady: true,
            tileMapPresent: true,
            tileMapReady: true,
            visibilityBoostApplied: true
        });
        if (shot.hdri) {
            expect(metrics?.scenario?.environment).toMatchObject({
                expected: true,
                present: true,
                backgroundExpected: true,
                backgroundPresent: true,
                iblId: 'ibl.hdri.german_town_street_2k',
                skyDomeVisible: false
            });
        } else {
            expect(metrics?.scenario?.environment).toMatchObject({
                backgroundExpected: false,
                skyDomeVisible: true
            });
        }

        const camera = metrics?.scenario?.camera ?? null;
        expect(camera).not.toBeNull();
        const pairedCamera = cameraByView.get(shot.view) ?? null;
        if (pairedCamera) expect(camera).toEqual(pairedCamera);
        else cameraByView.set(shot.view, camera);
        await page.locator('#harness-canvas').screenshot({ path: path.join(OUT_DIR, shot.name) });
    }
});
