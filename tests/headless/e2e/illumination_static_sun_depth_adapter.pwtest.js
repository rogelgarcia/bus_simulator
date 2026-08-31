// Browser acceptance for AI 531 shader compilation, current identity, debug variants, and caster rollback.
import test, { expect } from '@playwright/test';

test('AI 531 static-sun adapter compiles on pinned Three and preserves current/caster ownership', async ({ page }) => {
    test.setTimeout(90_000);
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto('/tests/headless/harness/index.html');
    await page.waitForFunction(() => !!window.__testHooks?.getEngine?.());
    await page.evaluate(() => window.__testHooks.loadScenario('empty', { seed: 'ai531-adapter' }));
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const app = await import('/src/app/illumination/static_sun_depth/index.js');
        const graphics = await import('/src/graphics/illumination/static_sun_depth/index.js');
        const registry = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const { CityCascadedShadows } = await import('/src/graphics/visuals/city/CityCascadedShadows.js');
        const engine = window.__testHooks.getEngine();
        engine.setPostProcessingEnabled?.(false);
        engine.renderer.shadowMap.enabled = true;

        const pointDirection = [0, 1, 0];
        const basis = app.createStableStaticSunDepthBasis(pointDirection, [0, 0, 0]);
        const descriptor = {
            schema: app.STATIC_SUN_DEPTH_TILE_SET_SCHEMA,
            identity: {
                channelId: 'static_sun_depth',
                channelVersion: 1,
                cityId: 'fixture.ai531',
                casterInventorySha256: '1'.repeat(64),
                channelSourceSha256: '2'.repeat(64),
                compilerSignatureSha256: '3'.repeat(64),
                sunPointDirectionWorld: pointDirection,
                basis,
                layout: {
                    order: 'row-major-y-then-x-v1',
                    lookup: 'half-open-min-inclusive-max-exclusive-v1',
                    rowOrigin: 'min-light-y-v1',
                    guardPolicy: 'copy-adjacent-clamp-exterior-v1',
                    tileCount: [1, 1],
                    interiorTexels: [4, 4],
                    guardTexels: 1,
                    texelSizeMeters: 1,
                    boundsLightMeters: { min: [-2, -2], max: [2, 2] }
                },
                alpha: {
                    model: 'evaluated-runtime-coverage-v1',
                    coverage: 'opacity-times-vertex-alpha-times-map-a-times-alpha-map-g-v1',
                    threshold: 'discard-when-coverage-lt-alpha-test-v1',
                    sidedness: 'material-side-and-shadow-side-v1',
                    forcedOpaque: 'shadow-as-opaque-v1',
                    semanticsSha256: '4'.repeat(64)
                },
                encoding: {
                    id: 'rg8-packed-linear-depth-v1',
                    quantization: 'linear-endpoints-inclusive-v1',
                    redChannel: 'quantized-high-byte-v1',
                    greenChannel: 'quantized-low-byte-v1',
                    minDepthMeters: -10,
                    maxDepthMeters: 10,
                    maxQuantized: 65534,
                    emptyQuantized: 65535
                },
                sampling: {
                    comparison: 'receiver-depth-minus-bias-lte-caster-depth-v1',
                    emptyPolicy: 'visible-v1',
                    outOfBoundsPolicy: 'fail-closed-zero-visibility-v1',
                    bias: {
                        model: 'constant-plus-normal-offset-v1',
                        constantMeters: 0.01,
                        normalOffsetScaleMeters: 0.02
                    },
                    pcf: { model: 'square-nearest-box-v1', radiusTexels: 1 }
                }
            },
            tiles: [{
                id: 'tile.0.0',
                coordinates: [0, 0],
                interiorBoundsLightMeters: { min: [-2, -2], max: [2, 2] },
                storedTexels: [6, 6],
                contentSha256: '5'.repeat(64)
            }]
        };
        const validated = app.validateStaticSunDepthTileSetDescriptor(descriptor);
        const bytes = new Uint8Array(6 * 6 * 2);
        for (let offset = 0; offset < bytes.length; offset += 2) app.packStaticSunDepthQuantizedRg8(65535, bytes, offset);
        const casterDepth = app.encodeStaticSunDepthMeters(-1, validated.identity.encoding);
        for (let y = 1; y <= 4; y += 1) {
            for (let x = 1; x <= 2; x += 1) app.packStaticSunDepthQuantizedRg8(casterDepth, bytes, (y * 6 + x) * 2);
        }
        const texture = new THREE.DataArrayTexture(bytes, 6, 6, 1);
        texture.format = THREE.RGFormat;
        texture.type = THREE.UnsignedByteType;
        texture.internalFormat = 'RG8';
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;

        const root = new THREE.Group();
        root.name = 'Ai531StaticCity';
        const material = new THREE.MeshPhysicalMaterial({ color: 0xb9c7d6, roughness: 0.8, clearcoat: 0.2 });
        const originalCompile = material.onBeforeCompile;
        const originalKey = material.customProgramCacheKey();
        const receiver = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), material);
        receiver.rotation.x = -Math.PI / 2;
        receiver.receiveShadow = true;
        root.add(receiver);
        const caster = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 1, 3.5),
            new THREE.MeshStandardMaterial({ color: 0x59636f })
        );
        caster.position.set(-1, 1, 0);
        caster.castShadow = true;
        root.add(caster);
        const busOutside = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial());
        busOutside.castShadow = true;
        busOutside.position.set(3, 0.25, 0);
        engine.scene.add(root, busOutside);
        const sun = new THREE.DirectionalLight(0xffffff, 3);
        sun.position.set(0, 8, 0);
        sun.castShadow = true;
        engine.scene.add(sun, sun.target);

        const binding = graphics.createStaticSunDepthShaderBinding({ descriptor: validated, texture });
        const materials = new graphics.StaticSunDepthMaterialSet();
        materials.prepare(root, binding, { outsideRoot: engine.scene });
        materials.activate();
        binding.updateCamera(engine.camera);
        engine.renderer.compile(engine.scene, engine.camera);
        engine.renderer.render(engine.scene, engine.camera);
        const activeSnapshot = registry.getMaterialShaderHookRegistrySnapshot(material);
        const activeKey = material.customProgramCacheKey();
        materials.setDebugMode('seam');
        engine.renderer.render(engine.scene, engine.camera);
        const csm = new CityCascadedShadows({
            camera: engine.camera,
            parent: engine.scene,
            sunRef: {
                direction: new THREE.Vector3(...pointDirection),
                color: new THREE.Color(0xffffff),
                intensity: 1
            },
            preset: {
                splits: [10, 20],
                mapSizeScales: [1, 1],
                bias: -0.00015,
                normalBias: 0.02,
                radius: 1
            },
            cascades: 2,
            mapSize: 256,
            maxTextureSize: 256
        });
        const csmAnchor = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
        const csmDirectAnchorCount = THREE.ShaderChunk.lights_fragment_begin.split(csmAnchor).length - 1;
        csm.registerMaterial(material);
        csm.updateFrame(engine);
        materials.setDebugMode('final');
        engine.renderer.compile(engine.scene, engine.camera);
        const csmHooks = registry.getMaterialShaderHookRegistrySnapshot(material).hooks;
        csm.dispose();
        materials.deactivate();
        const disabledKey = material.customProgramCacheKey();

        const fakeCity = { group: root, cityId: 'fixture.ai531', sunRef: { direction: new THREE.Vector3(0, 1, 0) }, _csm: null, _shadowCuller: null };
        const previousCity = engine.context.city;
        engine.context.city = fakeCity;
        const casters = new graphics.StaticSunDepthCasterController(engine);
        casters.activate(fakeCity);
        const suppressed = { city: caster.castShadow, bus: busOutside.castShadow, verified: casters.verifySuppressed() };
        casters.deactivate('test_current');
        const restored = { city: caster.castShadow, bus: busOutside.castShadow };
        engine.context.city = previousCity ?? null;

        materials.dispose();
        const finalCompileRestored = material.onBeforeCompile === originalCompile;
        root.removeFromParent();
        busOutside.removeFromParent();
        sun.removeFromParent();
        sun.target.removeFromParent();
        receiver.geometry.dispose();
        caster.geometry.dispose();
        busOutside.geometry.dispose();
        material.dispose();
        caster.material.dispose();
        busOutside.material.dispose();
        texture.dispose();
        return {
            revision: THREE.REVISION,
            activeHooks: activeSnapshot.hooks,
            activeKeyChanged: activeKey !== originalKey,
            csmDirectAnchorCount,
            csmHooks,
            disabledKeyExact: disabledKey === originalKey,
            finalCompileRestored,
            suppressed,
            restored,
            programs: engine.renderer.info.programs?.length ?? 0
        };
    });

    expect(result.revision).toBe('183');
    expect(result.activeHooks.some((hook) => hook.id === 'illumination.static_sun_depth' && hook.enabled)).toBe(true);
    expect(result.activeKeyChanged).toBe(true);
    expect(result.csmDirectAnchorCount).toBe(7);
    expect(result.csmHooks.map((hook) => hook.id)).toEqual(['city.cascaded_shadows', 'illumination.static_sun_depth']);
    expect(result.disabledKeyExact).toBe(true);
    expect(result.finalCompileRestored).toBe(true);
    expect(result.suppressed).toEqual({ city: false, bus: true, verified: true });
    expect(result.restored).toEqual({ city: true, bus: true });
    expect(result.programs).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter((message) => /shader error|VALIDATE_STATUS|StaticSunDepth/i.test(message))).toEqual([]);
});
