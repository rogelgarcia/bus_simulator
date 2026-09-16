// Startup must prepare the eventual render recipes without speculative variants.
import { test, expect } from '@playwright/test';

test('Hidden AO receivers are prepared once and retain exclusions and source geometry', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const { DynamicAoRuntime } = await import('/src/graphics/visuals/postprocessing/DynamicAoRuntime.js');
        const { sanitizeAmbientOcclusionSettings } = await import('/src/graphics/visuals/postprocessing/AmbientOcclusionSettings.js');
        const { prepareLightingView } = await import('/src/graphics/illumination/baked_lighting/LightingViewPreparation.js');
        const renderer = new T.WebGLRenderer(), scene = new T.Scene(), camera = new T.PerspectiveCamera(55, 1, .1, 100);
        renderer.setSize(32, 32); camera.position.set(0, 3, 8); camera.lookAt(0, 0, 0);
        scene.add(new T.HemisphereLight(0xffffff, 0xffffff, 1));
        const bus = new T.Mesh(new T.BoxGeometry(2, 2, 4), new T.MeshStandardMaterial());
        bus.position.y = 1.2; scene.add(bus);
        const hidden = new T.Group(); hidden.visible = false; scene.add(hidden);
        const material = new T.MeshStandardMaterial({ roughness: .73 });
        const floor = new T.Mesh(new T.BoxGeometry(12, .1, 12), material); hidden.add(floor);
        const excluded = new T.Mesh(floor.geometry, material.clone()); excluded.userData.excludeFromAmbientOcclusion = true;
        const glass = new T.Mesh(floor.geometry, new T.MeshStandardMaterial({ transparent: true, opacity: .5 }));
        const alphaMap = new T.DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1); alphaMap.needsUpdate = true;
        const alpha = new T.Mesh(floor.geometry, new T.MeshStandardMaterial({ alphaTest: .5, map: alphaMap }));
        hidden.add(excluded, glass, alpha);
        const original = floor.geometry, runtime = new DynamicAoRuntime();
        const settings = sanitizeAmbientOcclusionSettings({ scope: 'dynamic', alpha: { handling: 'exclude' } });
        const participants = [{ root: bus, cast: true, receive: true, aoUnderbody: { min: [-1, -1, -2], max: [1, -1, 2] } }];
        const update = (enabled, prepareAllMaterials = false) => runtime.update({ renderer, scene, camera, participants, settings, enabled, prepareAllMaterials });
        update(false, true); const disabledUntouched = runtime.materials.size === 0;
        update(true); const normalHiddenUntouched = !runtime.materials.has(material); runtime.restoreBindings();
        update(true, true);
        const prepared = runtime.materials.has(material), key = material.customProgramCacheKey();
        const exclusions = [excluded, glass, alpha].every(mesh => !runtime.materials.has(mesh.material));
        const noHiddenResources = !runtime.geometries.has(floor) && !runtime.depthMaterials.has(material) && floor.geometry === original;
        const target = new T.WebGLRenderTarget(32, 32);
        await prepareLightingView(renderer, scene, camera, target, new AbortController().signal);
        runtime.restoreBindings(); const programs = new Set(renderer.info.programs);
        hidden.visible = true;
        update(true); renderer.setRenderTarget(target); renderer.render(scene, camera); runtime.restoreBindings();
        const reused = programs.has(renderer.properties.get(material).currentProgram) && material.customProgramCacheKey() === key;
        const error = renderer.getContext().getError(), restored = floor.geometry === original;
        runtime.dispose(); target.dispose(); alphaMap.dispose(); original.dispose(); bus.geometry.dispose();
        for (const m of [material, bus.material, excluded.material, glass.material, alpha.material]) m.dispose();
        renderer.dispose();
        return { disabledUntouched, normalHiddenUntouched, prepared, exclusions, noHiddenResources, reused, error, restored };
    });
    expect(result).toEqual({ disabledUntouched: true, normalHiddenUntouched: true, prepared: true, exclusions: true,
        noHiddenResources: true, reused: true, error: 0, restored: true });
});

test('Cascade activation defers compilation to the real target and downshifts render safely', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const T = await import('three');
        const { City } = await import('/src/graphics/visuals/city/City.js');
        const { prepareLightingView } = await import('/src/graphics/illumination/baked_lighting/LightingViewPreparation.js');
        const renderer = new T.WebGLRenderer(), scene = new T.Scene(), camera = new T.PerspectiveCamera(55, 1, .1, 500);
        renderer.setSize(32, 32); renderer.shadowMap.enabled = true; renderer.toneMapping = T.ACESFilmicToneMapping;
        camera.position.set(0, 3, 8); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
        const target = new T.WebGLRenderTarget(32, 32), group = new T.Group(); scene.add(group);
        const mesh = new T.Mesh(new T.BoxGeometry(2, 2, 2), new T.MeshStandardMaterial());
        mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
        const city = Object.create(City.prototype);
        Object.assign(city, { group, _csm: null, _extraShadowRoots: new Set(),
            sunRef: { direction: new T.Vector3(1, 2, 1).normalize(), intensity: 2 } });
        const requests = [], targets = [], compile = renderer.compile;
        renderer.compile = function(...args) { targets.push(this.getRenderTarget() === target); return compile.apply(this, args); };
        const engine = { renderer, scene, camera, _bakedLighting: { requestViewPreparation: cause => requests.push(cause) } };
        let deferred = true; const counts = [];
        for (const cascades of [4, 2, 3, 2]) {
            const before = targets.length;
            city._activateCascadedShadows(engine, { cascades, mapSize: 256 }, { cascades });
            deferred &&= targets.length === before;
            await prepareLightingView(renderer, scene, camera, target, new AbortController().signal);
            // Include a draw before the next city update and another after CSM
            // truncates its live break list, as in the original downshift crash.
            renderer.setRenderTarget(target); renderer.render(scene, camera);
            city._csm.csm.update(); city._csm.padCascadeUniforms(); renderer.render(scene, camera);
            counts.push(city._csm.cascades);
            renderer.setRenderTarget(null);
        }
        const error = renderer.getContext().getError();
        city._deactivateCascadedShadows(); mesh.geometry.dispose(); mesh.material.dispose(); target.dispose(); renderer.dispose();
        return { deferred, counts, requests, correctTarget: targets.length > 0 && targets.every(Boolean), error };
    });
    expect(errors).toEqual([]);
    expect(result).toEqual({ deferred: true, counts: [4, 2, 3, 2], requests: Array(4).fill('cascade_activation'), correctTarget: true, error: 0 });
});
