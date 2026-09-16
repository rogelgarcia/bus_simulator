// Exact city shaders can compile while maps load without taking ownership of the displayed scene.
import { test, expect } from '@playwright/test';

for (const mode of ['ready', 'cancelled', 'cascaded']) test(`Baked shader stage preserves ${mode} ownership`, async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async mode => {
        const cancelled = mode === 'cancelled';
        const T = await import('three');
        const { prepareBakedShaderStage } = await import('/src/graphics/illumination/baked_lighting/BakedShaderStage.js');
        const { registerMaterialShaderHook, getMaterialShaderHookRegistrySnapshot } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const { registerEnhancedReceiverShader } = await import('/src/graphics/illumination/receiver_lightmaps/EnhancedReceiverShaderBinding.js');
        const { StaticSunDepthMaterialSet } = await import('/src/graphics/illumination/static_sun_depth/StaticSunDepthMaterialAdapter.js');
        const renderer = new T.WebGLRenderer(), scene = new T.Scene(), camera = new T.PerspectiveCamera();
        const city = new T.Group(), sun = new T.DirectionalLight(); sun.castShadow = true; scene.add(city, sun);
        const geometry = new T.PlaneGeometry(2, 2), material = new T.MeshPhysicalMaterial({ alphaTest: .1, clearcoat: .2, transmission: .1 });
        const liveUniforms = {};
        material.userData.authored = { shaderUniforms: liveUniforms };
        material.onBeforeCompile = shader => { shader.fragmentShader = '#define AUTHORED_PATCH\n' + shader.fragmentShader;
            material.userData.authored.shaderUniforms = shader.uniforms; };
        material.defines.AUTHORED_DEFINE = 1;
        const authored = material.onBeforeCompile;
        const custom = registerMaterialShaderHook(material, { id: 'test.authored', priority: 100, variantKey: 'original',
            apply(shader) { shader.fragmentShader = '#ifndef AUTHORED_DEFINE\n#error Lost authored define\n#endif\n#define INDEPENDENT_PATCH\n' + shader.fragmentShader; } });
        const a = new T.Mesh(geometry, material), b = new T.InstancedMesh(geometry, material, 1); city.add(a, b);
        let csm;
        if (mode === 'cascaded') {
            const { CityCascadedShadows } = await import('/src/graphics/visuals/city/CityCascadedShadows.js');
            csm = new CityCascadedShadows({ camera, parent: scene, sunRef: { direction: new T.Vector3(0, 1, 0), intensity: 1 },
                cascades: 4, mapSize: 256, angularDiameterDegrees: .53 });
            csm.registerMaterial(material); sun.visible = false;
        }
        const mapping = { profile: { irradianceRepresentation: 'surface-diffuse-v1', directRepresentation: 'hybrid-sun-visibility-v1' },
            objects: [{ id: 'a', base: 0, referenceCount: 6 }, { id: 'b', base: 6, referenceCount: 6, instances: [{}] }] };
        const coordinates = new Float32Array(48).fill(1), references = new Map([['a', a], ['b', b]]);
        const binding = { variantKey: 'verified-binding-1', uniforms: { staticSunDepthDebugMode: { value: 0 } }, setEnabled() {} };
        const target = new T.WebGLRenderTarget(8, 8); renderer.setRenderTarget(target); renderer.setClearColor(0x234567); renderer.clear();
        const beforePixels = new Uint8Array(256); renderer.readRenderTargetPixels(target, 0, 0, 8, 8, beforePixels);
        const engine = { renderer, scene, camera, context: { city: { group: city, getBakedShaderLighting: () => ({ sun, excluded: csm?.csm.lights ?? [] }) } },
            _post: { pipeline: { getSceneMaterialRenderTarget: () => target } } };
        const beforeKey = material.customProgramCacheKey(), beforeHooks = JSON.stringify(getMaterialShaderHookRegistrySnapshot(material));
        const controller = new AbortController(); let stage, error;
        const originalCompile = renderer.compile;
        renderer.compile = (...args) => {
            args[0].traverse(object => {
                if (a.isPrototypeOf(object) || b.isPrototypeOf(object)) throw new Error('Live mesh must not become a prototype');
            });
            return originalCompile.apply(renderer, args);
        };
        try { stage = await prepareBakedShaderStage({ engine, mapping, coordinates, references, uniforms: {}, binding, signal: controller.signal,
            progress(p) { if (cancelled && p.phase === 'waiting_for_programs') controller.abort(); } }); }
        catch (e) { error = e.name; }
        const afterPixels = new Uint8Array(256); renderer.readRenderTargetPixels(target, 0, 0, 8, 8, afterPixels);
        const untouched = a.material === material && b.material === material && a.geometry === geometry && b.geometry === geometry
            && material.customProgramCacheKey() === beforeKey && JSON.stringify(getMaterialShaderHookRegistrySnapshot(material)) === beforeHooks
            && material.userData.authored.shaderUniforms === liveUniforms
            && sun.castShadow && a.parent === city && renderer.getRenderTarget() === target && beforePixels.every((v, i) => v === afterPixels[i]);
        csm?.dispose(); sun.visible = true;
        let handoff;
        if (stage) {
            const receivers = registerEnhancedReceiverShader(material, mapping, {}, true), shadows = new StaticSunDepthMaterialSet();
            shadows.prepare(city, binding); shadows.activate(); sun.castShadow = false;
            await renderer.compileAsync(scene, camera);
            handoff = stage.dispose(); receivers.remove(); shadows.dispose();
        }
        const programs = renderer.info.programs.length;
        custom.remove(); const restored = material.onBeforeCompile === authored;
        material.dispose(); geometry.dispose(); b.dispose(); target.dispose(); renderer.dispose();
        return { untouched, handoff, error, programs, restored };
    }, mode);
    expect(result.untouched).toBe(true); expect(result.restored).toBe(true);
    if (mode === 'cancelled') expect(result).toMatchObject({ error: 'AbortError', programs: 0 });
    else { expect(result.handoff.programs).toBe(2); expect(result.handoff.reused).toBe(2); expect(result.programs).toBe(2); }
});
