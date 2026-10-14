// Detect a bright annulus caused by combining sinking leaf tips with the distant canopy.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

for (const transition of ['rise', 'trim']) test(`${transition}: grass stays within the brightness envelope of its two endpoint LODs`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/tests/headless/harness/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async transition => {
        const THREE = await import('three');
        const { loadGrassRuntimeAsset } = await import('/src/graphics/engine3d/grass/runtime/GrassRuntimeAsset.js');
        const { createGrassPatchRenderer } = await import('/src/graphics/engine3d/grass/runtime/GrassPatchRenderer.js');
        const { createGrassBoundaryMask } = await import('/src/graphics/engine3d/grass/runtime/GrassBoundaryMask.js');
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(960, 640); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .0511;
        const asset = await loadGrassRuntimeAsset({ renderer }), bounds = { minX: -16, maxX: 16, minZ: -8, maxZ: 64 };
        const coverage = createGrassBoundaryMask({ bounds, outline: [{ x: -16, z: -8 }, { x: 16, z: -8 }, { x: 16, z: 64 }, { x: -16, z: 64 }], exclusions: [], resolution: 256 });
        const grass = createGrassPatchRenderer({ asset, coverage, bounds, terminalTransition: transition });
        const scene = new THREE.Scene(); scene.add(grass.group);
        const camera = new THREE.PerspectiveCamera(55, 1.5, .1, 150), gl = renderer.getContext(), captures = {}, poses = [];
        for (const [name, height, originZ, tilt] of [['bus', 6.883, -8, .34836], ['close', 4.5, -8, .5], ['forward', 6.883, 4, .34836]]) {
            camera.position.set(0, height, originZ); camera.lookAt(0, height - tilt * 20, originZ + 20); camera.updateMatrixWorld(true);
            const pixels = {};
            for (const mode of ['LOD4', 'LOD5', 'AUTO']) {
                grass.setMode(mode); grass.update(camera); renderer.render(scene, camera);
                pixels[mode] = new Uint8Array(960 * 640 * 4); gl.readPixels(0, 0, 960, 640, gl.RGBA, gl.UNSIGNED_BYTE, pixels[mode]);
                captures[name + '-' + mode] = renderer.domElement.toDataURL('image/png');
            }
            const bins = Array.from({ length: 10 }, (_, i) => ({ start: 10 + i * 2, count: 0, LOD4: 0, LOD5: 0, AUTO: 0 }));
            const point = new THREE.Vector3();
            for (let y = 0; y < 640; y++) for (let x = 0; x < 960; x++) {
                point.set((x + .5) / 960 * 2 - 1, (y + .5) / 640 * 2 - 1, .5).unproject(camera).sub(camera.position);
                if (point.y >= 0) continue;
                point.multiplyScalar((.005 - camera.position.y) / point.y).add(camera.position);
                const distance = point.distanceTo(camera.position), bin = bins[Math.floor((distance - 10) / 2)];
                if (!bin || Math.abs(point.x) > 6 || point.z < -6 || point.z > 62) continue;
                const i = (y * 960 + x) * 4; bin.count++;
                for (const mode of Object.keys(pixels)) bin[mode] += .2126 * pixels[mode][i] + .7152 * pixels[mode][i + 1] + .0722 * pixels[mode][i + 2];
            }
            for (const bin of bins) {
                for (const mode of Object.keys(pixels)) bin[mode] /= bin.count;
                bin.overshoot = bin.AUTO / Math.max(bin.LOD4, bin.LOD5) - 1;
                bin.undershoot = 1 - bin.AUTO / Math.min(bin.LOD4, bin.LOD5);
            }
            poses.push({ name, bins });
        }
        const result = { poses, captures, glError: gl.getError() };
        grass.dispose(); coverage.dispose(); asset.dispose(); renderer.dispose(); return result;
    }, transition);
    const output = 'tests/artifacts/screens/grass/lod4_rise_transition/brightness/' + transition;
    await mkdir(output, { recursive: true });
    for (const [name, image] of Object.entries(result.captures)) await writeFile(`${output}/${name}.png`, Buffer.from(image.split(',')[1], 'base64'));
    delete result.captures;
    await writeFile(`${output}/measurement.json`, JSON.stringify({ result, errors }, null, 2));
    for (const pose of result.poses) for (const bin of pose.bins.filter(bin => bin.start >= 16 && bin.start < 24)) {
        expect(bin.count).toBeGreaterThan(100);
        expect(bin.overshoot, `${pose.name}: ${bin.start}–${bin.start + 2} m must not exceed both endpoint LODs`).toBeLessThan(.05);
        expect(bin.undershoot, `${pose.name}: ${bin.start}–${bin.start + 2} m must not introduce a dark ring`).toBeLessThan(.08);
    }
    expect(result.glError).toBe(0); expect(errors).toEqual([]);
});
