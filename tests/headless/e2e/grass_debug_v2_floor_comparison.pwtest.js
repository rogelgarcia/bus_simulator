// Validate eight PBR comparison fields, complementary instance subsets, and camera translation.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Grass floor comparisons preserve PBR normals, tile spacing and camera movement', async ({ page }) => {
    test.setTimeout(120000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/floor_pbr_comparison');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await expect(page.locator('[data-mode="refined"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#square-bounds')).not.toBeChecked();
    const startup = await page.evaluate(() => {
        const s = window.__plantCardsStudy;
        return { mode: s.comparison.getSnapshot().mode, visibleBounds: s.scene.getObjectByName('GrassV2SquareBounds').visible
            || s.comparison.group.children.some(child => child.isLineLoop && child.visible) };
    });
    expect(startup).toEqual({ mode: 'refined', visibleBounds: false });
    await page.screenshot({ path: path.join(folder, 'comparison-default.png') });
    const expectPatchTooltip = async (id, lines) => {
        const point = await page.evaluate(id => {
            const s = window.__plantCardsStudy, field = s.comparison.getSnapshot().fields.find(field => field.id === id);
            s.controls.target.set(field.x, field.surfaceHeight, field.z);
            s.camera.position.set(field.x + 1, 1.4, field.z + 1); s.controls.update();
            s.lighting.render(0);
            const ndc = s.controls.target.clone().project(s.camera), rect = s.renderer.domElement.getBoundingClientRect();
            return { x: rect.left + (ndc.x + 1) * rect.width / 2, y: rect.top + (1 - ndc.y) * rect.height / 2 };
        }, id);
        await page.mouse.move(point.x, point.y);
        const tooltip = page.locator('.grass-patch-distance');
        await expect(tooltip).toBeVisible();
        const text = (await tooltip.innerText()).split('\n');
        expect(text[0]).toMatch(/^Distance: \d+\.\d{2} m$/);
        expect(text.slice(1)).toEqual(lines);
    };
    for (const [id, texture, leaves, triangles] of [
        ['source', 'None', 'LOD3 · 10: 4K', '80,000'],
        ['texture4k', '4K', 'Leaves: 0', '18'],
        ['hybrid1k', '4K', 'LOD3 · 10: 1K', '20,002'],
        ['reference', 'None', 'LOD3 · 10: 2K', '40,000'],
        ['texture2k', '2K', 'Leaves: 0', '18'],
        ['hybrid2k', '2K', 'LOD3 · 10: 2K', '40,002'],
        ['rings4k', '4K', 'Leaves: 0', '26'],
        ['rings32', '4K', 'Leaves: 0', '26']
    ]) await expectPatchTooltip(id, ['Texture: ' + texture,
        ...(id === 'rings4k' ? ['Views: 1 × 1024² + top 1024²'] : id === 'rings32' ? ['Views: 32 × 512² + top 512²'] : []), leaves,
        ...(id.startsWith('rings') ? ['Outer ring: 8 cards (2 per side) · 12 cm depth · 40% leaves · shadows on'] : []),
        'Triangles: ' + triangles]);
    await page.screenshot({ path: path.join(folder, 'rings-tooltip.png') });
    await page.screenshot({ path: path.join(folder, 'hybrid-tooltip.png') });
    await page.mouse.move(5, 5);
    await page.locator('[data-pose="three_quarter"]').click();

    await page.locator('[data-mode="LOD0"]').click();
    const state = await page.evaluate(() => {
        const s = window.__plantCardsStudy, c = s.comparison;
        const original = s.patch.lod0.children.filter(m => m.isInstancedMesh);
        const matchesSubset = (variants, stride, offset) => Object.entries(variants).every(([mode, group]) => {
            const originalGroup = mode === 'LOD0' ? s.patch.lod0 : s.patch.representations[mode].group;
            const sources = originalGroup.children.filter(mesh => mesh.isInstancedMesh);
            return group.children.every((mesh, i) => mesh.geometry === sources[i].geometry && mesh.material === sources[i].material
                && mesh.count === sources[i].count / stride
                && Array.from(mesh.instanceMatrix.array).every((value, j) =>
                    value === sources[i].instanceMatrix.array[(Math.floor(j / 16) * stride + offset) * 16 + j % 16]));
        });
        const countGreen = bake => {
            const data = bake.readPixels('albedo'); let green = 0;
            for (let i = 0; i < data.length; i += 4) if (data[i + 1] > data[i] * 1.15 && data[i + 1] > data[i + 2] * 1.15) green++;
            return green;
        };
        return { ...c.getSnapshot(), tiles: c.tiles.map(tile => ({ position: tile.position.toArray(),
            width: tile.geometry.parameters.width, height: tile.geometry.parameters.height,
            uv: Array.from(tile.geometry.attributes.uv.array),
            tangentNormals: tile.material.normalMapType === 0, roughness: tile.material.roughness })),
            sharedMaps: ['map', 'normalMap', 'roughnessMap'].every(name => c.tiles[0].material[name] === c.tiles[1].material[name]),
            sharedSparseMaps: ['map', 'normalMap', 'roughnessMap'].every(name => c.tiles[2].material[name] === c.tiles[3].material[name]
                && c.tiles[2].material[name] !== c.tiles[0].material[name]),
            referenceMatches: matchesSubset(c.reference, 2, 0), complementMatches: matchesSubset(c.hybrid2K, 2, 1),
            greenPixels: [countGreen(c.bake), countGreen(c.sparseBake)],
            instanceLeaves: c.hybrid.LOD0.children.filter((_, i) => i % 2 === 0).reduce((sum, mesh) => sum + mesh.count, 0),
            subset: c.hybrid.LOD0.children.every((mesh, i) => mesh.geometry === original[i].geometry
                && Array.from(mesh.instanceMatrix.array).every((v, j) => v === original[i].instanceMatrix.array[Math.floor(j / 16) * 64 + j % 16])),
            mapSamples: Object.fromEntries(['albedo', 'normal', 'roughness'].map(name => {
                const values = c.bake.readPixels(name), colors = new Set();
                for (let i = 0; i < values.length; i += 4 * 997) colors.add(values[i] + ',' + values[i + 1] + ',' + values[i + 2]);
                return [name, colors.size];
            })) };
    });
    await expectPatchTooltip('hybrid1k', ['Texture: 4K', 'LOD0: 1K', 'Triangles: 7,888,002']);
    await page.mouse.move(5, 5);
    await page.locator('[data-pose="three_quarter"]').click();
    expect(state.sourceLeaves).toBe(4000); expect(state.hybridLeaves).toBe(1000); expect(state.instanceLeaves).toBe(1000);
    expect(state.sharedMaps).toBe(true); expect(state.subset).toBe(true); expect(state.gapMeters).toBe(0.3);
    expect(state.tiles.map(tile => tile.position)).toEqual([[-2.6, state.volume.surfaceHeight, -1.3], [0, 0.01, -2.6], [1.3, state.volume.surfaceHeight, -1.3], [1.3, 0.01, -2.6], [-1.3, state.ringPatch.baseHeight, -1.3], [0, state.ringPatch.baseHeight, -1.3]]);
    expect(state.fields.map(field => [field.geometryLeaves, field.textureLeaves])).toEqual([[4000, 0], [0, 4000], [1000, 4000], [2000, 0], [0, 2000], [2000, 2000], [0, 4000], [0, 4000]]);
    expect(state.sharedSparseMaps).toBe(true); expect(state.referenceMatches).toBe(true); expect(state.complementMatches).toBe(true);
    expect(state.edgeLeaves).toBeNull();
    expect(state.fields.some(field => field.id === 'edge4k')).toBe(false);
    expect(state.totalGeometryLeaves).toBe(9000);
    expect(state.totalTriangles).toBe(70992092);
    expect(state.sparseBake).toMatchObject({ sourceLeaves: 2000, sourceStride: 2, sourceOffset: 0, resolution: 2048, sourceView: 'top', projectionType: 'orthographic', sunBaked: false });
    expect(state.greenPixels[1]).toBeGreaterThan(10000); expect(state.greenPixels[1]).toBeLessThan(state.greenPixels[0]);
    await expect(page.locator('.grass-comparison-label')).toHaveCount(8);
    for (const [index, tile] of state.tiles.entries()) {
        const inset = index === 1 || index === 3 ? 0.01 : index >= 4 ? 0.005 : 0, size = 1 - 2 * inset;
        expect(tile.width).toBe(size); expect(tile.height).toBe(size); expect(tile.tangentNormals).toBe(true);
        [inset, 1 - inset, 1 - inset, 1 - inset, inset, inset, 1 - inset, inset]
            .forEach((value, i) => expect(tile.uv[i]).toBeCloseTo(value, 7));
    }
    expect(state.bake).toMatchObject({ resolution: 2048, sourceView: 'top', projectionType: 'orthographic', cameraPosition: [0, 3, 0], footprintMeters: 1, sunBaked: false, shadowsBaked: false });
    expect(state.mapSamples.albedo).toBeGreaterThan(100); expect(state.mapSamples.normal).toBeGreaterThan(100);
    expect(state.mapSamples.roughness).toBeGreaterThan(20);
    await page.screenshot({ path: path.join(folder, 'comparison-lod0.png') });
    for (const [mode, triangles] of [['refined', 20000], ['detailed', 10000], ['curved', 6000], ['split', 4000]]) {
        await page.locator('[data-mode="' + mode + '"]').click();
        const hybrid = await page.evaluate(mode => {
            const c = window.__plantCardsStudy.comparison;
            return { visible: Object.entries(c.hybrid).filter(([, group]) => group.visible).map(([name]) => name),
                triangles: c.getSnapshot().hybridTriangles,
                referenceVisible: Object.entries(c.reference).filter(([, group]) => group.visible).map(([name]) => name),
                hybrid2KVisible: Object.entries(c.hybrid2K).filter(([, group]) => group.visible).map(([name]) => name),
                hybrid2KTriangles: c.getSnapshot().hybrid2KTriangles, totalTriangles: c.getSnapshot().totalTriangles };
        }, mode);
        await expectPatchTooltip('hybrid1k', ['Texture: 4K', 'LOD3 · ' + triangles / 2000 + ': 1K', 'Triangles: ' + (triangles + 2).toLocaleString('en-US')]);
        await page.mouse.move(5, 5);
        await page.locator('[data-pose="three_quarter"]').click();
        expect(hybrid.visible).toEqual([mode]); expect(hybrid.triangles).toBe(triangles);
        expect(hybrid.referenceVisible).toEqual([mode]); expect(hybrid.hybrid2KVisible).toEqual([mode]);
        expect(hybrid.hybrid2KTriangles).toBe(triangles * 2); expect(hybrid.totalTriangles).toBe(triangles * 9 + 92);
        if (mode === 'refined') await page.screenshot({ path: path.join(folder, 'comparison-lod3-10.png') });
    }
    await page.locator('[data-mode="LOD0"]').click();
    for (const key of ['w', 's', 'a', 'd', 'q', 'e']) {
        await page.locator('[data-pose="three_quarter"]').click();
        const before = await page.evaluate(() => {
            const s = window.__plantCardsStudy;
            return { position: s.camera.position.toArray(), target: s.controls.target.toArray(), quaternion: s.camera.quaternion.toArray() };
        });
        await page.keyboard.down(key); await page.waitForTimeout(180); await page.keyboard.up(key);
        const movement = await page.evaluate(async ({ before, key }) => {
            const THREE = await import('three'), s = window.__plantCardsStudy;
            const delta = s.camera.position.clone().sub(new THREE.Vector3(...before.position));
            const targetDelta = s.controls.target.clone().sub(new THREE.Vector3(...before.target));
            const q = new THREE.Quaternion(...before.quaternion);
            const direction = key === 'w' || key === 's' ? new THREE.Vector3(0, 0, key === 'w' ? -1 : 1).applyQuaternion(q)
                : key === 'a' || key === 'd' ? new THREE.Vector3(key === 'a' ? -1 : 1, 0, 0).applyQuaternion(q)
                : new THREE.Vector3(0, key === 'q' ? -1 : 1, 0);
            if ('wasd'.includes(key)) direction.setY(0).normalize();
            return { distance: delta.length(), along: delta.dot(direction), deltaY: delta.y,
                horizontalDistance: Math.hypot(delta.x, delta.z), targetError: delta.distanceTo(targetDelta),
                rotationError: s.camera.quaternion.angleTo(q) };
        }, { before, key });
        expect(movement.distance).toBeGreaterThan(0.02); expect(movement.along).toBeGreaterThan(0.02);
        expect(movement.targetError).toBeLessThan(1e-8); expect(movement.rotationError).toBeLessThan(1e-6);
        if ('wasd'.includes(key)) expect(Math.abs(movement.deltaY)).toBeLessThan(1e-8);
        else expect(movement.horizontalDistance).toBeLessThan(1e-8);
    }
    await page.locator('[data-pose="elevated"]').click();
    await page.screenshot({ path: path.join(folder, 'comparison-top.png') });
    await page.locator('[data-pose="three_quarter"]').click();
    await page.evaluate(() => {
        const s = window.__plantCardsStudy, offset = s.camera.position.clone().sub(s.controls.target);
        offset.x *= -1; offset.z *= -1; s.camera.position.copy(s.controls.target).add(offset); s.controls.update();
    });
    await page.screenshot({ path: path.join(folder, 'comparison-reverse.png') });
    for (const bakeName of ['bake', 'sparseBake']) for (const name of ['albedo', 'normal', 'roughness']) {
        const png = await page.evaluate(({ name, bakeName }) => {
            const bake = window.__plantCardsStudy.comparison[bakeName], size = bake.getSnapshot().resolution, values = bake.readPixels(name);
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d'), image = ctx.createImageData(size, size);
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const from = (y * size + x) * 4, to = ((size - 1 - y) * size + x) * 4;
                for (let c = 0; c < 3; c++) {
                    const value = values[from + c] / 255;
                    image.data[to + c] = name === 'albedo' ? Math.round(255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055)) : values[from + c];
                }
                image.data[to + 3] = 255;
            }
            ctx.putImageData(image, 0, 0); return canvas.toDataURL('image/png').split(',')[1];
        }, { name, bakeName });
        await writeFile(path.join(folder, (bakeName === 'sparseBake' ? '2k-' : '') + name + '.png'), Buffer.from(png, 'base64'));
    }
    const fixture = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy;
        const { createGrassDebugV2FloorBake } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2FloorBake.js');
        const geometry = new THREE.PlaneGeometry(2, 2); geometry.rotateX(-Math.PI / 2);
        const normals = geometry.attributes.normal;
        for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0.6, 0.8, 0);
        const material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.15, 0.30, 0.10), roughness: 0.7, side: THREE.DoubleSide });
        const source = new THREE.Group(), mesh = new THREE.InstancedMesh(geometry, material, 1);
        const transform = new THREE.Matrix4().makeRotationY(Math.PI / 2); transform.setPosition(0, 0.01, 0);
        mesh.setMatrixAt(0, transform); source.add(mesh);
        const baked = await createGrassDebugV2FloorBake({ renderer: s.renderer, source, ground: s.scene.getObjectByName('GrassV2DirtTerrain'),
            resolution: 256 });
        const offset = (128 * 256 + 128) * 4;
        const result = Object.fromEntries(['albedo', 'normal', 'roughness'].map(name => [name, Array.from(baked.readPixels(name).slice(offset, offset + 3))]));
        const { createGrassDebugV2FloorMaterial } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2FloorMaterial.js');
        const floorMaterial = createGrassDebugV2FloorMaterial(baked.textures);
        const floorGeometry = new THREE.PlaneGeometry(0.4, 0.4); floorGeometry.rotateX(-Math.PI / 2);
        const floor = new THREE.Mesh(floorGeometry, floorMaterial), scene = new THREE.Scene();
        const light = new THREE.DirectionalLight(0xffffff, Math.PI), normal = new THREE.Vector3(0, 0.8, -0.6);
        light.position.copy(normal); scene.add(floor, light, light.target);
        const camera = new THREE.OrthographicCamera(-0.03, 0.03, 0.03, -0.03, 0.01, 5);
        const target = new THREE.WebGLRenderTarget(64, 64), pixels = new Uint8Array(64 * 64 * 4);
        const { renderer } = s, previousToneMapping = renderer.toneMapping;
        renderer.toneMapping = THREE.NoToneMapping;
        const sample = direction => {
            camera.position.copy(direction).normalize(); camera.lookAt(0, 0, 0);
            renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
            renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels);
            let green = 0;
            for (let y = 30; y <= 34; y++) for (let x = 30; x <= 34; x++) green += pixels[(y * 64 + x) * 4 + 1];
            return green / 25;
        };
        const front = sample(normal), back = sample(new THREE.Vector3(0, 0.1, 1));
        const grazing = [];
        for (let degrees = 86; degrees <= 94; degrees++) {
            const angle = THREE.MathUtils.degToRad(degrees);
            grazing.push(sample(normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(new THREE.Vector3(0, 0.6, 0.8), Math.sin(angle))));
        }
        floor.rotation.y = Math.PI;
        const rotated = sample(normal);
        const rotation = new THREE.Matrix4().makeRotationY(Math.PI);
        light.position.copy(normal).applyMatrix4(rotation);
        const rotatedTogether = sample(normal.clone().applyMatrix4(rotation));
        result.lighting = { front, back, grazing, rotated, rotatedTogether };
        floor.rotation.y = 0; light.position.set(0, 1, 0);
        const soilMap = new THREE.DataTexture(new Uint8Array([31, 22, 12, 255]), 1, 1);
        const soilNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
        const soilRoughness = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
        for (const texture of [soilMap, soilNormal, soilRoughness]) texture.needsUpdate = true;
        const soilFloor = createGrassDebugV2FloorMaterial({ albedo: soilMap, normal: soilNormal, roughness: soilRoughness }, { leafColorScale: new THREE.Vector3(0.5, 0.92, 0.5) });
        const soilReference = new THREE.MeshStandardMaterial({ map: soilMap, normalMap: soilNormal,
            roughnessMap: soilRoughness, roughness: 1, side: THREE.DoubleSide });
        camera.left = camera.bottom = -0.0005; camera.right = camera.top = 0.0005; camera.updateProjectionMatrix();
        result.soil = [];
        for (const elevation of [1, 3, 6, 30, 80]) {
            const angle = THREE.MathUtils.degToRad(elevation), direction = new THREE.Vector3(0, Math.sin(angle), Math.cos(angle));
            floor.material = soilReference; const reference = sample(direction);
            floor.material = soilFloor; const actual = sample(direction);
            result.soil.push({ elevation, reference, actual });
        }
        soilReference.dispose(); soilFloor.dispose(); soilMap.dispose(); soilNormal.dispose(); soilRoughness.dispose();
        renderer.toneMapping = previousToneMapping;
        target.dispose(); floorMaterial.dispose(); floorGeometry.dispose();
        baked.dispose(); mesh.dispose(); geometry.dispose(); material.dispose(); return result;
    });
    [38, 77, 26].forEach((value, i) => expect(Math.abs(fixture.albedo[i] - value)).toBeLessThanOrEqual(1));
    [128, 204, 230].forEach((value, i) => expect(Math.abs(fixture.normal[i] - value)).toBeLessThanOrEqual(2));
    expect(Math.abs(fixture.roughness[1] - 179)).toBeLessThanOrEqual(1);
    expect(fixture.roughness[0]).toBe(0); expect(fixture.roughness[2]).toBe(0);
    expect(fixture.lighting.front).toBeGreaterThan(60);
    expect(fixture.lighting.back).toBeLessThan(fixture.lighting.front * 0.6);
    expect(fixture.lighting.rotated).toBeLessThan(fixture.lighting.front * 0.65);
    expect(Math.abs(fixture.lighting.rotatedTogether - fixture.lighting.front)).toBeLessThan(2);
    for (let i = 1; i < fixture.lighting.grazing.length; i++)
        expect(Math.abs(fixture.lighting.grazing[i] - fixture.lighting.grazing[i - 1])).toBeLessThan(fixture.lighting.front * 0.3);
    for (const sample of fixture.soil) {
        expect(sample.reference).toBeGreaterThan(20);
        expect(Math.abs(sample.actual - sample.reference), 'Soil mismatch at ' + sample.elevation + ' degrees').toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ state, fixture, errors }, null, 2));
});
