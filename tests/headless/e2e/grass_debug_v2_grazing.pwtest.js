// Grazing-angle corrections must be independently reversible and leave source geometry untouched.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/grazing');

test('Plant study exposes independent normal-facing and alpha-coverage comparisons', async ({ page }) => {
    test.setTimeout(300000);
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto('/debug_tools/grass_plant_study.html?layout=row');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await expect(page.getByLabel('Normal facing', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Alpha coverage', { exact: true })).toBeChecked();
    await page.evaluate(async () => {
        window.__sourcePixels = async () => {
            const image = new Image(); image.src = window.__plantCardsStudy.capture('LOD0', 'side'); await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        window.__sourceBaseline = await window.__sourcePixels();
    });
    for (const normalFacing of [false, true]) for (const alphaCoverage of [false, true]) {
        await page.getByLabel('Normal facing', { exact: true }).setChecked(normalFacing);
        await page.getByLabel('Alpha coverage', { exact: true }).setChecked(alphaCoverage);
        const snapshot = await page.evaluate(() => window.__plantCardsStudy.getSnapshot());
        expect(snapshot.corrections).toEqual({ normalFacing, alphaCoverage });
        const mode = ['refined', 'detailed', 'curved', 'split'][Number(normalFacing) * 2 + Number(alphaCoverage)];
        await page.locator(`[data-mode="${mode}"]`).click();
        expect(await page.evaluate(() => window.__plantCardsStudy.getSnapshot().corrections)).toEqual({ normalFacing, alphaCoverage });
        const sourceError = await page.evaluate(async () => {
            const pixels = await window.__sourcePixels(); let sum = 0;
            for (let i = 0; i < pixels.length; i++) sum += Math.abs(pixels[i] - window.__sourceBaseline[i]);
            return sum / pixels.length;
        });
        expect(sourceError, 'LOD0 stays unchanged within subpixel rasterization tolerance').toBeLessThan(0.05);
    }
    console.log('Independent toggles and LOD0 stability verified.');
    for (const pose of ['three_quarter', 'side', 'grazing']) for (const state of ['LOD0', 'off', 'normals', 'coverage', 'both']) {
        await page.evaluate(({ pose, state }) => {
            const study = window.__plantCardsStudy;
            study.setNormalFacing(state === 'normals' || state === 'both');
            study.setAlphaCoverage(state === 'coverage' || state === 'both');
            if (pose === 'grazing') {
                study.camera.position.set(1.2, 0.022, 0.025);
                study.controls.target.set(0, 0.045, 0.015); study.controls.update();
            } else study.setPose(pose);
            study.setMode(state === 'LOD0' ? 'LOD0' : 'refined');
        }, { pose, state });
        await page.screenshot({ path: path.join(folder, `${pose}_${state}.jpg`), quality: 94 });
    }
    await writeFile(path.join(folder, 'snapshot.json'), JSON.stringify(await page.evaluate(() => window.__plantCardsStudy.getSnapshot()), null, 2));
    console.log('Grazing-angle comparison captures saved.');
    const measurements = await page.evaluate(async () => {
        const THREE = await import('three');
        const { renderer, cards } = window.__plantCardsStudy;
        const { updateMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        updateMaterialShaderHook(cards.material, 'lighting.calibrated_diffuse_ibl', { enabled: false });
        cards.material.envMap = null;
        const scene = new THREE.Scene(), target = new THREE.WebGLRenderTarget(750, 500, { samples: 4 });
        const camera = new THREE.PerspectiveCamera(35, 1.5, 0.001, 10);
        camera.position.set(1.2, 0.022, 0.025); camera.lookAt(0, 0.045, 0.015);
        const mesh = new THREE.Mesh(cards.refined.mesh.geometry, cards.material); scene.add(mesh);
        renderer.toneMapping = THREE.NoToneMapping; renderer.setClearColor(0, 0);
        cards.material.color.set(0); cards.material.emissive.set(0xffffff); cards.material.envMapIntensity = 0;
        const render = () => {
            renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
            const pixels = new Uint8Array(750 * 500 * 4); renderer.readRenderTargetPixels(target, 0, 0, 750, 500, pixels);
            let coverage = 0, green = 0, count = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                coverage += pixels[i] / 255;
                if (pixels[i + 3] > 250) { green += pixels[i + 1]; count++; }
            }
            return { coverage, green: green / count };
        };
        const coverage = [];
        for (const enabled of [false, true, false]) { cards.setAlphaCoverage(enabled); coverage.push(render().coverage); }
        cards.setAlphaCoverage(false);
        cards.material.map = null; cards.material.roughnessMap = null; cards.material.alphaToCoverage = false;
        cards.material.emissive.set(0); cards.material.color.setRGB(0.15, 0.4, 0.05); cards.material.roughness = 1;
        const normal = new THREE.DataTexture(new Uint8Array([128, 255, 128, 255]), 1, 1); normal.needsUpdate = true;
        const facingReference = new THREE.DataTexture(new Uint8Array([128, 255, 255, 255]), 1, 1); facingReference.needsUpdate = true;
        cards.material.normalMap = normal; cards.material.roughnessMap = facingReference; cards.material.needsUpdate = true;
        const geometry = new THREE.PlaneGeometry(1, 1); mesh.geometry = geometry;
        const light = new THREE.DirectionalLight(0xffffff, Math.PI); light.position.set(0, 3, 0); scene.add(light);
        const { createGrassDebugV2Material } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Material.js');
        const sourceGeometry = geometry.clone(); sourceGeometry.rotateX(-Math.PI / 2);
        const sourceMaterial = createGrassDebugV2Material({ color: cards.material.color.clone(), roughness: 1 });
        const facing = [];
        for (const [y, z] of [[1, 3], [-1, 3], [-1, -3]]) {
            camera.position.set(0, y, z); camera.lookAt(0, 0, 0);
            mesh.geometry = sourceGeometry; mesh.material = sourceMaterial; const source = render().green;
            mesh.geometry = geometry; mesh.material = cards.material;
            const values = [];
            for (const enabled of [false, true, false]) { cards.setNormalFacing(enabled); values.push(render().green); }
            facing.push({ y, z, source, values });
        }
        normal.dispose(); facingReference.dispose(); geometry.dispose(); sourceGeometry.dispose(); sourceMaterial.dispose(); target.dispose();
        return { coverage, facing };
    });
    await writeFile(path.join(folder, 'measurements.json'), JSON.stringify(measurements, null, 2));
    console.log(JSON.stringify(measurements));
    expect(measurements.coverage[1]).toBeGreaterThan(measurements.coverage[0] * 1.1);
    expect(measurements.coverage[2]).toBeCloseTo(measurements.coverage[0], 5);
    for (const { source, values } of measurements.facing) {
        expect(Math.abs(values[1] / source - 1)).toBeLessThan(0.1);
        expect(values[2]).toBeCloseTo(values[0], 5);
    }
    const underside = measurements.facing.find(result => result.y === -1 && result.z === 3);
    expect(underside.values[1]).toBeLessThan(underside.values[0] * 0.6);
    expect(errors).toEqual([]);
});
