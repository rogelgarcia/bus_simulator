// Compare each sparse ring projection with the exact selected live leaves under identical lighting.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Experimental ring retains source leaf colors in sunward and opposite views', async ({ page }) => {
    test.setTimeout(180000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/sparse_lower_ring/color');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy, r = s.comparison.ringPatch;
        const { createGrassDebugV2FloorMaterial } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2FloorMaterial.js');
        const { registerMaterialShaderHook } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        s.setMode('refined'); s.lighting.render(0);
        const renderer = s.renderer, bake = r.bakes[0], snapshot = bake.getSnapshot();
        const source = s.patch.representations.refined.group.children.filter(mesh => mesh.isInstancedMesh);
        const fixture = new THREE.Scene();
        fixture.environment = s.scene.environment;
        fixture.environmentIntensity = s.scene.environmentIntensity;
        fixture.environmentRotation.copy(s.scene.environmentRotation);
        const sun = s.lighting.sun.clone(); sun.castShadow = false;
        sun.position.copy(s.lighting.sunRef.direction).multiplyScalar(2); sun.target.position.set(0, 0, 0);
        const hemi = s.lighting.hemi.clone();
        fixture.add(sun, sun.target, hemi);
        const width = 2048, height = 256, target = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType, colorSpace: THREE.NoColorSpace });
        const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
            toneMapping: renderer.toneMapping, autoClear: renderer.autoClear, shadows: renderer.shadowMap.enabled,
            viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest() };
        const rows = [], matrix = new THREE.Matrix4();
        const render = (object, camera) => {
            fixture.add(object); renderer.setRenderTarget(target); renderer.setClearColor(0, 0); renderer.clear();
            renderer.render(fixture, camera); renderer.setRenderTarget(null); fixture.remove(object);
            const encoded = new Uint16Array(width * height * 4);
            renderer.readRenderTargetPixels(target, 0, 0, width, height, encoded);
            return Float32Array.from(encoded, value => THREE.DataUtils.fromHalfFloat(value) * 255);
        };
        try {
            renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = true; renderer.shadowMap.enabled = false; renderer.setScissorTest(false);
            for (const view of bake.views) {
                const candidates = [];
                for (const original of source) for (let index = 0; index < original.count; index++) {
                    original.getMatrixAt(index, matrix);
                    const radial = matrix.elements[12] * view.outward.x + matrix.elements[14] * view.outward.z;
                    const along = matrix.elements[12] * view.outward.z - matrix.elements[14] * view.outward.x;
                    if (radial > bake.halfBottom - snapshot.stripDepth && radial <= bake.halfBottom && Math.abs(along) <= bake.halfBottom)
                        candidates.push({ original, transform: matrix.clone() });
                }
                const selected = new Map(source.map(original => [original, []]));
                const retained = Math.round(candidates.length * snapshot.leafFraction);
                for (let i = 0; i < retained; i++) {
                    const leaf = candidates[Math.floor((i + 0.5) * candidates.length / retained)];
                    selected.get(leaf.original).push(leaf.transform);
                }
                const live = new THREE.Group();
                for (const [original, transforms] of selected) if (transforms.length) {
                    const mesh = new THREE.InstancedMesh(original.geometry, original.material, transforms.length);
                    transforms.forEach((transform, index) => mesh.setMatrixAt(index, transform));
                    mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; live.add(mesh);
                }
                const camera = new THREE.OrthographicCamera(-bake.captureHalfWidth, bake.captureHalfWidth,
                    r.getSnapshot().sourceHeight / 2, -r.getSnapshot().sourceHeight / 2, 0.01, 5);
                camera.position.copy(view.position).addScaledVector(view.outward, 2); camera.lookAt(view.position); camera.updateMatrixWorld(true);
                const geometry = new THREE.PlaneGeometry(bake.captureHalfWidth * 2, r.getSnapshot().sourceHeight);
                const actualMaterial = r.rings.find(mesh => mesh.userData.ringSide === view.id && mesh.userData.ringSegment === 0).material;
                const frame = renderer.properties.get(actualMaterial).uniforms.grassFloorCaptureToCard.value, savedFrame = frame.clone();
                frame.identity();
                const card = new THREE.Mesh(geometry, actualMaterial);
                card.position.copy(view.position); card.quaternion.copy(view.quaternion);
                const rawMaterial = createGrassDebugV2FloorMaterial(view.textures);
                rawMaterial.envMap = actualMaterial.envMap;
                rawMaterial.envMapIntensity = actualMaterial.envMapIntensity;
                rawMaterial.alphaTest = actualMaterial.alphaTest; rawMaterial.alphaToCoverage = actualMaterial.alphaToCoverage;
                registerMaterialShaderHook(rawMaterial, { id: 'test.ring.visibility', priority: 200, variantKey: 'raw-leaf-visibility',
                    apply: shader => { shader.fragmentShader = shader.fragmentShader.replace('vec3 previousDiffuse = reflectedLight.directDiffuse;',
                        'leafVisibility = 1.0;\n    vec3 previousDiffuse = reflectedLight.directDiffuse;'); } });
                try {
                    const pixels = { live: render(live, camera), ring: render(card, camera) };
                    card.material = rawMaterial; pixels.unattenuated = render(card, camera);
                    const means = { live: [0, 0, 0], ring: [0, 0, 0], unattenuated: [0, 0, 0] };
                    let count = 0;
                    for (let i = 0; i < pixels.live.length; i += 4) {
                        if (!Object.values(pixels).every(data => data[i + 3] > 250 && data[i + 1] > data[i] * 1.25 && data[i + 1] > data[i + 2] * 1.25)) continue;
                        count++;
                        for (const [name, data] of Object.entries(pixels)) for (let c = 0; c < 3; c++) means[name][c] += data[i + c];
                    }
                    for (const values of Object.values(means)) for (let c = 0; c < 3; c++) values[c] /= count;
                    rows.push({ side: view.id, lightAlignment: view.outward.dot(s.lighting.sunRef.direction), selectedLeaves: retained, count, means,
                        ringGreenRatio: means.ring[1] / means.live[1], unattenuatedGreenRatio: means.unattenuated[1] / means.live[1] });
                } finally { frame.copy(savedFrame); geometry.dispose(); rawMaterial.dispose(); live.children.forEach(mesh => mesh.dispose()); }
            }
        } finally {
            renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor);
            renderer.setScissorTest(previous.scissorTest); renderer.setClearColor(previous.color, previous.alpha);
            renderer.toneMapping = previous.toneMapping; renderer.autoClear = previous.autoClear; renderer.shadowMap.enabled = previous.shadows; target.dispose();
        }
        return { lighting: s.lighting.getSnapshot(), target: 'linear HDR half-float', rows };
    });
    await writeFile(path.join(folder, 'matched-strip-colors.json'), JSON.stringify({ ...result, errors }, null, 2));
    expect(errors).toEqual([]);
    for (const row of result.rows) {
        expect(row.count).toBeGreaterThan(1000);
        expect(Math.abs(row.ringGreenRatio - 1), row.side + ' ring/source green difference').toBeLessThan(0.12);
    }
});
