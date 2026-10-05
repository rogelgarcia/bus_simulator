// Verifies AI577 D5 game-consistent landscape lighting: resolved game settings, calibrated sky harmonics, water surface, tiers and shader parity.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getResolvedLightingSettings } from '../../../src/graphics/lighting/LightingSettings.js';
import { getResolvedAtmosphereSettings } from '../../../src/graphics/visuals/atmosphere/AtmosphereSettings.js';
import { CALIBRATED_DAYLIGHT } from '../../../src/graphics/lighting/CalibratedDaylight.js';
import { evaluateLandscapeSkyIrradiance, landscapeSkyHorizonRadiance, projectLandscapeSkyIrradiance } from '../../../src/graphics/engine3d/landscape/LandscapeSkyIrradiance.js';
import { LANDSCAPE_REFERENCE_PROBE_LIGHTING, LANDSCAPE_WATER_LEVEL_DISABLED, landscapeHazeCalibration, landscapeLightingUniformValues, landscapeSunDirection,
    landscapeTerrainRadiance, landscapeTerrainVisibility, landscapeWaterReflectance, landscapeWaterSurfaceRoughness } from '../../../src/graphics/engine3d/landscape/LandscapeLightingModel.js';
import { LANDSCAPE_SKY_REFLECTION, prefilterLandscapeSkyReflection, sampleLandscapeSkyReflection } from '../../../src/graphics/engine3d/landscape/LandscapeSkyReflection.js';
import { decodeRadianceHdr, toHalfFloatImage } from '../../shared/landscape_radiance_hdr.js';
import { landscapeViewerUrl } from '../../shared/landscape_viewer_url.js';

const artifacts = path.resolve('tests/artifacts/screens/landscape/ai577/d5/lighting/e2e');
const calibration = JSON.parse(await readFile(path.resolve('assets/public/lighting/calibrated/clear-afternoon-55.json'), 'utf8'));
const hdr = toHalfFloatImage(decodeRadianceHdr(await readFile(path.resolve('assets/public/lighting/calibrated/clear-afternoon-55.hdr'))));
const expectedSky = projectLandscapeSkyIrradiance(hdr), expectedHorizon = landscapeSkyHorizonRadiance(hdr);
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());

function observeErrors(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error|GL_INVALID|\[Landscape\]|\[IBL\]/i.test(message.text())) errors.push(message.text()); });
    return errors;
}

// shader compiler warnings (for example Direct3D X4122 from constant-folded loops) are failures like the surface detail cold load treats them
function observeShaderWarnings(page) {
    const warnings = [];
    page.on('console', message => { if (message.type() === 'warning' && /shader|webgl|program|THREE|GL_INVALID/i.test(message.text())) warnings.push(message.text()); });
    return warnings;
}

async function ready(page) {
    await page.waitForFunction(() => {
        const state = window.__landscapeTestHooks?.snapshot();
        if (state?.lastError) throw new Error(state.lastError);
        return state?.ready && state.lighting?.status !== 'loading' && state.streaming?.settled && state.appearance?.settled;
    }, null, { timeout: 90000 });
    return snapshot(page);
}

const closeTo = (actual, expected, relative, label) => expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(relative * Math.max(1e-6, Math.abs(expected)));

test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

test('Landscape lighting: the viewer resolves the game lighting, projects the calibrated sky without fatals and keeps the water contract', async ({ page }, testInfo) => {
    test.setTimeout(150000);
    expect(new URL(String(testInfo.project.use.baseURL)).port, 'Landscape verification uses port 8002').toBe('8002');
    const errors = observeErrors(page), warnings = observeShaderWarnings(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html'));
    const state = await ready(page), lighting = state.lighting;
    const settings = getResolvedLightingSettings({ includeUrlOverrides: false }), atmosphere = getResolvedAtmosphereSettings({ includeUrlOverrides: false });
    expect(lighting.status).toBe('ready'); expect(lighting.error).toBeNull(); expect(lighting.tier).toBe('standard');
    expect(lighting.toneMapping).toBe(settings.toneMapping); expect(lighting.toneMappingThree).toBe(4);
    expect(lighting.exposure).toBe(settings.exposure); expect(lighting.exposure).toBe(CALIBRATED_DAYLIGHT.exposure);
    expect(lighting.hemisphereIntensity).toBe(settings.hemiIntensity);
    const sun = landscapeSunDirection(atmosphere.sun.azimuthDeg, atmosphere.sun.elevationDeg);
    lighting.sun.direction.forEach((value, axis) => closeTo(value, sun[axis], 1e-9, `sun axis ${axis}`));
    lighting.sun.irradiance.forEach((value, channel) => closeTo(value, CALIBRATED_DAYLIGHT.sunNormalRgb[channel], 1e-9, `sun channel ${channel}`));
    expect(lighting.environment).toMatchObject({ iblId: CALIBRATED_DAYLIGHT.environmentId, intensity: 1, setBackground: true, background: 'hdr-equirect', pmrem: false,
        reflection: { model: LANDSCAPE_SKY_REFLECTION.model, width: LANDSCAPE_SKY_REFLECTION.width, height: LANDSCAPE_SKY_REFLECTION.height, supportDegrees: LANDSCAPE_SKY_REFLECTION.supportDegrees } });
    closeTo(lighting.environment.reflection.roughness, landscapeWaterSurfaceRoughness().roughness, 1e-12, 'reflection roughness');
    expect(lighting.environment.reflection.retainedWeight).toBeGreaterThan(.98);
    expect(await page.evaluate(() => window.__testFatals ?? [])).toEqual([]);
    // the runtime projects the half-float texels three.js uploaded; Node projects the same decoding
    lighting.sky.coefficients.forEach((rgb, index) => rgb.forEach((value, channel) => closeTo(value, expectedSky.coefficients[index * 3 + channel], 1e-6, `sky coefficient ${index}/${channel}`)));
    lighting.sky.horizonRadiance.forEach((value, channel) => closeTo(value, expectedHorizon[channel], 1e-9, `horizon ${channel}`));
    const receivers = { horizontal: lighting.sky.irradiance.up, east: lighting.sky.irradiance.east, north: lighting.sky.irradiance.north };
    const receiverErrors = Object.fromEntries(Object.entries(receivers).map(([name, value]) => [name, value.map((channel, index) => channel / calibration.profile.skyIrradiance[name][index] - 1)]));
    for (const [name, values] of Object.entries(receiverErrors)) values.forEach(value => expect(Math.abs(value), `${name} receiver`).toBeLessThanOrEqual(name === 'horizontal' ? .025 : .01));
    const haze = landscapeHazeCalibration({ seaLevel: 0, sunDirection: sun, sunIrradiance: [...CALIBRATED_DAYLIGHT.sunNormalRgb], skyCoefficients: Array.from(expectedSky.coefficients) }, expectedHorizon, 'standard');
    lighting.haze.calibration.forEach((value, channel) => closeTo(value, haze.calibration[channel], 1e-6, `haze calibration ${channel}`));
    expect(lighting.haze.calibrationClamped).toBe(false);
    expect(lighting.uniforms.sun.slice(0, 3).map(value => Math.round(value * 1e6) / 1e6)).toEqual(sun.map(value => Math.round(Math.fround(value) * 1e6) / 1e6));
    expect(lighting.uniforms.sunIrradiance[3]).toBe(0);
    expect(lighting.backdrop).toMatchObject({ model: 'landscape-atmosphere-backdrop-v1', visible: true, lightingTier: 'standard' });
    expect(state.water).toMatchObject({ visible: true, seaLevel: 0, cpuBytes: 140, gpuBytes: 140, separateFromTerrain: true, material: 'landscape-water-surface-v1',
        reflection: LANDSCAPE_SKY_REFLECTION.model, transparency: 'fresnel-premultiplied', opticalBody: true, ior: 1.333 });
    expect(state.budget.entries.filter(entry => entry.kind === 'landscape-water-reference').map(entry => [entry.cpuBytes, entry.gpuBytes])).toEqual([[140, 140]]);
    expect(lighting.resources.ledger).toMatch(/outside the landscape residency ledger/);
    expect(lighting.resources.hdrGpuBytes).toBe(1024 * 512 * 8); expect(lighting.resources.reflectionGpuBytes).toBe(LANDSCAPE_SKY_REFLECTION.width * LANDSCAPE_SKY_REFLECTION.height * 8);
    expect(lighting.resources).not.toHaveProperty('pmremGpuBytes');
    // hiding the water reference removes the optical water body; showing it restores the sea level
    await page.evaluate(() => window.__landscapeTestHooks.setWater(false));
    const dry = await snapshot(page);
    expect(dry.water.visible).toBe(false); expect(dry.lighting.water.opticalLevel).toBeNull(); expect(dry.lighting.uniforms.sunIrradiance[3]).toBe(LANDSCAPE_WATER_LEVEL_DISABLED);
    await page.evaluate(() => window.__landscapeTestHooks.setWater(true));
    const wet = await snapshot(page);
    expect(wet.lighting.water.opticalLevel).toBe(0); expect(wet.lighting.uniforms.sunIrradiance[3]).toBe(0);
    await page.evaluate(() => window.__landscapeTestHooks.preset('ground'));
    await ready(page);
    await page.screenshot({ path: path.join(artifacts, '01-beach-approach-standard.png') });
    const metadata = await page.evaluate(() => window.__landscapeTestHooks.performanceMetadata());
    expect(metadata.rendererSettings).toMatchObject({ toneMapping: 4, exposure: CALIBRATED_DAYLIGHT.exposure });
    await writeFile(path.join(artifacts, 'resolved-lighting.json'), JSON.stringify({ lighting, receiverErrors, water: state.water, metadata: metadata.rendererSettings }, null, 2));
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const disposed = await snapshot(page);
    expect(disposed.budget.cpuBytes).toBe(0); expect(disposed.budget.gpuBytes).toBe(0);
    expect(errors).toEqual([]);
    expect(warnings, 'no shader compiler warnings').toEqual([]);
});

test('Landscape lighting: the game URL overrides apply and every tier compiles at load and at runtime', async ({ page }) => {
    test.setTimeout(180000);
    const errors = observeErrors(page), warnings = observeShaderWarnings(page);
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeLighting=low&sunAzimuth=200&sunElevation=12&exposure=0.03'));
    const low = (await ready(page)).lighting;
    expect(low.tier).toBe('low'); expect(low.haze.enabled).toBe(false); expect(low.water.column).toBe('constant-deep-water-source');
    expect(low.exposure).toBe(.03);
    expect(low.sources.urlOverrides).toEqual({ exposure: '0.03', sunAzimuth: '200', sunElevation: '12' });
    landscapeSunDirection(200, 12).forEach((value, axis) => closeTo(low.sun.direction[axis], value, 1e-9, `overridden sun axis ${axis}`));
    expect(low.sun.elevationDeg).toBe(12);
    const frames = count => page.evaluate(async count => { for (let index = 0; index < count; index++) await new Promise(resolve => requestAnimationFrame(resolve)); }, count);
    const calibrations = { low: low.haze.calibration };
    for (const tier of ['high', 'standard']) {
        const switched = await page.evaluate(tier => window.__landscapeTestHooks.setLighting({ tier }), tier);
        expect(switched.tier).toBe(tier); expect(switched.backdrop.lightingTier).toBe(tier);
        await frames(30);
        const state = await snapshot(page);
        expect(state.lighting.tier).toBe(tier); expect(state.water.lightingTier).toBe(tier); expect(state.lastError).toBeNull();
        calibrations[tier] = state.lighting.haze.calibration;
    }
    expect(calibrations.high).not.toEqual(calibrations.standard);
    expect(await page.evaluate(() => window.__testFatals ?? [])).toEqual([]);
    await page.evaluate(() => window.__landscapeTestHooks.dispose());
    const invalid = [];
    page.on('pageerror', error => invalid.push(error.message));
    await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html?landscapeLighting=ultra'));
    await expect.poll(() => invalid.length).toBeGreaterThan(0);
    expect(invalid[0]).toMatch(/landscapeLighting must be one of low, standard, high; received ultra/);
    expect(errors.filter(message => !/landscapeLighting must be one of/.test(message))).toEqual([]);
    expect(warnings, 'no shader compiler warnings in any tier').toEqual([]);
});

test('Landscape lighting: the water surface reflects the prefiltered calibrated sky along its dominant reflection, rotated by a binding yaw', async ({ page }) => {
    test.setTimeout(120000);
    const warnings = observeShaderWarnings(page);
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html'));
    await ready(page);
    // low tier: no aerial perspective, so the premultiplied surface is exactly reflectance · prefiltered sky; camera above the water at y = 0
    const cameras = [[-300, 120, -500], [400, 60, -150], [40, 50, 460], [-2500, 12, 900], [30, 400, 90]];
    const rendered = await page.evaluate(async cameras => {
        const T = await import('three');
        const { LandscapeLighting } = await import('/src/graphics/engine3d/landscape/LandscapeLighting.js');
        const { createLandscapeShaderPayload } = await import('/src/graphics/shaders/materials/landscape/LandscapeShaderLoader.js');
        const canvas = document.createElement('canvas'), renderer = new T.WebGLRenderer({ canvas, antialias: false });
        renderer.setSize(33, 33, false);
        const binding = { format: 'city-landscape-binding', schemaVersion: 1, landscapeId: 'coastal', manifestUrl: 'assets/public/landscape/coastal-city/manifest.json', revision: 'r1',
            transform: { translation: { x: 0, y: 0, z: 0 }, yawDegrees: 90, scale: 1 }, extent: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, capabilities: ['landscape-reference-v1'] };
        const lighting = new LandscapeLighting({ renderer, scene: new T.Scene(), tier: 'low', binding, includeUrlOverrides: false });
        await lighting.ready;
        const environment = lighting.reflectionEnvironment(), payload = createLandscapeShaderPayload('water', { lightingTier: 'low', reflection: true });
        const material = new T.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, transparent: true, premultipliedAlpha: true, depthWrite: false,
            side: T.DoubleSide, uniforms: { ...lighting.uniforms, uLandscapeSkyReflection: { value: environment.texture }, uLandscapeSkyReflectionRotation: { value: environment.rotation } } });
        const geometry = new T.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), scene = new T.Scene(), mesh = new T.Mesh(geometry, material);
        mesh.frustumCulled = false; scene.add(mesh);
        const target = new T.WebGLRenderTarget(33, 33, { type: T.FloatType }), results = [];
        for (const position of cameras) {
            const camera = new T.PerspectiveCamera(5, 1, .1, 25000);
            camera.position.fromArray(position); camera.lookAt(40, 0, 60); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
            renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
            const pixel = new Float32Array(4); renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixel);
            results.push({ position, rgba: Array.from(pixel), error: renderer.getContext().getError() });
        }
        const map = { width: lighting.reflection.width, height: lighting.reflection.height, data: Array.from(lighting.reflection.data) };
        renderer.setRenderTarget(null); target.dispose(); geometry.dispose(); material.dispose(); lighting.dispose(); renderer.dispose(); renderer.forceContextLoss();
        return { results, map, status: lighting.status };
    }, cameras);
    expect(rendered.status).toBe('ready');
    // the page map is the Node prefilter of the same half-float texels
    const nodeMap = prefilterLandscapeSkyReflection(hdr, { roughness: landscapeWaterSurfaceRoughness().roughness });
    for (let index = 0; index < nodeMap.data.length; index += 97) closeTo(rendered.map.data[index], nodeMap.data[index], 1e-5, `reflection texel value ${index}`);
    const roughness = landscapeWaterSurfaceRoughness().roughness, mixing = roughness ** 4, comparison = [];
    for (const { position, rgba, error } of rendered.results) {
        const ray = [position[0] - 40, position[1], position[2] - 60], length = Math.hypot(...ray), v = ray.map(value => value / length);
        const mirrored = [-v[0], v[1], -v[2]], blended = mirrored.map((value, axis) => value * (1 - mixing) + (axis === 1 ? mixing : 0)), norm = Math.hypot(...blended);
        const reflection = blended.map(value => value / norm), game = [reflection[2], reflection[1], -reflection[0]];
        const sky = sampleLandscapeSkyReflection(rendered.map, game), reflectance = landscapeWaterReflectance(v);
        comparison.push({ position, v, game, sky, reflectance, rgba });
        expect(error).toBe(0);
        closeTo(rgba[3], reflectance, 2e-3, `reflectance from ${position}`);
        sky.forEach((value, channel) => closeTo(rgba[channel] / rgba[3], value, 1e-2, `reflected sky from ${position} channel ${channel}`));
    }
    await writeFile(path.join(artifacts, 'water-reflection-parity.json'), JSON.stringify(comparison, null, 2));
    expect(Math.max(...comparison.map(entry => entry.sky[2])) / Math.min(...comparison.map(entry => entry.sky[2])), 'the probes reflect different parts of the sky').toBeGreaterThan(1.2);
    expect(warnings).toEqual([]);
});

test('Landscape lighting: a city binding yaw turns the game-frame sun, sky harmonics and HDR background into landscape space consistently', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(landscapeViewerUrl('/screens/landscape_fabrication.html'));
    await ready(page);
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const { LandscapeLighting } = await import('/src/graphics/engine3d/landscape/LandscapeLighting.js');
        const { evaluateLandscapeSkyIrradiance } = await import('/src/graphics/engine3d/landscape/LandscapeSkyIrradiance.js');
        const canvas = document.createElement('canvas'), renderer = new T.WebGLRenderer({ canvas, antialias: false });
        renderer.setSize(33, 33, false);
        const binding = { format: 'city-landscape-binding', schemaVersion: 1, landscapeId: 'coastal', manifestUrl: 'assets/public/landscape/coastal-city/manifest.json', revision: 'r1',
            transform: { translation: { x: 300, y: 2, z: -40 }, yawDegrees: 90, scale: 1 }, extent: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, capabilities: ['landscape-reference-v1'] };
        const turned = new LandscapeLighting({ renderer, scene: new T.Scene(), binding, includeUrlOverrides: false });
        const plain = new LandscapeLighting({ renderer, scene: new T.Scene(), includeUrlOverrides: false });
        await Promise.all([turned.ready, plain.ready]);
        const target = new T.WebGLRenderTarget(33, 33, { type: T.FloatType });
        const background = (lighting, direction) => {
            const camera = new T.PerspectiveCamera(5, 1, .1, 100);
            camera.lookAt(...direction); camera.updateMatrixWorld();
            renderer.setRenderTarget(target); renderer.render(lighting.scene, camera);
            const pixel = new Float32Array(4); renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixel);
            return Array.from(pixel.slice(0, 3));
        };
        // landscape → city by the binding yaw (landscapePointToCity without translation): x' = c·x + s·z, z' = -s·x + c·z
        const toCity = ([x, y, z]) => [Math.cos(Math.PI / 2) * x + Math.sin(Math.PI / 2) * z, y, -Math.sin(Math.PI / 2) * x + Math.cos(Math.PI / 2) * z];
        const directions = [[1, .25, 0], [0, .1, 1], [-.6, .35, .5]], samples = directions.map(direction => ({ direction, city: toCity(direction),
            turned: background(turned, direction), plain: background(plain, toCity(direction)),
            turnedSky: evaluateLandscapeSkyIrradiance(turned.current.skyCoefficients, direction), plainSky: evaluateLandscapeSkyIrradiance(plain.current.skyCoefficients, toCity(direction)) }));
        const result = { samples, turnedSun: turned.sunDirection, plainSun: plain.sunDirection, rotation: turned.scene.backgroundRotation.y, status: [turned.status, plain.status] };
        renderer.setRenderTarget(null); target.dispose(); turned.dispose(); plain.dispose(); renderer.dispose(); renderer.forceContextLoss();
        return result;
    });
    expect(result.status).toEqual(['ready', 'ready']);
    closeTo(result.rotation, -Math.PI / 2, 1e-12, 'background rotation');
    landscapeSunDirection(45, 55, 90).forEach((value, axis) => closeTo(result.turnedSun[axis], value, 1e-12, `turned sun axis ${axis}`));
    for (const sample of result.samples) {
        sample.turned.forEach((value, channel) => closeTo(value, sample.plain[channel], 1e-3, `background along ${sample.direction} channel ${channel}`));
        sample.turnedSky.forEach((value, channel) => closeTo(value, sample.plainSky[channel], 1e-6, `sky harmonics along ${sample.direction} channel ${channel}`));
    }
    expect(Math.max(...result.samples.map(sample => Math.abs(sample.turned[2] - result.samples[0].turned[2]))), 'the probe directions see different parts of the sky').toBeGreaterThan(.01);
});

test('Landscape lighting: the production terrain shader reproduces the JavaScript lighting mirror on dry, submerged and orthographic probes', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port).not.toBe('8001');
    // a calibrated-like state: the reference hemisphere sky scaled to sky-irradiance magnitude, the calibrated sun, sea level 0
    const skyCoefficients = LANDSCAPE_REFERENCE_PROBE_LIGHTING.skyCoefficients.map(value => value * 4);
    const state = { seaLevel: 0, waterLevel: 0, sunDirection: landscapeSunDirection(45, 55), sunIrradiance: [...CALIBRATED_DAYLIGHT.sunNormalRgb], skyCoefficients, calibration: [1.08, 1.09, 1.01] };
    const uniforms = landscapeLightingUniformValues(state), albedo = 128 / 255;
    const cases = [
        { id: 'dry-perspective', tier: 'standard', height: 20, camera: { type: 'perspective', position: [-300, 420, -500], target: [40, 20, 60] } },
        { id: 'dry-far-haze', tier: 'standard', height: 20, camera: { type: 'perspective', position: [-3500, 900, -2600], target: [100, 20, 50] } },
        { id: 'dry-low', tier: 'low', height: 20, camera: { type: 'perspective', position: [-300, 420, -500], target: [40, 20, 60] } },
        { id: 'submerged-perspective', tier: 'standard', height: -4, camera: { type: 'perspective', position: [-120, 60, -90], target: [30, -4, 25] } },
        { id: 'submerged-toward-sun', tier: 'standard', height: -2.5, camera: { type: 'perspective', position: [-60, 45, -60], target: [20, -2.5, 20] } },
        { id: 'submerged-low', tier: 'low', height: -4, camera: { type: 'perspective', position: [-120, 60, -90], target: [30, -4, 25] } },
        { id: 'submerged-underwater-camera', tier: 'standard', height: -9, camera: { type: 'perspective', position: [-20, -2, -15], target: [10, -9, 5] } },
        { id: 'dry-orthographic', tier: 'standard', height: 20, camera: { type: 'orthographic', position: [0, 1500, -.001], target: [0, 20, 0] } }
    ];
    const context = await browser.newContext({ baseURL, viewport: { width: 512, height: 512 } }), page = await context.newPage();
    const errors = observeErrors(page);
    try {
        await page.route('**/tests/headless/e2e/fixtures/landscape_surface_probe.html', async route => route.fulfill({ contentType: 'text/html', body: await readFile('tests/headless/e2e/fixtures/landscape_surface_probe.html', 'utf8') }));
        await page.goto('/tests/headless/e2e/fixtures/landscape_surface_probe.html');
        const rendered = await page.evaluate(async ({ cases, uniforms, albedo }) => {
            const T = await import('three');
            const { createLandscapeShaderPayload } = await import('/src/graphics/shaders/materials/landscape/LandscapeShaderLoader.js');
            const { createLandscapeAppearanceUniforms, chooseLandscapeCoverageSlots } = await import('/src/graphics/engine3d/landscape/LandscapeAppearanceUniforms.js');
            const { LandscapeMaskPages } = await import('/src/graphics/engine3d/landscape/LandscapeMaskPages.js');
            const renderer = new T.WebGLRenderer({ canvas: document.getElementById('surface-probe'), antialias: false });
            renderer.setPixelRatio(1); renderer.setSize(63, 63, false);
            const target = new T.WebGLRenderTarget(63, 63, { type: T.FloatType }), coverageSlots = chooseLandscapeCoverageSlots(renderer).total;
            const appearance = createLandscapeAppearanceUniforms(coverageSlots), columns = 17, width = 21, capacity = 17, resources = [target];
            const base = new T.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, T.RGBAFormat), surface = new T.DataArrayTexture(new Uint8Array([128, 128, 255, 255, 255, 255, 0, 128]), 1, 1, 2);
            for (const texture of [base, surface]) { texture.colorSpace = T.NoColorSpace; texture.needsUpdate = true; resources.push(texture); }
            for (let soil = 0; soil < 6; soil++) { appearance[`uSoilBase${soil}`].value = base; appearance[`uSoilSurface${soil}`].value = surface; appearance.uSoilScale.value[soil].set(4, 0, 1, 0); }
            appearance.uBlendBase.value = base; appearance.uBlendSurface.value = surface; appearance.uAppearanceReady.value = 1; appearance.uMaskDimensions.value.set(columns, columns);
            const pixels = new Uint8Array(width * width * 4 * capacity);
            for (let index = 0; index < width * width * capacity; index++) pixels.set([2 * 17, 2, 1, 240], index * 4);
            const masks = new T.DataArrayTexture(pixels, width, width, capacity);
            masks.format = T.RGBAFormat; masks.magFilter = masks.minFilter = T.NearestFilter; masks.generateMipmaps = false; masks.flipY = false; masks.needsUpdate = true;
            appearance.uMaskPages.value = masks; resources.push(masks);
            const descriptor = { id: 'l0/c0/r0', level: 0, column: 0, row: 0, parentId: null, bounds: { minX: -20000, maxX: 20000, minZ: -20000, maxZ: 20000 } };
            LandscapeMaskPages.prototype.updateUniforms.call({ records: new Map([[descriptor.id, { id: descriptor.id, descriptor, slot: 0, progress: 1, status: 'resident' }]]), capacity, uniforms: appearance });
            const lighting = { uLandscapeSky: { value: Float32Array.from(uniforms.uLandscapeSky) }, uLandscapeSun: { value: Float32Array.from(uniforms.uLandscapeSun) }, uLandscapeSunIrradiance: { value: Float32Array.from(uniforms.uLandscapeSunIrradiance) } };
            const results = [];
            try {
                for (const probe of cases) {
                    const payload = createLandscapeShaderPayload('terrain', { coverageSlots, lightingTier: probe.tier, terrainAppearance: false });
                    const geometry = new T.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2).translate(0, probe.height, 0);
                    geometry.setAttribute('parentHeight', new T.BufferAttribute(new Float32Array(4).fill(probe.height), 1));
                    geometry.setAttribute('parentNormal', geometry.attributes.normal.clone());
                    geometry.setAttribute('color', new T.BufferAttribute(new Float32Array(12).fill(1), 3));
                    const material = new T.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, vertexColors: true,
                        uniforms: { ...appearance, ...lighting, uMorph: { value: 1 }, uEdges: { value: new T.Vector4() }, uEdgeMorph: { value: new T.Vector4(1, 1, 1, 1) },
                            uBounds: { value: new T.Vector4(-20000, 20000, -20000, 20000) }, uTint: { value: new T.Color(1, 1, 1) }, uLodColor: { value: 0 },
                            uDiagnostic: { value: 0 }, uDiagnosticRange: { value: new T.Vector3(0, 1, 0) } } });
                    const scene = new T.Scene(), mesh = new T.Mesh(geometry, material);
                    mesh.frustumCulled = false; scene.add(mesh);
                    const camera = probe.camera.type === 'orthographic' ? new T.OrthographicCamera(-20, 20, 20, -20, .1, 25000) : new T.PerspectiveCamera(20, 1, .1, 25000);
                    camera.position.fromArray(probe.camera.position); camera.lookAt(...probe.camera.target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
                    renderer.setRenderTarget(target); renderer.render(scene, camera);
                    const pixel = new Float32Array(4); renderer.readRenderTargetPixels(target, 31, 31, 1, 1, pixel);
                    const error = renderer.getContext().getError();
                    results.push({ id: probe.id, rgb: Array.from(pixel.slice(0, 3)), error });
                    geometry.dispose(); material.dispose();
                }
            } finally {
                renderer.setRenderTarget(null);
                for (const resource of resources) resource.dispose();
                renderer.dispose(); renderer.forceContextLoss();
            }
            return results;
        }, { cases, uniforms: Object.fromEntries(Object.entries(uniforms).map(([name, value]) => [name, Array.from(value)])), albedo });
        const comparison = rendered.map((result, index) => {
            const probe = cases[index], world = [...probe.camera.target];
            const expected = landscapeTerrainRadiance(state, { albedo: [albedo, albedo, albedo], normal: [0, 1, 0], roughness: 1, metalness: 0, ao: 1, world, origin: probe.camera.position }, probe.tier);
            return { ...result, expected, relative: result.rgb.map((value, channel) => Math.abs(value / expected[channel] - 1)) };
        });
        await writeFile(path.join(artifacts, 'shader-parity.json'), JSON.stringify({ state, cases, comparison }, null, 2));
        for (const entry of comparison) {
            expect(entry.error, `${entry.id} WebGL error`).toBe(0);
            entry.relative.forEach((value, channel) => expect(value, `${entry.id} channel ${channel}: GPU ${entry.rgb[channel]} vs mirror ${entry.expected[channel]}`).toBeLessThanOrEqual(5e-4));
        }
        const low = comparison.find(entry => entry.id === 'dry-low'), dry = comparison.find(entry => entry.id === 'dry-perspective');
        expect(Math.max(...dry.rgb.map((value, channel) => Math.abs(value - low.rgb[channel]))), 'the standard tier adds the aerial perspective the low tier omits').toBeGreaterThan(1e-3);
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});

test('Landscape lighting: the production terrain shader reproduces the D5c material response, terrain-reflected light and terrain-field visibility mirrors', async ({ browser }, testInfo) => {
    test.setTimeout(150000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port).not.toBe('8001');
    const skyCoefficients = LANDSCAPE_REFERENCE_PROBE_LIGHTING.skyCoefficients.map(value => value * 4), response = { model: true, bounce: true, terrainVisibility: true };
    const low = { seaLevel: 0, waterLevel: LANDSCAPE_WATER_LEVEL_DISABLED, sunDirection: landscapeSunDirection(45, 12), sunIrradiance: [...CALIBRATED_DAYLIGHT.sunNormalRgb], skyCoefficients, response };
    const high = { ...low, sunDirection: landscapeSunDirection(45, 55) };
    // one uniform material in every soil slot: EON roughness, specular shadowing weight and opposition amplitude (its flat page has no mean slope)
    const material = { response: [.3, 1, .5], albedo: 128 / 255 };
    // constant terrain fields: sky view 0.8 on flat ground and sqrt-sine horizon bytes per azimuth 0..315°; 140 at 45° hides a 12° sun, 60 does not
    const shadowBytes = [60, 140, 90, 60, 30, 60, 90, 60], litBytes = [60, 60, 90, 60, 30, 60, 90, 60];
    const cases = [
        { id: 'forward-low-sun', state: low, tilt: 0, fields: null, camera: { position: [-260, 62, -260], target: [0, 20, 0] } },
        { id: 'antisolar-low-sun', state: low, tilt: 0, fields: null, camera: { position: [300, 84, 300], target: [0, 20, 0] } },
        { id: 'side-high-sun', state: high, tilt: 0, fields: null, camera: { position: [-300, 220, 280], target: [0, 20, 0] } },
        { id: 'tilted-bounce', state: high, tilt: 35, fields: null, camera: { position: [40, 190, 320], target: [0, 20, 0] } },
        { id: 'fields-shadowed', state: low, tilt: 0, fields: shadowBytes, camera: { position: [300, 84, 300], target: [0, 20, 0] } },
        { id: 'fields-lit', state: low, tilt: 0, fields: litBytes, camera: { position: [300, 84, 300], target: [0, 20, 0] } },
        { id: 'fields-tilted', state: high, tilt: 25, fields: shadowBytes, camera: { position: [40, 190, 320], target: [0, 20, 0] } }
    ];
    const context = await browser.newContext({ baseURL, viewport: { width: 512, height: 512 } }), page = await context.newPage();
    const errors = observeErrors(page), warnings = observeShaderWarnings(page);
    try {
        await page.route('**/tests/headless/e2e/fixtures/landscape_surface_probe.html', async route => route.fulfill({ contentType: 'text/html', body: await readFile('tests/headless/e2e/fixtures/landscape_surface_probe.html', 'utf8') }));
        await page.goto('/tests/headless/e2e/fixtures/landscape_surface_probe.html');
        const rendered = await page.evaluate(async ({ cases, uniformsByCase, material }) => {
            const T = await import('three');
            const { createLandscapeShaderPayload } = await import('/src/graphics/shaders/materials/landscape/LandscapeShaderLoader.js');
            const { createLandscapeAppearanceUniforms, chooseLandscapeCoverageSlots } = await import('/src/graphics/engine3d/landscape/LandscapeAppearanceUniforms.js');
            const { LandscapeMaskPages } = await import('/src/graphics/engine3d/landscape/LandscapeMaskPages.js');
            const { createLandscapeTerrainFieldTexture } = await import('/src/graphics/engine3d/landscape/LandscapeTerrainFieldTexture.js');
            const renderer = new T.WebGLRenderer({ canvas: document.getElementById('surface-probe'), antialias: false });
            renderer.setPixelRatio(1); renderer.setSize(63, 63, false);
            const target = new T.WebGLRenderTarget(63, 63, { type: T.FloatType }), coverageSlots = chooseLandscapeCoverageSlots(renderer).total;
            const appearance = createLandscapeAppearanceUniforms(coverageSlots), columns = 17, width = 21, capacity = 17, resources = [target];
            const base = new T.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, T.RGBAFormat), surface = new T.DataArrayTexture(new Uint8Array([128, 128, 255, 255, 255, 255, 0, 128]), 1, 1, 2);
            for (const texture of [base, surface]) { texture.colorSpace = T.NoColorSpace; texture.needsUpdate = true; resources.push(texture); }
            for (let soil = 0; soil < 6; soil++) {
                appearance[`uSoilBase${soil}`].value = base; appearance[`uSoilSurface${soil}`].value = surface; appearance.uSoilScale.value[soil].set(4, 0, 1, 0);
                appearance.uSoilResponse.value[soil].set(material.response[0], material.response[1], 0, 0); appearance.uSoilState.value[soil].w = material.response[2];
            }
            appearance.uBlendBase.value = base; appearance.uBlendSurface.value = surface; appearance.uAppearanceReady.value = 1; appearance.uMaskDimensions.value.set(columns, columns);
            const pixels = new Uint8Array(width * width * 4 * capacity);
            for (let index = 0; index < width * width * capacity; index++) pixels.set([2 * 17, 2, 1, 240], index * 4);
            const masks = new T.DataArrayTexture(pixels, width, width, capacity);
            masks.format = T.RGBAFormat; masks.magFilter = masks.minFilter = T.NearestFilter; masks.generateMipmaps = false; masks.flipY = false; masks.needsUpdate = true;
            appearance.uMaskPages.value = masks; resources.push(masks);
            const descriptor = { id: 'l0/c0/r0', level: 0, column: 0, row: 0, parentId: null, bounds: { minX: -20000, maxX: 20000, minZ: -20000, maxZ: 20000 } };
            LandscapeMaskPages.prototype.updateUniforms.call({ records: new Map([[descriptor.id, { id: descriptor.id, descriptor, slot: 0, progress: 1, status: 'resident' }]]), capacity, uniforms: appearance });
            const results = [];
            try {
                for (const [index, probe] of cases.entries()) {
                    let fieldTexture = null;
                    if (probe.fields) {
                        const layer = width * width * 4, bytes = new Uint8Array(layer * 4);
                        for (let texel = 0; texel < width * width; texel++) {
                            bytes.set([204, 128, 128, 0], layer + texel * 4);
                            bytes.set(probe.fields.slice(0, 4), 2 * layer + texel * 4); bytes.set(probe.fields.slice(4), 3 * layer + texel * 4);
                        }
                        fieldTexture = createLandscapeTerrainFieldTexture({ pixels: bytes, width, height: width, depth: 4 }); fieldTexture.needsUpdate = true;
                        appearance.uTerrainFields.value = fieldTexture; appearance.uTerrainFieldsState.value.set([0, 0, 1, 4]); appearance.uMaskMeta.value[0].w = 1.25;
                    } else { appearance.uTerrainFields.value = null; appearance.uTerrainFieldsState.value.fill(0); appearance.uMaskMeta.value[0].w = 1; }
                    const lighting = Object.fromEntries(Object.entries(uniformsByCase[index]).map(([name, value]) => [name, { value: Float32Array.from(value) }]));
                    const payload = createLandscapeShaderPayload('terrain', { coverageSlots, lightingTier: 'standard', terrainAppearance: uniformsByCase[index].uLandscapeResponse[3] > .5 });
                    const geometry = new T.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2).rotateX(probe.tilt * Math.PI / 180).translate(...probe.camera.target);
                    const heights = new Float32Array(4).map((_, vertex) => geometry.attributes.position.getY(vertex));
                    geometry.setAttribute('parentHeight', new T.BufferAttribute(heights, 1));
                    geometry.setAttribute('parentNormal', geometry.attributes.normal.clone());
                    geometry.setAttribute('color', new T.BufferAttribute(new Float32Array(12).fill(1), 3));
                    const shader = new T.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, vertexColors: true,
                        uniforms: { ...appearance, ...lighting, uMorph: { value: 1 }, uEdges: { value: new T.Vector4() }, uEdgeMorph: { value: new T.Vector4(1, 1, 1, 1) },
                            uBounds: { value: new T.Vector4(-20000, 20000, -20000, 20000) }, uTint: { value: new T.Color(1, 1, 1) }, uLodColor: { value: 0 },
                            uDiagnostic: { value: 0 }, uDiagnosticRange: { value: new T.Vector3(0, 1, 0) } } });
                    const scene = new T.Scene(), mesh = new T.Mesh(geometry, shader);
                    mesh.frustumCulled = false; scene.add(mesh);
                    const camera = new T.PerspectiveCamera(20, 1, .1, 25000);
                    camera.position.fromArray(probe.camera.position); camera.lookAt(...probe.camera.target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
                    renderer.setRenderTarget(target); renderer.render(scene, camera);
                    const pixel = new Float32Array(4); renderer.readRenderTargetPixels(target, 31, 31, 1, 1, pixel);
                    results.push({ id: probe.id, rgb: Array.from(pixel.slice(0, 3)), normal: Array.from(geometry.attributes.normal.array.slice(0, 3)), error: renderer.getContext().getError() });
                    geometry.dispose(); shader.dispose(); fieldTexture?.dispose();
                }
            } finally {
                renderer.setRenderTarget(null);
                for (const resource of resources) resource.dispose();
                renderer.dispose(); renderer.forceContextLoss();
            }
            return results;
        }, { cases, material, uniformsByCase: cases.map(probe => Object.fromEntries(Object.entries(landscapeLightingUniformValues(probe.state)).map(([name, value]) => [name, Array.from(value)]))) });
        const comparison = rendered.map((result, index) => {
            const probe = cases[index], albedo = [material.albedo, material.albedo, material.albedo];
            const sample = probe.fields ? { availability: 1, fields: { skyView: 204 / 255, slopeDegrees: 0, horizonSine: probe.fields.map(byte => (byte / 255) ** 2) } } : { availability: 0, fields: null };
            const visibility = landscapeTerrainVisibility(sample, probe.state.sunDirection), fragment = { albedo, normal: result.normal, roughness: 1, metalness: 0, ao: 1, world: probe.camera.target, origin: probe.camera.position };
            const expected = landscapeTerrainRadiance(probe.state, { ...fragment, response: material.response, groundAlbedo: albedo, sunVisibility: visibility.sun, skyVisibility: visibility.sky,
                horizonSine: sample.fields?.horizonSine ?? null, fieldWeight: visibility.weight }, 'standard');
            const d5b = landscapeTerrainRadiance({ ...probe.state, response: undefined }, fragment, 'standard');
            return { ...result, expected, d5b, visibility, relative: result.rgb.map((value, channel) => Math.abs(value / expected[channel] - 1)) };
        });
        await writeFile(path.join(artifacts, 'response-parity.json'), JSON.stringify({ cases, material, comparison }, null, 2));
        for (const entry of comparison) {
            expect(entry.error, `${entry.id} WebGL error`).toBe(0);
            entry.relative.forEach((value, channel) => expect(value, `${entry.id} channel ${channel}: GPU ${entry.rgb[channel]} vs mirror ${entry.expected[channel]}`).toBeLessThanOrEqual(1e-3));
        }
        const byId = Object.fromEntries(comparison.map(entry => [entry.id, entry]));
        expect(byId['fields-shadowed'].visibility.sun).toBe(0);
        expect(byId['fields-lit'].visibility.sun).toBe(1);
        expect(byId['fields-shadowed'].rgb[1]).toBeLessThan(byId['fields-lit'].rgb[1] * .7);
        expect(byId['forward-low-sun'].rgb[1], 'the forward sheen of the D5b model is gone').toBeLessThan(byId['forward-low-sun'].d5b[1] * .6);
        expect(byId['tilted-bounce'].rgb[1], 'a tilted facet gains terrain-reflected light').toBeGreaterThan(byId['tilted-bounce'].d5b[1] * .5);
        expect(errors).toEqual([]);
        expect(warnings, 'no shader compiler warnings').toEqual([]);
    } finally { await context.close(); }
});
