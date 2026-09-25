// Fine vein normals must not switch a leaf's front/back lighting independently.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/facing_ridge');

test('Underside leaf detail stays in the structural normal hemisphere', async ({ page }) => {
    await mkdir(folder, { recursive: true });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await page.setViewportSize({ width: 1500, height: 1100 });
    for (const mode of ['LOD0', 'off', 'on']) {
        await page.evaluate(mode => {
            const study = window.__plantCardsStudy;
            study.camera.position.set(0.72, 0.06, 0.27); study.controls.target.set(0, 0.034, 0.012); study.controls.update();
            study.setNormalFacing(mode !== 'off'); study.setMode(mode === 'LOD0' ? 'LOD0' : 'refined');
        }, mode);
        await page.screenshot({ path: path.join(folder, `underside_${mode}.jpg`), quality: 94 });
    }
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2Material } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Material.js');
        const { updateMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const { renderer, cards } = window.__plantCardsStudy;
        updateMaterialShaderHook(cards.material, 'lighting.calibrated_diffuse_ibl', { enabled: false });
        cards.setAlphaCoverage(false); cards.setNormalFacing(true);
        const pixels = new Uint8Array(128 * 4);
        for (let x = 0; x < 128; x++) {
            const nx = 0.65 * Math.sin(x / 127 * Math.PI * 4), ny = Math.sqrt(1 - nx * nx);
            pixels.set([Math.round((nx * 0.5 + 0.5) * 255), Math.round((ny * 0.5 + 0.5) * 255), 128, 255], x * 4);
        }
        const normalMap = new THREE.DataTexture(pixels, 128, 1); normalMap.needsUpdate = true;
        const surface = new THREE.DataTexture(new Uint8Array([128, 255, 255, 255]), 1, 1); surface.needsUpdate = true;
        const source = createGrassDebugV2Material({ color: '#80b940', normalMap, normalMapType: THREE.ObjectSpaceNormalMap, roughness: 1 });
        Object.assign(cards.material, { normalMap, roughnessMap: surface, map: null, envMap: null, envMapIntensity: 0, roughness: 1, alphaToCoverage: false });
        cards.material.color.copy(source.color); cards.material.needsUpdate = true;
        const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geometry, source), scene = new THREE.Scene();
        const light = new THREE.DirectionalLight(0xffffff, Math.PI); light.position.set(0, 3, 0); scene.add(light, mesh);
        const camera = new THREE.OrthographicCamera(-0.7, 0.7, 0.22, -0.22, 0.01, 10);
        const target = new THREE.WebGLRenderTarget(640, 256);
        renderer.toneMapping = THREE.NoToneMapping; renderer.setClearColor(0, 0);
        const values = [];
        for (const y of [-0.3, 0.3]) {
            camera.position.set(2, y, 1); camera.lookAt(0, 0, 0);
            const images = [];
            for (const material of [source, cards.material]) {
                mesh.material = material; renderer.setRenderTarget(target); renderer.render(scene, camera); renderer.setRenderTarget(null);
                const pixels = new Uint8Array(640 * 256 * 4); renderer.readRenderTargetPixels(target, 0, 0, 640, 256, pixels);
                images.push(pixels);
            }
            let sum = 0, peak = 0, count = 0;
            for (let i = 0; i < images[0].length; i += 4) if (images[0][i + 3] > 250) {
                const error = Math.abs(images[0][i + 1] - images[1][i + 1]); sum += error; peak = Math.max(peak, error); count++;
            }
            values.push({ y, meanError: sum / count, peakError: peak, count });
        }
        geometry.dispose(); normalMap.dispose(); surface.dispose(); source.dispose(); target.dispose();
        return values;
    });
    await writeFile(path.join(folder, 'ridge-metrics.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    for (const measurement of result) {
        expect(measurement.count).toBeGreaterThan(1000);
        expect(measurement.meanError, 'Fine detail must shade like the corresponding source side').toBeLessThan(1);
        expect(measurement.peakError, 'No bright underside stripe').toBeLessThan(3);
    }
});
