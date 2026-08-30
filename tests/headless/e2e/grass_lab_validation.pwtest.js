// Headless integration regression: AI 357 offline Grass Lab approval workflow.
import test, { expect } from '@playwright/test';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const V2_ASSET_URL_PREFIX = '/assets/public/pbr/grass_low_cut_maintained_v2/';

function isOptionalCorrectionConfig(url) {
    try {
        return new URL(url).pathname.endsWith('/pbr.material.correction.config.js');
    } catch {
        return false;
    }
}

async function installV2AssetOverride(page) {
    const relativeRoot = String(process.env.GRASS_LAB_V2_ASSET_ROOT ?? '').trim();
    if (!relativeRoot) return;
    const root = path.resolve(process.cwd(), relativeRoot);
    const relative = path.relative(process.cwd(), root);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('GRASS_LAB_V2_ASSET_ROOT must remain inside the repository.');
    }
    await access(root);
    await page.route('**/pbr.material.correction.config.js', async (route) => {
        await route.fulfill({ status: 204, contentType: 'text/javascript', body: '' });
    });
    await page.route(`**${V2_ASSET_URL_PREFIX}**`, async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const assetName = decodeURIComponent(pathname.slice(V2_ASSET_URL_PREFIX.length));
        const filePath = path.resolve(root, assetName);
        if (!assetName || assetName.includes('/') || assetName.includes('\\') || path.dirname(filePath) !== root) {
            await route.abort('blockedbyclient');
            return;
        }
        if (assetName === 'pbr.material.correction.config.js') {
            await route.fulfill({ status: 204, contentType: 'text/javascript', body: '' });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'image/png', body: await readFile(filePath) });
    });
}

async function bootGrassLab(page) {
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error?.message ?? error}`));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('response', (response) => {
        if (response.status() >= 400 && !isOptionalCorrectionConfig(response.url())) {
            errors.push(`http ${response.status()}: ${response.url()}`);
        }
    });
    page.on('requestfailed', (request) => {
        if (!isOptionalCorrectionConfig(request.url())) {
            errors.push(`request failed: ${request.url()} · ${request.failure()?.errorText ?? '?'}`);
        }
    });
    await installV2AssetOverride(page);
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

test('Grass Lab: AI 360 near carpet uses the opaque V2 material and exact polygon roots', async ({ page }) => {
    test.setTimeout(120_000);
    await bootGrassLab(page);
    const baseline = await page.evaluate(async () => {
        await window.__grassLab.setMaterialVersion('v2');
        window.__grassLab.setNearEvidenceMode('near_mesh');
        window.__grassLab.focusBoundaryCamera('straight', 0.3, 1.25);
        window.__grassLab.resetValidationSamples();
        await window.__grassLab.settleCaptureFrames(90);
        return window.__grassLab.getCaptureMetadata({ role: 'ai360_exact_cut' });
    });
    const snapshot = baseline.snapshot;
    const near = snapshot.grass.nearCarpet;
    expect(snapshot.contractVersion).toBe(9);
    expect(snapshot.coverage.enabled).toBe(true);
    expect(snapshot.coverage.opaqueCap).toBe(true);
    expect(snapshot.coverage.alphaTestedSurface).toBe(false);
    expect(snapshot.coverage.transparentSurface).toBe(false);
    expect(snapshot.coverage.structuralBaseHeightMeters).toBeCloseTo(0.0275, 4);
    expect(snapshot.coverage.sidewalkSegments).toBeGreaterThan(0);
    expect(snapshot.coverage.treeBaseSegments).toBeGreaterThan(0);
    expect(baseline.materialVersion).toBe('v2');
    expect(baseline.materialDiagnostics.version).toBe('v2');
    expect(near.enabled).toBe(true);
    expect(near.coverageMode).toBe('exact_polygon_v2');
    expect(near.boundarySignature).toBe(snapshot.coverage.boundarySignature);
    expect(near.unrepresentedEligibleBins).toBe(0);
    expect(near.exactPostcheckFailures).toBe(0);
    expect(near.eligibleBins).toBe(near.representedBins);
    expect(near.sidewalkRejectedRoots).toBeGreaterThan(0);
    expect(near.transparent).toBe(false);
    expect(near.depthWrite).toBe(true);
    expect(near.castShadow).toBe(false);
    expect(near.materialPaths).toBe(1);
    expect(snapshot.grass.trianglesByTier.mid).toBe(0);
    expect(snapshot.grass.trianglesByTier.accent).toBe(0);
    expect(snapshot.grass.triangles + snapshot.coverage.triangles).toBeLessThanOrEqual(200_000);

    const treeClip = await page.evaluate(async () => {
        window.__grassLab.focusBoundaryCamera('tree_base', 0.3, 1.25);
        await window.__grassLab.settleCaptureFrames(60);
        return window.__grassLab.getSnapshot().grass.nearCarpet;
    });
    expect(treeClip.treeRejectedRoots).toBeGreaterThan(0);
    expect(treeClip.exactPostcheckFailures).toBe(0);

    const first = {
        boundarySignature: near.boundarySignature,
        eligibleBins: near.eligibleBins,
        representedBins: near.representedBins,
        rejectedRoots: near.rejectedRoots,
        triangles: near.triangles
    };
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.grassLabReady === 'true' && !!window.__grassLab, null, { timeout: 45_000 });
    const reloaded = await page.evaluate(async () => {
        await window.__grassLab.setMaterialVersion('v2');
        window.__grassLab.setNearEvidenceMode('near_mesh');
        window.__grassLab.focusBoundaryCamera('straight', 0.3, 1.25);
        await window.__grassLab.settleCaptureFrames(90);
        return window.__grassLab.getSnapshot().grass.nearCarpet;
    });
    expect({
        boundarySignature: reloaded.boundarySignature,
        eligibleBins: reloaded.eligibleBins,
        representedBins: reloaded.representedBins,
        rejectedRoots: reloaded.rejectedRoots,
        triangles: reloaded.triangles
    }).toEqual(first);

    const stationary = await page.evaluate(async () => {
        const before = window.__grassLab.getSnapshot().grass.nearCarpet;
        await window.__grassLab.settleCaptureFrames(90);
        const after = window.__grassLab.getSnapshot().grass.nearCarpet;
        return { before, after };
    });
    expect(stationary.after.lastBufferUpdates).toBe(0);
    expect(stationary.after.totalBufferUpdates).toBe(stationary.before.totalBufferUpdates);
});

test('Grass Lab: V2 field poses retain the 200k combined ceiling and low texture fallback', async ({ page }) => {
    await bootGrassLab(page);
    const snapshots = [];
    for (const cameraId of ['height_030', 'near_handoff', 'cluster_handoff', 'top_down', 'far_texture']) {
        const snapshot = await page.evaluate(async (id) => {
            window.__grassLab.focusCamera(id);
            await window.__grassLab.settleCaptureFrames(45);
            return window.__grassLab.getSnapshot();
        }, cameraId);
        snapshots.push(snapshot);
    }
    expect(snapshots.every((snapshot) => snapshot.lod.force === 'auto')).toBe(true);
    expect(snapshots.every((snapshot) => snapshot.lod.geometryBeyondCutoff === 0)).toBe(true);
    expect(Math.max(...snapshots.map((snapshot) => snapshot.grass.logicalDrawCalls))).toBeLessThanOrEqual(12);
    expect(Math.max(...snapshots.map((snapshot) => snapshot.grass.triangles + snapshot.coverage.triangles))).toBeLessThanOrEqual(200_000);
    expect(snapshots.at(-1).lod.activeTier).toBe('texture');

    const low = await page.evaluate(async () => {
        window.__grassLab.setNearEvidenceMode(null);
        window.__grassLab.setQualityPreset('low');
        window.__grassLab.focusCamera('height_050');
        await window.__grassLab.settleCaptureFrames(45);
        return window.__grassLab.getSnapshot();
    });
    expect(low.validation.qualityPreset).toBe('low');
    expect(low.grass.triangles).toBe(0);
    expect(low.grass.logicalDrawCalls).toBe(0);
    expect(low.coverage.opaqueCap).toBe(true);
    expect(low.coverage.logicalDrawCalls).toBeLessThanOrEqual(2);
});
