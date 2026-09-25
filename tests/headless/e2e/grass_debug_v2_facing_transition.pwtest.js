// A camera crossing the source ribbon must change lighting smoothly, without normal collapse.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/facing_transition', process.env.GRASS_FACING_CAPTURE ?? 'after');

test('Normal facing remains continuous through grazing views', async ({ page }) => {
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    for (const mode of ['LOD0', 'refined', 'split']) {
        await page.evaluate(mode => {
            const study = window.__plantCardsStudy;
            study.camera.position.set(0.72, 0.19, 0.27);
            study.controls.target.set(0, 0.034, 0.012); study.controls.update();
            study.setMode(mode);
        }, mode);
        await page.screenshot({ path: path.join(folder, `${mode}.jpg`), quality: 92 });
    }
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { updateMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const { renderer, cards } = window.__plantCardsStudy;
        updateMaterialShaderHook(cards.material, 'lighting.calibrated_diffuse_ibl', { enabled: false });
        cards.setAlphaCoverage(false); cards.setNormalFacing(true);
        const normal = new THREE.DataTexture(new Uint8Array([128, 255, 128, 255]), 1, 1);
        const surface = new THREE.DataTexture(new Uint8Array([128, 255, 255, 255]), 1, 1);
        normal.needsUpdate = surface.needsUpdate = true;
        Object.assign(cards.material, { normalMap: normal, roughnessMap: surface, map: null, envMap: null,
            envMapIntensity: 0, roughness: 1, alphaToCoverage: false });
        cards.material.color.setRGB(0.15, 0.4, 0.05); cards.material.needsUpdate = true;
        const geometry = new THREE.PlaneGeometry(1, 1);
        const mesh = new THREE.Mesh(geometry, cards.material), scene = new THREE.Scene();
        const light = new THREE.DirectionalLight(0xffffff, Math.PI); light.position.set(0, 3, 0);
        scene.add(light, mesh);
        const target = new THREE.WebGLRenderTarget(64, 64);
        renderer.toneMapping = THREE.NoToneMapping; renderer.setClearColor(0, 0);
        const pixels = new Uint8Array(64 * 64 * 4);
        const result = [];
        for (const camera of [new THREE.OrthographicCamera(-0.4, 0.4, 0.4, -0.4, 0.01, 10),
            new THREE.PerspectiveCamera(15, 1, 0.01, 10)]) {
            const samples = [];
            for (let step = -32; step <= 32; step++) {
                const degrees = step * 0.25, angle = THREE.MathUtils.degToRad(degrees);
                camera.position.set(0, 3 * Math.sin(angle), 3 * Math.cos(angle)); camera.lookAt(0, 0, 0);
                renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
                renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels);
                let green = 0, alpha = 0;
                for (const y of [31, 32]) for (const x of [31, 32]) {
                    const i = (y * 64 + x) * 4; green += pixels[i + 1]; alpha += pixels[i + 3];
                }
                samples.push({ degrees, green: green / 4, alpha: alpha / 4 });
            }
            const maximumStep = Math.max(...samples.slice(1).map((sample, i) => Math.abs(sample.green - samples[i].green)));
            result.push({ camera: camera.type, maximumStep, samples });
        }
        geometry.dispose(); normal.dispose(); surface.dispose(); target.dispose();
        return result;
    });
    await writeFile(path.join(folder, 'sweep.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result.map(({ camera, maximumStep, samples }) => ({ camera, maximumStep,
        underside: samples[0].green, top: samples.at(-1).green }))));
    for (const sweep of result) {
        expect(sweep.samples.every(sample => sample.alpha === 255)).toBe(true);
        expect(sweep.samples[0].green).toBeLessThan(sweep.samples.at(-1).green * 0.6);
        expect(Math.min(...sweep.samples.map(sample => sample.green)), 'No artificial dark band between the two sides')
            .toBeGreaterThanOrEqual(sweep.samples[0].green - 2);
        expect(sweep.maximumStep, 'A quarter-degree camera move must not flip between front and back lighting').toBeLessThan(8);
        expect(sweep.samples.filter(sample => sample.green > 45 && sample.green < 95).length,
            'The transition must contain intermediate lighting levels').toBeGreaterThan(8);
    }
    expect(errors).toEqual([]);
});
