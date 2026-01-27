// Headless browser tests: road markings visibility regression guard.
import test, { expect } from '@playwright/test';

async function attachFailFastConsole({ page }) {
    const errors = [];
    await page.addInitScript(() => {
        window.__e2eErrors = [];
        window.addEventListener('unhandledrejection', (e) => {
            const msg = e?.reason?.message ?? String(e?.reason ?? 'unhandledrejection');
            window.__e2eErrors.push({ kind: 'unhandledrejection', message: msg });
        });
    });
    page.on('pageerror', (err) => {
        errors.push({ kind: 'pageerror', message: err?.message ?? String(err) });
    });
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        const allow = [
            'ResizeObserver loop limit exceeded'
        ];
        if (allow.some((s) => text.includes(s))) return;
        errors.push({ kind: 'console.error', message: text });
    });
    page.on('requestfailed', (req) => {
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        errors.push({ kind: 'requestfailed', message: `${req.url()} (${type})` });
    });
    page.on('response', (res) => {
        const req = res.request();
        const type = req.resourceType();
        if (type !== 'script' && type !== 'document') return;
        const status = res.status();
        if (status < 400) return;
        errors.push({ kind: 'http', message: `${status} ${res.url()} (${type})` });
    });
    return async () => {
        const fromPage = await page.evaluate(() => Array.isArray(window.__e2eErrors) ? window.__e2eErrors : []);
        return [...errors, ...fromPage];
    };
}

test('Roads: markings are visible (pixel diff when toggled off)', async ({ page }, testInfo) => {
    const getErrors = await attachFailFastConsole({ page });
    await page.goto('tests/headless/harness/index.html');
    await page.waitForFunction(() => window.__testHooks && window.__testHooks.version === 1);

    const run = async (scenarioId, seed) => page.evaluate(async (args) => {
        const { scenarioId, seed } = args;
        const viewport = { width: 960, height: 540 };
        window.__testHooks.setViewport(viewport.width, viewport.height);
        window.__testHooks.setFixedDt(1 / 60);

        await window.__testHooks.loadScenario(scenarioId, { seed });
        window.__testHooks.step(40, { render: true });

        const hooks = window.__testHooks;
        const hasStats = typeof hooks.getSceneObjectStatsByName === 'function';
        const hasToggleGroup = typeof hooks.setSceneObjectVisibleByName === 'function';
        const hasToggleOverlay = typeof hooks.setRoadMarkingsOverlayEnabled === 'function';
        if (!hasStats || !hasToggleGroup || !hasToggleOverlay) {
            throw new Error('Missing harness scene hooks (getSceneObjectStatsByName / setSceneObjectVisibleByName / setRoadMarkingsOverlayEnabled)');
        }

        const asphaltStats = hooks.getSceneObjectStatsByName('Asphalt');
        const markingsWhiteStats = hooks.getSceneObjectStatsByName('MarkingsWhite');
        const markingsYellowStats = hooks.getSceneObjectStatsByName('MarkingsYellow');
        const laneArrowsStats = hooks.getSceneObjectStatsByName('LaneArrows');
        const crosswalksStats = hooks.getSceneObjectStatsByName('Crosswalks');
        const markingMeshCount = (markingsWhiteStats?.count ?? 0)
            + (markingsYellowStats?.count ?? 0)
            + (laneArrowsStats?.count ?? 0)
            + (crosswalksStats?.count ?? 0);

        const canvas = document.getElementById('harness-canvas');
        if (!canvas) throw new Error('Missing #harness-canvas');

        const w = Math.max(1, canvas.width | 0);
        const h = Math.max(1, canvas.height | 0);
        const roi = {
            x: 0,
            y: Math.max(0, Math.min(h - 1, Math.floor(h * 0.28))),
            w,
            h: Math.max(1, Math.min(h, Math.floor(h * 0.70)))
        };

        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;

        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Missing offscreen 2D context');

        const grab = () => {
            try {
                ctx.drawImage(canvas, 0, 0);
                return ctx.getImageData(roi.x, roi.y, roi.w, roi.h).data;
            } catch (err) {
                const msg = err?.message ?? String(err);
                throw new Error(`Canvas readback failed: ${msg}`);
            }
        };

        const perPixelThreshold = 25;
        const stableThreshold = 120;
        const countChangedPixels = (a, b) => {
            let changed = 0;
            const len = Math.min(a?.length ?? 0, b?.length ?? 0);
            for (let i = 0; i + 2 < len; i += 4) {
                const d = Math.abs(a[i] - b[i])
                    + Math.abs(a[i + 1] - b[i + 1])
                    + Math.abs(a[i + 2] - b[i + 2]);
                if (d >= perPixelThreshold) changed += 1;
            }
            return changed;
        };

        // Wait for one-time async texture loads (grass/IBL) to settle so diffs
        // are attributable to markings visibility, not late-loading assets.
        hooks.setSceneObjectVisibleByName('Markings', true);
        const overlayMaterialCount = hooks.setRoadMarkingsOverlayEnabled(true);
        hooks.renderFrame();

        let baselineA = grab();
        let stabilized = false;
        let baselineDiff = null;
        let stabilizeFrames = 0;
        const maxStabilizeFrames = 120;
        for (let i = 0; i < maxStabilizeFrames; i++) {
            hooks.renderFrame();
            const baselineB = grab();
            baselineDiff = countChangedPixels(baselineA, baselineB);
            baselineA = baselineB;
            stabilizeFrames = i + 1;
            if (baselineDiff <= stableThreshold) {
                stabilized = true;
                break;
            }
        }

        const before = baselineA;
        const toggledGroupCount = hooks.setSceneObjectVisibleByName('Markings', false);
        const toggledOverlayCount = hooks.setRoadMarkingsOverlayEnabled(false);
        hooks.renderFrame();
        const after = grab();
        hooks.setSceneObjectVisibleByName('Markings', true);
        hooks.setRoadMarkingsOverlayEnabled(true);
        hooks.renderFrame();

        const changedPixels = countChangedPixels(before, after);

        return {
            viewport,
            roi,
            asphaltStats,
            markingMeshCount,
            overlayMaterialCount,
            toggledGroupCount,
            toggledOverlayCount,
            changedPixels,
            stabilized,
            baselineDiff,
            stabilizeFrames
        };
    }, { scenarioId, seed });

    const canvas = page.locator('#harness-canvas');
    await expect(canvas).toBeVisible();

    const captureToggle = async (scenarioId) => {
        await canvas.screenshot({ path: testInfo.outputPath(`${scenarioId}__markings_on.png`) });
        await page.evaluate(() => {
            window.__testHooks.setSceneObjectVisibleByName('Markings', false);
            window.__testHooks.setRoadMarkingsOverlayEnabled(false);
            window.__testHooks.renderFrame();
        });
        await canvas.screenshot({ path: testInfo.outputPath(`${scenarioId}__markings_off.png`) });
        await page.evaluate(() => {
            window.__testHooks.setSceneObjectVisibleByName('Markings', true);
            window.__testHooks.setRoadMarkingsOverlayEnabled(true);
            window.__testHooks.renderFrame();
        });
    };

    const base = await run('city_straight_road', 'markings-visible');
    await captureToggle('city_straight_road');
    const textured = await run('road_markings_textured_asphalt', 'markings-textured');
    await captureToggle('road_markings_textured_asphalt');

    for (const res of [base, textured]) {
        expect(res.asphaltStats?.count ?? 0).toBeGreaterThan(0);
        expect((res.markingMeshCount ?? 0) + (res.overlayMaterialCount ?? 0)).toBeGreaterThan(0);
        expect(res.stabilized).toBe(true);
        expect(res.baselineDiff).toBeLessThanOrEqual(120);
        expect(res.changedPixels).toBeGreaterThan(500);
    }
    expect(await getErrors()).toEqual([]);
});
