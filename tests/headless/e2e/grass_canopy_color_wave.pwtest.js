// Track ground-fixed color while driving through the reported terminal transition.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const phase = process.env.GRASS_WAVE_PHASE || 'after';
const output = 'tests/artifacts/screens/grass_debug_v2/canopy_color_wave/' + phase;
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    ...(process.platform === 'win32' ? { launchOptions: { args: ['--use-angle=d3d11'] } } : {}) });

test('forward camera motion keeps the terminal canopy color stable', async ({ page }) => {
    test.setTimeout(180000);
    const errors = [], results = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await mkdir(output, { recursive: true });
    if (process.env.GRASS_WAVE_ISOLATE === 'view') await page.route('**/baked_canopy.glsl*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace(/return mix\(vec3\(0\.80[\s\S]*?;\n/, 'return vec3(0.76, 0.83, 0.70);\n') });
    });
    if (process.env.GRASS_WAVE_ISOLATE === 'mips') await page.route('**/GrassDebugV2FarTexture.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('coarseGain: 1.58', 'coarseGain: 1') });
    });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__waveView = view;\nlet copyFeedbackTimer;') });
    });
    await page.route('**/GrassDebugV2DistanceGrass.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const settings = selection.getSnapshot();', 'window.__waveFields = { fields, selection };\nconst settings = selection.getSnapshot();') });
    });
    await page.goto('/debug_tools/grass_debug_v2.html?grass=baked');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    const mipStats = await page.evaluate(() => {
        const rows = [], seen = new Set();
        window.__waveFields.fields.group.traverse(mesh => {
            const map = mesh.material?.userData.grassCanopyHandoff?.maps[0];
            if (!map || seen.has(map)) return; seen.add(map);
            for (const [level, mip] of map.mipmaps.entries()) {
                const mean = [0, 0, 0], sqrt = [0, 0, 0];
                for (let i = 0; i < mip.data.length; i += 4) for (let c = 0; c < 3; c++) {
                    mean[c] += mip.data[i + c] / (mip.width * mip.height);
                    sqrt[c] += Math.sqrt(mip.data[i + c] / 255) / (mip.width * mip.height);
                }
                rows.push({ level, mean, sqrt });
            }
        });
        return rows;
    });
    await page.evaluate(async () => {
        const THREE = await import('three'), view = window.__waveView;
        view.renderer.setAnimationLoop(null);
        view.camera.position.set(-2.4, 6.883, -12.934);
        view.camera.rotation.set(THREE.MathUtils.degToRad(-19.206), Math.PI, 0, 'YXZ');
    });
    for (const z of [-20.934, -18.934, -16.934, -14.934, -12.934, -10.934, -8.934, -6.934]) {
        for (const mode of ['LOD3', 'LOD4', 'LOD5', 'AUTO']) {
            const result = await page.evaluate(({ z, mode }) => {
                const view = window.__waveView, { camera, renderer } = view;
                camera.position.z = z; camera.updateMatrixWorld(true);
                view.grass.setMode(mode); view.grass.update(camera.position, performance.now(), true); view.lighting.render(0);
                const gl = renderer.getContext(), { width, height } = renderer.domElement, pixels = new Uint8Array(width * height * 4);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const bins = Array.from({ length: 14 }, (_, i) => ({ distance: 23 + i * 2, count: 0, sum: [0, 0, 0] }));
                const patch = { count: 0, sum: [0, 0, 0] }, point = camera.position.clone();
                const placements = view.grass.getSnapshot().placements;
                for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                    point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                    const t = (.1 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                    if (t <= 0 || wx < 7.5 || wx > 13 || !placements.some(p => wx > p.minX + .5 && wx < p.maxX - .5 && wz > p.minZ + .5 && wz < p.maxZ - .5)) continue;
                    const range = Math.hypot(wx - camera.position.x, wz - camera.position.z), bin = bins.find(b => Math.abs(b.distance - range) < 1);
                    const i = (y * width + x) * 4;
                    if (bin) { bin.count++; for (let c = 0; c < 3; c++) bin.sum[c] += pixels[i + c]; }
                    if (wz >= 20 && wz <= 26) { patch.count++; for (let c = 0; c < 3; c++) patch.sum[c] += pixels[i + c]; }
                }
                const finish = b => ({ ...b, rgb: b.sum.map(v => v / b.count), luma: (b.sum[0] * .2126 + b.sum[1] * .7152 + b.sum[2] * .0722) / b.count });
                return { z, mode, bins: bins.map(finish), patch: finish(patch) };
            }, { z, mode });
            results.push(result);
            if (z === -12.934 || mode === 'AUTO') await page.locator('#game-canvas').screenshot({ path: `${output}/${mode}-${z}.png` });
        }
    }
    await writeFile(`${output}/results.json`, JSON.stringify({ results, mipStats, errors }, null, 2));
    expect(errors).toEqual([]);
    for (const row of results) expect(row.patch.count).toBeGreaterThan(100);
    if (phase === 'after') {
        const color = results.filter(row => row.mode === 'LOD5').map(row => row.patch.luma);
        // Match the blades' gradual root-to-tip view change, without a localized mip wave.
        expect(Math.max(...color) - Math.min(...color), 'fixed ground patch brightness during the 14 m drive').toBeLessThan(6);
        expect(Math.max(...color.slice(1).map((v, i) => Math.abs(v - color[i]))), 'no brightness jump between 2 m steps').toBeLessThan(1.5);
        const row = results.find(row => row.mode === 'LOD5' && row.z === -12.934);
        const blades = results.find(row => row.mode === 'LOD4' && row.z === -12.934);
        for (const bin of row.bins.filter(bin => bin.distance >= 31 && bin.distance <= 39)) {
            const near = blades.bins.find(other => other.distance === bin.distance);
            expect(Math.abs(bin.luma - near.luma), `endpoint brightness at ${bin.distance} m`).toBeLessThan(4);
        }
        const far = row.bins.filter(bin => bin.distance >= 41).map(bin => bin.luma);
        expect(far.reduce((sum, value) => sum + value, 0) / far.length, 'retain the calibrated far palette').toBeGreaterThan(124);
    }
});
