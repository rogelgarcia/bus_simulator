// Verifies the actual city-builder apply/settings/JS-export/reload path with terrain caches refused.
import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const artifacts = path.resolve('tests/artifacts/screens/landscape/ai576/d6/city-binding');

test('Landscape D6: city builder keeps binding, parcel ownership and explicit reference-only rendering', async ({ page }) => {
    await mkdir(artifacts, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1920, height: 1080 });
    const harness = await readFile(path.resolve('tests/headless/harness/index.html'), 'utf8');
    const importMap = harness.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
    await page.route('**/__landscape_city_gate.html', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head>${importMap}</head><body><canvas id="harness-canvas"></canvas></body></html>` }));
    await page.goto('/__landscape_city_gate.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { MapDebuggerState } = await import('/src/states/MapDebuggerState.js');
        const { MapDebuggerEditorPanel } = await import('/src/graphics/gui/map_debugger/MapDebuggerEditorPanel.js');
        const { CITY_SPEC_REGISTRY } = await import('/src/app/city/specs/CitySpecRegistry.js');
        const { importCitySpecModule, serializeCitySpecToModule } = await import('/src/app/city/specs/CitySpecAuthoring.js');
        const { City } = await import('/src/graphics/visuals/city/City.js');
        const { CityStaticVisibility } = await import('/src/graphics/visuals/city/CityStaticVisibility.js');
        const { exportResolvedCityBakeSource } = await import('/src/graphics/illumination/bake_source/ResolvedCityBakeExporter.js');
        const { createStaticVisibilityCityHash } = await import('/src/app/city/visibility/index.js');
        for (const href of ['/src/graphics/gui/map_debugger/styles.css']) {
            const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.append(link);
        }
        const canvas = document.querySelector('#harness-canvas');
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(1920, 1080);
        const engine = {
            canvas, renderer, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(50, 1920 / 1080, .1, 3000),
            context: { cityInputs: new Proxy({}, { get() { throw new Error('Flat city input cache accessed'); } }) },
            clearScene() { this.scene.clear(); }
        };
        const state = new MapDebuggerState(engine, {});
        state.editorPanel = new MapDebuggerEditorPanel({ citySpecs: CITY_SPEC_REGISTRY, onApplyCity: settings => state._applyCitySettings(settings) });
        state.editorPanel.attach(document.body);
        state.editorPanel.root.classList.remove('hidden');
        state._loadCitySpec('coastal-landscape');
        state._ensureToolCameraControls({ resetHome: true });
        state._recomputeCameraLimits({ resetPosition: true });
        const before = structuredClone(state._spec);
        const originalFootprint = structuredClone(state.city.map.buildings[0].footprintLoops);
        const originalReservation = structuredClone(state.city.map.reservations[0]);
        state._setBuildingRendered('coastal-planning-parcel', false);
        const hidden = state._spec.buildings[0].rendered;
        state._applyCitySettings({ width: 25, height: 20, seed: 'edited-seed' });
        const afterSettings = structuredClone(state._spec);
        state._applyCitySettings({ width: 5, height: 5 });
        const refusedShrink = { width: state._spec.width, message: state.editorPanel.status.textContent };
        const moduleSource = serializeCitySpecToModule(state._spec);
        const moduleUrl = URL.createObjectURL(new Blob([moduleSource], { type: 'text/javascript' }));
        let reloaded;
        try { reloaded = importCitySpecModule(await import(moduleUrl)); } finally { URL.revokeObjectURL(moduleUrl); }
        state._applySpec(reloaded, { resetCamera: true });
        state._setBuildingRendered('coastal-planning-parcel', true);
        state._setTreesEnabled(true);
        const restoredFootprint = structuredClone(state.city.map.buildings[0].footprintLoops);
        const restoredReservation = structuredClone(state.city.map.reservations[0]);
        const notices = state.editorPanel.status.textContent;
        const guards = [];
        try { new City({ mapSpec: reloaded }); } catch (error) { guards.push(error.message); }
        try { await exportResolvedCityBakeSource({ city: { map: state.city.map, cityId: 'bigcity2' }, profile: { id: 'test' } }); } catch (error) { guards.push(error.message); }
        let visibilityFetches = 0;
        const visibility = new CityStaticVisibility({ city: { cityId: 'bigcity2', map: state.city.map }, engine, settings: { enabled: true }, fetchImpl: async () => { visibilityFetches++; throw new Error('Bound-city visibility fetched'); } });
        const visibilityStatus = visibility.getStatus?.() ?? visibility._status;
        visibility.dispose();
        const hashInput = { cityId: 'custom', map: state.city.map, genConfig: state.city.genConfig, visibilitySourceSpec: state._spec };
        const hashBefore = createStaticVisibilityCityHash(hashInput);
        const altered = structuredClone(state._spec); altered.landscape.revision = 'different-landscape-revision';
        const hashAfter = createStaticVisibilityCityHash({ ...hashInput, visibilitySourceSpec: altered });
        renderer.render(engine.scene, engine.camera);
        window.__landscapeCityGate = { state, renderer, moduleSource, cleanup() { state.exit(); renderer.dispose(); } };
        return {
            before, afterSettings, afterReload: structuredClone(state._spec), hidden, refusedShrink,
            originalFootprint, restoredFootprint, originalReservation, restoredReservation, notices,
            referencePlan: state.city.isLandscapeReferencePlan, cachedCity: engine.context.city,
            guards, visibilityFetches, visibilityStatus, hashBefore, hashAfter,
            exportHasBinding: JSON.parse(state.editorPanel._buildExportText()).landscape
        };
    });
    expect(result.referencePlan).toBe(true);
    expect(result.cachedCity).toBeNull();
    expect(result.hidden).toBe(false);
    expect(result.afterSettings.landscape).toEqual(result.before.landscape);
    expect(result.afterReload.landscape).toEqual(result.before.landscape);
    expect(result.afterSettings.origin).toEqual(result.before.origin);
    expect(result.afterReload.origin).toEqual(result.before.origin);
    expect(result.afterReload.reservations).toEqual(result.before.reservations);
    expect(result.afterReload.buildings[0].id).toBe('coastal-planning-parcel');
    expect(result.afterReload.buildings[0].configId).toBe('burban');
    expect(result.afterReload.buildings[0].placement).toEqual(result.before.buildings[0].placement);
    expect(result.restoredFootprint).toEqual(result.originalFootprint);
    expect(result.restoredReservation).toEqual(result.originalReservation);
    expect(result.refusedShrink.width).toBe(25);
    expect(result.refusedShrink.message).toContain('excludes authored square');
    expect(result.exportHasBinding).toEqual(result.before.landscape);
    expect(result.notices).toContain('Landscape reference plan');
    expect(result.guards).toHaveLength(2);
    for (const diagnostic of result.guards) expect(diagnostic).toContain('does not support landscape-bound cities');
    expect(result.visibilityFetches).toBe(0);
    expect(result.visibilityStatus.reason).toBe('landscape_binding_unsupported');
    expect(result.hashAfter).not.toBe(result.hashBefore);
    await page.getByRole('button', { name: 'Download JS', exact: true }).scrollIntoViewIfNeeded();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JS', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('CitySpec.js');
    await download.saveAs(path.join(artifacts, 'CitySpec.js'));
    await page.screenshot({ path: path.join(artifacts, '01-city-reference-plan.png') });
    await writeFile(path.join(artifacts, 'roundtrip.json'), `${JSON.stringify(result, null, 2)}\n`);
    await page.evaluate(() => window.__landscapeCityGate.cleanup());
    expect(errors).toEqual([]);
});
