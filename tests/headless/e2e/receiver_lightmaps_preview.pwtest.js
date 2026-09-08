import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (existsSync(chrome)) test.use({ launchOptions: { executablePath: chrome, args: ['--use-angle=d3d11'] } });

const artifactRoot = path.resolve('tests/artifacts/screens/illumination_533');

test('Receiver illumination: standard indirect control preserves Current when a package is absent', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/receivers/enhanced/package_index.json', (route) => route.fulfill({ status: 404, body: 'missing fixture' }));
    await page.goto('/?pose=civic_center_curve_front&coreTests=0&ibl=0&bloom=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 120_000 });
    const before = await page.evaluate(() => {
        const engine = window.__busSim.engine;
        engine.stop();
        return { settings: engine.bakedLightingSettings, sun: engine.lightingSettings.sunIntensity };
    });
    expect(before.settings.receivers).toEqual({ direct: false, indirect: false, linked: false, enhanced: true, debug: 'final' });
    await page.keyboard.press('0');
    await page.locator('.options-tab', { hasText: /^Baked lighting$/i }).click();
    await expect(page.locator('.options-row', { hasText: 'Enable baked indirect illumination' }).locator('input')).not.toBeChecked();
    await expect(page.locator('.options-row', { hasText: 'Enable baked direct illumination' }).locator('input')).toHaveCount(0);
    await page.evaluate(async () => {
        const engine = window.__busSim.engine;
        await engine.setBakedLightingSettings({ ...engine.bakedLightingSettings, receivers: { indirect: true } });
        engine.updateFrame(0);
    });
    const after = await page.evaluate(() => window.__busSim.engine.getBakedLightingDebugInfo());
    expect(after.status.state).toBe('fallback');
    expect(after.receiverLightmaps.effective.indirect).toBe(false);
    expect(after.settings.receivers.direct).toBe(false);
    await mkdir(artifactRoot, { recursive: true });
    await page.screenshot({ path: path.join(artifactRoot, 'options-preview.png') });
    expect(errors).toEqual([]);
});

test('Receiver illumination: material stage compiles with independent direct and indirect inputs', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text())) errors.push(message.text()); });
    await page.goto('/?pose=civic_center_curve_front&coreTests=0&ibl=0&bloom=0');
    await page.waitForFunction(() => window.__busSim?.sm?.currentName === 'game_mode', null, { timeout: 120_000 });
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { normalizeMaterialVariationConfig } = await import('/src/graphics/assets3d/materials/MaterialVariationSystem.js');
        const normalized = normalizeMaterialVariationConfig(null);
        const twice = normalizeMaterialVariationConfig(normalized);
        const { installReceiverLightmapBindings } = await import('/src/graphics/illumination/receiver_lightmaps/ReceiverLightmapMaterialAdapter.js');
        const { createReceiverAtlasTexture } = await import('/src/graphics/illumination/receiver_lightmaps/ReceiverLightmapResources.js');
        const { registerMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const engine = window.__busSim.engine; engine.stop();
        const scene = new THREE.Scene();
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const geometry = new THREE.PlaneGeometry(2, 2).toNonIndexed();
        const mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
        const camera = new THREE.PerspectiveCamera(50, 1, .1, 10); camera.position.z = 3;
        const map = new THREE.DataTexture(new Float32Array(7 * 4), 7, 1, THREE.RGBAFormat, THREE.FloatType);
        for (let i = 1; i < 7; i++) map.image.data.set([.5, .5, 0, 1], i * 4);
        map.needsUpdate = true;
        const texture = new THREE.DataArrayTexture(new Float32Array([Math.PI, 0, 0, 1]), 1, 1, 1);
        texture.type = THREE.FloatType; texture.needsUpdate = true;
        const uniforms = { receiverAtlasMapping: { value: map }, receiverDirectAtlas: { value: texture }, receiverIndirectAtlas: { value: texture },
            receiverDirectEnabled: { value: 0 }, receiverIndirectEnabled: { value: 1 }, receiverDebugMode: { value: 0 }, receiverMaxMip: { value: 0 }, receiverAtlasEnabled: { value: 1 } };
        const binding = installReceiverLightmapBindings({ objects: [{ id: 'plane', referenceCount: 6, base: 1 }] }, new Map([['plane', mesh]]), uniforms);
        const target = new THREE.WebGLRenderTarget(32, 32);
        engine.renderer.setRenderTarget(target); engine.renderer.render(scene, camera);
        const pixels = new Uint8Array(4); engine.renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixels);
        uniforms.receiverIndirectEnabled.value = 0; engine.renderer.render(scene, camera);
        const disabled = new Uint8Array(4); engine.renderer.readRenderTargetPixels(target, 16, 16, 1, 1, disabled);
        const mips = createReceiverAtlasTexture([
            { width: 2, height: 2, data: new Uint16Array([15360, 0, 0, 15360, 15360, 0, 0, 15360, 15360, 0, 0, 15360, 15360, 0, 0, 15360]) },
            { width: 1, height: 1, data: new Uint16Array([0, 15360, 0, 15360]) }
        ], 1);
        uniforms.receiverIndirectAtlas.value = mips; uniforms.receiverIndirectEnabled.value = 1;
        const forceMip = registerMaterialShaderHook(material, { id: 'test.force_mip', priority: 301, apply(shader) {
            shader.fragmentShader = shader.fragmentShader.replace('textureLod(atlas, vReceiverAtlas.xyz, lod)', 'textureLod(atlas, vReceiverAtlas.xyz, 1.0)');
        } });
        engine.renderer.render(scene, camera);
        const mipPixels = new Uint8Array(4); engine.renderer.readRenderTargetPixels(target, 16, 16, 1, 1, mipPixels);
        forceMip.remove();
        const visibility = { value: .25 };
        const hybrid = registerMaterialShaderHook(material, { id: 'test.hybrid_contract', priority: 200, apply(shader) {
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform int staticSunDepthEnabled; uniform vec3 staticSunDepthPointDirectionView; uniform float dynamicSunShadowVisibility; void staticSunDepthApplyDirectional() {}');
            shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin);
            Object.assign(shader.uniforms, { staticSunDepthEnabled: { value: 1 }, staticSunDepthPointDirectionView: { value: new THREE.Vector3(0, 0, 1) }, dynamicSunShadowVisibility: visibility });
        } });
        const sun = new THREE.DirectionalLight(0xffffff, 1); sun.position.set(0, 0, 3); scene.add(sun);
        uniforms.receiverIndirectEnabled.value = 0; uniforms.receiverDirectEnabled.value = 1;
        engine.renderer.render(scene, camera);
        const directPixels = new Uint8Array(4); engine.renderer.readRenderTargetPixels(target, 16, 16, 1, 1, directPixels);
        const program = engine.renderer.properties.get(material).currentProgram.program;
        const gl = engine.renderer.getContext();
        const shaderSource = gl.getAttachedShaders(program).map((shader) => gl.getShaderSource(shader)).join('\n');
        const uniformValues = Object.fromEntries(['receiverDirectEnabled', 'receiverAtlasEnabled', 'staticSunDepthEnabled', 'staticSunDepthPointDirectionView', 'dynamicSunShadowVisibility'].map((key) => {
            const location = gl.getUniformLocation(program, key);
            return [key, location ? gl.getUniform(program, location) : null];
        }));
        visibility.value = 0; engine.renderer.render(scene, camera);
        const specularPixels = new Uint8Array(4); engine.renderer.readRenderTargetPixels(target, 16, 16, 1, 1, specularPixels);
        engine.renderer.setRenderTarget(null); hybrid.remove(); binding.restore(); mips.dispose(); texture.dispose(); map.dispose(); material.dispose(); geometry.dispose(); target.dispose();
        return { pixels: Array.from(pixels), disabled: Array.from(disabled), mipPixels: Array.from(mipPixels), restored: mesh.geometry === geometry,
            shaderSource, uniformValues, directPixels: Array.from(directPixels), specularPixels: Array.from(specularPixels), stableDirections: JSON.stringify(normalized.exposure.direction) === JSON.stringify(twice.exposure.direction)
                && JSON.stringify(normalized.sunBleach.direction) === JSON.stringify(twice.sunBleach.direction) };
    });
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(path.join(artifactRoot, 'material-stage-shaders.glsl'), result.shaderSource);
    delete result.shaderSource;
    await writeFile(path.join(artifactRoot, 'material-stage-check.json'), JSON.stringify(result, null, 2));
    expect(result.pixels[0]).toBeGreaterThan(80);
    expect(result.pixels[1]).toBeLessThan(3);
    expect(result.disabled[0]).toBeLessThan(3);
    expect(result.restored).toBe(true);
    expect(result.stableDirections).toBe(true);
    expect(result.mipPixels[0]).toBeLessThan(3);
    expect(result.mipPixels[1]).toBeGreaterThan(60);
    expect(result.directPixels[0] - result.specularPixels[0]).toBeGreaterThanOrEqual(63);
    expect(result.directPixels[0] - result.specularPixels[0]).toBeLessThanOrEqual(65);
    expect(result.directPixels[1]).toBe(result.specularPixels[1]);
    expect(errors).toEqual([]);
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(path.join(artifactRoot, 'material-stage-check.json'), JSON.stringify(result, null, 2));
});
