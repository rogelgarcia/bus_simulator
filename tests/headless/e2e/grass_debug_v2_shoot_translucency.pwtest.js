// Check front/back reciprocity, warm transmission, shadowing and darkness in the shoot material.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1, video: 'off' });

test('Shoot leaves transmit warm light equally through either face without becoming transparent', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { createGrassDebugV2Material } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Material.js');
        const actual = window.__plantCardsStudy.plant.leaves[0].material;
        const roughnessValues = actual.roughnessMap.image.data.filter((_, i) => i % 4 === 1);
        let roughnessMin = 1, roughnessMax = 0;
        for (const value of roughnessValues) {
            const effective = actual.roughness * value / 255;
            roughnessMin = Math.min(roughnessMin, effective); roughnessMax = Math.max(roughnessMax, effective);
        }
        const renderer = new THREE.WebGLRenderer();
        renderer.shadowMap.enabled = true;
        const target = new THREE.WebGLRenderTarget(32, 32);
        renderer.setRenderTarget(target);
        const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 6);
        const material = createGrassDebugV2Material({ color: new THREE.Color().setRGB(0.1, 0.3, 0.04),
            roughness: 1, defines: { ...actual.defines } });
        const geometry = new THREE.PlaneGeometry(1, 1);
        const leaf = new THREE.Mesh(geometry, material); leaf.receiveShadow = true;
        const light = new THREE.DirectionalLight(0xffffff, Math.PI);
        light.castShadow = true; light.shadow.mapSize.set(256, 256);
        Object.assign(light.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 8 });
        light.shadow.camera.updateProjectionMatrix();
        const blocker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.05), new THREE.MeshBasicMaterial());
        blocker.position.z = -0.5; blocker.castShadow = true; blocker.visible = false;
        scene.add(leaf, light, light.target, blocker);
        const pixels = new Uint8Array(4);
        const sample = (side, backlit, u = 0.9, v = 0.6, intensity = Math.PI, shadow = false) => {
            camera.position.set(0, 0, side * 2); camera.lookAt(0, 0, 0);
            light.position.set(0, 0, side * (backlit ? -3 : 3)); light.intensity = intensity;
            blocker.visible = shadow;
            const uv = geometry.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
            uv.needsUpdate = true;
            renderer.render(scene, camera);
            renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixels);
            return [...pixels];
        };
        const result = { roughnessRange: [roughnessMin, roughnessMax], normalStrength: actual.normalScale.toArray(),
            enabled: actual.defines?.GRASS_LEAF_TRANSLUCENCY === 1,
            transparent: actual.transparent, opacity: actual.opacity,
            front: [sample(1, false), sample(-1, false)],
            back: [sample(1, true), sample(-1, true)],
            crease: sample(1, true, 0.5), base: sample(1, true, 0.9, -0.05),
            dark: sample(1, true, 0.9, 0.6, 0), shadow: sample(1, true, 0.9, 0.6, Math.PI, true) };
        geometry.dispose(); material.dispose(); blocker.geometry.dispose(); blocker.material.dispose();
        target.dispose(); renderer.dispose();
        return result;
    });
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/soil_cut_translucency');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'lighting-validation.json'), JSON.stringify(result, null, 2));
    await page.addStyleTag({ content: '.plant-study-panel { visibility: hidden; }' });
    for (const [name, side] of [['front_lit', 1], ['back_lit', -1]]) {
        await page.evaluate(side => {
            const s = window.__plantCardsStudy;
            s.camera.up.set(0, 1, 0); s.camera.position.set(0.036, 0.045, 0.150);
            s.controls.target.set(0.036, 0.036, 0); s.controls.update();
            s.lighting.sunRef.direction.set(0, 0.25, side).normalize();
            s.lighting.sun.position.copy(s.lighting.sun.target.position).addScaledVector(s.lighting.sunRef.direction, 0.8);
            s.lighting.sun.shadow.needsUpdate = true; s.renderer.shadowMap.needsUpdate = true;
            s.lighting.render(0);
        }, side);
        await page.screenshot({ path: path.join(folder, name + '.png') });
    }
    const backlitSurface = await page.evaluate(() => {
        const s = window.__plantCardsStudy, leaf = s.plant.leaves[0];
        const canvas = document.createElement('canvas');
        canvas.width = s.renderer.domElement.width; canvas.height = s.renderer.domElement.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const pixels = () => {
            s.lighting.render(0); context.drawImage(s.renderer.domElement, 0, 0);
            return context.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const shadowed = pixels(); leaf.receiveShadow = false; const unshadowed = pixels();
        leaf.receiveShadow = true; s.lighting.render(0);
        const p = leaf.geometry.attributes.position, index = leaf.geometry.index;
        let difference = 0, samples = 0;
        for (let i = 0; i < index.count; i += 3) {
            const vertices = [0, 1, 2].map(j => s.camera.position.clone().fromBufferAttribute(p, index.getX(i + j)));
            for (let a = 1; a < 6; a++) for (let b = 1; b < 7 - a; b++) {
                const point = vertices[0].clone().multiplyScalar(a / 7)
                    .addScaledVector(vertices[1], b / 7).addScaledVector(vertices[2], 1 - (a + b) / 7);
                if (point.y < 0.033 || point.y > 0.043) continue;
                leaf.localToWorld(point).project(s.camera);
                const x = Math.round((point.x * 0.5 + 0.5) * (canvas.width - 1));
                const y = Math.round((0.5 - point.y * 0.5) * (canvas.height - 1));
                const offset = 4 * (y * canvas.width + x);
                for (let c = 0; c < 3; c++) difference += Math.abs(shadowed[offset + c] - unshadowed[offset + c]);
                samples += 3;
            }
        }
        return { difference: difference / samples, samples };
    });
    result.backlitSurface = backlitSurface;
    await writeFile(path.join(folder, 'lighting-validation.json'), JSON.stringify(result, null, 2));
    expect(backlitSurface.samples).toBeGreaterThan(100);
    expect(backlitSurface.difference).toBeLessThan(3);
    expect(result.enabled).toBe(true);
    expect(result.transparent).toBe(false); expect(result.opacity).toBe(1);
    for (let channel = 0; channel < 3; channel++) {
        expect(Math.abs(result.front[0][channel] - result.front[1][channel])).toBeLessThanOrEqual(1);
        expect(Math.abs(result.back[0][channel] - result.back[1][channel])).toBeLessThanOrEqual(1);
        expect(result.dark[channel]).toBe(0);
        expect(result.shadow[channel]).toBeLessThan(2);
    }
    const [front] = result.front, [back] = result.back;
    expect(result.roughnessRange[0]).toBeGreaterThan(0.85);
    expect(result.roughnessRange[1]).toBeLessThanOrEqual(0.95);
    expect(result.normalStrength).toEqual([0.12, 0.12]);
    expect(back[1]).toBeGreaterThan(front[1] * 0.78);
    expect(back[1]).toBeLessThan(front[1] * 0.94);
    expect(back[0] / back[1]).toBeGreaterThan(front[0] / front[1] * 1.02);
    expect(back[2] / back[1]).toBeLessThan(front[2] / front[1] * 0.8);
    expect(result.crease[1]).toBeLessThan(back[1]);
    expect(result.base[1]).toBeLessThan(back[1] * 0.6);
    expect(errors).toEqual([]);
});
