// Capture identical fixed views of every LOD so representation differences cannot hide inside a blend.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const phase = process.env.GRASS_ALIGNMENT_PHASE || 'after';
const output = `tests/artifacts/screens/grass_debug_v2/lod_alignment/${phase}`;
test.use({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('all grass LODs can be compared at identical angles and distances', async ({ page }) => {
    test.setTimeout(300000);
    await mkdir(output, { recursive: true });
    const errors = [], rows = [];
    if (phase === 'before') for (const name of ['GrassDebugV2FarTexture.js', 'GrassDebugV2BakedLightingAssets.js', 'grass_baked_appearance.vert.glsl']) {
        const body = await readFile('tests/artifacts/screens/grass_debug_v2/wave_match/before-source/' + name, 'utf8');
        await page.route('**/' + name + '*', route => route.fulfill({ status: 200, contentType: name.endsWith('.glsl') ? 'text/plain' : 'application/javascript', body }));
    }
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/GrassDebugV2BakedLightingScene.js', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const api = Object.freeze', 'window.__alignment = { renderer, camera, sets };\nconst api = Object.freeze') });
    });
    await page.goto('/debug_tools/grass_baked_lighting_scene.html?appearance=detailed&shelter=0&strategy=baked&lod=AUTO');
    await page.evaluate(() => window.__grassBakedReadiness);
    await page.evaluate(() => {
        window.__grassBakedScene.setAnimating(false);
        for (const id of ['scene-panel', 'split-labels', 'scene-performance']) document.getElementById(id).hidden = true;
    });
    for (const pose of ['bus_20m_front', 'bus_30m_front', 'bus_40m_front', 'grazing', 'high']) for (const lod of ['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5', 'AUTO']) {
        const result = await page.evaluate(({ pose, lod }) => {
            const viewer = window.__grassBakedScene, { renderer, camera, sets } = window.__alignment;
            if (pose === 'grazing') viewer.setCamera([0, 1.4, 40], [0, .4, 0]);
            else if (pose === 'high') viewer.setCamera([0, 32, 40], [0, 0, 0]);
            else viewer.setPose(pose);
            viewer.setLod(lod); viewer.step(0);
            const gl = renderer.getContext(), { width, height } = renderer.domElement, pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const fields = sets.baked.getSnapshot().fields, point = camera.position.clone();
            const bins = [20, 30, 40, 50].map(distance => ({ distance, pixels: 0, rgb: [0, 0, 0], detail: 0 }));
            for (let y = 2; y < height - 2; y += 2) for (let x = 2; x < width - 2; x += 2) {
                point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                const t = (.07 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                const distance = Math.hypot(wx - camera.position.x, wz - camera.position.z), bin = bins.find(bin => Math.abs(distance - bin.distance) < 2);
                if (t <= 0 || !bin || !fields.some(p => wx > p.minX + .8 && wx < p.maxX - .8 && wz > p.minZ + .8 && wz < p.maxZ - .8)) continue;
                const i = (y * width + x) * 4;
                bin.pixels++; for (let c = 0; c < 3; c++) bin.rgb[c] += pixels[i + c];
                bin.detail += ((pixels[i] - pixels[i + 4]) * .2126 + (pixels[i + 1] - pixels[i + 5]) * .7152 + (pixels[i + 2] - pixels[i + 6]) * .0722) ** 2;
            }
            return { bins: bins.map(bin => ({ ...bin, rgb: bin.rgb.map(value => value / bin.pixels), detail: Math.sqrt(bin.detail / bin.pixels) })), camera: camera.position.toArray(), draw: { ...renderer.info.render } };
        }, { pose, lod });
        rows.push({ pose, lod, ...result });
        await page.locator('#scene-canvas').screenshot({ path: `${output}/${pose}-${lod}.png` });
    }
    await writeFile(`${output}/results.json`, JSON.stringify({ phase, rows, errors }, null, 2));
    expect(errors).toEqual([]);
    for (const row of rows) expect(row.camera).toEqual(rows.find(other => other.pose === row.pose).camera);
});
