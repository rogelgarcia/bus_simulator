// Reproduce clipped blade silhouettes and the uncovered grass/soil strip at grazing angles.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass/patch_edges';
test.use({ viewport: { width: 1440, height: 1048 }, deviceScaleFactor: 1, video: 'off' });

test('Patch boundaries keep complete eligible blades, including their overhanging tips', async ({ page }) => {
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
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(800, 800);
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .0511;
        const asset = await loadGrassRuntimeAsset({ renderer }), rows = [], captures = {};
        const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 10), gl = renderer.getContext();
        const pixels = () => { const data = new Uint8Array(800 * 800 * 4); gl.readPixels(0, 0, 800, 800, gl.RGBA, gl.UNSIGNED_BYTE, data); return data; };
        for (const [x, z] of [[0, 0], [6, 0], [8, 0], [8, 2]]) {
            const bounds = { minX: x, minZ: z, maxX: x + 2, maxZ: z + 2 };
            const outline = [{ x: x + .27, z: z + .23 }, { x: x + 1.53, z: z + .31 }, { x: x + 1.39, z: z + 1.61 }, { x: x + .36, z: z + 1.73 }];
            const coverage = createGrassBoundaryMask({ bounds, outline, exclusions: [], resolution: 1024 });
            const grass = createGrassPatchRenderer({ asset, coverage, bounds, patchSize: 2, terminalTransition: 'shorten' }); scene.add(grass.group);
            camera.position.set(x + 1, 3, z + 1); camera.up.set(0, 0, -1); camera.lookAt(x + 1, 0, z + 1); camera.updateMatrixWorld(true);
            for (let level = 0; level < 5; level++) {
                grass.setMode(`LOD${level}`); grass.update(camera); grass.surfaces.forEach(mesh => { mesh.visible = false; });
                renderer.render(scene, camera); const actual = pixels();
                const mesh = grass.group.children.find(mesh => mesh.visible && mesh.userData.grassPatchLevel === level), original = mesh.geometry;
                const ranges = level < 3 ? asset.sources[`LOD${level}`].userData.grassLeafRanges
                    : Array.from({ length: original.index.count / 6 }, (_, i) => ({ start: i * 6, count: 6 }));
                const { position, uv } = original.attributes, selected = [];
                let seed = (Math.imul(x / 2, 1597334677) ^ Math.imul(z / 2, 3812015801)) >>> 0;
                seed = Math.imul(seed ^ seed >>> 16, 2246822519) >>> 0;
                let eligible = 0, crossing = 0;
                for (const { start, count } of ranges) {
                    const vertices = new Set(Array.from(original.index.array.slice(start, start + count)));
                    const low = Math.min(...Array.from(vertices, vertex => uv.getY(vertex))), roots = [...vertices].filter(vertex => uv.getY(vertex) <= low + 1e-6);
                    let rx = roots.reduce((sum, vertex) => sum + position.getX(vertex), 0) / roots.length;
                    let rz = roots.reduce((sum, vertex) => sum + position.getZ(vertex), 0) / roots.length;
                    if (seed & 1) [rx, rz] = [-rz, rx]; if (seed & 2) { rx = -rx; rz = -rz; }
                    if (coverage.sample(x + 1 + rx, z + 1 + rz) < .5) continue;
                    eligible++;
                    if ([...vertices].some(vertex => {
                        let vx = position.getX(vertex), vz = position.getZ(vertex);
                        if (seed & 1) [vx, vz] = [-vz, vx]; if (seed & 2) { vx = -vx; vz = -vz; }
                        return coverage.sample(x + 1 + vx, z + 1 + vz) < .5;
                    })) crossing++;
                    for (let i = start; i < start + count; i++) selected.push(original.index.getX(i));
                }
                const reference = original.clone(); reference.setIndex(selected); mesh.geometry = reference;
                const enabled = renderer.properties.get(mesh.material).uniforms.grassBoundaryEnabled; enabled.value = 0;
                renderer.render(scene, camera); const expected = pixels();
                if (x === 0 && z === 0) captures[`LOD${level}-expected`] = renderer.domElement.toDataURL('image/png');
                enabled.value = 1; mesh.geometry = original; reference.dispose(); renderer.render(scene, camera);
                if (x === 0 && z === 0) captures[`LOD${level}-actual`] = renderer.domElement.toDataURL('image/png');
                let differing = 0, missing = 0;
                for (let i = 0; i < actual.length; i += 4) {
                    const delta = Math.max(...[0, 1, 2].map(c => Math.abs(actual[i + c] - expected[i + c])));
                    if (delta > 3) differing++;
                    if (actual[i] + actual[i + 1] + actual[i + 2] < 3 && expected[i] + expected[i + 1] + expected[i + 2] > 30) missing++;
                }
                rows.push({ x, z, level, seed, eligible, crossing, differing, missing });
            }
            grass.dispose(); coverage.dispose();
        }
        const glError = gl.getError(); asset.dispose(); renderer.dispose(); return { rows, captures, glError };
    });
    await mkdir(output, { recursive: true });
    for (const [name, image] of Object.entries(result.captures)) await writeFile(`${output}/${name}.png`, Buffer.from(image.split(',')[1], 'base64'));
    delete result.captures; await writeFile(`${output}/silhouette.json`, JSON.stringify({ result, errors }, null, 2));
    expect(result.rows.every(row => row.crossing > 5)).toBe(true);
    expect(result.rows.filter(row => row.differing > 20), 'GPU boundary must match complete leaves selected by their roots').toEqual([]);
    expect(result.glError).toBe(0); expect(errors).toEqual([]);
});

test('Grass and soil form a continuous surface at the close field edge', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__grassTestView = view;\nlet copyFeedbackTimer;') });
    });
    await page.goto('/debug_tools/grass_debug_v2.html?grass=patches&handoff=shorten');
    await page.waitForFunction(() => !!window.__grassDebugV2); await page.evaluate(() => window.__grassDebugV2.readiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), view = window.__grassTestView, { renderer, camera, grass } = view;
        renderer.setAnimationLoop(null); view.controls.enabled = false; view.keyboard.clear();
        const field = grass.getSnapshot().placement, soil = view.content.land.ground, captures = {}, rows = [];
        camera.position.set(field.maxX + .15, .055, field.minZ + 1.3); camera.lookAt(field.maxX - .1, .025, field.minZ - 1); camera.updateMatrixWorld(true);
        view.render(performance.now()); captures.lab = renderer.domElement.toDataURL('image/png');
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xff00ff);
        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide });
        const sourceSurface = grass.group.children.find(mesh => mesh.userData.grassCanopy).material;
        const grassMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, toneMapped: false, side: THREE.DoubleSide,
            polygonOffset: sourceSurface.polygonOffset, polygonOffsetFactor: sourceSurface.polygonOffsetFactor, polygonOffsetUnits: sourceSurface.polygonOffsetUnits });
        grass.coverage.bind(groundMaterial, { inverse: true }); grass.coverage.bind(grassMaterial);
        const ground = soil.clone(); ground.material = groundMaterial; scene.add(ground);
        const surfaces = grass.group.children.filter(mesh => mesh.userData.grassCanopy).map(mesh => { const clone = mesh.clone(); clone.material = grassMaterial; scene.add(clone); return clone; });
        const surfaceHeights = surfaces.map(mesh => mesh.position.y);
        const width = renderer.domElement.width, height = renderer.domElement.height, gl = renderer.getContext(), point = new THREE.Vector3();
        const probes = [
            { name: 'right', position: [field.maxX + .15, .055, field.minZ + 1.3], target: [field.maxX - .1, .025, field.minZ - 1], axis: 'x', edge: field.maxX },
            { name: 'left', position: [field.minX - .15, .055, field.minZ + 1.3], target: [field.minX + .1, .025, field.minZ - 1], axis: 'x', edge: field.minX },
            { name: 'front', position: [field.minX + 1.3, .055, field.minZ - .15], target: [field.minX - 1, .025, field.minZ + .1], axis: 'z', edge: field.minZ },
            { name: 'back', position: [field.minX + 1.3, .055, field.maxZ + .15], target: [field.minX - 1, .025, field.maxZ - .1], axis: 'z', edge: field.maxZ }
        ];
        for (const probe of probes) {
            camera.position.fromArray(probe.position); camera.lookAt(...probe.target); camera.updateMatrixWorld(true);
            view.render(performance.now()); captures[probe.name + '-lab'] = renderer.domElement.toDataURL('image/png');
            const mask = new Uint8Array(width * height);
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, .5).unproject(camera).sub(camera.position);
                if (point.y >= 0) continue; point.multiplyScalar(-camera.position.y / point.y).add(camera.position);
                const along = probe.axis === 'x' ? point.z - field.minZ : point.x - field.minX;
                if (Math.abs(point[probe.axis] - probe.edge) < .2 && along > .15 && along < 1.15) mask[y * width + x] = 1;
            }
            for (const [name, lift] of [['current', 0], ['raised-control', .005]]) {
                surfaces.forEach((mesh, index) => { mesh.position.y = surfaceHeights[index] + lift; mesh.updateMatrix(); });
                renderer.render(scene, camera); const pixels = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                let holes = 0, checked = 0;
                for (let i = 0; i < mask.length; i++) if (mask[i]) { checked++; if (pixels[i * 4 + 2] > 100 && pixels[i * 4 + 1] < 100) holes++; }
                rows.push({ side: probe.name, name, holes, checked }); captures[probe.name + '-' + name] = renderer.domElement.toDataURL('image/png');
            }
        }
        const glError = gl.getError(); groundMaterial.dispose(); grassMaterial.dispose();
        return { rows, captures, field, camera: { position: camera.position.toArray(), rotation: camera.rotation.toArray() }, glError };
    });
    await mkdir(output, { recursive: true });
    for (const [name, image] of Object.entries(result.captures)) await writeFile(`${output}/edge-${name}.png`, Buffer.from(image.split(',')[1], 'base64'));
    delete result.captures; await writeFile(`${output}/ground.json`, JSON.stringify({ result, errors }, null, 2));
    for (const row of result.rows.filter(row => row.name === 'current')) {
        expect(row.checked).toBeGreaterThan(1000);
        expect(row.holes, `${row.side}: the real ground geometry must not reveal background through the edge`).toBe(0);
    }
    expect(result.rows.filter(row => row.name === 'raised-control').every(row => row.holes > 1000), 'The grazing fixture must detect an uncovered raised floor').toBe(true);
    expect(result.glError).toBe(0); expect(errors).toEqual([]);
});
