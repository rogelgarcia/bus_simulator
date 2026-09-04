// Real-gameplay before/after evidence for AI 532 with two registered vehicles.
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';

const PROFILE_ID = 'ai527.sun.az045.el35';
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PACKAGE_INDEX_PATH = path.join(
    REPO_ROOT,
    'tests/artifacts/illumination_531/package_index.json'
);
const CAPTURE_DIRECTORY = path.join(
    REPO_ROOT,
    'tests/artifacts/screens/illumination_532/gameplay'
);

let profile = null;
try {
    const packageIndex = JSON.parse(await readFile(PACKAGE_INDEX_PATH, 'utf8'));
    profile = packageIndex?.profiles?.[PROFILE_ID] ?? null;
} catch {
    profile = null;
}
const packagePath = profile?.packagePath
    ? path.resolve(REPO_ROOT, profile.packagePath)
    : null;
const packageAvailable = !!profile && !!packagePath && existsSync(packagePath);

test.use({ viewport: { width: 1280, height: 744 } });

test('AI 532 real gameplay compares current and hybrid shadows with two vehicles', async ({ page }) => {
    test.setTimeout(600_000);
    test.skip(!packageAvailable, 'AI 531 production package is not available in this checkout.');

    const pageErrors = [];
    const shaderErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.stack ?? error)));
    page.on('console', (message) => {
        if (message.type() === 'error' && /shader error|VALIDATE_STATUS/i.test(message.text())) {
            shaderErrors.push(message.text());
        }
    });

    await page.goto('/?pose=civic_center_curve_front&coreTests=0');
    await page.waitForFunction(() => (
        window.__busSim?.sm?.currentName === 'game_mode'
        && window.__busSim?.sm?.current?.city?.cityId === 'bigcity2'
        && window.__busSim?.sm?.current?.busAnchor
        && window.__busSim?.sm?.current?.city?.getStaticVisibilityStatus?.()?.state === 'active'
    ), null, { timeout: 180_000 });

    const currentState = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createBus } = await import('/src/graphics/assets3d/factories/BusFactory.js');
        const { getBusSpec } = await import('/src/app/vehicle/buses/BusCatalog.js');
        const { engine, sm } = window.__busSim;
        const state = sm.current;
        await Promise.all([
            engine.waitForLightingReady?.(),
            state.city?.world?.trees?.readyPromise,
            state.busModel?.userData?.readyPromise
        ].filter(Boolean));

        engine.stop();
        state.gameLoop?.pause?.();
        state._updateChaseCamera = () => {};
        engine.setViewportSize(1280, 720);
        engine.renderer.setPixelRatio(1);
        engine.renderer.setSize(1280, 720, false);
        engine.camera.aspect = 1280 / 720;
        engine.camera.updateProjectionMatrix();

        engine.setAtmosphereSettings({
            ...engine.atmosphereSettings,
            sun: {
                ...engine.atmosphereSettings?.sun,
                azimuthDeg: 45,
                elevationDeg: 35
            }
        });
        state.city.update(engine);

        const secondaryModel = createBus(getBusSpec('coach'));
        await secondaryModel?.userData?.readyPromise;
        const secondaryAnchor = new THREE.Group();
        secondaryAnchor.name = 'AI532GameplaySecondaryVehicle';
        secondaryAnchor.position.copy(state.busAnchor.position);
        secondaryAnchor.position.x += 3.8;
        secondaryAnchor.position.z += 3.8;
        secondaryAnchor.rotation.copy(state.busAnchor.rotation);
        secondaryAnchor.add(secondaryModel);
        secondaryAnchor.traverse((object) => {
            if (!object?.isMesh) return;
            object.castShadow = true;
            object.receiveShadow = true;
        });
        engine.scene.add(secondaryAnchor);
        state.city.registerShadowReceivers(secondaryAnchor);
        const registration = engine.registerDynamicIlluminationObject({
            id: 'vehicle.ai532.secondary',
            root: secondaryAnchor,
            cast: true,
            receive: true
        });

        state.city.updateStaticVisibility?.(engine.camera, performance.now() + 1000);
        for (let frame = 0; frame < 4; frame += 1) engine.renderFrame();
        engine.renderer.getContext().finish();
        window.__ai532GameplayCapture = {
            registration,
            secondaryAnchor,
            pipeline: null
        };
        return {
            stateName: sm.currentName,
            cityId: state.city.cityId,
            dynamicIds: engine.getDynamicIlluminationObjects().map((entry) => entry.id),
            primaryPosition: state.busAnchor.position.toArray(),
            secondaryPosition: secondaryAnchor.position.toArray()
        };
    });

    await mkdir(CAPTURE_DIRECTORY, { recursive: true });
    const beforePath = path.join(CAPTURE_DIRECTORY, 'before_current.png');
    const afterPath = path.join(CAPTURE_DIRECTORY, 'after_hybrid.png');
    const canvas = page.locator('#game-canvas');
    await canvas.screenshot({ path: beforePath, type: 'png' });

    const activation = await page.evaluate(async ({ selectedProfile, packageUrl }) => {
        const { StaticSunDepthPipeline } = await import(
            '/src/graphics/illumination/static_sun_depth/index.js'
        );
        const { engine, sm } = window.__busSim;
        const state = sm.current;
        const pipeline = new StaticSunDepthPipeline(engine, {
            initialMode: 'current',
            getLiveStaticSunDepthIdentity: () => ({ ...selectedProfile.liveIdentity })
        });
        engine.installIlluminationPipeline(pipeline);
        window.__ai532GameplayCapture.pipeline = pipeline;
        const live = selectedProfile.liveIdentity;
        await pipeline.setMode('auto', {
            url: packageUrl,
            expectations: {
                cityId: live.cityId,
                lightingProfileId: live.lightingProfileId,
                selectedCapabilityProfileId: 'development.static_sun_v1',
                resolvedSourceSha256: live.resolvedSourceSha256,
                staticSunDepthSourceSha256: live.staticSunDepthSourceSha256
            }
        });
        for (let attempt = 0; attempt < 60; attempt += 1) {
            state.city.update(engine);
            engine.renderFrame();
            engine.renderer.getContext().finish();
            const diagnostics = pipeline.getDiagnostics();
            if (diagnostics.active) {
                for (let frame = 0; frame < 4; frame += 1) engine.renderFrame();
                engine.renderer.getContext().finish();
                const finalDiagnostics = pipeline.getDiagnostics();
                return {
                    active: true,
                    effectiveMode: finalDiagnostics.runtime.controller.effectiveMode,
                    registrations: finalDiagnostics.dynamicShadows.registrations,
                    casterIds: finalDiagnostics.dynamicShadows.map.projection.casterIds,
                    casterMeshCount: finalDiagnostics.dynamicShadows.metrics.casterMeshCount,
                    dynamicDrawCalls: finalDiagnostics.dynamicShadows.metrics.drawCalls,
                    dynamicTriangles: finalDiagnostics.dynamicShadows.metrics.triangles,
                    staticCastersActive: finalDiagnostics.casters.active
                };
            }
            const stateName = diagnostics.runtime?.controller?.state;
            if (stateName === 'failed' || stateName === 'fallback' || stateName === 'stale') {
                return {
                    active: false,
                    state: stateName,
                    error: diagnostics.lastError,
                    diagnostics
                };
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        return { active: false, state: 'timeout', diagnostics: pipeline.getDiagnostics() };
    }, {
        selectedProfile: profile,
        packageUrl: `/${profile.packagePath.replaceAll('\\', '/')}`
    });

    expect(activation, JSON.stringify(activation, null, 2)).toMatchObject({
        active: true,
        effectiveMode: 'baked',
        staticCastersActive: true
    });
    expect(activation.registrations.map((entry) => entry.id)).toEqual([
        'vehicle.ai532.secondary',
        'vehicle.player'
    ]);
    expect(activation.casterIds).toEqual([
        'vehicle.ai532.secondary',
        'vehicle.player'
    ]);
    expect(activation.casterMeshCount).toBeGreaterThan(1);
    expect(activation.dynamicDrawCalls).toBeGreaterThan(1);
    expect(activation.dynamicTriangles).toBeGreaterThan(0);

    await canvas.screenshot({ path: afterPath, type: 'png' });

    await page.evaluate(async () => {
        const { engine } = window.__busSim;
        const capture = window.__ai532GameplayCapture;
        const pipeline = capture?.pipeline ?? null;
        if (pipeline) {
            engine.installIlluminationPipeline(null);
            await pipeline.dispose();
        }
        capture?.registration?.unregister?.();
        capture?.secondaryAnchor?.removeFromParent?.();
        window.__ai532GameplayCapture = null;
    });

    expect(currentState).toMatchObject({
        stateName: 'game_mode',
        cityId: 'bigcity2'
    });
    expect(currentState.dynamicIds).toEqual([
        'vehicle.ai532.secondary',
        'vehicle.player'
    ]);
    expect(pageErrors).toEqual([]);
    expect(shaderErrors).toEqual([]);
});
