// Verify that canopy shade remains opaque and soil gaps are shaded during baking.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Baked canopy shade occludes bright ground at medium distance', async ({ page }) => {
    test.setTimeout(240000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/canopy_shade');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy;
        const walls = s.comparison.volume.bake.views.map(view => {
            const image = view.textures.albedo.image, bands = [];
            for (const [low, high] of [[0, 0.2], [0.4, 0.6], [0.8, 1]]) {
                let alpha = 0, green = 0, count = 0, solid = 0;
                for (let y = Math.floor(low * image.height); y < Math.floor(high * image.height); y++)
                    for (let x = 0; x < image.width; x++) {
                        const i = (y * image.width + x) * 4, a = image.data[i + 3] / 255;
                        alpha += a; green += image.data[i + 1] * a; count++;
                        if (a > 0.9) solid++;
                    }
                bands.push({ coverage: alpha / count, green: green / alpha, solid: solid / count });
            }
            const mips = view.textures.albedo.mipmaps.filter(mip => mip.height >= 4).map(mip => {
                let alpha = 0, count = 0;
                for (let y = 0; y < Math.max(1, Math.floor(mip.height * 0.2)); y++) for (let x = 0; x < mip.width; x++) {
                    alpha += mip.data[(y * mip.width + x) * 4 + 3] / 255; count++;
                }
                return { height: mip.height, lowerCoverage: alpha / count };
            });
            return { id: view.id, bands, mips };
        });
        const { createGrassDebugV2FloorBake } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2FloorBake.js');
        const soilMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.3, 0.2, 0.1), roughness: 1 });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), soilMaterial);
        ground.rotation.x = -Math.PI / 2; ground.updateMatrixWorld(true);
        const source = new THREE.Group(), material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.1, 0.35, 0.05), roughness: 1 });
        const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.6), material);
        blade.rotation.x = -Math.PI / 2; blade.position.set(0.46, 0.08, 0); source.add(blade);
        const bake = await createGrassDebugV2FloorBake({ renderer: s.renderer, source, ground, resolution: 256 });
        const data = bake.readPixels('albedo'), normal = bake.readPixels('normal'), roughness = bake.readPixels('roughness');
        const sample = x => {
            const i = (128 * 256 + Math.round((x + 0.5) * 256 - 0.5)) * 4;
            return { rgb: Array.from(data.slice(i, i + 3)), coverage: normal[i + 3],
                soil: [roughness[i], roughness[i + 2], roughness[i + 3]] };
        };
        const soil = { open: sample(0), shaded: sample(0.38), wrapped: sample(-0.46), grass: sample(0.46) };
        bake.dispose(); blade.geometry.dispose(); material.dispose(); ground.geometry.dispose(); soilMaterial.dispose();
        return { walls, soil };
    });
    await page.addStyleTag({ content: '.plant-study-panel, .grass-authoring-dock, .grass-comparison-label, .grass-patch-distance {display:none!important;}' });
    for (const distance of [3, 6, 10]) {
        await page.evaluate(async distance => {
            const THREE = await import('three'), s = window.__plantCardsStudy;
            const center = new THREE.Vector3(0.65, 0.02, -1.3);
            const direction = s.lighting.sunRef.direction.clone(); direction.y = 0; direction.normalize().negate();
            direction.multiplyScalar(Math.cos(Math.PI / 6)); direction.y = 0.5;
            s.camera.position.copy(center).addScaledVector(direction, distance);
            s.controls.target.copy(center); s.controls.update();
            s.renderer.shadowMap.needsUpdate = true; s.lighting.sun.shadow.needsUpdate = true; s.lighting.render(0);
        }, distance);
        await page.screenshot({ path: path.join(folder, (process.env.GRASS_SHADE_CAPTURE || 'after') + '-' + distance + 'm.png') });
    }
    await writeFile(path.join(folder, (process.env.GRASS_SHADE_CAPTURE || 'after') + '.json'), JSON.stringify({ result, errors }, null, 2));
    for (const wall of result.walls) {
        expect(wall.bands[0].coverage, wall.id + ' lower canopy is not a hole').toBeGreaterThan(0.95);
        expect(wall.bands[0].green).toBeLessThan(wall.bands[1].green * 0.75);
        expect(wall.bands[0].green).toBeGreaterThan(2);
        expect(wall.bands[2].coverage).toBeLessThan(0.7);
        for (const mip of wall.mips) expect(mip.lowerCoverage, wall.id + ' mip ' + mip.height).toBeGreaterThan(0.95);
    }
    for (const key of ['shaded', 'wrapped']) {
        expect(result.soil[key].rgb[1]).toBeLessThan(result.soil.open.rgb[1] * 0.7);
        expect(result.soil[key].rgb[1]).toBeGreaterThan(2);
        expect(result.soil[key].coverage).toBe(0);
        expect(result.soil[key].soil).toEqual(result.soil[key].rgb);
    }
    [77, 51, 26].forEach((value, c) => expect(Math.abs(result.soil.open.rgb[c] - value)).toBeLessThanOrEqual(1));
    [26, 89, 13].forEach((value, c) => expect(Math.abs(result.soil.grass.rgb[c] - value)).toBeLessThanOrEqual(1));
    expect(errors).toEqual([]);
});
