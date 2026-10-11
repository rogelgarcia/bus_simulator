// Compare adjacent grass representations in the bus scene at the actual switch distances and camera elevations.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const output = 'tests/artifacts/screens/grass_debug_v2/bus_palette/' + (process.env.GRASS_PALETTE_PHASE || 'after');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('bus grass keeps adjacent LOD colors at low and elevated camera angles', async ({ page }) => {
    test.setTimeout(180000); await mkdir(output, { recursive: true });
    const errors = [], rows = [];
    if (process.env.GRASS_PALETTE_BEFORE_WAVE) for (const name of ['GrassDebugV2FarTexture.js', 'GrassDebugV2BakedLightingAssets.js', 'grass_baked_appearance.vert.glsl']) {
        const body = await readFile('tests/artifacts/screens/grass_debug_v2/wave_match/before-source/' + name, 'utf8');
        await page.route('**/' + name + '*', route => route.fulfill({ status: 200, contentType: name.endsWith('.glsl') ? 'text/plain' : 'application/javascript', body }));
    }
    if (process.env.GRASS_PALETTE_REFERENCE) for (const name of ['GrassDebugV2BakedLightingAssets.js', 'GrassDebugV2TransitionFields.js', 'grass_baked_appearance.vert.glsl', 'grass_baked_appearance.frag.glsl']) {
        const path = name.endsWith('.glsl') ? `src/graphics/shaders/materials/grass/${name}` : `src/graphics/gui/grass_debugger_v2/${name}`;
        const body = execFileSync('git', ['show', `d39f8164:${path}`], { encoding: 'utf8' });
        await page.route('**/' + name + '*', route => route.fulfill({ status: 200, contentType: name.endsWith('.glsl') ? 'text/plain' : 'application/javascript', body }));
    }
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__paletteView = view;\nlet copyFeedbackTimer;') });
    });
    await page.route('**/GrassDebugV2DistanceGrass.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('externalShadows.update(); refreshShadows();', 'externalShadows.update(); refreshShadows(); window.__paletteAssets = { bakedAssets, fields };') });
    });
    await page.goto('/debug_tools/grass_debug_v2.html?grass=baked');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    await expect(page.locator('[data-grass-strategy="baked"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-grass-strategy="current"]')).not.toHaveAttribute('aria-current');
    await page.evaluate(() => window.__paletteView.renderer.setAnimationLoop(null));
    for (const pose of ['bus', 'overview', 'grass', 'high', 'grazing']) for (const lod of ['LOD2', 'LOD3', 'LOD4', 'LOD5', 'AUTO']) {
        const row = await page.evaluate(({ pose, lod }) => {
            const view = window.__paletteView, { camera, renderer } = view;
            if (pose === 'high') { camera.position.set(0, 32, -10); camera.lookAt(0, 0, 30); camera.updateMatrixWorld(true); }
            else if (pose === 'grazing') { camera.position.set(0, 1.4, 3); camera.lookAt(0, -.1, 63); camera.updateMatrixWorld(true); }
            else view.setCamera(pose);
            view.grass.setMode(lod); view.grass.update(camera.position, performance.now(), true); view.lighting.render(0);
            const gl = renderer.getContext(), { width, height } = renderer.domElement, pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const placements = view.grass.getSnapshot().placements, point = camera.position.clone();
            const bins = [20, 30, 40, 50, 70].map(distance => ({ distance, pixels: 0, rgb: [0, 0, 0], detail: 0 }));
            for (let y = 2; y < height - 2; y += 2) for (let x = 2; x < width - 2; x += 2) {
                point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                const t = (.07 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                const distance = Math.hypot(wx - camera.position.x, wz - camera.position.z);
                const bin = bins.find(bin => Math.abs(distance - bin.distance) < 2);
                if (t <= 0 || !bin || !placements.some(p => wx > p.minX + .8 && wx < p.maxX - .8 && wz > p.minZ + .8 && wz < p.maxZ - .8)) continue;
                const i = (y * width + x) * 4;
                bin.pixels++; for (let c = 0; c < 3; c++) bin.rgb[c] += pixels[i + c];
                bin.detail += ((pixels[i] - pixels[i + 4]) * .2126 + (pixels[i + 1] - pixels[i + 5]) * .7152 + (pixels[i + 2] - pixels[i + 6]) * .0722) ** 2;
            }
            const overflow = []; view.grass.group.traverse(mesh => { if (mesh.isInstancedMesh && mesh.count > mesh.instanceMatrix.count) overflow.push(mesh.name); });
            return { pose, lod, bins: bins.map(bin => ({ ...bin, rgb: bin.rgb.map(value => value / bin.pixels), detail: Math.sqrt(bin.detail / bin.pixels) })), draw: { ...renderer.info.render }, overflow };
        }, { pose, lod });
        rows.push(row);
        await page.locator('#game-canvas').screenshot({ path: `${output}/${pose}-${lod}.png` });
    }
    const repeats = [];
    for (const lod of ['LOD2', 'LOD3', 'LOD4', 'LOD5']) {
        repeats.push(await page.evaluate(async lod => {
            const THREE = await import('three'), view = window.__paletteView, { renderer, scene } = view;
            const p = view.grass.getSnapshot().placement, camera = new THREE.OrthographicCamera(-3, 3, 12, -12, .1, 50);
            camera.position.set((p.minX + p.maxX) / 2, 20, 14); camera.up.set(0, 0, -1); camera.lookAt(camera.position.x, 0, 14);
            view.grass.setMode(lod); view.content.trees.visible = false;
            const target = new THREE.WebGLRenderTarget(384, 1536), pixels = new Uint8Array(384 * 1536 * 4);
            renderer.setRenderTarget(target); renderer.render(scene, camera); renderer.readRenderTargetPixels(target, 0, 0, 384, 1536, pixels);
            renderer.setRenderTarget(null); target.dispose(); view.content.trees.visible = true;
            const luma = i => pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
            const correlation = (dx, dy) => {
                let n = 0, a = 0, b = 0, aa = 0, bb = 0, ab = 0;
                for (let y = 3; y < 1533 - dy; y += 2) for (let x = 3; x < 381 - dx; x += 2) {
                    const u = luma((y * 384 + x) * 4), v = luma(((y + dy) * 384 + x + dx) * 4);
                    n++; a += u; b += v; aa += u * u; bb += v * v; ab += u * v;
                }
                return (ab - a * b / n) / Math.sqrt((aa - a * a / n) * (bb - b * b / n));
            };
            return { lod, correlationX2m: correlation(128, 0), correlationZ2m: correlation(0, 128) };
        }, lod));
    }
    await page.evaluate(() => { window.__grassDebugV2.setCamera('overview'); window.__grassDebugV2.setGrassMode('AUTO'); window.__paletteView.lighting.render(0); });
    await page.screenshot({ path: `${output}/controls.png` });
    await writeFile(`${output}/results.json`, JSON.stringify({ rows, repeats, errors }, null, 2));
    expect(errors).toEqual([]);
    for (const row of rows) expect(row.overflow).toEqual([]);
    if (process.env.GRASS_PALETTE_REFERENCE) return;
    for (const row of repeats) {
        expect(row.correlationX2m, row.lod + ' no horizontal tile repetition').toBeLessThan(.3);
        expect(row.correlationZ2m, row.lod + ' no longitudinal tile repetition').toBeLessThan(.3);
    }
    for (const pose of ['bus', 'overview', 'grass', 'high', 'grazing']) for (const [near, far, distance] of [['LOD2', 'LOD3', 20], ['LOD3', 'LOD4', 30], ['LOD4', 'LOD5', 40]]) {
        const a = rows.find(row => row.pose === pose && row.lod === near).bins.find(bin => bin.distance === distance);
        const b = rows.find(row => row.pose === pose && row.lod === far).bins.find(bin => bin.distance === distance);
        if (a.pixels < 100) continue;
        expect(Math.max(...a.rgb.map((value, channel) => Math.abs(value - b.rgb[channel]))), `${pose} ${near}/${far} at ${distance} m`).toBeLessThan(8);
    }
});
