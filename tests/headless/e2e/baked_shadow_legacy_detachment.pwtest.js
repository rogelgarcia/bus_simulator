// Browser regression: baked shadows must detach and later restore legacy CSM state.
import test, { expect } from '@playwright/test';

test('Baked shadows detach CSM without multiplying sunlight and restore it cleanly', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error?.message ?? String(error)));

    await page.goto('/tests/headless/harness/index.html');
    await page.waitForFunction(() => !!window.__testHooks?.getEngine?.());

    const result = await page.evaluate(async () => {
        const harness = window.__testHooks;
        await harness.loadScenario('empty', { seed: 'baked-shadow-legacy-detachment' });
        const engine = harness.getEngine();
        const THREE = await import('three');
        const { City } = await import('/src/graphics/visuals/city/City.js');
        const { StaticSunDepthCasterController } = await import(
            '/src/graphics/illumination/static_sun_depth/StaticSunDepthCasterController.js'
        );

        const city = Object.create(City.prototype);
        city.group = new THREE.Group();
        city.sunRef = {
            direction: new THREE.Vector3(40, 80, 20).normalize(),
            intensity: 2.5,
            color: new THREE.Color(0xffffff)
        };
        city.sun = new THREE.DirectionalLight(0xffffff, city.sunRef.intensity);
        city.sun.name = 'fixture-sun';
        city.sun.position.set(40, 80, 20);
        city.sunTarget = new THREE.Object3D();
        city.sunTarget.position.set(0, 0, 0);
        city.sun.target = city.sunTarget;
        city.group.add(city.sun, city.sunTarget);
        city._attached = true;
        city._csm = null;
        city._singleSunShadowMap = null;
        city._shadowSettingsKey = '';
        city._staticSunDepthCacheActive = false;
        city._extraShadowRoots = new Set();
        city._maxShadowTextureSize = () => 256;

        const receiverMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
        const receiver = new THREE.Mesh(
            new THREE.PlaneGeometry(20, 20),
            receiverMaterial
        );
        receiver.rotation.x = -Math.PI / 2;
        receiver.receiveShadow = true;
        city.group.add(receiver);
        engine.scene.add(city.group);

        engine.setShadowSettings({
            type: 'cascade',
            quality: 'low',
            cascades: 0,
            mergeCasters: true,
            instancedCasters: false
        });
        const previousCity = engine.context.city;
        engine.context.city = city;

        city.applyShadowSettings(engine);
        const initial = {
            csmActive: city._csm !== null,
            cascadeCount: city._csm?.csm?.cascades ?? 0,
            sunVisible: city.sun.visible,
            materialUsesCsm: receiverMaterial.defines?.USE_CSM === 1,
            materialCascadeCount: receiverMaterial.defines?.CSM_CASCADES ?? 0
        };

        const controller = new StaticSunDepthCasterController(engine);
        controller.activate(city);
        engine.renderer.compile(engine.scene, engine.camera);
        engine.renderer.render(engine.scene, engine.camera);
        const bakedDiagnostics = controller.getDiagnostics();
        const baked = {
            csmActive: city._csm !== null,
            sunVisible: city.sun.visible,
            sunCastShadow: city.sun.castShadow,
            materialUsesCsm: receiverMaterial.defines?.USE_CSM === 1,
            shadowLightCount: bakedDiagnostics.shadowLightCount,
            legacyShadowMapPassDisabled: bakedDiagnostics.legacyShadowMapPassDisabled
        };

        controller.deactivate();
        const restored = {
            csmActive: city._csm !== null,
            cascadeCount: city._csm?.csm?.cascades ?? 0,
            sunVisible: city.sun.visible,
            materialUsesCsm: receiverMaterial.defines?.USE_CSM === 1,
            materialCascadeCount: receiverMaterial.defines?.CSM_CASCADES ?? 0
        };

        const snapshotLegacyMode = () => {
            let visibleDirectionalLightCount = 0;
            city.group.traverse((object) => {
                if (object?.isDirectionalLight && object.visible !== false && object.intensity !== 0) {
                    visibleDirectionalLightCount += 1;
                }
            });
            return {
                csmActive: city._csm !== null,
                cascadeCount: city._csm?.csm?.cascades ?? 0,
                visibleDirectionalLightCount,
                materialUsesCsm: receiverMaterial.defines?.USE_CSM === 1,
                materialCascadeCount: receiverMaterial.defines?.CSM_CASCADES ?? 0
            };
        };
        engine.setShadowSettings({ type: 'single', quality: 'high' });
        city.applyShadowSettings(engine);
        const single = snapshotLegacyMode();
        engine.setShadowSettings({ type: 'cascade', quality: 'high', cascades: 0 });
        city.applyShadowSettings(engine);
        const cascadeHigh = snapshotLegacyMode();
        engine.setShadowSettings({ type: 'cascade', quality: 'low', cascades: 0 });
        city.applyShadowSettings(engine);
        const cascadeLowAgain = snapshotLegacyMode();

        const lateMaterial = new THREE.MeshStandardMaterial({ color: 0x707070 });
        const lateRoot = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lateMaterial);
        engine.scene.add(lateRoot);
        const registration = engine.registerDynamicIlluminationObject({
            id: 'fixture.moving-object',
            root: lateRoot,
            cast: true,
            receive: true
        });
        const lateRegistration = {
            materialUsesCsm: lateMaterial.defines?.USE_CSM === 1,
            materialCascadeCount: lateMaterial.defines?.CSM_CASCADES ?? 0
        };

        delete lateMaterial.defines.USE_CSM;
        const repairedCount = city._csm.reconcileMaterials(engine.scene);
        const repaired = {
            repairedCount,
            materialUsesCsm: lateMaterial.defines?.USE_CSM === 1,
            materialCascadeCount: lateMaterial.defines?.CSM_CASCADES ?? 0
        };

        registration.unregister();
        city._deactivateCascadedShadows();
        engine.scene.remove(lateRoot, city.group);
        lateRoot.geometry.dispose();
        lateMaterial.dispose();
        receiver.geometry.dispose();
        receiverMaterial.dispose();
        engine.context.city = previousCity;

        return {
            initial,
            baked,
            restored,
            single,
            cascadeHigh,
            cascadeLowAgain,
            lateRegistration,
            repaired
        };
    });

    expect(result.initial).toEqual({
        csmActive: true,
        cascadeCount: 2,
        sunVisible: false,
        materialUsesCsm: true,
        materialCascadeCount: 2
    });
    expect(result.baked).toEqual({
        csmActive: false,
        sunVisible: true,
        sunCastShadow: false,
        materialUsesCsm: false,
        shadowLightCount: 0,
        legacyShadowMapPassDisabled: true
    });
    expect(result.restored).toEqual({
        csmActive: true,
        cascadeCount: 2,
        sunVisible: false,
        materialUsesCsm: true,
        materialCascadeCount: 2
    });
    expect(result.single).toEqual({
        csmActive: false,
        cascadeCount: 0,
        visibleDirectionalLightCount: 1,
        materialUsesCsm: false,
        materialCascadeCount: 0
    });
    expect(result.cascadeHigh).toEqual({
        csmActive: true,
        cascadeCount: 4,
        visibleDirectionalLightCount: 4,
        materialUsesCsm: true,
        materialCascadeCount: 4
    });
    expect(result.cascadeLowAgain).toEqual({
        csmActive: true,
        cascadeCount: 2,
        visibleDirectionalLightCount: 2,
        materialUsesCsm: true,
        materialCascadeCount: 2
    });
    expect(result.lateRegistration).toEqual({
        materialUsesCsm: true,
        materialCascadeCount: 2
    });
    expect(result.repaired.repairedCount).toBeGreaterThan(0);
    expect(result.repaired).toMatchObject({
        materialUsesCsm: true,
        materialCascadeCount: 2
    });
    expect(errors).toEqual([]);
});
