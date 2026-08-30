// Headless coverage for retained visible-scene depth in the AO receiver mask.
import test, { expect } from '@playwright/test';

const BASE_QUERY = 'ibl=0&bloom=0&sunBloom=0&grade=off&aa=fxaa&ao=off&shadows=off';

function attachRuntimeErrors(page) {
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error?.stack || error?.message || error)));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    return () => errors.slice();
}

async function prepareScenario(page, options = {}) {
    await page.goto(`/tests/headless/harness/index.html?${BASE_QUERY}`);
    await page.waitForFunction(() => window.__testHooks?.version === 1);
    await page.evaluate(async (scenarioOptions) => {
        const hooks = window.__testHooks;
        hooks.setViewport(960, 540);
        hooks.setFixedDt(1 / 60);
        hooks.setAntiAliasingSettings({ mode: 'fxaa', fxaa: { edgeThreshold: 0.2 } });
        await hooks.loadScenario('ao_exclusion_depth_reuse', scenarioOptions);
        hooks.setAmbientOcclusionSettings({
            mode: 'gtao',
            alpha: { handling: 'exclude', threshold: 0.5 },
            staticAo: { mode: 'off' },
            busContactShadow: { enabled: false },
            gtao: {
                intensity: 1.05,
                radius: 0.75,
                quality: 'high',
                denoise: true,
                debugView: false,
                updateMode: 'every_frame',
                motionThreshold: { positionMeters: 0, rotationDeg: 0, fovDeg: 0 }
            }
        });
        hooks.step(10, { dt: 1 / 60, render: true });
    }, options);
}

test('AO exclusion mask: retained depth matches legacy while submitting only receivers', async ({ page }, testInfo) => {
    const getErrors = attachRuntimeErrors(page);
    await prepareScenario(page);

    const legacyPath = testInfo.outputPath('ao-mask-legacy.png');
    const optimizedPath = testInfo.outputPath('ao-mask-retained-depth.png');

    const comparison = await page.evaluate(() => {
        const hooks = window.__testHooks;
        const engine = hooks.getEngine();
        const pipeline = engine?._post?.pipeline;
        const canvas = document.getElementById('harness-canvas');
        const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
        if (!pipeline || !canvas || !gl) throw new Error('Missing pipeline or WebGL context');

        const capture = () => {
            const pixels = new Uint8Array(canvas.width * canvas.height * 4);
            gl.finish();
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return pixels;
        };

        pipeline.setAoExclusionDepthReuseEnabledForDebug(false);
        hooks.step(6, { dt: 1 / 60, render: true });
        const legacyPixels = capture();
        const legacy = hooks.getAmbientOcclusionDebugInfo()?.alpha?.frameStats ?? null;

        pipeline.setAoExclusionDepthReuseEnabledForDebug(true);
        hooks.step(6, { dt: 1 / 60, render: true });
        const optimizedPixels = capture();
        const optimized = hooks.getAmbientOcclusionDebugInfo()?.alpha?.frameStats ?? null;

        let sumError = 0;
        let maxError = 0;
        let changedPixels = 0;
        for (let index = 0; index < legacyPixels.length; index += 4) {
            let pixelMax = 0;
            for (let channel = 0; channel < 3; channel += 1) {
                const error = Math.abs(legacyPixels[index + channel] - optimizedPixels[index + channel]);
                sumError += error;
                pixelMax = Math.max(pixelMax, error);
                maxError = Math.max(maxError, error);
            }
            if (pixelMax > 4) changedPixels += 1;
        }

        return {
            legacy,
            optimized,
            meanAbsoluteError: sumError / Math.max(1, canvas.width * canvas.height * 3),
            maxError,
            changedPixelRatio: changedPixels / Math.max(1, canvas.width * canvas.height),
            scenario: hooks.getMetrics()?.scenario ?? null
        };
    });

    await page.locator('#harness-canvas').screenshot({ path: optimizedPath });
    await testInfo.attach('ao-mask-retained-depth.png', { path: optimizedPath, contentType: 'image/png' });

    await page.evaluate(() => {
        const hooks = window.__testHooks;
        const pipeline = hooks.getEngine()?._post?.pipeline;
        pipeline?.setAoExclusionDepthReuseEnabledForDebug?.(false);
        hooks.step(3, { dt: 1 / 60, render: true });
    });
    await page.locator('#harness-canvas').screenshot({ path: legacyPath });
    await testInfo.attach('ao-mask-legacy.png', { path: legacyPath, contentType: 'image/png' });

    expect(comparison.scenario?.mixedMaterialGroups).toBe(2);
    expect(comparison.legacy?.maskStrategy).toBe('legacy_full_scene');
    expect(comparison.legacy?.fallbackReason).toBe('depth_reuse_disabled');
    expect(comparison.optimized?.maskStrategy).toBe('retained_depth_receivers_only');
    expect(comparison.optimized?.retainedDepthUsed).toBe(true);
    expect(comparison.optimized?.maskCandidateObjects).toBe(4);
    expect(comparison.optimized?.maskCandidateGroups).toBe(4);
    expect(comparison.optimized?.maskCalls).toBeLessThanOrEqual(comparison.optimized?.maskCandidateGroups ?? 0);
    expect(comparison.optimized?.maskCalls).toBeLessThan(comparison.legacy?.maskCalls ?? 0);
    expect(comparison.optimized?.maskTriangles).toBeLessThan(comparison.legacy?.maskTriangles ?? 0);
    expect(comparison.meanAbsoluteError).toBeLessThan(0.35);
    expect(comparison.maxError).toBeLessThanOrEqual(8);
    expect(comparison.changedPixelRatio).toBeLessThan(0.002);
    expect(getErrors()).toEqual([]);
});

test('AO exclusion mask: empty receiver set skips rendering', async ({ page }) => {
    const getErrors = attachRuntimeErrors(page);
    await prepareScenario(page, { receiversVisible: false });

    const stats = await page.evaluate(() => {
        const hooks = window.__testHooks;
        hooks.getEngine()?._post?.pipeline?.setAoExclusionDepthReuseEnabledForDebug?.(true);
        hooks.step(3, { dt: 1 / 60, render: true });
        return hooks.getAmbientOcclusionDebugInfo()?.alpha?.frameStats ?? null;
    });

    expect(stats?.maskStrategy).toBe('empty');
    expect(stats?.maskCandidateObjects).toBe(0);
    expect(stats?.maskCalls).toBe(0);
    expect(stats?.maskTriangles).toBe(0);
    expect(stats?.maskRendered).toBe(false);
    expect(stats?.maskSkipped).toBe(true);
    expect(getErrors()).toEqual([]);
});

test('AO exclusion mask: resize, TAA, SSAO, and resolved MSAA depth remain valid', async ({ page }) => {
    const getErrors = attachRuntimeErrors(page);
    await prepareScenario(page);

    const results = await page.evaluate(() => {
        const hooks = window.__testHooks;
        const pipeline = hooks.getEngine()?._post?.pipeline;
        pipeline?.setAoExclusionDepthReuseEnabledForDebug?.(true);

        hooks.setViewport(800, 450);
        hooks.setAntiAliasingSettings({
            mode: 'taa',
            taa: { jitter: 0.75, historyWeight: 0.85, clampStrength: 1.0 }
        });
        hooks.step(5, { dt: 1 / 60, render: true });
        const taa = {
            aa: hooks.getAntiAliasingDebugInfo(),
            mask: hooks.getAmbientOcclusionDebugInfo()?.alpha?.frameStats ?? null
        };

        hooks.setAmbientOcclusionSettings({
            mode: 'ssao',
            alpha: { handling: 'exclude', threshold: 0.5 },
            staticAo: { mode: 'off' },
            busContactShadow: { enabled: false },
            ssao: { intensity: 0.8, radius: 8, quality: 'high' }
        });
        hooks.step(4, { dt: 1 / 60, render: true });
        const ssao = hooks.getAmbientOcclusionDebugInfo()?.alpha?.frameStats ?? null;

        hooks.setAntiAliasingSettings({ mode: 'msaa', msaa: { samples: 4 } });
        hooks.step(4, { dt: 1 / 60, render: true });
        const msaa = {
            aa: hooks.getAntiAliasingDebugInfo(),
            mask: hooks.getAmbientOcclusionDebugInfo()?.alpha?.frameStats ?? null
        };
        return { taa, ssao, msaa };
    });

    expect(results.taa.aa?.activeMode).toBe('taa');
    expect(results.taa.mask?.maskStrategy).toBe('retained_depth_receivers_only');
    expect(results.taa.mask?.retainedDepthUsed).toBe(true);
    expect(results.ssao?.maskStrategy).toBe('retained_depth_receivers_only');
    expect(results.msaa.mask?.maskStrategy).toBe('retained_depth_receivers_only');
    expect(results.msaa.mask?.retainedDepthUsed).toBe(true);
    expect(getErrors()).toEqual([]);
});
