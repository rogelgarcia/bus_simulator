// Headless integration regression: AI 357 offline Grass Lab approval workflow.
import test, { expect } from '@playwright/test';

async function bootGrassLab(page) {
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error?.message ?? error}`));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('response', (response) => {
        if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
    });
    page.on('requestfailed', (request) => errors.push(`request failed: ${request.url()} · ${request.failure()?.errorText ?? '?'}`));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/debug_tools/grass_debug.html');
    await page.waitForTimeout(5000);
    const startup = await page.evaluate(() => ({ ready: document.body.dataset.grassLabReady ?? null, hasApi: !!window.__grassLab }));
    expect(errors, `Grass Lab startup errors: ${errors.join('\n')}`).toEqual([]);
    expect(startup).toEqual({ ready: 'true', hasApi: true });
    await page.evaluate(() => {
        window.__grassLab.setQualityPreset('default');
        window.__grassLab.setLighting('daylight');
        window.__grassLab.focusCamera('height_050');
        window.__grassLab.resetValidationSamples();
    });
    await page.waitForTimeout(800);
}

test('Grass Lab: automatic LOD, hard coverage, quality fallback, and deterministic accents remain intact', async ({ page }) => {
    await bootGrassLab(page);
    const baseline = await page.evaluate(() => window.__grassLab.getSnapshot());
    expect(baseline.contractVersion).toBe(7);
    expect(baseline.lod.force).toBe('auto');
    expect(baseline.coverage.enabled).toBe(true);
    expect(baseline.coverage.alphaTestedSurface).toBe(true);
    expect(baseline.coverage.transparentSurface).toBe(false);
    expect(baseline.coverage.layerHeightMeters).toBeCloseTo(0.0275, 4);
    expect(baseline.coverage.sidewalkSegments).toBeGreaterThan(0);
    expect(baseline.coverage.outsideCorners).toBeGreaterThan(0);
    expect(baseline.grass.nearCarpet.enabled).toBe(true);
    expect(baseline.grass.localizedAccents.deterministicSignature).toMatch(/^grass-accents-v1-/);

    const firstSignature = baseline.grass.localizedAccents.deterministicSignature;
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.grassLabReady === 'true' && !!window.__grassLab, null, { timeout: 45_000 });
    await page.waitForTimeout(700);
    const reloaded = await page.evaluate(() => window.__grassLab.getSnapshot());
    expect(reloaded.grass.localizedAccents.deterministicSignature).toBe(firstSignature);

    const low = await page.evaluate(async () => {
        window.__grassLab.setQualityPreset('low');
        window.__grassLab.focusCamera('height_050');
        await new Promise((resolve) => setTimeout(resolve, 500));
        return window.__grassLab.getSnapshot();
    });
    expect(low.validation.qualityPreset).toBe('low');
    expect(low.grass.enabled).toBe(false);
    expect(low.coverage.enabled).toBe(true);
    expect(low.coverage.surfaceTriangles).toBe(baseline.coverage.surfaceTriangles);
    expect(low.coverage.lipTriangles).toBe(baseline.coverage.lipTriangles);
});

test('Grass Lab: repeatable poses cross both handoffs without cutoff leaks or runaway cost', async ({ page }) => {
    await bootGrassLab(page);
    const snapshots = [];
    for (const cameraId of ['height_030', 'near_handoff', 'cluster_handoff', 'top_down', 'far_texture']) {
        const snapshot = await page.evaluate(async (id) => {
            window.__grassLab.focusCamera(id);
            await new Promise((resolve) => setTimeout(resolve, 450));
            return window.__grassLab.getSnapshot();
        }, cameraId);
        snapshots.push(snapshot);
    }
    expect(snapshots.every((snapshot) => snapshot.lod.force === 'auto')).toBe(true);
    expect(snapshots.every((snapshot) => snapshot.lod.geometryBeyondCutoff === 0)).toBe(true);
    expect(Math.max(...snapshots.map((snapshot) => snapshot.grass.logicalDrawCalls))).toBeLessThanOrEqual(12);
    expect(Math.max(...snapshots.map((snapshot) => snapshot.grass.triangles))).toBeLessThanOrEqual(100_000);
    expect(snapshots.at(-1).lod.activeTier).toBe('texture');

    const moving = await page.evaluate(async () => {
        window.__grassLab.startMotionPath('flyover');
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return window.__grassLab.getValidationDiagnostics();
    });
    expect(moving.validation.motionPath).toBe('flyover');
    expect(moving.snapshot.validation.motionActive).toBe(true);
    expect(moving.snapshot.lod.geometryBeyondCutoff).toBe(0);
    expect(moving.budgetResult.measurements.maximumDrawCalls).toBeLessThanOrEqual(12);
});
