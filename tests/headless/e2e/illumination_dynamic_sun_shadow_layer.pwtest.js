// Browser acceptance for AI 532 shared moving-object shadow ownership and rendering.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test, { expect } from '@playwright/test';

const CAPTURE_DIRECTORY = fileURLToPath(new URL(
    '../../artifacts/screens/illumination_532/',
    import.meta.url
));

async function writeCapture(name, dataUrl) {
    const prefix = 'data:image/png;base64,';
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) {
        throw new TypeError(`AI 532 capture '${name}' is not a PNG data URL.`);
    }
    await mkdir(CAPTURE_DIRECTORY, { recursive: true });
    await writeFile(`${CAPTURE_DIRECTORY}${name}`, Buffer.from(dataUrl.slice(prefix.length), 'base64'));
}

test('AI 532 renders two interacting moving objects into one texel-snapped dynamic map', async ({ page }) => {
    test.setTimeout(90_000);
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/tests/headless/harness/index.html');
    await page.waitForFunction(() => !!window.__testHooks?.getEngine?.());
    await page.evaluate(() => window.__testHooks.loadScenario('empty', { seed: 'ai532-dynamic-layer' }));

    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { DynamicSunShadowLayer } = await import(
            '/src/graphics/illumination/dynamic_sun_shadow/index.js'
        );
        const engine = window.__testHooks.getEngine();
        engine.setPostProcessingEnabled?.(false);

        const geometry = new THREE.BoxGeometry(1.5, 2, 3);
        const materialA = new THREE.MeshStandardMaterial({ color: 0xcc5533 });
        const materialB = new THREE.MeshPhysicalMaterial({
            color: 0x3366cc,
            roughness: 0.7,
            clearcoat: 0.2
        });
        const glassMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x99ccff,
            transparent: true,
            opacity: 0.25,
            transmission: 0.5
        });
        const objectA = new THREE.Group();
        const objectB = new THREE.Group();
        objectA.name = 'DynamicVehicleA';
        objectB.name = 'DynamicVehicleB';
        const meshA = new THREE.Mesh(geometry, materialA);
        const meshB = new THREE.Mesh(geometry, materialB);
        meshA.castShadow = true;
        meshA.receiveShadow = true;
        meshB.castShadow = true;
        meshB.receiveShadow = true;
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.1), glassMaterial);
        glass.position.y = 1.2;
        glass.castShadow = true;
        glass.receiveShadow = true;
        objectA.position.set(-2, 1, 0);
        objectB.position.set(2, 1, 0.5);
        objectA.add(meshA, glass);
        objectB.add(meshB);
        engine.scene.add(objectA, objectB);

        const layer = new DynamicSunShadowLayer(engine.renderer, {
            mapSize: 64,
            worldUnitsPerTexel: 0.25,
            paddingTexels: 2,
            receiverMinimumY: 0,
            depthPaddingMeters: 1
        });
        const handleA = layer.register({ id: 'vehicle.a', root: objectA });
        const handleB = layer.register({ id: 'vehicle.b', root: objectB });
        layer.activate();
        const activeCasterFlags = [meshA.castShadow, meshB.castShadow, glass.castShadow];
        const binding = layer.render([0.25, 1, 0.2]);
        const target = layer.getDebugRenderTarget();
        const pixels = new Uint8Array(64 * 64 * 4);
        engine.renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels);
        let nonClearPixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
            if (pixels[offset] < 254 || pixels[offset + 1] < 254
                || pixels[offset + 2] < 254 || pixels[offset + 3] < 254) {
                nonClearPixels += 1;
            }
        }
        const first = layer.getDiagnostics();

        objectA.position.x += 0.05;
        objectB.position.z -= 0.05;
        objectA.updateWorldMatrix(true, true);
        objectB.updateWorldMatrix(true, true);
        layer.render([0.25, 1, 0.2]);
        const second = layer.getDiagnostics();

        layer.deactivate();
        const resolutionChanged = layer.setResolution({
            mapSize: 128,
            worldUnitsPerTexel: 0.125
        });
        layer.activate();
        const highBinding = layer.render([0.25, 1, 0.2]);
        const high = layer.getDiagnostics();
        const highTarget = layer.getDebugRenderTarget();
        layer.deactivate();
        const restoredCasterFlags = [meshA.castShadow, meshB.castShadow, glass.castShadow];
        const removed = [handleA.unregister(), handleB.unregister()];
        layer.dispose();
        objectA.removeFromParent();
        objectB.removeFromParent();
        geometry.dispose();
        glass.geometry.dispose();
        materialA.dispose();
        materialB.dispose();
        glassMaterial.dispose();

        return {
            activeCasterFlags,
            bindingEnabled: binding.enabled,
            nonClearPixels,
            first: {
                active: first.active,
                sharedInteractionMap: first.sharedInteractionMap,
                registrationIds: first.registrations.map((entry) => entry.id),
                casterMeshCount: first.metrics.casterMeshCount,
                receiverObjectCount: first.metrics.receiverObjectCount,
                drawCalls: first.metrics.drawCalls,
                triangles: first.metrics.triangles,
                projectionCasterIds: first.map.projection.casterIds,
                worldUnitsPerTexel: first.map.projection.worldUnitsPerTexel
            },
            secondRenderCount: second.metrics.renders,
            resolutionChanged,
            high: {
                bindingEnabled: highBinding.enabled,
                size: high.map.size,
                targetSize: [highTarget.width, highTarget.height],
                worldUnitsPerTexel: high.map.worldUnitsPerTexel,
                estimatedGpuBytes: high.map.estimatedGpuBytes,
                linearCoverageMeters: high.map.size * high.map.worldUnitsPerTexel,
                registrations: high.registrations.map((entry) => entry.id)
            },
            restoredCasterFlags,
            removed
        };
    });

    expect(result.activeCasterFlags).toEqual([false, false, false]);
    expect(result.bindingEnabled).toBe(true);
    expect(result.nonClearPixels).toBeGreaterThan(0);
    expect(result.first).toEqual({
        active: true,
        sharedInteractionMap: true,
        registrationIds: ['vehicle.a', 'vehicle.b'],
        casterMeshCount: 2,
        receiverObjectCount: 2,
        drawCalls: 2,
        triangles: 24,
        projectionCasterIds: ['vehicle.a', 'vehicle.b'],
        worldUnitsPerTexel: 0.25
    });
    expect(result.secondRenderCount).toBe(2);
    expect(result.resolutionChanged).toBe(true);
    expect(result.high).toEqual({
        bindingEnabled: true,
        size: 128,
        targetSize: [128, 128],
        worldUnitsPerTexel: 0.125,
        estimatedGpuBytes: 128 * 128 * 8,
        linearCoverageMeters: 16,
        registrations: ['vehicle.a', 'vehicle.b']
    });
    expect(result.restoredCasterFlags).toEqual([true, true, true]);
    expect(result.removed).toEqual([true, true]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
});

test('AI 532 shared map lets one moving object shadow another per fragment', async ({ page }) => {
    test.setTimeout(90_000);
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/tests/headless/harness/index.html');
    await page.waitForFunction(() => !!window.__testHooks?.getEngine?.());
    await page.evaluate(() => window.__testHooks.loadScenario('empty', { seed: 'ai532-interaction' }));

    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const staticApp = await import('/src/app/illumination/static_sun_depth/index.js');
        const staticGraphics = await import('/src/graphics/illumination/static_sun_depth/index.js');
        const { DynamicSunShadowLayer } = await import(
            '/src/graphics/illumination/dynamic_sun_shadow/index.js'
        );
        const engine = window.__testHooks.getEngine();
        engine.setPostProcessingEnabled?.(false);
        engine.renderer.shadowMap.enabled = true;

        const pointDirection = [0, 1, 0];
        const descriptor = {
            schema: staticApp.STATIC_SUN_DEPTH_TILE_SET_SCHEMA,
            identity: {
                channelId: 'static_sun_depth',
                channelVersion: 1,
                cityId: 'fixture.ai532',
                casterInventorySha256: '1'.repeat(64),
                channelSourceSha256: '2'.repeat(64),
                compilerSignatureSha256: '3'.repeat(64),
                sunPointDirectionWorld: pointDirection,
                basis: staticApp.createStableStaticSunDepthBasis(pointDirection, [0, 0, 0]),
                layout: {
                    order: 'row-major-y-then-x-v1',
                    lookup: 'half-open-min-inclusive-max-exclusive-v1',
                    rowOrigin: 'min-light-y-v1',
                    guardPolicy: 'copy-adjacent-clamp-exterior-v1',
                    tileCount: [1, 1],
                    interiorTexels: [4, 4],
                    guardTexels: 1,
                    texelSizeMeters: 10,
                    boundsLightMeters: { min: [-20, -20], max: [20, 20] }
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
                    minDepthMeters: -20,
                    maxDepthMeters: 20,
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
                    pcf: { model: 'square-nearest-box-v1', radiusTexels: 0 }
                }
            },
            tiles: [{
                id: 'tile.0.0',
                coordinates: [0, 0],
                interiorBoundsLightMeters: { min: [-20, -20], max: [20, 20] },
                storedTexels: [6, 6],
                contentSha256: '5'.repeat(64)
            }]
        };
        const staticPixels = new Uint8Array(6 * 6 * 2);
        for (let offset = 0; offset < staticPixels.length; offset += 2) {
            staticApp.packStaticSunDepthQuantizedRg8(65535, staticPixels, offset);
        }
        const staticTexture = new THREE.DataArrayTexture(staticPixels, 6, 6, 1);
        staticTexture.format = THREE.RGFormat;
        staticTexture.type = THREE.UnsignedByteType;
        staticTexture.internalFormat = 'RG8';
        staticTexture.minFilter = THREE.NearestFilter;
        staticTexture.magFilter = THREE.NearestFilter;
        staticTexture.generateMipmaps = false;
        staticTexture.needsUpdate = true;

        const receiverMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 1,
            metalness: 0
        });
        const hiddenCasterMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
        hiddenCasterMaterial.colorWrite = false;
        hiddenCasterMaterial.depthWrite = false;
        const receiverRoot = new THREE.Group();
        const casterRoot = new THREE.Group();
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4), receiverMaterial);
        const caster = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.8, 2.5), hiddenCasterMaterial);
        receiver.position.y = 0.5;
        caster.position.y = 2.4;
        receiver.castShadow = true;
        receiver.receiveShadow = true;
        caster.castShadow = true;
        caster.receiveShadow = true;
        receiverRoot.add(receiver);
        casterRoot.add(caster);

        const sun = new THREE.DirectionalLight(0xffffff, 3);
        sun.position.set(0, 10, 0);
        sun.target.position.set(0, 0, 0);
        sun.castShadow = true;
        sun.shadow.mapSize.set(64, 64);
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        scene.add(receiverRoot, casterRoot, sun, sun.target);
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 30);
        camera.position.set(0, 8, 0);
        camera.up.set(0, 0, -1);
        camera.lookAt(0, 0.5, 0);
        camera.updateMatrixWorld(true);

        const dynamicLayer = new DynamicSunShadowLayer(engine.renderer, {
            mapSize: 128,
            worldUnitsPerTexel: 0.1,
            paddingTexels: 4,
            receiverMinimumY: 0,
            depthPaddingMeters: 1,
            constantBiasMeters: 0.005,
            normalBiasMeters: 0.01
        });
        const receiverHandle = dynamicLayer.register({ id: 'vehicle.receiver', root: receiverRoot });
        const casterHandle = dynamicLayer.register({ id: 'vehicle.caster', root: casterRoot });
        dynamicLayer.activate();
        const binding = staticGraphics.createStaticSunDepthShaderBinding({
            descriptor,
            texture: staticTexture,
            debugMode: 'dynamicVisibility'
        });
        binding.setDynamicShadowState(dynamicLayer.render(pointDirection));
        binding.updateCamera(camera);
        const materialSet = new staticGraphics.StaticSunDepthMaterialSet();
        materialSet.prepareRoots([receiverRoot, casterRoot], binding, { outsideRoot: scene });
        materialSet.activate();
        engine.renderer.compile(scene, camera);

        const target = new THREE.WebGLRenderTarget(128, 128, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: true
        });
        const renderCapture = () => {
            engine.renderer.setRenderTarget(target);
            engine.renderer.setClearColor(0x000000, 1);
            engine.renderer.clear(true, true, true);
            engine.renderer.render(scene, camera);
            const width = 128;
            const height = 128;
            const pixels = new Uint8Array(width * height * 4);
            engine.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
            engine.renderer.setRenderTarget(null);
            let sum = 0;
            for (let y = 63; y < 66; y += 1) {
                for (let x = 63; x < 66; x += 1) {
                    const offset = (y * width + x) * 4;
                    sum += pixels[offset] + pixels[offset + 1] + pixels[offset + 2];
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            const image = context.createImageData(width, height);
            const rowBytes = width * 4;
            for (let y = 0; y < height; y += 1) {
                const sourceOffset = (height - 1 - y) * rowBytes;
                image.data.set(pixels.subarray(sourceOffset, sourceOffset + rowBytes), y * rowBytes);
            }
            context.putImageData(image, 0, 0);
            return {
                brightness: sum / 9 / 3,
                png: canvas.toDataURL('image/png')
            };
        };

        const shadowed = renderCapture();
        casterRoot.position.x = 4;
        casterRoot.updateWorldMatrix(true, true);
        binding.setDynamicShadowState(dynamicLayer.render(pointDirection));
        binding.updateCamera(camera);
        const unshadowed = renderCapture();

        materialSet.dispose();
        dynamicLayer.deactivate();
        receiverHandle.unregister();
        casterHandle.unregister();
        dynamicLayer.dispose();
        target.dispose();
        staticTexture.dispose();
        receiver.geometry.dispose();
        caster.geometry.dispose();
        receiverMaterial.dispose();
        hiddenCasterMaterial.dispose();
        sun.dispose?.();

        return {
            shadowed: shadowed.brightness,
            unshadowed: unshadowed.brightness,
            delta: unshadowed.brightness - shadowed.brightness,
            shadowedCapture: shadowed.png,
            unshadowedCapture: unshadowed.png
        };
    });

    await writeCapture('dynamic_interaction_shadowed.png', result.shadowedCapture);
    await writeCapture('dynamic_interaction_clear.png', result.unshadowedCapture);
    expect(result.unshadowed).toBeGreaterThan(result.shadowed);
    expect(result.delta).toBeGreaterThan(20);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter((message) => /shader error|VALIDATE_STATUS/i.test(message))).toEqual([]);
});

test('AI 532 moving receiver samples the fixed world cache at each rendered pose', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/tests/headless/harness/index.html');
    await page.waitForFunction(() => !!window.__testHooks?.getEngine?.());
    await page.evaluate(() => window.__testHooks.loadScenario('empty', { seed: 'ai532-static-on-mover' }));

    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const staticApp = await import('/src/app/illumination/static_sun_depth/index.js');
        const staticGraphics = await import('/src/graphics/illumination/static_sun_depth/index.js');
        const engine = window.__testHooks.getEngine();
        engine.setPostProcessingEnabled?.(false);

        const pointDirection = [0, 1, 0];
        const descriptor = {
            schema: staticApp.STATIC_SUN_DEPTH_TILE_SET_SCHEMA,
            identity: {
                channelId: 'static_sun_depth',
                channelVersion: 1,
                cityId: 'fixture.ai532.moving',
                casterInventorySha256: '1'.repeat(64),
                channelSourceSha256: '2'.repeat(64),
                compilerSignatureSha256: '3'.repeat(64),
                sunPointDirectionWorld: pointDirection,
                basis: staticApp.createStableStaticSunDepthBasis(pointDirection, [0, 0, 0]),
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
                    pcf: { model: 'square-nearest-box-v1', radiusTexels: 0 }
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
        const pixels = new Uint8Array(6 * 6 * 2);
        for (let offset = 0; offset < pixels.length; offset += 2) {
            staticApp.packStaticSunDepthQuantizedRg8(65535, pixels, offset);
        }
        const occupied = staticApp.encodeStaticSunDepthMeters(-1, descriptor.identity.encoding);
        for (let y = 3; y < 6; y += 1) {
            for (let x = 0; x < 6; x += 1) {
                staticApp.packStaticSunDepthQuantizedRg8(occupied, pixels, (y * 6 + x) * 2);
            }
        }
        const texture = new THREE.DataArrayTexture(pixels, 6, 6, 1);
        texture.format = THREE.RGFormat;
        texture.type = THREE.UnsignedByteType;
        texture.internalFormat = 'RG8';
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;

        const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), material);
        receiver.castShadow = true;
        receiver.receiveShadow = true;
        const movingRoot = new THREE.Group();
        movingRoot.add(receiver);
        const sun = new THREE.DirectionalLight(0xffffff, 2);
        sun.position.set(0, 8, 0);
        const scene = new THREE.Scene();
        scene.add(movingRoot, sun, sun.target);
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
        camera.up.set(0, 0, -1);
        const binding = staticGraphics.createStaticSunDepthShaderBinding({
            descriptor,
            texture,
            debugMode: 'visibility'
        });
        const materialSet = new staticGraphics.StaticSunDepthMaterialSet();
        materialSet.prepareRoots([movingRoot], binding, { outsideRoot: scene });
        materialSet.activate();
        const target = new THREE.WebGLRenderTarget(64, 64);
        const samplePose = (worldX) => {
            movingRoot.position.x = worldX;
            movingRoot.updateWorldMatrix(true, true);
            camera.position.set(worldX, 6, 0);
            camera.lookAt(worldX, 0.3, 0);
            camera.updateMatrixWorld(true);
            binding.updateCamera(camera);
            engine.renderer.setRenderTarget(target);
            engine.renderer.setClearColor(0x000000, 1);
            engine.renderer.clear(true, true, true);
            engine.renderer.render(scene, camera);
            const width = 64;
            const height = 64;
            const pixels = new Uint8Array(width * height * 4);
            engine.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
            engine.renderer.setRenderTarget(null);
            const sampleOffset = (32 * width + 32) * 4;
            const sample = [...pixels.slice(sampleOffset, sampleOffset + 4)];
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            const image = context.createImageData(width, height);
            const rowBytes = width * 4;
            for (let y = 0; y < height; y += 1) {
                const sourceOffset = (height - 1 - y) * rowBytes;
                image.data.set(pixels.subarray(sourceOffset, sourceOffset + rowBytes), y * rowBytes);
            }
            context.putImageData(image, 0, 0);
            return { sample, png: canvas.toDataURL('image/png') };
        };
        const shadowed = samplePose(1);
        const lit = samplePose(-1);

        materialSet.dispose();
        target.dispose();
        texture.dispose();
        receiver.geometry.dispose();
        material.dispose();
        return {
            shadowed: shadowed.sample,
            lit: lit.sample,
            shadowedCapture: shadowed.png,
            litCapture: lit.png
        };
    });

    await writeCapture('static_cache_moving_receiver_shadowed.png', result.shadowedCapture);
    await writeCapture('static_cache_moving_receiver_lit.png', result.litCapture);
    expect(result.shadowed[0]).toBeLessThan(16);
    expect(result.lit[0]).toBeGreaterThan(240);
});
