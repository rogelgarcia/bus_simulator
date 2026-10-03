// Verify runtime patch captures, atomic publication, masked color and camera motion without shadow rebakes.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
test.skip(true, 'Historical runtime-card strategy: the field now uses grass_debug_v2_lod3_bus.pwtest.js.');

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod3_runtime_transitions');
const poses = [
    { azimuth: 0, elevation: 15, distance: 32 },
    { azimuth: 45, elevation: 35, distance: 24 },
    { azimuth: 135, elevation: 15, distance: 32 },
    { azimuth: 225, elevation: 35, distance: 24 },
    { azimuth: 315, elevation: 65, distance: 24 },
    { azimuth: 90, elevation: 85, distance: 24 }
];

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: ['--force-color-profile=srgb'] } });

function validate(snapshot) {
    expect(snapshot).toMatchObject({ layout: 'runtime-patch-impostors', resolution: 512, tileMeters: 1,
        leaves: 96000, cacheCapacity: 64, lightingBaked: false, worldOrientedNormals: true, shadowSource: 'LOD2' });
    expect(snapshot.sourceLeaves).toBeGreaterThan(500);
    expect(snapshot.sourceLeaves).toBeLessThan(900);
    expect(snapshot.cacheEntries).toBeGreaterThan(0);
    expect(snapshot.cacheEntries).toBeLessThanOrEqual(snapshot.cacheCapacity);
    expect(snapshot.captureCount).toBeGreaterThan(0);
    expect(snapshot.swapCount).toBe(snapshot.captureCount);
    expect(snapshot.capture).toMatchObject({ selfShadows: true, shadowGenerationCount: 1 });
    expect(snapshot.estimatedTextureBytes).toBeGreaterThan(512 * 512 * 4);
    expect(snapshot.views).toHaveLength(snapshot.cacheEntries);
    expect(snapshot.views.every(view => Number.isInteger(view.generation) && view.generation > 0)).toBe(true);
    expect(snapshot.fields.length).toBeGreaterThan(0);
    for (const field of snapshot.fields) {
        expect(field.cards).toBeGreaterThanOrEqual(0);
        expect(field.cards).toBeLessThanOrEqual(288);
        expect(field.fallbackLeaves).toBeGreaterThanOrEqual(0);
        expect(field.fallbackLeaves).toBeLessThanOrEqual(96000);
        expect(field.triangles).toBe(field.cards * 2 + field.fallbackLeaves * 2);
    }
}

test('LOD3 runtime 512 captures preserve coverage and lighting while camera views refresh atomically', async ({ page }) => {
    test.setTimeout(360000);
    await mkdir(output, { recursive: true });
    const errors = [], views = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod3-runtime-transitions-1&lod=LOD3&fields=1#01_overview');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    await page.addStyleTag({ content: '#scene-panel,#scene-performance{visibility:hidden!important}' });
    await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__grassLitterScene, runtime = s.dynamicPlates;
        const { registerMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const { attachShaderMetadata } = await import('/src/graphics/shaders/core/ShaderLoader.js');
        const { grassImpostorCoverageProbeShader } = await import('/src/graphics/shaders/materials/grass/GrassImpostorCoverageProbeShaderLoader.js');
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        function pose({ azimuth, elevation, distance }) {
            const az = azimuth * Math.PI / 180, el = elevation * Math.PI / 180;
            s.camera.position.set(Math.sin(az) * Math.cos(el) * distance, Math.sin(el) * distance, Math.cos(az) * Math.cos(el) * distance);
            s.camera.up.set(0, 1, 0); s.camera.lookAt(0, .1, 0); s.camera.fov = 28;
            s.camera.updateProjectionMatrix(); s.camera.updateMatrixWorld();
            runtime.updateCamera(s.camera);
        }
        async function settle() {
            for (let step = 0; step < 512; step++) {
                runtime.updateCamera(s.camera);
                if (!runtime.getSnapshot().pendingViews && !runtime.getSnapshot().transitions) {
                    await frame();
                    if (!runtime.getSnapshot().pendingViews && !runtime.getSnapshot().transitions) return runtime.getSnapshot();
                }
                runtime.renderPending();
                await frame();
            }
            throw Error('Runtime view capture queue did not settle: ' + JSON.stringify(runtime.getSnapshot()));
        }
        function rendererState() {
            const r = s.renderer;
            return { target: r.getRenderTarget()?.uuid ?? null, viewport: r.getViewport(new THREE.Vector4()).toArray(),
                scissor: r.getScissor(new THREE.Vector4()).toArray(), scissorTest: r.getScissorTest(),
                clear: r.getClearColor(new THREE.Color()).toArray(), clearAlpha: r.getClearAlpha(),
                tone: r.toneMapping, exposure: r.toneMappingExposure, colorSpace: r.outputColorSpace,
                autoClear: r.autoClear, pixelRatio: r.getPixelRatio(),
                shadowEnabled: r.shadowMap.enabled, shadowAuto: r.shadowMap.autoUpdate,
                shadowNeeds: r.shadowMap.needsUpdate, sunNeeds: s.lighting.sun.shadow.needsUpdate };
        }
        function maskedGrass() {
            const r = s.renderer, width = 800, height = 500;
            const target = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType, colorSpace: THREE.NoColorSpace });
            const pixels = new Uint16Array(width * height * 4), visibility = new Map(), coverageHooks = [];
            const previous = r.getRenderTarget(), viewport = r.getViewport(new THREE.Vector4()), scissor = r.getScissor(new THREE.Vector4());
            const scissorTest = r.getScissorTest(), clear = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha();
            const background = s.scene.background, tone = r.toneMapping, autoClear = r.autoClear;
            try {
                s.scene.traverse(mesh => {
                    if (!mesh.isMesh) return;
                    const grass = mesh.userData.grassRuntimeImpostor || mesh.userData.grassRuntimeFallback
                        || mesh.userData.grassLeafCount || mesh.geometry.userData.grassLeafCount;
                    if (!grass) { visibility.set(mesh, mesh.visible); mesh.visible = false; }
                });
                s.scene.background = null; r.toneMapping = THREE.NoToneMapping; r.autoClear = true;
                r.setClearColor(0, 0); r.setRenderTarget(target); r.setScissorTest(false);
                r.render(s.scene, s.camera); r.readRenderTargetPixels(target, 0, 0, width, height, pixels);
                const rgb = [0, 0, 0], opaqueRgb = [0, 0, 0]; let coverage = 0, occupied = 0, opaquePixelCount = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    const a = THREE.DataUtils.fromHalfFloat(pixels[i + 3]);
                    if (a <= .001) continue;
                    coverage += a; occupied++;
                    if (a >= .99) opaquePixelCount++;
                    for (let c = 0; c < 3; c++) {
                        const value = THREE.DataUtils.fromHalfFloat(pixels[i + c]);
                        rgb[c] += value;
                        if (a >= .99) opaqueRgb[c] += value;
                    }
                }
                const result = { weightedRgb: rgb.map(value => value / Math.max(coverage, 1)),
                    opaqueRgb: opaqueRgb.map(value => value / Math.max(opaquePixelCount, 1)), opaquePixelCount,
                    alphaCoverage: coverage, alphaOccupied: occupied, width, height };
                const materials = new Set();
                s.scene.traverseVisible(mesh => { if (mesh.isMesh) materials.add(mesh.material); });
                for (const material of materials) {
                    const original = { material, programKey: material.customProgramCacheKey,
                        shader: material.userData.shader, hadShader: Object.hasOwn(material.userData, 'shader') };
                    const hook = registerMaterialShaderHook(material, {
                        id: 'test.grass.rgb-coverage', priority: 10000, variantKey: grassImpostorCoverageProbeShader.variantKey,
                        apply: shader => {
                            const anchor = '#include <dithering_fragment>';
                            if (!shader.fragmentShader.includes(anchor)) throw Error('Grass RGB coverage shader contract changed.');
                            shader.fragmentShader = shader.fragmentShader.replace(anchor, anchor + '\n' + grassImpostorCoverageProbeShader.fragmentSource);
                        }
                    });
                    coverageHooks.push({ ...original, hook });
                    attachShaderMetadata(material, grassImpostorCoverageProbeShader);
                }
                r.render(s.scene, s.camera); r.readRenderTargetPixels(target, 0, 0, width, height, pixels);
                let rgbCoverage = 0, rgbOccupied = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    const value = THREE.DataUtils.fromHalfFloat(pixels[i]);
                    rgbCoverage += value;
                    if (value > .001) rgbOccupied++;
                }
                return { ...result, coverage: rgbCoverage, occupied: rgbOccupied, coverageMethod: 'white-rgb-msaa' };
            } finally {
                coverageHooks.forEach(({ material, hook, programKey, shader, hadShader }) => {
                    hook.remove(); material.customProgramCacheKey = programKey;
                    if (hadShader) material.userData.shader = shader;
                    else delete material.userData.shader;
                });
                visibility.forEach((value, mesh) => { mesh.visible = value; });
                s.scene.background = background; r.toneMapping = tone; r.autoClear = autoClear;
                r.setRenderTarget(previous); r.setViewport(viewport); r.setScissor(scissor); r.setScissorTest(scissorTest);
                r.setClearColor(clear, alpha); target.dispose();
            }
        }
        window.__runtimeVerification = { frame, pose, settle, rendererState, maskedGrass };
    });

    for (const pose of poses) {
        await page.evaluate(pose => { const s = window.__grassLitterScene; s.setLod('LOD3'); window.__runtimeVerification.pose(pose); }, pose);
        const snapshot = await page.evaluate(() => window.__runtimeVerification.settle());
        validate(snapshot);
        const measurements = {};
        for (const lod of ['LOD2', 'LOD3']) {
            measurements[lod] = await page.evaluate(lod => {
                const s = window.__grassLitterScene; s.setLod(lod); s.lighting.render(0);
                return window.__runtimeVerification.maskedGrass();
            }, lod);
            await page.screenshot({ path: path.join(output, `a${pose.azimuth}_e${pose.elevation}_${lod}.png`) });
        }
        const reference = measurements.LOD2, captured = measurements.LOD3;
        const luminance = reference.opaqueRgb[0] * .2126 + reference.opaqueRgb[1] * .7152 + reference.opaqueRgb[2] * .0722;
        const comparison = { coverageRatio: captured.coverage / reference.coverage,
            occupiedRatio: captured.occupied / reference.occupied,
            normalizedColorError: captured.opaqueRgb.map((value, index) => (value - reference.opaqueRgb[index]) / luminance) };
        views.push({ pose, snapshot, measurements, comparison });
        await writeFile(path.join(output, 'views.json'), JSON.stringify({ views, errors }, null, 2));
    }

    const renderedDissolve = await page.evaluate(() => {
        const s = window.__grassLitterScene, probe = window.__runtimeVerification, cards = [], fallbacks = [];
        s.scene.traverseVisible(mesh => {
            if (mesh.userData.grassRuntimeImpostor) cards.push({ mesh, saved: mesh.geometry.attributes.grassImpostorBlend.array.slice() });
            if (mesh.userData.grassRuntimeFallback) fallbacks.push(mesh);
        });
        const sample = (low, high) => {
            for (const { mesh } of cards) {
                const blend = mesh.geometry.attributes.grassImpostorBlend;
                for (let i = 0; i < mesh.geometry.instanceCount; i++) blend.setXY(i, low, high);
                blend.needsUpdate = true;
            }
            return probe.maskedGrass().coverage;
        };
        try {
            fallbacks.forEach(mesh => { mesh.visible = false; });
            const full = sample(0, 1), lower = sample(0, .5), upper = sample(.5, 1);
            return { full, lower, upper, lowerRatio: lower / full, upperRatio: upper / full, combinedRatio: (lower + upper) / full };
        } finally {
            fallbacks.forEach(mesh => { mesh.visible = true; });
            for (const { mesh, saved } of cards) { mesh.geometry.attributes.grassImpostorBlend.array.set(saved); mesh.geometry.attributes.grassImpostorBlend.needsUpdate = true; }
        }
    });
    await writeFile(path.join(output, 'rendered_dissolve.json'), JSON.stringify(renderedDissolve, null, 2));
    expect(renderedDissolve.full).toBeGreaterThan(1000);
    expect(renderedDissolve.lowerRatio).toBeGreaterThan(.45);
    expect(renderedDissolve.lowerRatio).toBeLessThan(.55);
    expect(renderedDissolve.upperRatio).toBeGreaterThan(.45);
    expect(renderedDissolve.upperRatio).toBeLessThan(.55);
    expect(renderedDissolve.combinedRatio).toBeGreaterThan(.98);
    expect(renderedDissolve.combinedRatio).toBeLessThan(1.02);

    const continuity = await page.evaluate(async () => {
        const s = window.__grassLitterScene, probe = window.__runtimeVerification, runtime = s.dynamicPlates;
        probe.pose({ azimuth: 135, elevation: 15, distance: 32 }); await probe.settle();
        const frames = [], abrupt = [];
        let previous = new Map(), previousTime = performance.now(), blendedFrames = 0;
        for (let i = 0; i < 120; i++) {
            probe.pose({ azimuth: 135 + i * .15, elevation: 15, distance: 32 }); await probe.frame();
            const weights = new Map(), now = performance.now();
            s.scene.traverseVisible(mesh => {
                if (!mesh.userData.grassRuntimeImpostor) return;
                const g = mesh.geometry, centers = g.attributes.grassImpostorCenter, blend = g.attributes.grassImpostorBlend;
                for (let j = 0; j < g.instanceCount; j++) {
                    const key = centers.getX(j) + ':' + centers.getZ(j) + ':' + mesh.material.uuid;
                    weights.set(key, blend ? blend.getY(j) - blend.getX(j) : 1);
                }
            });
            let maximumStep = 0;
            if (i) for (const key of new Set([...previous.keys(), ...weights.keys()])) {
                const delta = Math.abs((weights.get(key) ?? 0) - (previous.get(key) ?? 0));
                maximumStep = Math.max(maximumStep, delta);
                if (delta > .65 && now - previousTime < 150) abrupt.push({ frame: i, key, delta, elapsed: now - previousTime });
            }
            const snapshot = runtime.getSnapshot();
            if (snapshot.transitions) blendedFrames++;
            frames.push({ elapsed: now - previousTime, maximumStep, transitions: snapshot.transitions, captures: snapshot.captureCount });
            previous = weights; previousTime = now;
        }
        return { frames, abrupt, blendedFrames };
    });
    await writeFile(path.join(output, 'continuity.json'), JSON.stringify(continuity, null, 2));
    expect(continuity.abrupt).toEqual([]);
    expect(continuity.blendedFrames).toBeGreaterThan(20);

    const behavior = await page.evaluate(async () => {
        const s = window.__grassLitterScene, runtime = s.dynamicPlates, probe = window.__runtimeVerification;
        s.setLod('LOD3'); probe.pose({ azimuth: 225, elevation: 35, distance: 24 }); await probe.settle();
        s.lighting.render(0);
        const settled = runtime.getSnapshot(), shadowsBefore = s.getSnapshot().shadows;
        for (let i = 0; i < 30; i++) await probe.frame();
        const stationary = runtime.getSnapshot(), rotation = s.camera.quaternion.clone();
        s.camera.rotateY(.08); s.camera.updateMatrixWorld();
        for (let i = 0; i < 10; i++) { runtime.updateCamera(s.camera); runtime.renderPending(); await probe.frame(); }
        const lookOnly = runtime.getSnapshot(); s.camera.quaternion.copy(rotation);
        const orbit = [];
        for (let i = 0; i < 12; i++) {
            probe.pose({ azimuth: 225 + (i + 1) * .8, elevation: 35, distance: 24 });
            const before = runtime.getSnapshot(); runtime.renderPending(); runtime.updateCamera(s.camera);
            const after = runtime.getSnapshot(); orbit.push({ before, after }); await probe.frame();
        }
        const moved = await probe.settle(); s.lighting.render(0);
        const shadowsAfter = s.getSnapshot().shadows;
        probe.pose({ azimuth: 0, elevation: 20, distance: 4 });
        const near = await probe.settle();
        return { settled, stationary, lookOnly, orbit, moved, near, shadowsBefore, shadowsAfter };
    });
    await writeFile(path.join(output, 'motion.json'), JSON.stringify({ behavior, errors }, null, 2));
    expect(behavior.stationary.captureCount).toBe(behavior.settled.captureCount);
    expect(behavior.lookOnly.captureCount).toBe(behavior.stationary.captureCount);
    expect(behavior.moved.captureCount).toBeGreaterThan(behavior.lookOnly.captureCount);
    expect(behavior.stationary.capture.shadowGenerationCount).toBe(behavior.settled.capture.shadowGenerationCount);
    expect(behavior.lookOnly.capture.shadowGenerationCount).toBe(behavior.settled.capture.shadowGenerationCount);
    expect(behavior.moved.capture.shadowGenerationCount).toBe(behavior.settled.capture.shadowGenerationCount);
    expect(behavior.shadowsAfter.generations).toBe(behavior.shadowsBefore.generations);
    expect(behavior.shadowsAfter.source).toBe('LOD2');
    expect(behavior.near.fields.find(field => field.index === 0).fallbackLeaves).toBeGreaterThan(behavior.settled.fields.find(field => field.index === 0).fallbackLeaves);
    for (const step of behavior.orbit) {
        expect(step.after.captureCount - step.before.captureCount).toBeLessThanOrEqual(1);
        expect(step.after.cacheEntries).toBeLessThanOrEqual(step.after.cacheCapacity);
        validate(step.after);
    }

    const restoration = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__grassLitterScene, probe = window.__runtimeVerification, r = s.renderer;
        s.setLod('LOD2'); s.dynamicPlates.updateCamera(s.camera); s.setLod('LOD3');
        probe.pose({ azimuth: 77.5, elevation: 27.5, distance: 28 });
        const pending = s.dynamicPlates.getSnapshot().pendingViews;
        if (!pending) throw Error('Renderer restoration probe requires a pending capture.');
        const saved = { target: r.getRenderTarget(), viewport: r.getViewport(new THREE.Vector4()), scissor: r.getScissor(new THREE.Vector4()),
            scissorTest: r.getScissorTest(), clear: r.getClearColor(new THREE.Color()), alpha: r.getClearAlpha(),
            autoClear: r.autoClear, tone: r.toneMapping, exposure: r.toneMappingExposure };
        const sentinel = new THREE.WebGLRenderTarget(32, 32), captureBefore = s.dynamicPlates.getSnapshot().captureCount;
        const publications = [], originalRender = r.render;
        let before, after, captureAfter;
        try {
            r.setRenderTarget(sentinel); r.setViewport(3, 5, 19, 17); r.setScissor(7, 9, 11, 13); r.setScissorTest(true);
            r.setClearColor(0x324a65, .37); r.autoClear = false; r.toneMappingExposure = 2.7;
            r.render = function(...args) {
                const snapshot = s.dynamicPlates.getSnapshot();
                publications.push({ captures: snapshot.captureCount, swaps: snapshot.swapCount, views: snapshot.views });
                return originalRender.apply(this, args);
            };
            before = probe.rendererState(); s.dynamicPlates.renderPending(); after = probe.rendererState();
            captureAfter = s.dynamicPlates.getSnapshot().captureCount;
        } finally {
            r.render = originalRender;
            r.setRenderTarget(saved.target); r.setViewport(saved.viewport); r.setScissor(saved.scissor); r.setScissorTest(saved.scissorTest);
            r.setClearColor(saved.clear, saved.alpha); r.autoClear = saved.autoClear; r.toneMapping = saved.tone; r.toneMappingExposure = saved.exposure;
            sentinel.dispose();
        }
        return { before, after, captureBefore, captureAfter, pending, publications };
    });
    const multipleFields = await page.evaluate(async () => {
        const s = window.__grassLitterScene;
        s.setFieldCount(9); s.frameFields(); s.setLod('LOD3');
        await window.__runtimeVerification.settle(); s.lighting.render(0);
        return { runtime: s.dynamicPlates.getSnapshot(), scene: s.getSnapshot() };
    });
    await page.screenshot({ path: path.join(output, 'nine_fields_LOD3.png') });
    await page.evaluate(() => { const s = window.__grassLitterScene; s.setLod('LOD2'); s.lighting.render(0); });
    await page.screenshot({ path: path.join(output, 'nine_fields_LOD2.png') });
    const timings = await page.evaluate(async () => {
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const s = window.__grassLitterScene, probe = window.__runtimeVerification, timer = getOrCreateGpuFrameTimer(s.renderer);
        const gl = s.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER), blocks = [];
        for (const fields of [1, 9]) for (const moving of [false, true]) for (const lod of ['LOD2', 'LOD3']) {
            s.setFieldCount(fields); s.setLod(lod);
            const distance = fields === 1 ? 32 : 80;
            probe.pose({ azimuth: 225, elevation: 25, distance });
            if (lod === 'LOD3') await probe.settle();
            for (let i = 0; i < 60; i++) await probe.frame();
            const before = timer.getDiagnostics(), first = before.submissionSequence;
            const captureBefore = s.dynamicPlates.getSnapshot().captureCount, intervals = [];
            let previous = performance.now();
            for (let i = 0; i < 90; i++) {
                if (moving) probe.pose({ azimuth: 225 + (i + 1) * .2, elevation: 25, distance });
                await probe.frame();
                const now = performance.now(); intervals.push(now - previous); previous = now;
            }
            const last = timer.getDiagnostics().submissionSequence, runtime = s.dynamicPlates.getSnapshot();
            for (let i = 0; i < 60 && timer.getSamplesSince(0).filter(sample => sample.submissionSequence > first && sample.submissionSequence <= last).length < last - first; i++)
                await probe.frame();
            const diagnostics = timer.getDiagnostics();
            const samples = timer.getSamplesSince(0).filter(sample => sample.submissionSequence > first && sample.submissionSequence <= last).map(sample => sample.ms);
            const sorted = samples.slice().sort((a, b) => a - b), active = runtime.fields.filter(field => field.active);
            blocks.push({ fields, moving, lod, samples, intervals,
                valid: before.active && diagnostics.active && before.disjointCount === diagnostics.disjointCount && samples.length === 90 && last - first === 90,
                meanMs: samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : null,
                p95Ms: sorted.length ? sorted[Math.floor(sorted.length * .95)] : null,
                captureCount: runtime.captureCount - captureBefore,
                fallbackFraction: lod === 'LOD3' ? active.reduce((sum, field) => sum + field.fallbackLeaves, 0) / (fields * 96000) : 1,
                runtime, diagnostics });
        }
        return { gpu, viewport: [innerWidth, innerHeight], pixelRatio: s.renderer.getPixelRatio(), blocks };
    });
    await writeFile(path.join(output, 'timings.json'), JSON.stringify(timings, null, 2));
    await writeFile(path.join(output, 'validation.json'), JSON.stringify({ views, behavior, restoration, multipleFields, timings, errors }, null, 2));
    expect(restoration.after).toEqual(restoration.before);
    expect(restoration.captureAfter).toBe(restoration.captureBefore + 1);
    expect(restoration.publications.length).toBeGreaterThanOrEqual(3);
    expect(restoration.publications.every(publication => publication.captures === restoration.captureBefore
        && publication.swaps === restoration.captureBefore)).toBe(true);
    validate(multipleFields.runtime);
    expect(multipleFields.runtime.fields).toHaveLength(9);
    expect(multipleFields.runtime.totalTriangles).toBe(multipleFields.runtime.fields.reduce((sum, field) => sum + field.triangles, 0));
    expect(multipleFields.scene.fields.count).toBe(9);
    for (const { pose, measurements, comparison } of views) {
        expect.soft(measurements.LOD2.occupied).toBeGreaterThan(1000);
        expect.soft(measurements.LOD3.occupied).toBeGreaterThan(1000);
        expect.soft(measurements.LOD2.opaquePixelCount).toBeGreaterThan(500);
        expect.soft(measurements.LOD3.opaquePixelCount).toBeGreaterThan(500);
        expect.soft(comparison.coverageRatio, JSON.stringify({ pose, comparison })).toBeGreaterThan(.85);
        expect.soft(comparison.coverageRatio, JSON.stringify({ pose, comparison })).toBeLessThan(1.15);
        expect.soft(Math.max(...comparison.normalizedColorError.map(Math.abs)), JSON.stringify({ pose, comparison })).toBeLessThan(.15);
    }
    expect(errors).toEqual([]);
});
