// Browser GPU-readback parity for the AI 531 arbitrary-world static-sun sampler.
import test, { expect } from '@playwright/test';

test('AI 531 GPU visibility matches the CPU sampler across world-space and guard cases', async ({ page }) => {
    test.setTimeout(120_000);
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/tests/headless/harness/index.html');
    await page.waitForFunction(() => !!window.__testHooks?.getEngine?.());
    await page.evaluate(() => window.__testHooks.loadScenario('empty', { seed: 'ai531-gpu-parity' }));

    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const app = await import('/src/app/illumination/static_sun_depth/index.js');
        const graphics = await import('/src/graphics/illumination/static_sun_depth/index.js');
        const engine = window.__testHooks.getEngine();
        engine.setPostProcessingEnabled?.(false);

        const sunPointDirectionWorld = new THREE.Vector3(0.36, 0.8, -0.48).normalize().toArray();
        const originWorld = [3.25, -2.5, 5.75];
        const basis = app.createStableStaticSunDepthBasis(sunPointDirectionWorld, originWorld);
        const sourceMapAxes = app.createThreeR183DirectionalShadowFilterAxes(
            sunPointDirectionWorld
        );
        const tileCount = [2, 2];
        const interiorTexels = [4, 4];
        const guardTexels = 1;
        const storedTexels = [6, 6];
        const boundsMin = [-4, -4];
        const encoding = {
            id: 'rg8-packed-linear-depth-v1',
            quantization: 'linear-endpoints-inclusive-v1',
            redChannel: 'quantized-high-byte-v1',
            greenChannel: 'quantized-low-byte-v1',
            minDepthMeters: -5,
            maxDepthMeters: 5,
            maxQuantized: 65534,
            emptyQuantized: 65535
        };
        const descriptor = app.validateStaticSunDepthTileSetDescriptor({
            schema: 'static-sun-depth-tile-set-v1',
            identity: {
                channelId: 'static_sun_depth',
                channelVersion: 1,
                cityId: 'fixture.ai531.gpu-parity',
                casterInventorySha256: '1'.repeat(64),
                channelSourceSha256: '2'.repeat(64),
                compilerSignatureSha256: '3'.repeat(64),
                sunPointDirectionWorld,
                basis,
                layout: {
                    order: 'row-major-y-then-x-v1',
                    lookup: 'half-open-min-inclusive-max-exclusive-v1',
                    rowOrigin: 'min-light-y-v1',
                    guardPolicy: 'copy-adjacent-clamp-exterior-v1',
                    tileCount,
                    interiorTexels,
                    guardTexels,
                    texelSizeMeters: 1,
                    boundsLightMeters: { min: boundsMin, max: [4, 4] }
                },
                alpha: {
                    model: 'evaluated-runtime-coverage-v1',
                    coverage: 'opacity-times-vertex-alpha-times-map-a-times-alpha-map-g-v1',
                    threshold: 'discard-when-coverage-lt-alpha-test-v1',
                    sidedness: 'material-side-and-shadow-side-v1',
                    forcedOpaque: 'shadow-as-opaque-v1',
                    semanticsSha256: '4'.repeat(64)
                },
                encoding,
                sampling: {
                    comparison: 'receiver-depth-minus-bias-lte-caster-depth-v1',
                    emptyPolicy: 'visible-v1',
                    outOfBoundsPolicy: 'fail-closed-zero-visibility-v1',
                    bias: {
                        model: 'geometric-normal-offset-plus-constant-depth-relief-v1',
                        constantDepthReliefMeters: 0.0697915,
                        geometricNormalOffsetMeters: 0.0232
                    },
                    pcf: {
                        model: 'three-r183-vogel-5-linear-compare-v1',
                        radiusTexels: 1.5,
                        sampleCount: 5,
                        screenRotation: 'interleaved-gradient-noise-gl-fragcoord-v1',
                        hardwareComparison: 'linear-four-compare-taps-v1',
                        shadowMapSizeTexels: [16384, 16384],
                        shadowMapWorldExtentMeters: [680, 680],
                        sourceMapRightAxisWorld: sourceMapAxes.rightAxisWorld,
                        sourceMapUpAxisWorld: sourceMapAxes.upAxisWorld
                    }
                }
            },
            tiles: Array.from({ length: 4 }, (_, index) => {
                const x = index % tileCount[0];
                const y = Math.floor(index / tileCount[0]);
                return {
                    id: `tile.${x}.${y}`,
                    coordinates: [x, y],
                    interiorBoundsLightMeters: {
                        min: [boundsMin[0] + x * 4, boundsMin[1] + y * 4],
                        max: [boundsMin[0] + (x + 1) * 4, boundsMin[1] + (y + 1) * 4]
                    },
                    storedTexels,
                    contentSha256: String(index + 5).repeat(64)
                };
            })
        });

        const negativeDepth = app.encodeStaticSunDepthMeters(-1, encoding);
        const positiveDepth = app.encodeStaticSunDepthMeters(1, encoding);
        const zeroDepth = app.encodeStaticSunDepthMeters(0, encoding);
        const grid = Array.from({ length: 8 }, () => Array(8).fill(negativeDepth));
        for (let y = 1; y <= 3; y += 1) {
            for (let x = 4; x <= 6; x += 1) grid[y][x] = positiveDepth;
        }
        for (let y = 4; y <= 6; y += 1) {
            for (let x = 1; x <= 3; x += 1) grid[y][x] = app.STATIC_SUN_DEPTH_EMPTY_QUANTIZED;
            for (let x = 4; x <= 6; x += 1) grid[y][x] = zeroDepth;
        }

        const tileResources = descriptor.tiles.map((tile) => {
            const bytes = new Uint8Array(storedTexels[0] * storedTexels[1] * 2);
            for (let storedY = 0; storedY < storedTexels[1]; storedY += 1) {
                for (let storedX = 0; storedX < storedTexels[0]; storedX += 1) {
                    const globalX = tile.coordinates[0] * interiorTexels[0] + storedX - guardTexels;
                    const globalY = tile.coordinates[1] * interiorTexels[1] + storedY - guardTexels;
                    const ownerX = Math.min(7, Math.max(0, globalX));
                    const ownerY = Math.min(7, Math.max(0, globalY));
                    const value = grid[ownerY][ownerX];
                    app.packStaticSunDepthQuantizedRg8(
                        value,
                        bytes,
                        (storedY * storedTexels[0] + storedX) * 2
                    );
                }
            }
            return {
                tileId: tile.id,
                bytes,
                verifiedContentSha256: tile.contentSha256
            };
        });
        const activeSet = app.createStaticSunDepthActiveSet(
            descriptor,
            tileResources,
            { expectedIdentity: descriptor.identity }
        );
        const layerBytes = storedTexels[0] * storedTexels[1] * 2;
        const textureBytes = new Uint8Array(layerBytes * tileResources.length);
        tileResources.forEach((resource, index) => textureBytes.set(resource.bytes, index * layerBytes));
        const texture = new THREE.DataArrayTexture(
            textureBytes,
            storedTexels[0],
            storedTexels[1],
            tileResources.length
        );
        texture.format = THREE.RGFormat;
        texture.type = THREE.UnsignedByteType;
        texture.internalFormat = 'RG8';
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.flipY = false;
        texture.unpackAlignment = 1;
        texture.colorSpace = THREE.NoColorSpace;
        texture.needsUpdate = true;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        const root = new THREE.Group();
        scene.add(root);
        const geometry = new THREE.PlaneGeometry(1, 1);
        const standardMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
        const physicalMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1, clearcoat: 0.25 });
        const meshes = {
            standard: new THREE.Mesh(geometry, standardMaterial),
            physical: new THREE.Mesh(geometry, physicalMaterial)
        };
        for (const mesh of Object.values(meshes)) {
            mesh.frustumCulled = false;
            mesh.receiveShadow = true;
            root.add(mesh);
        }
        const light = new THREE.DirectionalLight(0xffffff, 2);
        light.position.fromArray(originWorld).add(new THREE.Vector3().fromArray(sunPointDirectionWorld).multiplyScalar(100));
        light.target.position.fromArray(originWorld);
        const otherDirection = new THREE.Vector3().fromArray(basis.rightAxisWorld).normalize();
        const otherLight = new THREE.DirectionalLight(0xffffff, 0);
        otherLight.position.fromArray(originWorld).addScaledVector(otherDirection, 100);
        otherLight.target.position.fromArray(originWorld);
        const ambientLight = new THREE.AmbientLight(0xffffff, 0);
        scene.add(light, light.target, otherLight, otherLight.target, ambientLight);

        const binding = graphics.createStaticSunDepthShaderBinding({
            descriptor,
            texture,
            debugMode: 'visibility'
        });
        const materialSet = new graphics.StaticSunDepthMaterialSet();
        materialSet.prepare(root, binding, { outsideRoot: scene });
        materialSet.activate();

        const camera = new THREE.OrthographicCamera(-0.1, 0.1, 0.1, -0.1, 0.01, 10);
        const target = new THREE.WebGLRenderTarget(3, 3, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: true,
            stencilBuffer: false
        });
        target.texture.colorSpace = THREE.NoColorSpace;
        const renderer = engine.renderer;
        const previousTarget = renderer.getRenderTarget();
        const previousToneMapping = renderer.toneMapping;
        const previousClearColor = renderer.getClearColor(new THREE.Color()).clone();
        const previousClearAlpha = renderer.getClearAlpha();
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.setClearColor(0x000000, 1);

        const worldFromLight = (lightX, lightY, lightDepth) => new THREE.Vector3(
            basis.originWorld[0]
                + basis.rightAxisWorld[0] * lightX
                + basis.upAxisWorld[0] * lightY
                + basis.depthAxisWorld[0] * lightDepth,
            basis.originWorld[1]
                + basis.rightAxisWorld[1] * lightX
                + basis.upAxisWorld[1] * lightY
                + basis.depthAxisWorld[1] * lightDepth,
            basis.originWorld[2]
                + basis.rightAxisWorld[2] * lightX
                + basis.upAxisWorld[2] * lightY
                + basis.depthAxisWorld[2] * lightDepth
        );
        const worldAtTexel = (globalX, globalY, depth) => worldFromLight(
            boundsMin[0] + globalX + 0.5,
            boundsMin[1] + globalY + 0.5,
            depth
        );
        const towardSun = new THREE.Vector3().fromArray(sunPointDirectionWorld).normalize();
        const geometricShiftNormal = towardSun.clone()
            .add(new THREE.Vector3().fromArray(basis.rightAxisWorld))
            .normalize();
        const cases = [
            { id: 'signed_negative_depth_occluded', global: [2, 2], depth: 0, normal: towardSun },
            { id: 'positive_depth_fully_lit', global: [5, 2], depth: 0, normal: towardSun },
            { id: 'empty_texel_fully_lit', global: [2, 5], depth: 4, normal: towardSun },
            { id: 'internal_boundary_guard_mix', global: [3, 5], depth: 0.25, normal: towardSun },
            { id: 'global_boundary_fail_closed_taps', global: [0, 0], depth: -2, normal: towardSun },
            { id: 'normal_bias_toward_sun', global: [5, 5], depth: 0.25, normal: towardSun },
            { id: 'normal_bias_away_from_sun', global: [5, 5], depth: 0.25, normal: towardSun.clone().negate() },
            {
                id: 'geometric_bias_shifts_xy_and_depth',
                position: worldFromLight(-0.01, -1.5, 0.9),
                normal: geometricShiftNormal
            }
        ];
        const readback = [];
        const composition = [];
        try {
            for (const testCase of cases) {
                const position = testCase.position?.clone?.() ?? worldAtTexel(
                    testCase.global[0],
                    testCase.global[1],
                    testCase.depth
                );
                const normal = testCase.normal.clone().normalize();
                const cpu = app.sampleStaticSunDepthWorld(
                    activeSet,
                    position.toArray(),
                    normal.toArray(),
                    { fragmentCoordinatePixels: [1.5, 1.5] }
                );
                for (const [materialId, mesh] of Object.entries(meshes)) {
                    meshes.standard.visible = materialId === 'standard';
                    meshes.physical.visible = materialId === 'physical';
                    mesh.position.copy(position);
                    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
                    mesh.updateMatrixWorld(true);
                    camera.position.copy(position).addScaledVector(normal, 2);
                    camera.up.copy(Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
                    camera.lookAt(position);
                    camera.updateMatrixWorld(true);
                    binding.updateCamera(camera);
                    renderer.setRenderTarget(target);
                    renderer.clear(true, true, true);
                    renderer.render(scene, camera);
                    const pixel = new Uint8Array(4);
                    renderer.readRenderTargetPixels(target, 1, 1, 1, 1, pixel);
                    readback.push({
                        id: testCase.id,
                        materialId,
                        cpuVisibility: cpu.visibility,
                        cpuStatus: cpu.status,
                        cpuOutOfBoundsTapCount: cpu.outOfBoundsTapCount,
                        cpuAppliedBiasMeters: cpu.appliedBiasMeters,
                        cpuBiasedWorldPosition: cpu.biasedWorldPosition,
                        cpuLightPosition: cpu.lightPosition,
                        pixel: [...pixel],
                        gpuVisibility: pixel[0] / 255
                    });
                }
            }
            binding.setDebugMode('final');
            const compositionCases = [
                { id: 'named_sun_visible', global: [5, 2], normal: towardSun, named: 3, other: 0, ambient: 0, emissive: 0 },
                { id: 'named_sun_occluded', global: [2, 2], normal: towardSun, named: 3, other: 0, ambient: 0, emissive: 0 },
                { id: 'non_aligned_directional_occluded', global: [2, 2], normal: otherDirection, named: 0, other: 3, ambient: 0, emissive: 0 },
                { id: 'ambient_occluded', global: [2, 2], normal: towardSun, named: 0, other: 0, ambient: 1, emissive: 0 },
                { id: 'emissive_occluded', global: [2, 2], normal: towardSun, named: 0, other: 0, ambient: 0, emissive: 0.75 }
            ];
            for (const testCase of compositionCases) {
                const position = worldAtTexel(testCase.global[0], testCase.global[1], 0);
                const normal = testCase.normal.clone().normalize();
                const cpu = app.sampleStaticSunDepthWorld(
                    activeSet,
                    position.toArray(),
                    normal.toArray(),
                    { fragmentCoordinatePixels: [1.5, 1.5] }
                );
                light.intensity = testCase.named;
                otherLight.intensity = testCase.other;
                ambientLight.intensity = testCase.ambient;
                for (const [materialId, mesh] of Object.entries(meshes)) {
                    meshes.standard.visible = materialId === 'standard';
                    meshes.physical.visible = materialId === 'physical';
                    mesh.material.emissive.setRGB(testCase.emissive, testCase.emissive, testCase.emissive);
                    mesh.material.emissiveIntensity = 1;
                    mesh.position.copy(position);
                    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
                    mesh.updateMatrixWorld(true);
                    camera.position.copy(position).addScaledVector(normal, 2);
                    camera.up.copy(Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
                    camera.lookAt(position);
                    camera.updateMatrixWorld(true);
                    binding.updateCamera(camera);
                    renderer.setRenderTarget(target);
                    renderer.clear(true, true, true);
                    renderer.render(scene, camera);
                    const pixel = new Uint8Array(4);
                    renderer.readRenderTargetPixels(target, 1, 1, 1, 1, pixel);
                    composition.push({
                        id: testCase.id,
                        materialId,
                        cpuVisibility: cpu.visibility,
                        pixel: [...pixel],
                        maxChannel: Math.max(pixel[0], pixel[1], pixel[2]) / 255
                    });
                }
            }
        } finally {
            renderer.setRenderTarget(previousTarget);
            renderer.toneMapping = previousToneMapping;
            renderer.setClearColor(previousClearColor, previousClearAlpha);
            materialSet.dispose();
            target.dispose();
            texture.dispose();
            geometry.dispose();
            standardMaterial.dispose();
            physicalMaterial.dispose();
        }
        return { basis, readback, composition };
    });

    expect(result.basis.originWorld).toEqual([3.25, -2.5, 5.75]);
    const expectedCpu = {
        signed_negative_depth_occluded: 0,
        positive_depth_fully_lit: 1,
        empty_texel_fully_lit: 1,
        normal_bias_toward_sun: 0,
        normal_bias_away_from_sun: 0
    };
    for (const entry of result.readback) {
        expect(entry.cpuStatus, entry.id).toBe('sampled');
        if (Object.hasOwn(expectedCpu, entry.id)) {
            expect(entry.cpuVisibility, entry.id).toBeCloseTo(expectedCpu[entry.id], 12);
        } else {
            expect(entry.cpuVisibility, entry.id).toBeGreaterThan(0);
            expect(entry.cpuVisibility, entry.id).toBeLessThan(1);
        }
        expect(entry.pixel[3], `${entry.id}/${entry.materialId} alpha`).toBe(255);
        expect(
            Math.abs(entry.gpuVisibility - entry.cpuVisibility),
            `${entry.id}/${entry.materialId}: GPU ${entry.gpuVisibility}, CPU ${entry.cpuVisibility}, pixel ${entry.pixel}`
        ).toBeLessThanOrEqual(2 / 255);
    }
    const globalEntries = result.readback.filter((entry) => entry.id === 'global_boundary_fail_closed_taps');
    expect(globalEntries.every((entry) => entry.cpuOutOfBoundsTapCount > 0)).toBe(true);
    const toward = result.readback.find((entry) => entry.id === 'normal_bias_toward_sun');
    const away = result.readback.find((entry) => entry.id === 'normal_bias_away_from_sun');
    expect(toward.cpuAppliedBiasMeters).toBeCloseTo(0.0697915, 12);
    expect(away.cpuAppliedBiasMeters).toBeCloseTo(0.0697915, 12);
    const shifted = result.readback.find((entry) => (
        entry.id === 'geometric_bias_shifts_xy_and_depth'
    ));
    expect(shifted.cpuLightPosition[0]).toBeCloseTo(
        -0.01 + 0.0232 / Math.sqrt(2),
        6
    );
    expect(shifted.cpuLightPosition[1]).toBeCloseTo(-1.5, 6);
    expect(shifted.cpuLightPosition[2]).toBeCloseTo(
        0.9 - 0.0232 / Math.sqrt(2),
        6
    );
    for (const materialId of ['standard', 'physical']) {
        const sample = (id) => result.composition.find((entry) => entry.id === id && entry.materialId === materialId);
        const namedVisible = sample('named_sun_visible');
        const namedOccluded = sample('named_sun_occluded');
        expect(namedVisible.cpuVisibility, `${materialId} named sun visible CPU control`).toBe(1);
        expect(namedOccluded.cpuVisibility, `${materialId} named sun occluded CPU control`).toBe(0);
        expect(namedVisible.pixel[3], `${materialId} named sun visible alpha`).toBe(255);
        expect(namedOccluded.pixel[3], `${materialId} named sun occluded alpha`).toBe(255);
        expect(namedVisible.maxChannel, `${materialId} named sun visible pixel ${namedVisible.pixel}`).toBeGreaterThan(0.25);
        expect(namedOccluded.maxChannel, `${materialId} named sun occluded pixel ${namedOccluded.pixel}`).toBeLessThanOrEqual(2 / 255);
        expect(namedVisible.maxChannel - namedOccluded.maxChannel, `${materialId} named sun visibility contrast`).toBeGreaterThan(0.25);
        for (const id of ['non_aligned_directional_occluded', 'ambient_occluded', 'emissive_occluded']) {
            const preserved = sample(id);
            expect(preserved.cpuVisibility, `${materialId}/${id} CPU occlusion control`).toBe(0);
            expect(preserved.pixel[3], `${materialId}/${id} alpha`).toBe(255);
            expect(
                preserved.maxChannel,
                `${materialId}/${id} should survive named-sun cache occlusion; pixel ${preserved.pixel}`
            ).toBeGreaterThan(0.15);
        }
    }
    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter((message) => /shader error|VALIDATE_STATUS|StaticSunDepth/i.test(message))).toEqual([]);
});
