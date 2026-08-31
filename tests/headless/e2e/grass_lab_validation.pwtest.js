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
    expect(snapshot.contractVersion).toBe(10);
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
    test.setTimeout(120_000);
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

test('Grass Lab: AI 361 exposes exact four-tier handoffs with complete cohesive field coverage', async ({ page }) => {
    test.setTimeout(120_000);
    await bootGrassLab(page);
    const capabilities = await page.evaluate(() => {
        const lab = window.__grassLab;
        return Object.fromEntries([
            'setHierarchyEvidenceMode',
            'focusHandoff',
            'seekMotionPath',
            'resetLodHysteresis'
        ].map((name) => [name, typeof lab[name] === 'function']));
    });
    expect(capabilities).toEqual({
        setHierarchyEvidenceMode: true,
        focusHandoff: true,
        seekMotionPath: true,
        resetLodHysteresis: true
    });

    const samples = await page.evaluate(async () => {
        const lab = window.__grassLab;
        await lab.setMaterialVersion('v2');
        lab.setQualityPreset('default');
        lab.setHierarchyEvidenceMode('auto');
        const results = [];
        for (const handoffId of ['close_billboard', 'billboard_middle', 'middle_texture']) {
            for (const offsetMeters of [-0.5, 0, 0.5]) {
                lab.resetLodHysteresis();
                lab.focusHandoff(handoffId, offsetMeters);
                await lab.settleCaptureFrames(12);
                results.push({ handoffId, offsetMeters, metadata: lab.getCaptureMetadata({ handoffId, offsetMeters }) });
            }
        }
        return results;
    });
    expect(samples).toHaveLength(9);
    const expectedTransitions = {
        close_billboard: 'near_to_billboard',
        billboard_middle: 'billboard_to_middle',
        middle_texture: 'middle_to_texture'
    };
    for (const sample of samples) {
        const { metadata } = sample;
        const snapshot = metadata.snapshot;
        const field = snapshot.grass.midCluster;
        const near = snapshot.grass.nearCarpet;
        expect(snapshot.contractVersion).toBe(10);
        expect(metadata.materialVersion).toBe('v2');
        expect(snapshot.lod.version).toBe(2);
        expect(Object.keys(snapshot.lod.weights)).toEqual(['near', 'billboard', 'middle', 'texture']);
        expect(snapshot.lod.geometryBeyondCutoff).toBe(0);
        expect(snapshot.coverage.logicalDrawCalls).toBeLessThanOrEqual(2);
        expect(snapshot.grass.logicalDrawCalls).toBeLessThanOrEqual(12);
        expect(snapshot.grass.triangles + snapshot.coverage.triangles).toBeLessThanOrEqual(200_000);
        expect(snapshot.grass.trianglesByTier).toEqual(expect.objectContaining({
            billboard: expect.any(Number),
            middle: expect.any(Number),
            accent: expect.any(Number)
        }));
        expect(String(near.coverageMode)).toMatch(/^exact_polygon/);
        expect(near.boundarySignature).toBe(snapshot.coverage.boundarySignature);
        expect(near.unrepresentedEligibleBins).toBe(0);
        expect(near.exactPostcheckFailures).toBe(0);
        expect(field.coverageMode).toBe('exact_polygon');
        expect(field.boundarySignature).toBe(snapshot.coverage.boundarySignature);
        expect(field.placementSignature).toMatch(/^cohesive-field-v2-/);
        expect(field.eligibleUnits).toBe(field.representedUnits);
        expect(field.unrepresentedEligibleUnits).toBe(0);
        expect(field.eligibleAreaSquareMeters).toBe(field.representedAreaSquareMeters);
        expect(field.exactPostcheckFailures).toBe(0);
        expect(field.exactEnvelopeFailures).toBe(0);
        expect(field.cutoffRejectedUnits).toBe(0);
        for (const tier of [field.billboard, field.middle]) {
            expect(tier.unrepresentedEligibleUnits).toBe(0);
            expect(tier.geometryBeyondCutoff).toBe(0);
            expect(tier.drawCalls).toBeLessThanOrEqual(1);
            expect(tier.castShadow).toBe(false);
            expect(tier.frustumCulled).toBe(true);
        }
    }
    for (const [handoffId, transitionState] of Object.entries(expectedTransitions)) {
        const handoffSamples = samples.filter((sample) => sample.handoffId === handoffId);
        expect(handoffSamples[1].metadata.snapshot.lod.transitionState).toBe(transitionState);
        expect(handoffSamples[0].metadata.snapshot.lod.effectiveDistanceMeters)
            .toBeLessThan(handoffSamples[2].metadata.snapshot.lod.effectiveDistanceMeters);
    }
});

test('Grass Lab: same-cell camera motion reevaluates handoffs while placement stays cached', async ({ page }) => {
    test.setTimeout(120_000);
    await bootGrassLab(page);
    const result = await page.evaluate(async () => {
        const lab = window.__grassLab;
        await lab.setMaterialVersion('v2');
        lab.setQualityPreset('default');
        lab.setHierarchyEvidenceMode('auto');
        lab.resetLodHysteresis();
        const capture = () => {
            const snapshot = lab.getSnapshot();
            return {
                camera: lab.getCaptureMetadata().camera.position,
                near: {
                    layoutRevision: snapshot.grass.nearCarpet.layoutRevision,
                    cacheHits: snapshot.grass.nearCarpet.cacheHits,
                    lastBufferUpdates: snapshot.grass.nearCarpet.lastBufferUpdates,
                    placementSignature: snapshot.grass.nearCarpet.placementSignature,
                    boundarySignature: snapshot.grass.nearCarpet.boundarySignature
                },
                field: {
                    cutoffRejectedUnits: snapshot.grass.midCluster.cutoffRejectedUnits,
                    geometryBeyondCutoff: snapshot.grass.midCluster.geometryBeyondCutoff
                }
            };
        };
        await lab.seekMotionPath('forward', 0.5);
        await lab.settleCaptureFrames(2);
        const first = capture();
        await lab.seekMotionPath('forward', 0.50001);
        await lab.settleCaptureFrames(1);
        const moved = capture();
        await lab.settleCaptureFrames(1);
        const repeated = capture();
        return { first, moved, repeated };
    });

    expect(Math.floor(result.moved.camera.x)).toBe(Math.floor(result.first.camera.x));
    expect(Math.floor(result.moved.camera.z)).toBe(Math.floor(result.first.camera.z));
    expect(result.moved.near.layoutRevision).toBeGreaterThan(result.first.near.layoutRevision);
    expect(result.moved.near.cacheHits).toBeGreaterThan(result.first.near.cacheHits);
    expect(result.moved.near.placementSignature).toBe(result.first.near.placementSignature);
    expect(result.moved.near.boundarySignature).toBe(result.first.near.boundarySignature);
    expect(result.repeated.near.layoutRevision).toBe(result.moved.near.layoutRevision);
    expect(result.repeated.near.lastBufferUpdates).toBe(0);
    expect(result.repeated.field.cutoffRejectedUnits).toBe(0);
    expect(result.repeated.field.geometryBeyondCutoff).toBe(0);
});

test('Grass Lab: AI 361 evidence isolation and fixed-progress motion remain deterministic and cutoff-safe', async ({ page }) => {
    test.setTimeout(120_000);
    await bootGrassLab(page);
    const result = await page.evaluate(async () => {
        const lab = window.__grassLab;
        await lab.setMaterialVersion('v2');
        lab.setQualityPreset('default');
        const capture = () => {
            const snapshot = lab.getSnapshot();
            return {
                camera: lab.getCaptureMetadata().camera,
                lod: snapshot.lod,
                coverageTriangles: snapshot.coverage.triangles,
                grassTriangles: snapshot.grass.triangles,
                grassDraws: snapshot.grass.logicalDrawCalls,
                trianglesByTier: snapshot.grass.trianglesByTier,
                boundarySignature: snapshot.coverage.boundarySignature,
                fieldPlacementSignature: snapshot.grass.midCluster.placementSignature
            };
        };
        const roles = [];
        for (const role of ['texture_only', 'close', 'billboard', 'middle', 'accent']) {
            lab.setHierarchyEvidenceMode(role);
            if (role === 'accent') lab.focusAccent('tree');
            else if (role === 'middle' || role === 'texture_only') lab.focusHandoff('middle_texture', role === 'texture_only' ? 0.5 : -0.5);
            else if (role === 'billboard') lab.focusHandoff('billboard_middle', -0.5);
            else lab.focusHandoff('close_billboard', -0.5);
            await lab.settleCaptureFrames(10);
            roles.push({ role, snapshot: capture() });
        }
        lab.setHierarchyEvidenceMode('auto');
        const routes = {};
        for (const route of ['forward', 'reverse', 'strafe', 'flyover']) {
            routes[route] = [];
            for (const progress of [0, 0.5, 1]) {
                lab.resetLodHysteresis();
                await lab.seekMotionPath(route, progress);
                await lab.settleCaptureFrames(6);
                routes[route].push({ progress, snapshot: capture() });
            }
        }
        lab.resetLodHysteresis();
        await lab.seekMotionPath('flyover', 0.5);
        await lab.settleCaptureFrames(6);
        const repeatedFlyover = capture();
        return { roles, routes, repeatedFlyover };
    });
    await page.reload();
    await page.waitForFunction(
        () => document.body.dataset.grassLabReady === 'true' && !!window.__grassLab,
        null,
        { timeout: 45_000 }
    );
    const reloadedFlyover = await page.evaluate(async () => {
        const lab = window.__grassLab;
        await lab.setMaterialVersion('v2');
        lab.setQualityPreset('default');
        lab.setHierarchyEvidenceMode('auto');
        lab.resetLodHysteresis();
        await lab.seekMotionPath('flyover', 0.5);
        await lab.settleCaptureFrames(6);
        const snapshot = lab.getSnapshot();
        return {
            camera: lab.getCaptureMetadata().camera,
            weights: snapshot.lod.weights,
            boundarySignature: snapshot.coverage.boundarySignature,
            fieldPlacementSignature: snapshot.grass.midCluster.placementSignature
        };
    });

    const roleById = Object.fromEntries(result.roles.map((entry) => [entry.role, entry.snapshot]));
    expect(roleById.texture_only.trianglesByTier).toEqual(expect.objectContaining({
        near: 0,
        billboard: 0,
        middle: 0,
        accent: 0
    }));
    expect(roleById.close.trianglesByTier.near).toBeGreaterThan(0);
    expect(roleById.billboard.trianglesByTier.billboard).toBeGreaterThan(0);
    expect(roleById.middle.trianglesByTier.middle).toBeGreaterThan(0);
    expect(roleById.accent.trianglesByTier.accent).toBeGreaterThan(0);
    for (const snapshot of Object.values(roleById)) {
        expect(snapshot.lod.geometryBeyondCutoff).toBe(0);
        expect(snapshot.grassDraws).toBeLessThanOrEqual(12);
        expect(snapshot.grassTriangles + snapshot.coverageTriangles).toBeLessThanOrEqual(200_000);
    }

    for (const samples of Object.values(result.routes)) {
        expect(samples).toHaveLength(3);
        for (const { snapshot } of samples) {
            expect(snapshot.lod.geometryBeyondCutoff).toBe(0);
            expect(snapshot.grassDraws).toBeLessThanOrEqual(12);
            expect(snapshot.grassTriangles + snapshot.coverageTriangles).toBeLessThanOrEqual(200_000);
        }
    }
    expect(result.routes.forward[0].snapshot.lod.effectiveDistanceMeters)
        .toBeLessThan(result.routes.forward[2].snapshot.lod.effectiveDistanceMeters);
    expect(result.routes.reverse[0].snapshot.lod.effectiveDistanceMeters)
        .toBeGreaterThan(result.routes.reverse[2].snapshot.lod.effectiveDistanceMeters);
    expect(result.repeatedFlyover.camera).toEqual(result.routes.flyover[1].snapshot.camera);
    expect(result.repeatedFlyover.lod.weights).toEqual(result.routes.flyover[1].snapshot.lod.weights);
    expect(result.repeatedFlyover.boundarySignature).toBe(result.routes.flyover[1].snapshot.boundarySignature);
    expect(result.repeatedFlyover.fieldPlacementSignature).toBe(result.routes.flyover[1].snapshot.fieldPlacementSignature);
    expect(reloadedFlyover.camera).toEqual(result.routes.flyover[1].snapshot.camera);
    expect(reloadedFlyover.weights).toEqual(result.routes.flyover[1].snapshot.lod.weights);
    expect(reloadedFlyover.boundarySignature).toBe(result.routes.flyover[1].snapshot.boundarySignature);
    expect(reloadedFlyover.fieldPlacementSignature).toBe(result.routes.flyover[1].snapshot.fieldPlacementSignature);
});
