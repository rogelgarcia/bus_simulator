// Compare endpoint colors and highlight distributions at the reported camera pose.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const phase = process.env.GRASS_PALETTE_PHASE || 'after';
const output = `tests/artifacts/screens/grass_debug_v2/canopy_palette/${phase}`;
test.use({ viewport: process.env.GRASS_PALETTE_UHD ? { width: 3818, height: 1716 } : { width: 2048, height: 960 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    ...(process.platform === 'win32' ? { launchOptions: { args: ['--use-angle=d3d11'] } } : {}) });

test('canopy and blades retain similar colors at their handoff distance', async ({ page }) => {
    test.setTimeout(180000);
    const errors = [], results = [];
    await mkdir(output, { recursive: true });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__paletteView = view;\nlet copyFeedbackTimer;') });
    });
    await page.goto('/debug_tools/grass_debug_v2.html?grass=baked');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    await page.evaluate(() => window.__paletteView.renderer.setAnimationLoop(null));
    const poses = [{ name: 'reported', y: 6.883, pitch: -19.206 }, { name: 'high', y: 15.855, pitch: -25.421 }, { name: 'grazing', y: 2.5, pitch: -6 }];
    for (const pose of poses) for (const mode of ['LOD2', 'LOD3', 'LOD4', 'LOD5', 'AUTO']) {
        const result = await page.evaluate(async ({ pose, mode }) => {
            const THREE = await import('three'), view = window.__paletteView, { camera, renderer } = view;
            camera.position.set(-2.4, pose.y, 7.66);
            camera.rotation.set(THREE.MathUtils.degToRad(pose.pitch), Math.PI, 0, 'YXZ'); camera.updateMatrixWorld(true);
            view.grass.setMode(mode); view.grass.update(camera.position, performance.now(), true); view.lighting.render(0);
            const gl = renderer.getContext(), { width, height } = renderer.domElement, pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const bins = Array.from({ length: 18 }, (_, i) => ({ distance: 19 + i * 2, count: 0, sum: [0, 0, 0], lumas: [], detail: 0 }));
            const point = camera.position.clone(), placements = view.grass.getSnapshot().placements;
            for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
                point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                const t = (.1 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                if (t <= 0 || wx < 7.5 || wx > 13 || !placements.some(p => wx > p.minX + .6 && wx < p.maxX - .6 && wz > p.minZ + .6 && wz < p.maxZ - .6)) continue;
                const distance = Math.hypot(wx - camera.position.x, wz - camera.position.z), bin = bins.find(b => Math.abs(b.distance - distance) < 1);
                if (!bin) continue;
                const i = (y * width + x) * 4, luma = pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
                bin.count++; bin.lumas.push(luma); for (let c = 0; c < 3; c++) bin.sum[c] += pixels[i + c];
                bin.detail += (luma - (pixels[i + 4] * .2126 + pixels[i + 5] * .7152 + pixels[i + 6] * .0722)) ** 2;
            }
            return { pose, mode, bins: bins.map(({ lumas, ...bin }) => {
                lumas.sort((a, b) => a - b);
                return { ...bin, rgb: bin.sum.map(v => v / bin.count), luma: lumas.reduce((s, v) => s + v, 0) / bin.count,
                    quantiles: [.1, .5, .9, .99].map(q => lumas[Math.floor((lumas.length - 1) * q)]), detail: Math.sqrt(bin.detail / bin.count) };
            }) };
        }, { pose, mode });
        results.push(result);
        await page.locator('#game-canvas').screenshot({ path: `${output}/${pose.name}-${mode}.png` });
    }
    await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
    expect(errors).toEqual([]);
    for (const row of results) expect(row.bins.filter(b => b.count > 100).length).toBeGreaterThan(8);
    if (phase === 'after' || phase === 'uhd-after') for (const pose of poses) {
        const blades = results.find(r => r.pose.name === pose.name && r.mode === 'LOD4');
        const canopy = results.find(r => r.pose.name === pose.name && r.mode === 'LOD5');
        for (const bin of blades.bins.filter(b => b.distance >= 31 && b.distance <= 39)) {
            const far = canopy.bins.find(b => b.distance === bin.distance);
            for (let c = 0; c < 3; c++) expect(Math.abs(far.rgb[c] - bin.rgb[c]), `${pose.name}, ${bin.distance} m, channel ${c}`).toBeLessThan(6);
        }
        if (pose.name === 'reported') for (const bin of canopy.bins.filter(b => b.distance >= 19 && b.distance <= 31)) {
            const near = blades.bins.find(b => b.distance === bin.distance);
            expect(bin.quantiles[3] - near.quantiles[3], `pale highlight excess at ${bin.distance} m`).toBeLessThan(10);
        }
    }
});
