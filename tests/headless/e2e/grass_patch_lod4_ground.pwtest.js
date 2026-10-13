// Compare sparse LOD4 over its leaf-filled ground with LOD3 and an unfilled ground control.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('LOD4 ground adds bright leaf detail without increasing geometry or flattening the soil', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/tests/headless/harness/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto('/tests/headless/harness/index.html');
    const results = await page.evaluate(async () => {
        const THREE = await import('three');
        const { loadGrassRuntimeAsset } = await import('/src/graphics/engine3d/grass/runtime/GrassRuntimeAsset.js');
        const { createGrassBoundaryMask } = await import('/src/graphics/engine3d/grass/runtime/GrassBoundaryMask.js');
        const { createGrassPatchRenderer } = await import('/src/graphics/engine3d/grass/runtime/GrassPatchRenderer.js');
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        const width = 960, height = 640;
        renderer.setSize(width, height); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .0511;
        const asset = await loadGrassRuntimeAsset({ renderer });
        const bounds = { minX: -8, maxX: 8, minZ: 0, maxZ: 40 };
        const coverage = createGrassBoundaryMask({ bounds, outline: [{ x: -8, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 40 }, { x: -8, z: 40 }], exclusions: [], resolution: 256 });
        const grass = createGrassPatchRenderer({ asset, coverage, bounds }), scene = new THREE.Scene(); scene.add(grass.group);
        const camera = new THREE.PerspectiveCamera(50, width / height, .1, 150), gl = renderer.getContext();
        const capture = (mode, groundOnly = false, unfilled = false) => {
            grass.setMode(mode); grass.update(camera);
            if (groundOnly) grass.group.children.forEach(mesh => { if (mesh.userData.grassPatchLevel !== undefined) mesh.visible = false; });
            if (unfilled) grass.material.mode.value = 3;
            renderer.render(scene, camera);
            const pixels = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return { pixels, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls,
                textures: renderer.info.memory.textures, image: renderer.domElement.toDataURL('image/png') };
        };
        const results = [], point = new THREE.Vector3();
        const luma = (pixels, i) => .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
        for (const [pose, position, target] of [['oblique', [8, 9, -8], [0, 0, 13]], ['bus', [0, 4.5, -6], [0, 0, 13]]]) {
            camera.position.fromArray(position); camera.lookAt(...target); camera.updateMatrixWorld(true);
            const lod3 = capture('LOD3'), bare = capture('LOD4', false, true), lod4 = capture('LOD4');
            const floorBare = capture('LOD4', true, true), floor = capture('LOD4', true);
            let count = 0, referenceLight = 0, bareLight = 0, filledLight = 0, bareDark = 0, filledDark = 0;
            let brighter = 0, unchanged = 0, darkened = 0, fullChanged = 0;
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, .5).unproject(camera).sub(camera.position);
                if (point.y >= 0) continue;
                point.multiplyScalar((.005 - camera.position.y) / point.y).add(camera.position);
                if (Math.abs(point.x) > 6 || point.z < 2 || point.z > 30) continue;
                const i = (y * width + x) * 4, reference = luma(lod3.pixels, i), old = luma(bare.pixels, i), filled = luma(lod4.pixels, i);
                const groundDelta = luma(floor.pixels, i) - luma(floorBare.pixels, i);
                count++; referenceLight += reference; bareLight += old; filledLight += filled;
                if (old < 55) bareDark++; if (filled < 55) filledDark++;
                if (groundDelta > 3) brighter++; if (Math.abs(groundDelta) < 1) unchanged++; if (groundDelta < -1) darkened++;
                if (filled - old > 2) fullChanged++;
            }
            for (const capture of [lod3, bare, lod4, floorBare, floor]) delete capture.pixels;
            results.push({ pose, count, referenceMean: referenceLight / count, bareMean: bareLight / count, filledMean: filledLight / count,
                bareDark, filledDark, brighter, unchanged, darkened, fullChanged, captures: { lod3, bare, lod4, floorBare, floor } });
        }
        grass.dispose(); coverage.dispose(); asset.dispose(); renderer.dispose(); return results;
    });
    const output = 'tests/artifacts/screens/grass/runtime_redesign/lod4_ground';
    await mkdir(output, { recursive: true });
    for (const row of results) for (const [name, capture] of Object.entries(row.captures)) {
        await writeFile(`${output}/${row.pose}-${name}.png`, Buffer.from(capture.image.split(',')[1], 'base64')); delete capture.image;
    }
    await writeFile(`${output}/measurement.json`, JSON.stringify({ results, errors }, null, 2));
    for (const row of results) {
        expect(row.count).toBeGreaterThan(10000);
        expect(row.brighter / row.count, row.pose + ': visible leaf detail in the ground').toBeGreaterThan(.1);
        expect(row.unchanged / row.count, row.pose + ': retain dark soil between leaves').toBeGreaterThan(.1);
        expect(row.darkened).toBe(0);
        expect(row.fullChanged).toBeGreaterThan(500);
        expect(Math.abs(row.filledMean - row.referenceMean), row.pose + ': closer to LOD3 brightness').toBeLessThan(Math.abs(row.bareMean - row.referenceMean));
        expect(row.filledDark).toBeLessThan(row.bareDark);
        expect(row.captures.lod4.triangles).toBe(row.captures.bare.triangles);
        expect(row.captures.lod4.calls).toBe(row.captures.bare.calls);
        expect(row.captures.lod4.textures).toBe(row.captures.bare.textures);
        expect(row.captures.lod4.triangles).toBeLessThan(row.captures.lod3.triangles);
    }
    expect(errors).toEqual([]);
});
