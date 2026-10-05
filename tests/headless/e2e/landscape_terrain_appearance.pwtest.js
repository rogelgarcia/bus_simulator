// Verifies AI577 D5 terrain-driven natural appearance (landscape-terrain-appearance-v1): the worker-derived landscape-scale layer in the viewer, the
// inspection hooks and viewer options (A/B switch, explicit errors), and the production terrain shader against the JavaScript mirrors: the catena
// per soil share, coastal wetting, rock weathering, the switch, and the natural dressing diagnostics (landscape-dressing-inputs v1).
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CALIBRATED_DAYLIGHT } from '../../../src/graphics/lighting/CalibratedDaylight.js';
import { LANDSCAPE_REFERENCE_PROBE_LIGHTING, LANDSCAPE_WATER_LEVEL_DISABLED, landscapeLightingUniformValues, landscapeSunDirection, landscapeTerrainRadiance,
    landscapeTerrainVisibility } from '../../../src/graphics/engine3d/landscape/LandscapeLightingModel.js';
import { landscapeMacroAlbedo, landscapeMacroRoughness, landscapeMacroVariationUniforms } from '../../../src/graphics/engine3d/landscape/LandscapeMacroVariation.js';
import { LANDSCAPE_TERRAIN_APPEARANCE, decodeLandscapeAppearanceLayer, landscapeCoastalWetSurface, landscapeRockFactor, landscapeTerrainAppearanceInputs } from '../../../src/graphics/engine3d/landscape/LandscapeTerrainAppearance.js';
import { decodeLandscapeTerrainFields } from '../../../src/app/landscape/index.js';
import { sampleLandscapeDressingInputs } from '../../../src/app/landscape/LandscapeDressingInputs.js';

const artifacts = path.resolve('tests/artifacts/screens/landscape/ai577/d5/appearance/e2e');
const snapshot = page => page.evaluate(() => window.__landscapeTestHooks.snapshot());

function observeErrors(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|shader error|GL_INVALID|\[Landscape\]/i.test(message.text())) errors.push(message.text()); });
    return errors;
}

async function ready(page) {
    await page.waitForFunction(() => {
        const state = window.__landscapeTestHooks?.snapshot();
        if (state?.lastError) throw new Error(state.lastError);
        const fields = state?.appearance?.terrainFields;
        return state?.ready && state.streaming?.settled && state.appearance?.settled && (fields?.status !== 'active' || fields.appearanceLayerState?.status === 'resident');
    }, null, { timeout: 120000 });
    return snapshot(page);
}

const openViewer = (page, query = '') => page.goto(`/screens/landscape_fabrication.html?landscapeCpuMiB=512&landscapeGpuMiB=256${query}`);

test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

test('Landscape D5 terrain appearance: the worker derives the layer with the root page; hooks mirror it and the A/B switch applies without reloading', async ({ page }, testInfo) => {
    test.setTimeout(240000);
    expect(new URL(String(testInfo.project.use.baseURL)).port).not.toBe('8001');
    const errors = observeErrors(page);
    await openViewer(page);
    const state = await ready(page), fields = state.appearance.terrainFields, model = LANDSCAPE_TERRAIN_APPEARANCE;
    expect([state.terrainAppearance, state.terrainFields, state.naturalInference]).toEqual(['on', 'auto', 'terrain']);
    expect(state.lighting.response.switches.terrainAppearance).toBe(true);
    expect(fields.appearanceLayerState.status).toBe('resident');
    expect(fields.appearanceLayer).toMatchObject({ id: model.layer.id, rootId: 'l0/c0/r0', derivedIn: 'appearance worker' });
    expect(fields.appearanceLayer.layer).toBe(fields.capacity * fields.layersPerPage);
    expect(fields.bytes.arrayGpu).toBe(fields.capacity * fields.bytes.pageBytes + fields.appearanceLayer.bytes);
    expect(fields.appearanceLayer.statistics.natural + fields.appearanceLayer.statistics.excluded + fields.appearanceLayer.statistics.sea).toBe(fields.appearanceLayer.statistics.samples);
    expect(fields.timing.peakUploadMs, 'the layer upload is a single array-layer copy on the render thread').toBeLessThan(25);
    expect(state.appearance.terrainAppearance.planningCover).toEqual([224, 0, 0, 0]);
    // the inspection hook mirrors the shader inputs: inland catena terms, the coastal reach near the beach, per-soil shares
    const inland = await page.evaluate(() => window.__landscapeTestHooks.terrainAppearanceSample(2633, 711));
    expect(inland.availability).toBe(1);
    expect(Math.abs(inland.moisture)).toBeLessThanOrEqual(1);
    expect(inland.soils.sand.share).toBe(.5); expect(inland.soils.rock.share).toBe(0); expect(inland.soils.forest.tone).toBeCloseTo(inland.tone, 12);
    expect(inland.reach).toBe(0);
    const beach = await page.evaluate(() => window.__landscapeTestHooks.terrainAppearanceSample(1062, 1372));
    expect(beach.reach).toBeGreaterThan(model.coastal.tidalMeters);
    expect(beach.reach).toBeLessThanOrEqual(model.coastal.maximumReachMeters);
    // the A/B switch: neutral inputs at once, restored on demand; since AI577 D6 it selects a compiled program variant, linked in parallel
    expect(state.terrainProgramVariant).toMatchObject({ diagnostics: false, terrainAppearance: true, pending: false });
    await page.evaluate(() => window.__landscapeTestHooks.setTerrainAppearance(false));
    const off = await page.evaluate(() => window.__landscapeTestHooks.terrainAppearanceSample(2633, 711));
    expect([off.enabled, off.tone, off.chroma, off.exposure, off.reach]).toEqual([false, 0, 0, 0, 0]);
    expect((await snapshot(page)).terrainAppearance).toBe('off');
    await expect.poll(async () => (await snapshot(page)).terrainProgramVariant, { timeout: 60000 }).toMatchObject({ terrainAppearance: false, pending: false });
    await page.evaluate(() => window.__landscapeTestHooks.setTerrainAppearance(true));
    expect((await snapshot(page)).terrainAppearance).toBe('on');
    await expect.poll(async () => (await snapshot(page)).terrainProgramVariant, { timeout: 60000 }).toMatchObject({ terrainAppearance: true, pending: false });
    // natural dressing inputs: planning-only cover keeps the v1 suppression and reports its inferred natural ground; natural ground has none
    const planned = await page.evaluate(() => window.__landscapeTestHooks.dressingSample(2050, 2150)), natural = await page.evaluate(() => window.__landscapeTestHooks.dressingSample(2633, 711));
    expect(planned.planningShare).toBe(1);
    expect([planned.grassDensity, planned.shrubSuitability, planned.treeSuitability, planned.rockScatter, planned.beachDebris]).toEqual([0, 0, 0, 0, 0]);
    expect(planned.inferredGround).not.toBeNull();
    expect(planned.displaySoilId, 'D5d displays inferred natural soil on planning cover').not.toBe('unknown');
    expect(Object.values(planned.inferredGround).some(value => value > 0)).toBe(true);
    expect(natural.planningShare).toBe(0);
    expect(natural.inferredGround).toBeNull();
    expect(natural.treeSuitability + natural.grassDensity).toBeGreaterThan(0);
    await writeFile(path.join(artifacts, 'viewer-hooks.json'), JSON.stringify({ layer: fields.appearanceLayer, layerState: fields.appearanceLayerState, inland, beach, planned, natural }, null, 2));
    expect(errors).toEqual([]);
});

test('Landscape D5 terrain appearance: viewer options select the switch, terrain fields and natural inference, and invalid values fail explicitly', async ({ browser }, testInfo) => {
    test.setTimeout(300000);
    const baseURL = String(testInfo.project.use.baseURL);
    const context = await browser.newContext({ baseURL, viewport: { width: 960, height: 540 } });
    try {
        const page = await context.newPage(), errors = observeErrors(page);
        await openViewer(page, '&landscapeTerrainAppearance=off&landscapeTerrainFields=off&landscapeNaturalInference=overview');
        const state = await ready(page);
        expect([state.terrainAppearance, state.terrainFields, state.naturalInference]).toEqual(['off', 'off', 'overview']);
        expect(state.lighting.response.switches.terrainAppearance).toBe(false);
        expect(state.terrainProgramVariant, 'AI577 D6: the off switch loads the program variant without the terrain-driven appearance').toMatchObject({ terrainAppearance: false, pending: false });
        expect(state.appearance.terrainFields.status).toBe('disabled');
        expect(await page.evaluate(() => window.__landscapeTestHooks.terrainAppearanceSample(2633, 711))).toMatchObject({ enabled: false, layer: null, availability: 0, tone: 0 });
        expect(errors).toEqual([]);
        await page.close();
        for (const [query, message] of [['&landscapeTerrainAppearance=maybe', /landscapeTerrainAppearance must be one of on, off; received maybe/],
            ['&landscapeTerrainFields=sometimes', /landscapeTerrainFields must be one of auto, off; received sometimes/],
            ['&landscapeNaturalInference=guess', /landscapeNaturalInference must be one of .*; received guess/]]) {
            const invalid = await context.newPage(), failures = [];
            invalid.on('pageerror', error => failures.push(error.message));
            await openViewer(invalid, query);
            await expect.poll(() => failures.join('\n'), { timeout: 20000 }).toMatch(message);
            expect(await invalid.evaluate(() => typeof window.__landscapeTestHooks)).toBe('undefined');
            await invalid.close();
        }
    } finally { await context.close(); }
});

// one uniform material in every soil slot on a synthetic hierarchy (the D5c parity probe), rendered by the production terrain program at tier standard
async function renderProbes(page, cases, shared) {
    await page.route('**/tests/headless/e2e/fixtures/landscape_surface_probe.html', async route => route.fulfill({ contentType: 'text/html', body: await readFile('tests/headless/e2e/fixtures/landscape_surface_probe.html', 'utf8') }));
    await page.goto('/tests/headless/e2e/fixtures/landscape_surface_probe.html');
    return page.evaluate(async ({ cases, shared }) => {
        const T = await import('three');
        const { createLandscapeShaderPayload } = await import('/src/graphics/shaders/materials/landscape/LandscapeShaderLoader.js');
        const { createLandscapeAppearanceUniforms, chooseLandscapeCoverageSlots } = await import('/src/graphics/engine3d/landscape/LandscapeAppearanceUniforms.js');
        const { LandscapeMaskPages } = await import('/src/graphics/engine3d/landscape/LandscapeMaskPages.js');
        const { createLandscapeTerrainFieldTexture } = await import('/src/graphics/engine3d/landscape/LandscapeTerrainFieldTexture.js');
        const renderer = new T.WebGLRenderer({ canvas: document.getElementById('surface-probe'), antialias: false });
        renderer.setPixelRatio(1); renderer.setSize(63, 63, false);
        const target = new T.WebGLRenderTarget(63, 63, { type: T.FloatType }), coverageSlots = chooseLandscapeCoverageSlots(renderer).total;
        const appearance = createLandscapeAppearanceUniforms(coverageSlots), columns = 17, width = 21, capacity = 17, resources = [target];
        const base = new T.DataTexture(new Uint8Array([...shared.baseBytes, 255]), 1, 1, T.RGBAFormat), surface = new T.DataArrayTexture(new Uint8Array([128, 128, 255, 255, 255, 255, 0, 128]), 1, 1, 2);
        for (const texture of [base, surface]) { texture.colorSpace = T.NoColorSpace; texture.needsUpdate = true; resources.push(texture); }
        appearance.uSoilMacro.value.set(shared.soilMacro); appearance.uMacroSettings.value.set(shared.macroSettings);
        appearance.uBlendBase.value = base; appearance.uBlendSurface.value = surface; appearance.uAppearanceReady.value = 1; appearance.uMaskDimensions.value.set(columns, columns);
        const descriptor = { id: 'l0/c0/r0', level: 0, column: 0, row: 0, parentId: null, bounds: { minX: -20000, maxX: 20000, minZ: -20000, maxZ: 20000 } };
        const results = [];
        try {
            for (const probe of cases) {
                for (let soil = 0; soil < 6; soil++) {
                    appearance[`uSoilBase${soil}`].value = base; appearance[`uSoilSurface${soil}`].value = surface; appearance.uSoilScale.value[soil].set(probe.roles[soil], 0, 1, 0);
                    appearance.uSoilResponse.value[soil].set(shared.response[0], shared.response[1], 0, 0); appearance.uSoilState.value[soil].w = shared.response[2];
                }
                const pixels = new Uint8Array(width * width * 4 * capacity);
                for (let index = 0; index < width * width * capacity; index++) pixels.set([probe.soil * 17, probe.cover, 1, 240], index * 4);
                const masks = new T.DataArrayTexture(pixels, width, width, capacity);
                masks.format = T.RGBAFormat; masks.magFilter = masks.minFilter = T.NearestFilter; masks.generateMipmaps = false; masks.flipY = false; masks.needsUpdate = true;
                appearance.uMaskPages.value = masks;
                LandscapeMaskPages.prototype.updateUniforms.call({ records: new Map([[descriptor.id, { id: descriptor.id, descriptor, slot: 0, progress: 1, status: 'resident' }]]), capacity, uniforms: appearance });
                const layer = width * width * 4, bytes = new Uint8Array(layer * 5);
                for (let texel = 0; texel < width * width; texel++) {
                    bytes.set(probe.fields[0], texel * 4); bytes.set(probe.fields[1], layer + texel * 4);
                    bytes.set(probe.fields[2], 2 * layer + texel * 4); bytes.set(probe.fields[3], 3 * layer + texel * 4);
                    if (probe.layer) bytes.set(probe.layer, 4 * layer + texel * 4);
                }
                const fieldTexture = createLandscapeTerrainFieldTexture({ pixels: bytes, width, height: width, depth: 5 }); fieldTexture.needsUpdate = true;
                appearance.uTerrainFields.value = fieldTexture; appearance.uTerrainFieldsState.value.set([0, 0, probe.layer ? 3 : 1, 4]); appearance.uMaskMeta.value[0].w = 1.25;
                appearance.uPlanningCover.value.set(shared.planningCover);
                const lighting = Object.fromEntries(Object.entries(probe.lighting).map(([name, value]) => [name, { value: Float32Array.from(value) }]));
                // AI577 D6: inspection views and the terrain-appearance switch are compiled program variants
                const payload = createLandscapeShaderPayload('terrain', { coverageSlots, lightingTier: 'standard', diagnostics: probe.diagnostic > 0, terrainAppearance: probe.enabled !== false });
                const geometry = new T.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2).translate(0, probe.height, 0);
                geometry.setAttribute('parentHeight', new T.BufferAttribute(new Float32Array(4).fill(probe.height), 1));
                geometry.setAttribute('parentNormal', geometry.attributes.normal.clone());
                geometry.setAttribute('color', new T.BufferAttribute(new Float32Array(12).fill(1), 3));
                const shader = new T.ShaderMaterial({ vertexShader: payload.vertexSource, fragmentShader: payload.fragmentSource, vertexColors: true,
                    uniforms: { ...appearance, ...lighting, uMorph: { value: 1 }, uEdges: { value: new T.Vector4() }, uEdgeMorph: { value: new T.Vector4(1, 1, 1, 1) },
                        uBounds: { value: new T.Vector4(-20000, 20000, -20000, 20000) }, uTint: { value: new T.Color(1, 1, 1) }, uLodColor: { value: 0 },
                        uDiagnostic: { value: probe.diagnostic }, uDiagnosticRange: { value: new T.Vector3(0, 1, 0) }, uSurfaceSoilColors: { value: Float32Array.from(shared.soilClasses) } } });
                const scene = new T.Scene(), mesh = new T.Mesh(geometry, shader);
                mesh.frustumCulled = false; scene.add(mesh);
                const camera = new T.PerspectiveCamera(20, 1, .1, 25000);
                camera.position.set(40, probe.height + 170, 320); camera.lookAt(0, probe.height, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
                renderer.setRenderTarget(target); renderer.render(scene, camera);
                const pixel = new Float32Array(4); renderer.readRenderTargetPixels(target, 31, 31, 1, 1, pixel);
                results.push({ id: probe.id, rgb: Array.from(pixel.slice(0, 3)), error: renderer.getContext().getError() });
                geometry.dispose(); shader.dispose(); fieldTexture.dispose(); masks.dispose();
            }
        } finally {
            renderer.setRenderTarget(null);
            for (const resource of resources) resource.dispose();
            renderer.dispose(); renderer.forceContextLoss();
        }
        return results;
    }, { cases, shared });
}

test('Landscape D5 terrain appearance: the production terrain shader reproduces the catena, wetting, weathering and switch mirrors', async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const baseURL = String(testInfo.project.use.baseURL);
    expect(new URL(baseURL).port).not.toBe('8001');
    const skyCoefficients = LANDSCAPE_REFERENCE_PROBE_LIGHTING.skyCoefficients.map(value => value * 4), response = [.3, 1, .5];
    const state = enabled => ({ seaLevel: 0, waterLevel: LANDSCAPE_WATER_LEVEL_DISABLED, sunDirection: landscapeSunDirection(45, 55), sunIrradiance: [...CALIBRATED_DAYLIGHT.sunNormalRgb], skyCoefficients,
        response: { model: true, bounce: true, terrainVisibility: true, terrainAppearance: enabled } });
    const uniforms = enabled => Object.fromEntries(Object.entries(landscapeLightingUniformValues(state(enabled))).map(([name, value]) => [name, Array.from(value)]));
    const baseBytes = [150, 110, 70], albedo = baseBytes.map(value => value / 255), macro = landscapeMacroVariationUniforms({ seed: 1, soils: Array.from({ length: 6 }, () => ({ soilId: 'loam' })), enabled: false });
    const litFields = [[0, 0, 0, 0], [204, 128, 128, 0], [60, 60, 90, 60], [30, 60, 90, 60]], developed = [1, 1, 1, 1, 1, 1];
    const cases = [
        { id: 'catena-moist', height: 20, soil: 2, roles: developed, layer: [204, 51, 0, 0], enabled: true },
        { id: 'catena-dry', height: 20, soil: 2, roles: developed, layer: [51, 0, 0, 0], enabled: true },
        { id: 'catena-sand-share', height: 20, soil: 2, roles: [.5, .5, .5, .5, .5, .5], layer: [204, 51, 0, 0], enabled: true },
        { id: 'wet-swash', height: .2, soil: 2, roles: developed, layer: [128, 0, 120, 0], enabled: true },
        { id: 'damp-upper-beach', height: .9, soil: 2, roles: developed, layer: [128, 0, 120, 0], enabled: true },
        { id: 'rock-weathered-moist', height: 20, soil: 5, roles: [1, 1, 1, 1, 1, -1], layer: [191, 0, 0, 0], enabled: true },
        { id: 'switch-off', height: 20, soil: 2, roles: developed, layer: [204, 51, 0, 0], enabled: false }
    ].map(probe => ({ ...probe, cover: 2, fields: litFields, diagnostic: 0, lighting: uniforms(probe.enabled) }));
    const context = await browser.newContext({ baseURL, viewport: { width: 512, height: 512 } }), page = await context.newPage(), errors = observeErrors(page);
    try {
        const rendered = await renderProbes(page, cases, { baseBytes, soilMacro: Array.from(macro.uSoilMacro), macroSettings: Array.from(macro.uMacroSettings), response, planningCover: [0, 0, 0, 0],
            soilClasses: new Array(18).fill(0) });
        const visibilitySample = { availability: 1, fields: { skyView: 204 / 255, slopeDegrees: 0, horizonSine: [60, 60, 90, 60, 30, 60, 90, 60].map(byte => (byte / 255) ** 2) } };
        const comparison = rendered.map((result, index) => {
            const probe = cases[index], world = [0, probe.height, 0], origin = [40, probe.height + 170, 320], normal = [0, 1, 0];
            const layer = decodeLandscapeAppearanceLayer(probe.layer.map(byte => byte / 255));
            const inputs = landscapeTerrainAppearanceInputs({ layer, availability: 1, height: probe.height, geometricSlopeDegrees: 0, footprintSpacings: 0, enabled: probe.enabled });
            const rock = probe.roles[probe.soil] < 0, share = Math.max(0, probe.roles[probe.soil]), field = { tone: share * inputs.tone, chroma: share * inputs.chroma };
            const factor = rock ? landscapeRockFactor({ slopeDegrees: 0, height: probe.height, reach: inputs.reach, moisture: inputs.moisture * inputs.weight }) : [1, 1, 1];
            const surfaceAlbedo = (field.tone || field.chroma ? landscapeMacroAlbedo('loam', field, albedo) : albedo).map((value, channel) => value * factor[channel]);
            const roughness = field.tone ? landscapeMacroRoughness('loam', field, 1) : 1, groundAlbedo = surfaceAlbedo;
            const wet = landscapeCoastalWetSurface({ albedo: surfaceAlbedo, normal, geometricNormal: normal, roughness, response, height: probe.height, reach: probe.enabled ? inputs.reach : 0 });
            const visibility = landscapeTerrainVisibility(visibilitySample, state(probe.enabled).sunDirection);
            const expected = landscapeTerrainRadiance(state(probe.enabled), { albedo: wet.albedo, normal: wet.normal, roughness: wet.roughness, metalness: 0, ao: 1, world, origin, response: wet.response,
                groundAlbedo, sunVisibility: visibility.sun, skyVisibility: visibility.sky, horizonSine: visibilitySample.fields.horizonSine, fieldWeight: visibility.weight }, 'standard');
            return { ...result, expected, inputs, wetting: { moisture: wet.moisture, film: wet.film }, factor, relative: result.rgb.map((value, channel) => Math.abs(value / expected[channel] - 1)) };
        });
        await writeFile(path.join(artifacts, 'appearance-parity.json'), JSON.stringify({ cases, comparison }, null, 2));
        for (const entry of comparison) {
            expect(entry.error, `${entry.id} WebGL error`).toBe(0);
            entry.relative.forEach((value, channel) => expect(value, `${entry.id} channel ${channel}: GPU ${entry.rgb[channel]} vs mirror ${entry.expected[channel]}`).toBeLessThanOrEqual(2e-3));
        }
        const byId = Object.fromEntries(comparison.map(entry => [entry.id, entry])), luminance = rgb => .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
        expect(luminance(byId['catena-moist'].rgb), 'moist hollows render darker than dry ridges').toBeLessThan(luminance(byId['catena-dry'].rgb) * .85);
        expect(luminance(byId['catena-sand-share'].rgb)).toBeGreaterThan(luminance(byId['catena-moist'].rgb));
        expect(byId['wet-swash'].wetting.film).toBeGreaterThan(.9);
        expect(byId['damp-upper-beach'].wetting.film).toBe(0);
        expect(byId['damp-upper-beach'].wetting.moisture).toBeGreaterThan(0);
        expect(luminance(byId['rock-weathered-moist'].rgb)).toBeLessThan(luminance(byId['switch-off'].rgb) * .75);
        expect(byId['switch-off'].inputs.tone).toBe(0);
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});

test('Landscape D5 terrain appearance: the dressing diagnostics reproduce landscape-dressing-inputs v1, planning suppression included', async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const baseURL = String(testInfo.project.use.baseURL);
    const skyCoefficients = LANDSCAPE_REFERENCE_PROBE_LIGHTING.skyCoefficients.map(value => value * 4);
    const lighting = Object.fromEntries(Object.entries(landscapeLightingUniformValues({ seaLevel: 0, waterLevel: LANDSCAPE_WATER_LEVEL_DISABLED, sunDirection: landscapeSunDirection(45, 55),
        sunIrradiance: [...CALIBRATED_DAYLIGHT.sunNormalRgb], skyCoefficients })).map(([name, value]) => [name, Array.from(value)]));
    // catalog order of the coastal landscape: unknown, seabed, sand, loam, forest, rock -> dressing host classes 0, 0, 1, 2, 3, 4
    const soils = ['unknown', 'seabed', 'sand', 'loam', 'forest', 'rock'], soilClasses = [0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0];
    const layer0 = [200, 40, 0, 51], layer1 = [230, 160, 128, 30], fieldBytes = [layer0, layer1, [60, 60, 90, 60], [30, 60, 90, 60]];
    const units = [...layer0, ...layer1, 60, 60, 90, 60, 30, 60, 90, 60].map(byte => byte / 255), fields = decodeLandscapeTerrainFields(units);
    const outputs = ['grassDensity', 'shrubSuitability', 'treeSuitability', 'rockScatter', 'beachDebris'];
    const cases = [];
    for (const [soil, cover] of [[3, 2], [4, 3], [5, 4], [2, 1], [4, 5]]) for (const [k, output] of outputs.entries()) {
        cases.push({ id: `${soils[soil]}-cover${cover}-${output}`, soil, cover, output, height: 20, roles: [1, 1, 1, 1, 1, 1], layer: null, fields: fieldBytes, diagnostic: 8 + k, lighting });
    }
    const context = await browser.newContext({ baseURL, viewport: { width: 512, height: 512 } }), page = await context.newPage(), errors = observeErrors(page);
    try {
        const rendered = await renderProbes(page, cases, { baseBytes: [128, 128, 128], soilMacro: new Array(24).fill(0), macroSettings: [0, 0, 0, 1], response: [.3, 1, .5],
            planningCover: [224, 0, 0, 0], soilClasses });
        const comparison = rendered.map((result, index) => {
            const probe = cases[index], planningShare = probe.cover >= 5 ? 1 : 0;
            const expected = sampleLandscapeDressingInputs({ soilWeights: { [soils[probe.soil]]: 1 }, planningShare, fields })[probe.output];
            return { ...result, expected, difference: Math.abs(result.rgb[0] - expected) };
        });
        await writeFile(path.join(artifacts, 'dressing-parity.json'), JSON.stringify({ fields, comparison }, null, 2));
        for (const entry of comparison) {
            expect(entry.error).toBe(0);
            expect(entry.difference, `${entry.id}: GPU ${entry.rgb[0]} vs mirror ${entry.expected}`).toBeLessThanOrEqual(2e-3);
        }
        expect(comparison.filter(entry => entry.id.includes('cover5')).every(entry => entry.rgb[0] === 0), 'planning-only cover is suppressed').toBe(true);
        expect(comparison.some(entry => entry.expected > .1), 'the probes exercise nonzero outputs').toBe(true);
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});
