// Browser acceptance for AI 531 package staging, atomic activation, and current fallback.
import test, { expect } from '@playwright/test';

test('AI 531 static-sun pipeline activates only a verified complete set and rolls back atomically', async ({ page }) => {
    test.setTimeout(120_000);
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto('/tests/headless/harness/index.html');
    await page.waitForFunction(() => !!window.__testHooks?.getEngine?.());
    await page.evaluate(() => window.__testHooks.loadScenario('empty', { seed: 'ai531-pipeline' }));

    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const packageApi = await import('/src/app/illumination/package/index.js');
        const staticSun = await import('/src/app/illumination/static_sun_depth/index.js');
        const graphics = await import('/src/graphics/illumination/static_sun_depth/index.js');
        const engine = window.__testHooks.getEngine();
        engine.setPostProcessingEnabled?.(false);
        engine.renderer.shadowMap.enabled = true;

        const ids = {
            cityId: 'fixture.ai531',
            lightingProfileId: 'fixture.ai531.sun.v1',
            selectedCapabilityProfileId: 'development.static_sun_v1',
            resolvedSourceSha256: '6'.repeat(64),
            channelSourceSha256: '2'.repeat(64),
            channelProfileSha256: '7'.repeat(64)
        };
        const pointDirection = [0, 1, 0];
        const createDescriptor = (compilerSignatureSha256, tileContentSha256 = '5'.repeat(64)) => ({
            schema: staticSun.STATIC_SUN_DEPTH_TILE_SET_SCHEMA,
            identity: {
                channelId: 'static_sun_depth',
                channelVersion: 1,
                cityId: ids.cityId,
                casterInventorySha256: '1'.repeat(64),
                channelSourceSha256: ids.channelSourceSha256,
                compilerSignatureSha256,
                sunPointDirectionWorld: pointDirection,
                basis: staticSun.createStableStaticSunDepthBasis(pointDirection, [0, 0, 0]),
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
                contentSha256: tileContentSha256
            }]
        });
        const pixels = new Uint8Array(6 * 6 * 2);
        for (let offset = 0; offset < pixels.length; offset += 2) {
            staticSun.packStaticSunDepthQuantizedRg8(65535, pixels, offset);
        }
        const occupied = staticSun.encodeStaticSunDepthMeters(-1, createDescriptor('3'.repeat(64)).identity.encoding);
        for (let y = 0; y < 6; y += 1) {
            for (let x = 0; x <= 2; x += 1) {
                staticSun.packStaticSunDepthQuantizedRg8(occupied, pixels, (y * 6 + x) * 2);
            }
        }
        const tileContentSha256 = await packageApi.rawSha256Hex(pixels);
        const compilerDescriptor = {
            backend: 'cycles_cpu',
            buildHash: 'fixture-build',
            scriptSha256: '9'.repeat(64),
            version: '5.2.1 LTS'
        };
        const build = (descriptor, payload = pixels) => packageApi.buildIlluminationBinaryPackage({
            cityId: ids.cityId,
            lightingProfileId: ids.lightingProfileId,
            selectedCapabilityProfileId: ids.selectedCapabilityProfileId,
            source: {
                resolvedSourceSha256: ids.resolvedSourceSha256,
                schema: 'fixture-source-v1'
            },
            compilerDescriptor,
            channels: [{
                id: 'static_sun_depth',
                required: true,
                sourceSha256: ids.channelSourceSha256,
                profileSha256: ids.channelProfileSha256
            }],
            chunks: [{
                id: 'static_sun_depth.tiles.rg8',
                channelId: 'static_sun_depth',
                data: payload,
                resourceType: 'texture_2d_array',
                encoding: 'rg8_unorm',
                precision: 'unorm8',
                dimensions: { width: 6, height: 6, depth: 1, components: 2 },
                rowOrigin: 'lower_left',
                coordinateTransform: descriptor,
                mipLevel: 0,
                requiredRuntimeCapabilities: [
                    'fragment_highp_float',
                    'rg8_unorm',
                    'texture_2d_array',
                    'webgl2'
                ]
            }]
        });
        const preliminary = await build(createDescriptor('3'.repeat(64), tileContentSha256));
        const descriptor = createDescriptor(preliminary.manifest.compiler.signatureSha256, tileContentSha256);
        const packageResult = await build(descriptor);
        const invalidTilePackageResult = await build(
            createDescriptor(preliminary.manifest.compiler.signatureSha256, '5'.repeat(64))
        );
        const invalidGuardPixels = pixels.slice();
        invalidGuardPixels[0] ^= 0x01;
        const invalidGuardSha256 = await packageApi.rawSha256Hex(invalidGuardPixels);
        const invalidGuardPackageResult = await build(
            createDescriptor(preliminary.manifest.compiler.signatureSha256, invalidGuardSha256),
            invalidGuardPixels
        );
        let fetchCount = 0;
        let liveResolvedSourceSha256 = ids.resolvedSourceSha256;
        let staticSunUploadCount = 0;
        const originalRendererInitTexture = engine.renderer.initTexture.bind(engine.renderer);
        engine.renderer.initTexture = (texture) => {
            if (texture?.isDataArrayTexture) staticSunUploadCount += 1;
            return originalRendererInitTexture(texture);
        };
        const pipeline = new graphics.StaticSunDepthPipeline(engine, {
            fetchPackage: async (request) => {
                fetchCount += 1;
                const source = request.url.endsWith('/invalid-tile')
                    ? invalidTilePackageResult.bytes
                    : (request.url.endsWith('/invalid-guard')
                        ? invalidGuardPackageResult.bytes
                        : packageResult.bytes);
                const bytes = source.slice();
                if (request.url.endsWith('/corrupt')) bytes[bytes.length - 1] ^= 0xff;
                return bytes;
            },
            getLiveStaticSunDepthIdentity: () => ({
                alphaSemanticsSha256: '4'.repeat(64),
                casterInventorySha256: '1'.repeat(64),
                cityId: ids.cityId,
                developmentCacheAllowed: true,
                lightingProfileId: ids.lightingProfileId,
                resolvedSourceSha256: liveResolvedSourceSha256,
                staticSunDepthSourceSha256: ids.channelSourceSha256
            })
        });
        const previousPipeline = engine.installIlluminationPipeline(pipeline);
        const previousCity = engine.context.city;

        const root = new THREE.Group();
        root.name = 'Ai531AtomicCity';
        const cityMaterial = new THREE.MeshPhysicalMaterial({ color: 0xb9c7d6, roughness: 0.8, clearcoat: 0.2 });
        const cityMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), cityMaterial);
        cityMesh.castShadow = true;
        cityMesh.receiveShadow = true;
        root.add(cityMesh);
        const busMaterial = new THREE.MeshStandardMaterial({ color: 0xe0b34b });
        const busMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.6), busMaterial);
        busMesh.castShadow = true;
        busMesh.position.set(3, 0, 0);
        const sun = new THREE.DirectionalLight(0xffffff, 2);
        sun.position.set(0, 8, 0);
        sun.castShadow = true;
        engine.scene.add(root, busMesh, sun, sun.target);
        engine.context.city = {
            group: root,
            cityId: ids.cityId,
            sun,
            sunRef: { direction: new THREE.Vector3(...pointDirection) },
            _csm: null,
            _shadowCuller: null
        };
        engine.camera.position.set(5, 4, 7);
        engine.camera.lookAt(0, 0, 0);
        engine.camera.updateMatrixWorld(true);
        const originalRendererCompile = engine.renderer.compile.bind(engine.renderer);
        let rejectNextCityCompile = true;
        const cityCompileCasterStates = [];
        engine.renderer.compile = (scene, camera) => {
            if (scene === engine.scene) {
                cityCompileCasterStates.push(cityMesh.castShadow);
                if (rejectNextCityCompile) throw new Error('ai531_exact_city_compile_rejected');
            }
            return originalRendererCompile(scene, camera);
        };

        const expectations = {
            cityId: ids.cityId,
            lightingProfileId: ids.lightingProfileId,
            selectedCapabilityProfileId: ids.selectedCapabilityProfileId,
            resolvedSourceSha256: ids.resolvedSourceSha256,
            staticSunDepthSourceSha256: ids.channelSourceSha256
        };
        engine.renderFrame();
        const currentBeforeLoad = {
            fetchCount,
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            diagnostics: pipeline.getDiagnostics()
        };

        await pipeline.setMode('auto', { url: '/fixture/invalid-tile', expectations });
        engine.renderFrame();
        const invalidTileFallback = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            active: pipeline.getDiagnostics().active !== null,
            staticSunUploadCount,
            controller: pipeline.getDiagnostics().runtime.controller
        };

        await pipeline.setMode('auto', { url: '/fixture/invalid-guard', expectations });
        engine.renderFrame();
        const invalidGuardFallback = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            active: pipeline.getDiagnostics().active !== null,
            staticSunUploadCount,
            controller: pipeline.getDiagnostics().runtime.controller
        };

        await pipeline.setMode('auto', { url: '/fixture/valid', expectations });
        const readyBeforeCommit = {
            caster: cityMesh.castShadow,
            state: pipeline.getDiagnostics().runtime.controller.state,
            phase: pipeline.getDiagnostics().runtime.controller.phase
        };
        engine.renderFrame();
        const rejectedCityCompile = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            active: pipeline.getDiagnostics().active !== null,
            controller: pipeline.getDiagnostics().runtime.controller
        };
        rejectNextCityCompile = false;
        await pipeline.setMode('auto', { url: '/fixture/valid', expectations });
        engine.renderFrame();
        const active = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            diagnostics: pipeline.getDiagnostics()
        };
        pipeline.setDebugMode('currentDifference');
        engine.renderFrame();
        const comparison = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            active: pipeline.getDiagnostics().active !== null
        };
        pipeline.setDebugMode('final');
        engine.renderFrame();
        const afterComparison = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            active: pipeline.getDiagnostics().active !== null
        };

        const receiverDriftMaterial = new THREE.MeshStandardMaterial({ color: 0x8ca0b5 });
        cityMesh.material = receiverDriftMaterial;
        engine.renderFrame();
        const receiverDriftFallback = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            active: pipeline.getDiagnostics().active !== null,
            controller: pipeline.getDiagnostics().runtime.controller
        };
        cityMesh.material = cityMaterial;
        await pipeline.setMode('auto', { url: '/fixture/valid', expectations });
        engine.renderFrame();
        const receiverDriftReactivated = pipeline.getDiagnostics().active !== null
            && cityMesh.castShadow === false;

        const stableSunRefDescriptor = Object.getOwnPropertyDescriptor(engine.context.city, 'sunRef');
        Object.defineProperty(engine.context.city, 'sunRef', {
            configurable: true,
            get() {
                throw new Error('ai531_live_identity_getter_failed');
            }
        });
        engine.renderFrame();
        const exceptionalIdentityFallback = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            active: pipeline.getDiagnostics().active !== null,
            lastError: pipeline.getDiagnostics().lastError
        };
        Object.defineProperty(engine.context.city, 'sunRef', stableSunRefDescriptor);
        await pipeline.setMode('auto', { url: '/fixture/valid', expectations });
        engine.renderFrame();
        const exceptionalIdentityReactivated = pipeline.getDiagnostics().active !== null
            && cityMesh.castShadow === false;

        liveResolvedSourceSha256 = 'b'.repeat(64);
        engine.renderFrame();
        const liveDriftFallback = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            active: pipeline.getDiagnostics().active !== null
        };
        liveResolvedSourceSha256 = ids.resolvedSourceSha256;
        await pipeline.setMode('auto', { url: '/fixture/valid', expectations });
        engine.renderFrame();
        const liveDriftReactivated = pipeline.getDiagnostics().active !== null && cityMesh.castShadow === false;

        await pipeline.load({
            url: '/fixture/valid',
            expectations: { ...expectations, staticSunDepthSourceSha256: 'a'.repeat(64) }
        });
        const staleBeforeCommit = {
            caster: cityMesh.castShadow,
            active: pipeline.getDiagnostics().active !== null
        };
        engine.renderFrame();
        const staleFallback = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            diagnostics: pipeline.getDiagnostics()
        };

        await pipeline.setMode('auto', { url: '/fixture/valid', expectations });
        engine.renderFrame();
        const reactivated = pipeline.getDiagnostics().active !== null && cityMesh.castShadow === false;
        await pipeline.load({ url: '/fixture/corrupt', expectations });
        const corruptBeforeCommit = {
            caster: cityMesh.castShadow,
            active: pipeline.getDiagnostics().active !== null
        };
        engine.renderFrame();
        const corruptFallback = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            diagnostics: pipeline.getDiagnostics()
        };

        const fetchCountBeforeCurrent = fetchCount;
        await pipeline.setMode('current');
        engine.renderFrame();
        const explicitCurrent = {
            fetchDelta: fetchCount - fetchCountBeforeCurrent,
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            diagnostics: pipeline.getDiagnostics()
        };

        await pipeline.setMode('auto', { url: '/fixture/valid', expectations });
        engine.renderFrame();
        pipeline._onContextLost();
        const contextLossFallback = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            active: pipeline.getDiagnostics().active !== null,
            controller: pipeline.getDiagnostics().runtime.controller
        };

        await pipeline.setMode('auto', { url: '/fixture/valid', expectations });
        engine.renderFrame();
        engine.renderer.compile = originalRendererCompile;
        engine.renderer.initTexture = originalRendererInitTexture;
        engine.installIlluminationPipeline(previousPipeline ?? null);
        const uninstallFallback = {
            caster: cityMesh.castShadow,
            bus: busMesh.castShadow,
            active: pipeline.getDiagnostics().active !== null,
            controller: pipeline.getDiagnostics().runtime.controller
        };
        engine.context.city = previousCity ?? null;
        await pipeline.dispose();
        root.removeFromParent();
        busMesh.removeFromParent();
        sun.removeFromParent();
        sun.target.removeFromParent();
        cityMesh.geometry.dispose();
        cityMaterial.dispose();
        receiverDriftMaterial.dispose();
        busMesh.geometry.dispose();
        busMaterial.dispose();
        return {
            currentBeforeLoad,
            invalidTileFallback,
            invalidGuardFallback,
            readyBeforeCommit,
            rejectedCityCompile,
            cityCompileCasterStates,
            active,
            comparison,
            afterComparison,
            receiverDriftFallback,
            receiverDriftReactivated,
            exceptionalIdentityFallback,
            exceptionalIdentityReactivated,
            liveDriftFallback,
            liveDriftReactivated,
            staleBeforeCommit,
            staleFallback,
            reactivated,
            corruptBeforeCommit,
            corruptFallback,
            explicitCurrent,
            contextLossFallback,
            uninstallFallback,
            fetchCount
        };
    });

    expect(result.currentBeforeLoad.fetchCount).toBe(0);
    expect(result.currentBeforeLoad.caster).toBe(true);
    expect(result.currentBeforeLoad.bus).toBe(true);
    expect(result.currentBeforeLoad.diagnostics.active).toBeNull();
    expect(result.invalidTileFallback.caster).toBe(true);
    expect(result.invalidTileFallback.bus).toBe(true);
    expect(result.invalidTileFallback.active).toBe(false);
    expect(result.invalidTileFallback.staticSunUploadCount).toBe(0);
    expect(result.invalidTileFallback.controller.state).toBe('fallback');
    expect(result.invalidTileFallback.controller.reason).toBe('program_preparation_failure');
    expect(result.invalidGuardFallback.caster).toBe(true);
    expect(result.invalidGuardFallback.bus).toBe(true);
    expect(result.invalidGuardFallback.active).toBe(false);
    expect(result.invalidGuardFallback.staticSunUploadCount).toBe(0);
    expect(result.invalidGuardFallback.controller.state).toBe('fallback');
    expect(result.invalidGuardFallback.controller.reason).toBe('program_preparation_failure');
    expect(result.readyBeforeCommit).toEqual({ caster: true, state: 'loading', phase: 'ready_to_commit' });
    expect(result.rejectedCityCompile.caster).toBe(true);
    expect(result.rejectedCityCompile.bus).toBe(true);
    expect(result.rejectedCityCompile.active).toBe(false);
    expect(result.rejectedCityCompile.controller.state).toBe('failed');
    expect(result.rejectedCityCompile.controller.reason).toBe('activation_failure');
    expect(result.rejectedCityCompile.controller.effectiveMode).toBe('current');
    expect(result.cityCompileCasterStates.length).toBeGreaterThanOrEqual(2);
    expect(result.cityCompileCasterStates.every((value) => value === true)).toBe(true);
    expect(result.active.caster).toBe(false);
    expect(result.active.bus).toBe(true);
    expect(result.active.diagnostics.active).not.toBeNull();
    expect(result.active.diagnostics.runtime.controller.effectiveMode).toBe('baked');
    expect(result.comparison).toEqual({ caster: true, bus: true, active: true });
    expect(result.afterComparison).toEqual({ caster: false, bus: true, active: true });
    expect(result.receiverDriftFallback.caster).toBe(true);
    expect(result.receiverDriftFallback.bus).toBe(true);
    expect(result.receiverDriftFallback.active).toBe(false);
    expect(result.receiverDriftFallback.controller.reason).toBe('static_receiver_material_drift');
    expect(result.receiverDriftReactivated).toBe(true);
    expect(result.exceptionalIdentityFallback.caster).toBe(true);
    expect(result.exceptionalIdentityFallback.bus).toBe(true);
    expect(result.exceptionalIdentityFallback.active).toBe(false);
    expect(result.exceptionalIdentityFallback.lastError).toContain('ai531_live_identity_getter_failed');
    expect(result.exceptionalIdentityReactivated).toBe(true);
    expect(result.liveDriftFallback).toEqual({ caster: true, bus: true, active: false });
    expect(result.liveDriftReactivated).toBe(true);
    expect(result.staleBeforeCommit).toEqual({ caster: false, active: true });
    expect(result.staleFallback.caster).toBe(true);
    expect(result.staleFallback.bus).toBe(true);
    expect(result.staleFallback.diagnostics.active).toBeNull();
    expect(result.staleFallback.diagnostics.runtime.controller.effectiveMode).toBe('current');
    expect(result.staleFallback.diagnostics.runtime.controller.reason).toBe('source_mismatch');
    expect(result.staleFallback.diagnostics.runtime.controller.causeState).toBe('stale');
    expect(result.reactivated).toBe(true);
    expect(result.corruptBeforeCommit).toEqual({ caster: false, active: true });
    expect(result.corruptFallback.caster).toBe(true);
    expect(result.corruptFallback.bus).toBe(true);
    expect(result.corruptFallback.diagnostics.active).toBeNull();
    expect(result.corruptFallback.diagnostics.runtime.controller.effectiveMode).toBe('current');
    expect(result.corruptFallback.diagnostics.runtime.controller.reason).toBe('integrity_failure');
    expect(result.corruptFallback.diagnostics.runtime.controller.causeState).toBe('failed');
    expect(result.explicitCurrent.fetchDelta).toBe(0);
    expect(result.explicitCurrent.caster).toBe(true);
    expect(result.explicitCurrent.bus).toBe(true);
    expect(result.explicitCurrent.diagnostics.active).toBeNull();
    expect(result.contextLossFallback.caster).toBe(true);
    expect(result.contextLossFallback.bus).toBe(true);
    expect(result.contextLossFallback.active).toBe(false);
    expect(result.contextLossFallback.controller.reason).toBe('webgl_context_lost');
    expect(result.uninstallFallback.caster).toBe(true);
    expect(result.uninstallFallback.bus).toBe(true);
    expect(result.uninstallFallback.active).toBe(false);
    expect(result.uninstallFallback.controller.reason).toBe('pipeline_removed');
    expect(result.fetchCount).toBe(12);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter((message) => /shader error|VALIDATE_STATUS|StaticSunDepth/i.test(message))).toEqual([]);
});
