// A material's zero reflection scale must retain calibrated diffuse sky radiance.
import { test, expect } from '@playwright/test';

test('calibrated diffuse skylight survives disabled reflections and restores legacy behavior', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/tests/headless/harness/index.html?ibl=0');
    await page.waitForFunction(() => !!window.__testHooks);
    const values = await page.evaluate(async () => {
        const THREE = await import('three');
        const { applyIBLToScene, applyIBLIntensity } = await import('/src/graphics/engine3d/lighting/IBL.js');
        const renderer = window.__testHooks.getEngine().renderer;
        const sky = new THREE.Scene(); sky.background = new THREE.Color(.5, .5, .5);
        const generator = new THREE.PMREMGenerator(renderer), environment = generator.fromScene(sky);
        const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
        camera.position.z = 2;
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.MeshPhysicalMaterial({color:new THREE.Color(.18,.18,.18),
            roughness:1,metalness:0,specularIntensity:0,envMapIntensity:0});
        material.userData.iblNoAutoEnvMapIntensity = true;
        scene.add(new THREE.Mesh(geometry, material));
        const target = new THREE.WebGLRenderTarget(32,32,{type:THREE.FloatType});
        const previous = renderer.getRenderTarget(), result = [];
        try {
            for (const id of ['legacy','ibl.calibrated.clear_afternoon_55','legacy','ibl.calibrated.clear_afternoon_55']) {
                const settings = {enabled:true,iblId:id,envMapIntensity:1};
                applyIBLToScene(scene,environment.texture,settings); applyIBLIntensity(scene,settings);
                renderer.setRenderTarget(target); renderer.render(scene,camera);
                const pixels = new Float32Array(4); renderer.readRenderTargetPixels(target,16,16,1,1,pixels);
                result.push({id,rgb:[...pixels.slice(0,3)],reflectionIntensity:material.envMapIntensity});
            }
            return result;
        } finally {
            renderer.setRenderTarget(previous); target.dispose(); geometry.dispose(); material.dispose();
            environment.dispose(); generator.dispose();
        }
    });
    for (const entry of values) {
        expect(entry.reflectionIntensity).toBe(0);
        for (const value of entry.rgb) expect(Math.abs(value - (entry.id === 'legacy' ? 0 : .09))).toBeLessThan(.006);
    }
    expect(values[1].rgb).toEqual(values[3].rgb);
    expect(errors).toEqual([]);
});
