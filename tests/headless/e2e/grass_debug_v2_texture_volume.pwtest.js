// Validate the textured shell's silhouette, capture frames and view-dependent PBR lighting.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Texture-only patches have relightable side walls from LOD3-10', async ({ page }) => {
    test.setTimeout(240000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/texture_volumes');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await expect(page.locator('#field-visible')).not.toBeChecked();
    const state = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy, c = s.comparison, v = c.volume;
        const sourceHeight = new THREE.Box3().setFromObject(s.patch.representations.refined.group).max.y;
        s.scene.updateMatrixWorld(true);
        return { ...v.getSnapshot(), sourceHeight, fieldVisible: s.largeField.group.visible,
            tiles: c.tiles.map(tile => tile.position.toArray()),
            meshes: v.walls.map(wall => {
                const bounds = new THREE.Box3().setFromObject(wall);
                return { name: wall.name, min: bounds.min.toArray(), max: bounds.max.toArray(),
                    normal: new THREE.Vector3(0, 0, 1).applyQuaternion(wall.quaternion).toArray(),
                    triangles: wall.geometry.index.count / 3 };
            }),
            maps: v.bake.views.map(view => {
                const data = view.textures.albedo.image.data, normal = view.textures.normal.image.data;
                const light = s.lighting.sunRef.direction.clone().normalize().applyQuaternion(view.quaternion.clone().invert());
                let clear = 0, opaque = 0, partial = 0, invalidNormals = 0, green = 0, blue = 0, opaqueDarkFill = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] === 0) clear++;
                    else if (data[i + 3] === 255) opaque++;
                    else partial++;
                    const cosine = (normal[i] / 127.5 - 1) * light.x + (normal[i + 1] / 127.5 - 1) * light.y + (normal[i + 2] / 127.5 - 1) * light.z;
                    if (data[i + 3] && Math.max(cosine, 0) + 0.35 * Math.max(-cosine, 0) <= 0.10) opaqueDarkFill++;
                    if (data[i + 3] > 200) {
                        if (data[i + 1] > data[i] * 1.1) green++;
                        const length = Math.hypot(...Array.from(normal.slice(i, i + 3), value => value / 127.5 - 1));
                        if (Math.abs(length - 1) > 0.03) invalidNormals++;
                        blue += normal[i + 2];
                    }
                }
                return { id: view.id, clear, opaque, partial, green, invalidNormals, blue, opaqueDarkFill, coverage: view.coverage,
                    mips: view.textures.albedo.mipmaps.length, mapId: view.textures.albedo.uuid };
            }) };
    });
    expect(state.fieldVisible).toBe(false);
    expect(state.fields).toEqual(['texture4k', 'texture2k']);
    expect(state.walls).toBe(8); expect(state.triangles).toBe(32);
    expect(state.wallHeight).toBeCloseTo(state.sourceHeight * 0.8, 8);
    expect(state.centerHeight).toBeCloseTo(state.wallHeight / 2, 8);
    expect(state.surfaceHeight).toBe(state.wallHeight);
    expect(state.bake).toMatchObject({ source: '4K LOD3 · 10', sourceLeaves: 4000,
        views: ['front', 'right', 'back', 'left'], sunBaked: false, shadowsBaked: false, canopyShadeBaked: true });
    for (const wall of state.meshes) {
        expect(wall.min[1]).toBeCloseTo(0, 7);
        expect(wall.max[1]).toBeCloseTo(state.wallHeight, 7);
        expect(wall.triangles).toBe(2);
    }
    expect(state.tiles.map(p => p[1])).toEqual([state.wallHeight, 0.01, state.wallHeight, 0.01, state.sourceHeight * 0.7]);
    expect(new Set(state.maps.map(map => map.mapId)).size).toBe(4);
    for (const map of state.maps) {
        expect(map.clear).toBeGreaterThan(1000); expect(map.opaque).toBeGreaterThan(1000);
        expect(map.partial).toBeGreaterThan(100); expect(map.green).toBeGreaterThan(1000);
        expect(map.invalidNormals).toBe(0); expect(map.mips).toBeGreaterThan(5);
        expect(map.opaqueDarkFill).toBeGreaterThan(1000);
        expect(map.coverage.retained).toBeGreaterThan(50000);
        expect(map.coverage.shaded).toBeGreaterThan(50000);
    }
    const connections = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy, c = s.comparison, v = c.volume;
        const result = [];
        for (const [fieldIndex, join] of v.joins.entries()) {
            const floor = c.tiles[fieldIndex * 2], bake = fieldIndex === 1 ? c.sparseBake : c.bake;
            const size = bake.getSnapshot().resolution, color = bake.readPixels('albedo'), normals = bake.readPixels('normal');
            for (const [viewIndex, view] of join.views.entries()) {
                const wall = v.walls[fieldIndex * 4 + viewIndex], raw = v.bake.views[viewIndex];
                const { data, width, height } = view.textures.albedo.image;
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(wall.quaternion);
                const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(wall.quaternion);
                let colorError = 0, normalError = 0, alphaMin = 255, lowerChanges = 0, geometryError = 0;
                for (let x = 0; x < width; x++) {
                    const local = right.clone().multiplyScalar((x + 0.5) / width - 0.5).addScaledVector(outward, 0.5);
                    const u = local.x + 0.5, uvY = 0.5 - local.z;
                    const px = THREE.MathUtils.clamp(Math.round(u * size - 0.5), 0, size - 1);
                    const py = THREE.MathUtils.clamp(Math.round(uvY * size - 0.5), 0, size - 1);
                    const offset = ((height - 1) * width + x) * 4, reference = (py * size + px) * 4;
                    for (let channel = 0; channel < 3; channel++)
                        colorError = Math.max(colorError, Math.abs(data[offset + channel] - color[reference + channel]));
                    alphaMin = Math.min(alphaMin, data[offset + 3]);
                    const actualNormal = new THREE.Vector3().fromArray(view.textures.normal.image.data, offset)
                        .multiplyScalar(1 / 127.5).subScalar(1).normalize().applyQuaternion(wall.quaternion);
                    const expectedNormal = new THREE.Vector3(normals[reference] / 127.5 - 1,
                        normals[reference + 2] / 127.5 - 1, -(normals[reference + 1] / 127.5 - 1)).normalize();
                    normalError = Math.max(normalError, actualNormal.distanceTo(expectedNormal));
                    for (let y = 0; y <= view.joinStarts[x]; y++) for (let channel = 0; channel < 4; channel++)
                        if (data[(y * width + x) * 4 + channel] !== raw.textures.albedo.image.data[(y * width + x) * 4 + channel]) lowerChanges++;
                }
                for (const x of [-0.5, 0.5]) {
                    const top = wall.localToWorld(new THREE.Vector3(x, v.wallHeight / 2, 0));
                    geometryError = Math.max(geometryError, Math.abs(top.y - floor.position.y),
                        Math.abs(Math.max(Math.abs(top.x - floor.position.x), Math.abs(top.z - floor.position.z)) - 0.5));
                }
                result.push({ fieldIndex, viewIndex, colorError, normalError, alphaMin, lowerChanges, geometryError,
                    independentSource: view.textures.albedo.source !== raw.textures.albedo.source,
                    width: floor.geometry.parameters.width, depth: floor.geometry.parameters.height,
                    uv: Array.from(floor.geometry.attributes.uv.array) });
            }
        }
        return result;
    });
    for (const edge of connections) {
        expect(edge.colorError).toBeLessThanOrEqual(1);
        expect(edge.normalError).toBeLessThan(0.015);
        expect(edge.alphaMin).toBe(255);
        expect(edge.lowerChanges).toBe(0);
        expect(edge.geometryError).toBeLessThan(1e-7);
        expect(edge.independentSource).toBe(true);
        expect(edge.width).toBe(1); expect(edge.depth).toBe(1);
        expect(edge.uv).toEqual([0, 1, 1, 1, 0, 0, 1, 0]);
    }
    await page.screenshot({ path: path.join(folder, 'overview.png') });
    const views = [
        ['front', [0.82, 0.33, -0.25]], ['back', [-0.82, 0.33, -2.35]],
        ['top', [0.10, 1.45, -1.05]], ['low', [0.7, 0.12, -0.1]]
    ];
    for (const [name, position] of views) {
        await page.evaluate(position => {
            const s = window.__plantCardsStudy;
            s.camera.position.set(...position); s.controls.target.set(0, 0.035, -1.3);
            s.controls.update(); s.lighting.render(0);
        }, position);
        await page.screenshot({ path: path.join(folder, name + '.png') });
    }
    // Opposite-view averages can cancel across the restored leaf orientations;
    // compare matching wall texels to verify local front/back relighting.
    const lighting = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy;
        const wall = s.comparison.volume.walls[0], mesh = wall.clone();
        mesh.position.set(0, 0, 0); mesh.castShadow = mesh.receiveShadow = false;
        const scene = new THREE.Scene(), light = new THREE.DirectionalLight(0xffffff, 3);
        light.position.set(0.4, 1, 1); scene.add(mesh, light, light.target);
        const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.1, -0.1, 0.01, 4);
        const target = new THREE.WebGLRenderTarget(512, 128), pixels = new Uint8Array(512 * 128 * 4);
        const renderer = s.renderer, previous = { mapping: renderer.toneMapping, clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
        renderer.toneMapping = THREE.NoToneMapping; renderer.setClearColor(0, 0);
        const samples = [], captures = [];
        for (const sign of [1, -1]) {
            camera.position.set(0, 0, sign); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
            renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
            renderer.readRenderTargetPixels(target, 0, 0, 512, 128, pixels);
            let sum = 0, count = 0;
            for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 200) { sum += pixels[i + 1]; count++; }
            samples.push({ meanGreen: sum / count, count }); captures.push(pixels.slice());
        }
        renderer.toneMapping = previous.mapping; renderer.setClearColor(previous.clear, previous.alpha);
        let difference = 0, matched = 0;
        for (let y = 0; y < 128; y++) for (let x = 0; x < 512; x++) {
            const front = (y * 512 + x) * 4, back = (y * 512 + 511 - x) * 4;
            if (captures[0][front + 3] > 200 && captures[1][back + 3] > 200) {
                difference += Math.abs(captures[0][front + 1] - captures[1][back + 1]); matched++;
            }
        }
        target.dispose(); s.lighting.render(0); return { samples, meanPixelChange: difference / matched, matched };
    });
    expect(lighting.matched).toBeGreaterThan(1000);
    expect(lighting.meanPixelChange).toBeGreaterThan(8);
    await page.locator('#field-visible').check();
    expect(await page.evaluate(() => window.__plantCardsStudy.largeField.group.visible)).toBe(true);
    await page.locator('#field-visible').uncheck();
    expect(await page.evaluate(() => window.__plantCardsStudy.largeField.group.visible)).toBe(false);
    expect(errors).toEqual([]);
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ state, connections, lighting, errors }, null, 2));
});
