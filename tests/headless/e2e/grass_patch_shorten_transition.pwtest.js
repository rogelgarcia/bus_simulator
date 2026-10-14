// Validate the selected height profile on camera poses and forward samples outside the calibration set.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('Shortened grass avoids bright and dark bands across angles and forward patch crossings', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/tests/headless/harness/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { loadGrassRuntimeAsset } = await import('/src/graphics/engine3d/grass/runtime/GrassRuntimeAsset.js');
        const { createGrassPatchRenderer } = await import('/src/graphics/engine3d/grass/runtime/GrassPatchRenderer.js');
        const { createGrassBoundaryMask } = await import('/src/graphics/engine3d/grass/runtime/GrassBoundaryMask.js');
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        const width = 960, height = 640; renderer.setSize(width, height);
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .0511;
        const asset = await loadGrassRuntimeAsset({ renderer }), bounds = { minX: -48, maxX: 48, minZ: -48, maxZ: 72 };
        const coverage = createGrassBoundaryMask({ bounds, outline: [{ x: -48, z: -48 }, { x: 48, z: -48 }, { x: 48, z: 72 }, { x: -48, z: 72 }], exclusions: [], resolution: 256 });
        const grass = createGrassPatchRenderer({ asset, coverage, bounds, terminalTransition: 'shorten' }), scene = new THREE.Scene(); scene.add(grass.group);
        const [, , , transitionStart, transitionEnd] = grass.getSnapshot().distances, binWidth = (transitionEnd - transitionStart) / 16;
        const camera = new THREE.PerspectiveCamera(55, width / height, .1, 150), gl = renderer.getContext(), poses = [], measurements = [];
        for (const h of [3.5, 6.883, 9, 10.654]) for (let a = 0; a < 8; a++) poses.push({ name: `height-${h}-angle-${a}`, h, x: .37, z: -.71, yaw: a * Math.PI / 4 + .19 });
        for (let i = 0; i <= 32; i++) poses.push({ name: `forward-${i}`, h: 6.883, x: 1.31, z: -9.37 + i * .75, yaw: .07 });
        poses.push({ name: 'reported-bus', h: 6.883, x: -12.668, z: -1.296, yaw: 0 }, { name: 'reported-high', h: 10.654, x: -12.668, z: 34.478, yaw: 0 });
        poses.push({ name: 'reported-reach', h: 6.883, x: -12.934, z: -9.561, yaw: 0 });
        for (const h of [4.75, 8.25, 12]) for (let a = 0; a < 8; a++) poses.push({ name: `holdout-${h}-angle-${a}`, h, x: -5.83, z: 7.21, yaw: a * Math.PI / 4 + .48, slope: .45 });
        for (const pose of poses) {
            camera.position.set(pose.x, pose.h, pose.z); camera.lookAt(pose.x + Math.sin(pose.yaw) * 20, pose.h - (pose.slope ?? .34836) * 20, pose.z + Math.cos(pose.yaw) * 20); camera.updateMatrixWorld(true);
            const pixels = {};
            for (const mode of ['LOD4', 'LOD5', 'AUTO']) {
                grass.setMode(mode); grass.update(camera); renderer.render(scene, camera);
                pixels[mode] = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels[mode]);
            }
            const bins = Array.from({ length: 16 }, (_, i) => ({ distance: transitionStart + i * binWidth, count: 0, LOD4: 0, LOD5: 0, AUTO: 0 }));
            const point = new THREE.Vector3();
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, .5).unproject(camera).sub(camera.position);
                if (point.y >= 0) continue;
                point.multiplyScalar(-camera.position.y / point.y).add(camera.position);
                const distance = point.distanceTo(camera.position), bin = bins[Math.floor((distance - transitionStart) / binWidth)];
                const side = (point.x - pose.x) * Math.cos(pose.yaw) - (point.z - pose.z) * Math.sin(pose.yaw);
                if (!bin || Math.abs(side) > 6) continue;
                const i = (y * width + x) * 4; bin.count++;
                for (const mode of Object.keys(pixels)) bin[mode] += .2126 * pixels[mode][i] + .7152 * pixels[mode][i + 1] + .0722 * pixels[mode][i + 2];
            }
            for (const bin of bins) {
                for (const mode of Object.keys(pixels)) bin[mode] /= bin.count;
                bin.overshoot = bin.AUTO / Math.max(bin.LOD4, bin.LOD5) - 1;
                bin.undershoot = 1 - bin.AUTO / Math.min(bin.LOD4, bin.LOD5);
            }
            measurements.push({ ...pose, bins });
        }
        const result = { measurements, glError: gl.getError(), snapshot: grass.getSnapshot() };
        grass.dispose(); coverage.dispose(); asset.dispose(); renderer.dispose(); return result;
    });
    const output = 'tests/artifacts/screens/grass/transition_calibration';
    await mkdir(output, { recursive: true }); await writeFile(`${output}/holdout.json`, JSON.stringify({ result, errors }, null, 2));
    for (const pose of result.measurements) for (const bin of pose.bins) {
        expect(bin.count, `${pose.name} at ${bin.distance} m: visible samples`).toBeGreaterThan(100);
        expect(bin.overshoot, `${pose.name} at ${bin.distance} m: bright band`).toBeLessThan(.05);
        expect(bin.undershoot, `${pose.name} at ${bin.distance} m: dark band`).toBeLessThan(.05);
    }
    expect(result.glError).toBe(0); expect(errors).toEqual([]);
});
