// Regress full-field forced detail and the coarse-blade/canopy brightness handoff.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('fixed grass locks forced detail and shading while Auto matches its canopy', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/tests/headless/harness/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { loadGrassRuntimeAsset } = await import('/src/graphics/engine3d/grass/runtime/GrassRuntimeAsset.js');
        const { createGrassBoundaryMask } = await import('/src/graphics/engine3d/grass/runtime/GrassBoundaryMask.js');
        const { createGrassPatchRenderer } = await import('/src/graphics/engine3d/grass/runtime/GrassPatchRenderer.js');
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(640, 480); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .0511;
        const asset = await loadGrassRuntimeAsset({ renderer });
        const bounds = { minX: -8, maxX: 8, minZ: 0, maxZ: 64 };
        const coverage = createGrassBoundaryMask({ bounds, outline: [{ x: -8, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 64 }, { x: -8, z: 64 }], exclusions: [], resolution: 256 });
        const grass = createGrassPatchRenderer({ asset, coverage, bounds });
        const scene = new THREE.Scene(); scene.add(grass.group);
        const camera = new THREE.PerspectiveCamera(50, 640 / 480, .1, 200);
        camera.position.set(0, 40, 32); camera.lookAt(0, 0, 32); camera.updateMatrixWorld(true);
        const forced = [], visible = [];
        for (let level = 0; level < 5; level++) {
            grass.setMode('LOD' + level); grass.update(camera);
            forced.push(grass.getSnapshot().levels[level]);
            visible.push(grass.group.children.filter(mesh => mesh.visible && mesh.userData.grassPatchLevel === level).length);
        }
        const capture = mode => {
            grass.setMode(mode); grass.update(camera); renderer.render(scene, camera);
            const pixels = new Uint8Array(640 * 480 * 4);
            renderer.getContext().readPixels(0, 0, 640, 480, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, pixels);
            let luma = 0, count = 0, dark = 0;
            for (let y = 120; y < 360; y++) for (let x = 260; x < 380; x++) {
                const i = (y * 640 + x) * 4;
                const value = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
                luma += value; count++; if (value < 20) dark++;
            }
            return { luma: luma / count, darkFraction: dark / count, pixels, image: renderer.domElement.toDataURL('image/png') };
        };
        const distantLod2 = capture('LOD2');
        camera.position.set(0, 6, -6); camera.lookAt(0, 0, 18); camera.updateMatrixWorld(true);
        const lod4 = capture('LOD4');
        grass.material.camera.value.y += 1000;
        renderer.render(scene, camera);
        const forcedFarPixels = new Uint8Array(lod4.pixels.length), gl = renderer.getContext();
        gl.readPixels(0, 0, 640, 480, gl.RGBA, gl.UNSIGNED_BYTE, forcedFarPixels);
        let forcedShadingChangedPixels = 0;
        for (let i = 0; i < forcedFarPixels.length; i += 4) {
            if ([0, 1, 2].some(channel => forcedFarPixels[i + channel] !== lod4.pixels[i + channel])) forcedShadingChangedPixels++;
        }
        const lod5 = capture('LOD5');
        const auto = capture('AUTO');
        const point = new THREE.Vector3(); let terminalError = 0, terminalLight = 0, terminalPixels = 0;
        for (let y = 0; y < 480; y++) for (let x = 0; x < 640; x++) {
            point.set((x + .5) / 640 * 2 - 1, (y + .5) / 480 * 2 - 1, .5).unproject(camera).sub(camera.position);
            if (point.y >= 0) continue;
            point.multiplyScalar((.005 - camera.position.y) / point.y).add(camera.position);
            const distance = point.distanceTo(camera.position);
            if (Math.abs(point.x) > 6 || point.z < 0 || point.z > 64 || distance < 22.2 || distance > 23.2) continue;
            const i = (y * 640 + x) * 4;
            const luma = pixels => .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
            terminalError += Math.abs(luma(auto.pixels) - luma(lod5.pixels)); terminalLight += luma(lod5.pixels); terminalPixels++;
        }
        for (const capture of [distantLod2, lod4, lod5, auto]) delete capture.pixels;
        const restoredPool = grass.getSnapshot();
        grass.dispose(); coverage.dispose(); asset.dispose(); renderer.dispose();
        return { forced, visible, restoredPool, distantLod2, lod4, lod5, auto, forcedShadingChangedPixels,
            terminalPixels, terminalRelativeError: terminalError / terminalLight };
    });
    const output = 'tests/artifacts/screens/grass/runtime_redesign/lod_consistency';
    await mkdir(output, { recursive: true });
    for (const key of ['distantLod2', 'lod4', 'lod5', 'auto']) {
        await writeFile(`${output}/${key}.png`, Buffer.from(result[key].image.split(',')[1], 'base64'));
        delete result[key].image;
    }
    await writeFile(`${output}/measurement.json`, JSON.stringify({ result, errors }, null, 2));
    expect(result.forced.every(count => count > 0), 'Every forced blade level must render above its automatic cutoff').toBe(true);
    expect(result.visible).toEqual(result.forced);
    expect(result.restoredPool.capacityPerLevel).toEqual(result.restoredPool.autoCapacityPerLevel);
    expect(result.restoredPool.levels[4]).toBeGreaterThan(0);
    expect(result.distantLod2.darkFraction).toBeLessThan(.15);
    expect(result.forcedShadingChangedPixels, 'Forced LOD4 must ignore the automatic shading distance').toBe(0);
    expect(Math.abs(result.lod4.luma / result.lod5.luma - 1), 'Coarse blades and canopy should have comparable brightness').toBeLessThan(.10);
    expect(Math.abs(result.auto.luma / result.lod5.luma - 1), 'Automatic coarse blades and canopy should have comparable brightness').toBeLessThan(.10);
    expect(result.terminalPixels).toBeGreaterThan(100);
    expect(result.terminalRelativeError, 'Fading blades should already match the underlying canopy').toBeLessThan(.04);
    expect(errors).toEqual([]);
});
