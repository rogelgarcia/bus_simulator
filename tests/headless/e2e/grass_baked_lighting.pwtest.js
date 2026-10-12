// Validate the isolated nine-field strategy and collect matched renders and soil-relative timings.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { writeGrassBakedLightingReport } from '../visual/grass_baked_lighting_report.mjs';

const output = 'tests/artifacts/screens/grass_debug_v2/baked_lighting';
test.use({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('baked grass preserves the reference path and renders every level', async ({ page }) => {
    test.setTimeout(process.env.GRASS_BAKED_PERF ? 900000 : 360000); await mkdir(output, { recursive: true });
    const errors = [], performance = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.error(message.text().slice(0, 1600)); } });
    await page.route('**/GrassDebugV2BakedLightingScene.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const api = Object.freeze', 'window.__bakedTest = { renderer, scene, camera, sets, assets, bakedAssets };\nconst api = Object.freeze') });
    });
    await page.goto('/debug_tools/grass_baked_lighting_scene.html');
    const initial = await page.evaluate(() => window.__grassBakedReadiness);
    initial.renderer = await page.evaluate(() => {
        const gl = window.__bakedTest.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER), vendor: gl.getParameter(info ? info.UNMASKED_VENDOR_WEBGL : gl.VENDOR) };
    });
    expect(initial.fields.current.cells).toBe(1296);
    expect(initial.appearance.baseShootDensity).toBe(.6);
    expect(initial.appearance.runtimeNormalMaps).toBe(0);
    await page.evaluate(() => { window.__grassBakedScene.setAnimating(false); document.getElementById('scene-panel').hidden = true;
        document.getElementById('split-labels').hidden = true; document.getElementById('scene-performance').hidden = true; });
    const snapshots = [], palette = [];
    for (const pose of ['bus_14m_front', 'bus_19m_rear', 'bus_24m_side', 'bus_40m_front', 'bus_40m_rear', 'bus_40m_side', 'overview', 'roots_close']) {
        for (const strategy of ['current', 'baked']) for (const lod of ['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5', 'AUTO']) {
            snapshots.push(await page.evaluate(({ pose, strategy, lod }) => {
                const viewer = window.__grassBakedScene;
                if (pose === 'roots_close') viewer.setCamera([3, .4, 5], [3, .05, 3.2]); else viewer.setPose(pose);
                viewer.setStrategy(strategy); viewer.setLod(lod); viewer.step(0); return viewer.getSnapshot();
            }, { pose, strategy, lod }));
            palette.push({ pose, strategy, lod, ...await page.evaluate(() => {
                const { renderer, camera, sets } = window.__bakedTest, viewer = window.__grassBakedScene;
                viewer.step(0); const gl = renderer.getContext(), { width, height } = renderer.domElement;
                const pixels = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const rgb = [0, 0, 0], litter = [0, 0, 0]; let count = 0, litterCount = 0;
                for (let i = 0; i < width * Math.floor(height / 2) * 4; i += 4) {
                    const [r, g, b] = pixels.subarray(i, i + 3);
                    if (r > g * 1.03 && g > b * .95 && g > 25) { litter[0] += r; litter[1] += g; litter[2] += b; litterCount++; }
                    if (g < 50 || g < r * 1.04 || g < b * 1.2) continue;
                    rgb[0] += r; rgb[1] += g; rgb[2] += b; count++;
                }
                const fieldRgb = [0, 0, 0], fields = sets.baked.getSnapshot().fields.filter(field => field.index !== 4), point = camera.position.clone();
                const farBandRgb = [0, 0, 0]; let farBandPixels = 0, fieldPixels = 0, greenPixels = 0;
                for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) {
                    point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                    const t = (.05 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                    if (t <= 0 || !fields.some(field => wx > field.minX + .4 && wx < field.maxX - .4 && wz > field.minZ + .4 && wz < field.maxZ - .4)) continue;
                    const i = (y * width + x) * 4, [r, g, b] = pixels.subarray(i, i + 3);
                    // Judge the flat canopy where it is used, rather than against nearby upright blades.
                    const distance = Math.hypot(wx - camera.position.x, wz - camera.position.z);
                    if (distance >= 40 && distance <= 50) {
                        farBandPixels++; farBandRgb[0] += r; farBandRgb[1] += g; farBandRgb[2] += b;
                    }
                    if (y >= height / 2) continue;
                    fieldPixels++; fieldRgb[0] += r; fieldRgb[1] += g; fieldRgb[2] += b;
                    if (g > r * 1.04 && g > b * 1.2) greenPixels++;
                }
                return { greenRgb: rgb.map(value => value / count), redToGreen: rgb[0] / rgb[1], blueToGreen: rgb[2] / rgb[1], litterRgb: litter.map(value => value / litterCount),
                    fieldRgb: fieldRgb.map(value => value / fieldPixels), fieldGreenCoverage: greenPixels / fieldPixels, fieldPixels,
                    farBandRgb: farBandRgb.map(value => value / farBandPixels), farBandPixels };
            }) });
            await page.locator('#scene-canvas').screenshot({ path: `${output}/${pose}-${strategy}-${lod}.png` });
        }
        if (process.env.GRASS_BAKED_PERF && pose.startsWith('bus_')) {
            performance.push(await page.evaluate(rendersPerFrame => window.__grassBakedScene.benchmark({ rounds: 4, frames: 40, rendersPerFrame }), Number(process.env.GRASS_BAKED_BATCH || 1)));
            const run = performance.at(-1);
            expect(run.results).toHaveLength(15);
            for (const row of run.results) {
                expect(row.gpuMs).toBeGreaterThan(0); expect(row.soilGpuMs).toBeGreaterThan(0);
                expect(row.soilGpuMs + row.aboveSoilMs).toBeCloseTo(row.gpuMs, 8);
                expect(row.samples).toBeGreaterThanOrEqual(128);
            }
            await writeFile(`${output}/performance-latest.json`, JSON.stringify(performance, null, 2));
            console.log('Benchmarked ' + pose);
        }
    }
    const validation = await page.evaluate(async () => {
        const THREE = await import('three');
        const { setBakedGrassCardMipmaps, createBakedGrassColorMaps } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2BakedAppearance.js');
        const texture = new THREE.DataTexture(new Uint8Array([100, 200, 40, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 2, 2);
        setBakedGrassCardMipmaps(texture); const mip = [...texture.mipmaps[1].data]; texture.dispose();
        const { scene, renderer, sets, assets, bakedAssets } = window.__bakedTest, viewer = window.__grassBakedScene;
        const shadowLow = new Uint8Array([32, 96, 160, 224]);
        const shadowHigh = Uint8Array.from({ length: 64 }, (_, i) => shadowLow[Math.floor(i / 32) * 2 + Math.floor(i % 8 / 4)] + (i % 2 ? 16 : -16));
        const channels = { albedo: new Uint8Array(Array(4).fill([40, 40, 40, 0]).flat()), normal: new Uint8Array(16),
            roughness: new Uint8Array(Array(4).fill([40, 255, 40, 40]).flat()) };
        const resolve = visibility => createBakedGrassColorMaps({ readPixels: (_, channel) => channel === 'visibility' ? visibility : channels[channel] }, renderer);
        const lowMaps = resolve(shadowLow), highMaps = resolve(shadowHigh);
        const shadowResolutionDifference = Math.max(...lowMaps[0].image.data.map((value, i) => Math.abs(value - highMaps[0].image.data[i])));
        [...lowMaps, ...highMaps].forEach(map => map.dispose());
        const canopyMaps = [assets.canopy.materials.all.map, bakedAssets.canopy.materials.all.map].map(map => ({ width: map.image.width, height: map.image.height, anisotropy: map.anisotropy }));
        const original = assets.sources.LOD2.geometry.attributes, baked = bakedAssets.sources.LOD2.geometry.attributes;
        const height = bakedAssets.sources.LOD2.geometry.boundingBox.max.y, shades = { root: [], tip: [] };
        for (let i = 0; i < original.position.count; i++) {
            const y = original.position.getY(i) / height, group = y < .1 ? shades.root : y > .8 ? shades.tip : null;
            if (group) group.push(baked.color.getY(i));
        }
        const rootToTipShade = (shades.root.reduce((a, b) => a + b, 0) / shades.root.length) / (shades.tip.reduce((a, b) => a + b, 0) / shades.tip.length);
        const originalSunIntensity = viewer.getSnapshot().lighting.sunIntensity;
        viewer.setStrategy('baked'); viewer.setLod('LOD3'); viewer.setPose('bus_14m_front');
        const visible = scene.children.map(child => [child, child.visible]);
        scene.children.forEach(child => { if (child !== sets.baked.group) child.visible = false; });
        const canvas = renderer.domElement, gl = renderer.getContext();
        const capture = () => { viewer.step(0); const pixels = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; };
        const before = capture(); viewer.setSunIntensity(0); const after = capture();
        let maxSunDifference = 0, maxShadowDifference = 0, totalSunDifference = 0;
        for (let i = 0; i < before.length; i++) { const difference = Math.abs(before[i] - after[i]); maxSunDifference = Math.max(maxSunDifference, difference); totalSunDifference += difference; }
        viewer.setExternalShadows(false); const unshadowed = capture();
        for (let i = 0; i < before.length; i++) maxShadowDifference = Math.max(maxShadowDifference, Math.abs(before[i] - unshadowed[i]));
        for (const [child, value] of visible) child.visible = value;
        const invalid = [], litPrograms = [];
        sets.baked.group.traverse(mesh => { if (mesh.isMesh && mesh.material.isMeshBasicMaterial && (mesh.material.normalMap || mesh.material.roughnessMap || mesh.material.envMap)) invalid.push(mesh.name); });
        sets.baked.group.traverseVisible(mesh => { if (!mesh.isMesh) return;
            const shader = renderer.properties.get(mesh.material).currentProgram.fragmentShader;
            if (/uniform\s+DirectionalLight/.test(gl.getShaderSource(shader))) litPrograms.push(mesh.name);
        });
        viewer.setSunIntensity(originalSunIntensity); viewer.setExternalShadows(true);
        return { mip, rootToTipShade, canopyMaps, shadowResolutionDifference, maxSunDifference, meanSunDifference: totalSunDifference / before.length, maxShadowDifference, invalid, litPrograms };
    });
    await writeFile(`${output}/results.json`, JSON.stringify({ initial, snapshots, performance, validation, palette, errors }, null, 2));
    await writeGrassBakedLightingReport(output, { initial, snapshots, performance, validation, errors });
    expect(validation.mip).toEqual([100, 200, 40, 64]); expect(validation.maxSunDifference).toBeLessThanOrEqual(1);
    expect(validation.meanSunDifference).toBeLessThan(.01); expect(validation.litPrograms).toEqual([]);
    expect(validation.maxShadowDifference).toBeGreaterThan(10); expect(validation.invalid).toEqual([]);
    expect(validation.rootToTipShade, 'Prepared roots retain deep shading below the exposed tips').toBeLessThan(.15);
    expect(validation.canopyMaps[0]).toEqual({ width: 1024, height: 1024, anisotropy: 4 });
    expect(validation.canopyMaps[1]).toEqual({ width: 1024, height: 1024, anisotropy: initial.appearance.canopyFiltering.anisotropy });
    expect(initial.appearance.canopyFiltering.linearMagnification).toBe(true);
    expect(validation.shadowResolutionDifference, 'Resolve the full matching shadow footprint when visibility is 4× the color resolution').toBe(0);
    for (const pose of ['bus_14m_front', 'bus_19m_rear', 'bus_24m_side']) for (const lod of ['LOD3', 'LOD4']) {
        const reference = palette.find(row => row.pose === pose && row.strategy === 'baked' && row.lod === 'LOD2');
        const card = palette.find(row => row.pose === pose && row.strategy === 'baked' && row.lod === lod);
        expect(Math.abs(card.blueToGreen - reference.blueToGreen), `${pose} ${lod}: cards retain the prepared blades' blue/green balance`).toBeLessThan(.06);
        expect(Math.abs(card.redToGreen - reference.redToGreen), `${pose} ${lod}: cards retain the prepared blades' red/green balance`).toBeLessThan(.06);
    }
    for (const pose of ['bus_40m_front', 'bus_40m_rear', 'bus_40m_side']) {
        const reference = palette.find(row => row.pose === pose && row.strategy === 'baked' && row.lod === 'LOD4');
        const canopy = palette.find(row => row.pose === pose && row.strategy === 'baked' && row.lod === 'LOD5');
        expect(reference.farBandPixels, 'The 40–50 m strip contains enough field samples').toBeGreaterThan(100);
        expect(canopy.farBandPixels).toBe(reference.farBandPixels);
        const [r, g, b] = reference.farBandRgb, [cr, cg, cb] = canopy.farBandRgb;
        expect(Math.abs(cr / cg - r / g), `${pose}: LOD5 retains LOD4's green in the 40–50 m band`).toBeLessThan(.04);
        expect(Math.abs(cb / cg - b / g), `${pose}: LOD5 retains LOD4's saturation in the 40–50 m band`).toBeLessThan(.05);
        expect(cg / g, `${pose}: LOD5 preserves distant brightness`).toBeGreaterThan(.9);
        expect(cg / g, `${pose}: LOD5 avoids glowing distant grass`).toBeLessThan(1.1);
    }
    for (const lod of ['LOD3', 'LOD4']) {
        const pair = palette.filter(row => row.pose === 'roots_close' && row.lod === lod);
        for (let c = 0; c < 3; c++) {
            const ratio = pair[1].litterRgb[c] / pair[0].litterRgb[c];
            expect(ratio, `${lod} shaded litter retains visible detail`).toBeGreaterThan(.3);
            expect(ratio, `${lod} litter sits in shadow below the exposed blades`).toBeLessThan(.9);
        }
    }
    expect(errors).toEqual([]);
});

test('comparison controls keep nine fields and the current strategy available', async ({ page }) => {
    test.setTimeout(90000); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/debug_tools/grass_baked_lighting_scene.html?strategy=baked&lod=LOD4');
    await page.evaluate(() => window.__grassBakedReadiness);
    await page.locator('#strategy').selectOption('current');
    expect(await page.evaluate(() => window.__grassBakedScene.getSnapshot().strategy)).toBe('current');
    await page.locator('#strategy').selectOption('split');
    await expect(page.locator('a[href="grass_litter_scene.html?fields=9"]')).toBeVisible();
    const state = await page.evaluate(() => window.__grassBakedScene.getSnapshot());
    expect(state.fields.current.fields).toHaveLength(9); expect(state.fields.baked.fields).toHaveLength(9);
    expect(state.fields.current.cardBase.density).toBe(.45);
    await page.locator('#brightness').fill('0.9');
    expect(await page.evaluate(() => window.__grassBakedScene.getSnapshot().brightness)).toBe(.9);
    await page.locator('#brightness').fill('1');
    await page.locator('#lod').selectOption('AUTO');
    await page.locator('#panel-toggle').click();
    await expect(page.locator('#panel-body')).toBeHidden();
    await expect(page.locator('#panel-toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.evaluate(() => window.__grassBakedScene.setCamera([12, 7, 14], [0, 0, 0]));
    await page.locator('#scene-canvas').focus(); await page.keyboard.press('r');
    expect(await page.evaluate(() => window.__grassBakedScene.getSnapshot().camera.position[1])).toBe(4.5);
    await page.evaluate(async () => { const viewer = window.__grassBakedScene; viewer.setPose('bus_14m_front'); viewer.setAnimating(false);
        for (let i = 0; i < 32; i++) { await new Promise(resolve => requestAnimationFrame(resolve)); viewer.step(0); } });
    await mkdir(output, { recursive: true }); await page.screenshot({ path: `${output}/live-split.png` });
    expect(errors).toEqual([]);
});
