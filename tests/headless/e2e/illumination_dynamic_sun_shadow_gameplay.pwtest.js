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

test('AI 532 real gameplay proves tree-to-bus and bus-to-bus shadow reception', async ({ page }) => {
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
    const treeCurrentPath = path.join(CAPTURE_DIRECTORY, 'tree_bus_current.png');
    const treeHybridPath = path.join(CAPTURE_DIRECTORY, 'tree_bus_hybrid.png');
    const treeStaticVisibilityPath = path.join(
        CAPTURE_DIRECTORY,
        'tree_bus_static_visibility.png'
    );
    const busDynamicVisibilityPath = path.join(
        CAPTURE_DIRECTORY,
        'bus_to_bus_dynamic_visibility.png'
    );
    const busDynamicControlPath = path.join(
        CAPTURE_DIRECTORY,
        'bus_to_bus_dynamic_visibility_control.png'
    );
    const behindTreePath = path.join(CAPTURE_DIRECTORY, 'behind_tree_hybrid.png');
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

    const treeArrangement = await page.evaluate(async () => {
        const THREE = await import('three');
        const { engine, sm } = window.__busSim;
        const state = sm.current;
        const capture = window.__ai532GameplayCapture;
        const pipeline = capture.pipeline;
        const descriptor = pipeline._active?.binding?.descriptor;
        const pointDirection = new THREE.Vector3(
            ...descriptor.identity.sunPointDirectionWorld
        ).normalize();
        const towardSun = new THREE.Vector3(pointDirection.x, 0, pointDirection.z).normalize();
        const shadowDirection = towardSun.clone().multiplyScalar(-1);
        const rowSide = new THREE.Vector3(-shadowDirection.z, 0, shadowDirection.x);
        const buildingBounds = (state.city?.buildings?.group?.children ?? []).map((root) => {
            root.updateWorldMatrix(true, true);
            return new THREE.Box3().setFromObject(root);
        }).filter((bounds) => !bounds.isEmpty());
        const clearanceFromBuildings = (point) => buildingBounds.reduce((minimum, bounds) => {
            const dx = Math.max(bounds.min.x - point.x, 0, point.x - bounds.max.x);
            const dz = Math.max(bounds.min.z - point.z, 0, point.z - bounds.max.z);
            return Math.min(minimum, Math.hypot(dx, dz));
        }, Infinity);
        const treeRoots = state.city?.world?.trees?.group?.children ?? [];
        const trees = treeRoots.map((root, index) => {
            root.updateWorldMatrix(true, true);
            const bounds = new THREE.Box3().setFromObject(root);
            const center = bounds.getCenter(new THREE.Vector3());
            const treeBase = new THREE.Vector3(center.x, 0, center.z);
            const secondaryPosition = treeBase.clone()
                .addScaledVector(shadowDirection, 4.0)
                .addScaledVector(rowSide, -0.8);
            const primaryPosition = treeBase.clone()
                .addScaledVector(shadowDirection, 7.5)
                .addScaledVector(rowSide, 2.2);
            const target = treeBase.clone()
                .addScaledVector(shadowDirection, 4.4)
                .addScaledVector(rowSide, 0.6);
            const occupancySamples = [
                treeBase,
                secondaryPosition,
                primaryPosition,
                secondaryPosition.clone().addScaledVector(rowSide, -6.5),
                secondaryPosition.clone().addScaledVector(rowSide, 6.5),
                primaryPosition.clone().addScaledVector(rowSide, -6.5),
                primaryPosition.clone().addScaledVector(rowSide, 6.5)
            ];
            const objectClearance = Math.min(...occupancySamples.map(clearanceFromBuildings));
            const cameraChoices = [-1, 1].map((sign) => {
                const cameraSide = rowSide.clone().multiplyScalar(sign);
                const position = target.clone()
                    .addScaledVector(cameraSide, 22)
                    .addScaledVector(towardSun, 2.5);
                const behindTreePosition = treeBase.clone()
                    .addScaledVector(towardSun, 15)
                    .addScaledVector(cameraSide, 11);
                return {
                    cameraSide,
                    clearance: Math.min(
                        clearanceFromBuildings(position),
                        clearanceFromBuildings(behindTreePosition)
                    ),
                    position
                };
            }).sort((left, right) => right.clearance - left.clearance);
            return {
                bounds,
                cameraChoice: cameraChoices[0],
                center,
                height: bounds.max.y - bounds.min.y,
                index,
                objectClearance,
                primaryPosition,
                secondaryPosition,
                target,
                treeBase,
                root
            };
        }).filter((entry) => (
            !entry.bounds.isEmpty()
            && entry.height >= 5
            && Math.abs(entry.center.x) <= 190
            && Math.abs(entry.center.z) <= 190
        ));
        if (trees.length < 1) throw new Error('Big City 2 has no usable real tree.');

        // Favor a large tree whose two-bus row and both cameras have the best
        // conservative clearance from real building bounds. Concave courtyard
        // buildings can still report zero AABB clearance for genuinely open
        // space, so the image remains the final human composition check.
        trees.sort((left, right) => {
            const leftScore = Math.min(left.objectClearance, left.cameraChoice.clearance) * 100
                + left.height * 3 - Math.hypot(left.center.x, left.center.z) * 0.02;
            const rightScore = Math.min(right.objectClearance, right.cameraChoice.clearance) * 100
                + right.height * 3 - Math.hypot(right.center.x, right.center.z) * 0.02;
            return rightScore - leftScore || left.index - right.index;
        });
        const selectedTree = trees[0];
        const groundY = state.city?.generatorConfig?.ground?.surfaceY
            ?? state.city?.generatorConfig?.road?.surfaceY
            ?? state.busAnchor.position.y;
        const treeBase = selectedTree.treeBase.clone().setY(groundY);

        // Tree -> coach -> player follows the sun ray. Both buses are broadside
        // to that ray, leaving a physical gap while the coach's roof shadow can
        // reach the player bus. The tree shadow crosses both moving receivers.
        const secondaryPosition = selectedTree.secondaryPosition.clone().setY(0);
        const primaryPosition = selectedTree.primaryPosition.clone().setY(0);
        state.busAnchor.position.copy(primaryPosition);
        capture.secondaryAnchor.position.copy(secondaryPosition);
        const broadsideYaw = Math.atan2(rowSide.x, rowSide.z);
        state.busAnchor.rotation.set(0, broadsideYaw, 0);
        capture.secondaryAnchor.rotation.set(0, broadsideYaw, 0);
        const groundRoot = (root) => {
            root.updateMatrixWorld(true);
            const bounds = new THREE.Box3().setFromObject(root);
            root.position.y += groundY - bounds.min.y;
            root.updateMatrixWorld(true);
        };
        groundRoot(state.busAnchor);
        groundRoot(capture.secondaryAnchor);
        primaryPosition.copy(state.busAnchor.position);
        secondaryPosition.copy(capture.secondaryAnchor.position);

        const cameraSide = selectedTree.cameraChoice.cameraSide;
        const target = selectedTree.target.clone().setY(groundY + 1.75);
        engine.camera.fov = 47;
        engine.camera.position.copy(target)
            .addScaledVector(cameraSide, 22)
            .addScaledVector(towardSun, 2.5)
            .add(new THREE.Vector3(0, 4.8, 0));
        engine.camera.lookAt(target);
        engine.camera.updateProjectionMatrix();
        engine.camera.updateMatrixWorld(true);

        capture.treeArrangement = {
            primaryPosition: primaryPosition.clone(),
            cameraSide: cameraSide.clone(),
            rowSide: rowSide.clone(),
            secondaryPosition: secondaryPosition.clone(),
            shadowDirection: shadowDirection.clone(),
            target: target.clone(),
            towardSun: towardSun.clone(),
            treeBase: treeBase.clone()
        };

        pipeline.setDebugMode('final');
        state.city.updateStaticVisibility?.(engine.camera, performance.now() + 2000);
        for (let frame = 0; frame < 6; frame += 1) engine.renderFrame();
        engine.renderer.getContext().finish();
        const diagnostics = pipeline.getDiagnostics();
        return {
            treeId: selectedTree.root.name,
            treeIndex: selectedTree.index,
            treeHeight: selectedTree.height,
            objectClearance: selectedTree.objectClearance,
            cameraClearance: selectedTree.cameraChoice.clearance,
            treeBase: treeBase.toArray(),
            primaryPosition: primaryPosition.toArray(),
            secondaryPosition: secondaryPosition.toArray(),
            shadowDirection: shadowDirection.toArray(),
            dynamicRequiredHalfExtent: diagnostics.dynamicShadows.map.projection.requiredHalfExtentMeters,
            dynamicUsableHalfExtent: diagnostics.dynamicShadows.map.projection.usableHalfExtentMeters,
            dynamicCasterIds: diagnostics.dynamicShadows.map.projection.casterIds
        };
    });

    async function renderDebugMode(mode) {
        return page.evaluate((nextMode) => {
            const { engine, sm } = window.__busSim;
            const pipeline = window.__ai532GameplayCapture.pipeline;
            pipeline.setDebugMode(nextMode);
            sm.current.city.updateStaticVisibility?.(engine.camera, performance.now() + 3000);
            for (let frame = 0; frame < 6; frame += 1) engine.renderFrame();
            engine.renderer.getContext().finish();
            return pipeline.getDiagnostics().dynamicShadows.map.projection;
        }, mode);
    }

    await renderDebugMode('liveFinal');
    await canvas.screenshot({ path: treeCurrentPath, type: 'png' });
    await renderDebugMode('final');
    await canvas.screenshot({ path: treeHybridPath, type: 'png' });
    await renderDebugMode('visibility');
    await canvas.screenshot({ path: treeStaticVisibilityPath, type: 'png' });
    const alignedDynamicProjection = await renderDebugMode('dynamicVisibility');
    await canvas.screenshot({ path: busDynamicVisibilityPath, type: 'png' });

    // Move only the coach laterally for an A/B control. Static tree visibility
    // on the player is unchanged; the coach-to-player dynamic shadow must move.
    const offsetControlPosition = await page.evaluate(() => {
        const { engine } = window.__busSim;
        const capture = window.__ai532GameplayCapture;
        capture.secondaryAnchor.position
            .copy(capture.treeArrangement.secondaryPosition)
            .addScaledVector(capture.treeArrangement.rowSide, 16);
        capture.secondaryAnchor.updateMatrixWorld(true);
        for (let frame = 0; frame < 6; frame += 1) engine.renderFrame();
        engine.renderer.getContext().finish();
        return capture.secondaryAnchor.position.toArray();
    });
    await canvas.screenshot({ path: busDynamicControlPath, type: 'png' });

    // Restore the shadow-aligned coach, then use a second real-game camera with
    // the tree in the foreground and both buses behind it.
    await page.evaluate(async () => {
        const THREE = await import('three');
        const { engine } = window.__busSim;
        const capture = window.__ai532GameplayCapture;
        const arrangement = capture.treeArrangement;
        capture.secondaryAnchor.position.copy(arrangement.secondaryPosition);
        capture.secondaryAnchor.updateMatrixWorld(true);
        engine.camera.position.copy(arrangement.treeBase)
            .addScaledVector(arrangement.towardSun, 15)
            .addScaledVector(arrangement.cameraSide, 11)
            .add(new THREE.Vector3(0, 7.5, 0));
        engine.camera.lookAt(arrangement.target);
        engine.camera.updateMatrixWorld(true);
    });
    const behindTreeProjection = await renderDebugMode('final');
    await canvas.screenshot({ path: behindTreePath, type: 'png' });

    expect(treeArrangement.treeId).toMatch(/^trees:\d+$/);
    expect(treeArrangement.treeHeight).toBeGreaterThanOrEqual(5);
    expect(treeArrangement.dynamicRequiredHalfExtent).toBeLessThanOrEqual(
        treeArrangement.dynamicUsableHalfExtent
    );
    expect(treeArrangement.dynamicCasterIds).toEqual([
        'vehicle.ai532.secondary',
        'vehicle.player'
    ]);
    expect(alignedDynamicProjection.requiredHalfExtentMeters).toBeLessThanOrEqual(
        alignedDynamicProjection.usableHalfExtentMeters
    );
    expect(behindTreeProjection.requiredHalfExtentMeters).toBeLessThanOrEqual(
        behindTreeProjection.usableHalfExtentMeters
    );
    expect(offsetControlPosition).not.toEqual(treeArrangement.secondaryPosition);

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
