// Validate the two-face folded leaf, hard diagonal shading, soil contact and field counts.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod2_two_triangles');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off' });

test('LOD2 has two folded faces with separate shading normals and fitted roots', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await mkdir(output, { recursive: true });
    const previous = await readFile(path.join(output, 'before_GrassDebugV2RibbonShoot.js'), 'utf8');
    await page.route('**/GrassDebugV2RibbonShoot.js?verify=before-two-tris', route => route.fulfill({ contentType: 'text/javascript', body: previous }));
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot&revision=lod2-two-tris-1');
    await page.waitForFunction(() => !!window.__plantCardsReadiness); await page.evaluate(() => window.__plantCardsReadiness);
    await page.getByRole('button', { name: 'LOD2', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Wireframe', exact: true }).check();
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy;
        const leaves = s.shootLods.LOD2.leaves.map(leaf => {
            leaf.updateWorldMatrix(true, false);
            const g = leaf.geometry, { position: p, normal: n } = g.attributes;
            const point = j => new THREE.Vector3().fromBufferAttribute(p, j), normal = j => new THREE.Vector3().fromBufferAttribute(n, j);
            const faces = Array.from({ length: g.index.count / 3 }, (_, f) => [0, 1, 2].map(k => g.index.getX(f * 3 + k)));
            const roots = [0, 2, 3].map(j => { const w = point(j).applyMatrix4(leaf.matrixWorld); return w.y - s.soil.getHeightAt(w.x, w.z); });
            const areas = faces.map(face => { const [a, b, c] = face.map(point); return b.sub(a).cross(c.sub(a)).length() / 2; });
            return { triangles: faces.length, vertices: p.count, roots, minimumArea: Math.min(...areas),
                foldDegrees: THREE.MathUtils.radToDeg(normal(0).angleTo(normal(3))),
                hardNormals: faces.every(face => face.every(j => normal(j).distanceTo(normal(face[0])) < 1e-7)),
                seamGap: Math.max(point(1).distanceTo(point(4)), point(2).distanceTo(point(3))),
                normalError: Math.max(...Array.from({ length: n.count }, (_, j) => Math.abs(normal(j).length() - 1))) };
        });
        const { createGrassDebugV2RibbonShoot: create } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?v=lod2-two-tris-1');
        const { createGrassDebugV2RibbonShoot: before } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?verify=before-two-tris');
        const material = s.plant.leaves[0].material, unchanged = {};
        for (const lod of ['LOD0', 'LOD0_SMART']) {
            const a = create({ material, lod }), b = before({ material, lod });
            unchanged[lod] = a.leaves.every((leaf, i) => {
                const g = leaf.geometry, old = b.leaves[i].geometry;
                return g.index.count === old.index.count && g.index.array.every((v, j) => v === old.index.array[j])
                    && Object.entries(g.attributes).every(([name, attr]) => attr.array.every((v, j) => v === old.attributes[name].array[j]));
            });
            a.dispose(); b.dispose();
        }
        const { createGrassDebugV2FieldLod } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2FieldLod1.js?v=lod2-two-tris-1');
        const placements = Array.from({ length: 25 }, (_, i) => ({ id: i, x: 0, z: 0, scale: 1,
            azimuthDegrees: i * 14.4, backwardInclinationDegrees: i * 1.875 }));
        const variants = createGrassDebugV2FieldLod({ material, placements, seed: 123, lod: 'LOD2' });
        const { position: p, normal: n } = variants.mesh.geometry.attributes;
        const roots = [], folds = [], seams = [];
        for (let leaf = 0; leaf < 50; leaf++) {
            const base = leaf * 6;
            roots.push(...[0, 2, 3].map(j => p.getY(base + j)));
            folds.push(new THREE.Vector3().fromBufferAttribute(n, base).angleTo(new THREE.Vector3().fromBufferAttribute(n, base + 3)));
            seams.push(new THREE.Vector3().fromBufferAttribute(p, base + 1).distanceTo(new THREE.Vector3().fromBufferAttribute(p, base + 4)),
                new THREE.Vector3().fromBufferAttribute(p, base + 2).distanceTo(new THREE.Vector3().fromBufferAttribute(p, base + 3)));
        }
        const variant = variants.getSnapshot(); variants.dispose();
        return { leaves, unchanged, variant, roots, folds, seams };
    });
    for (const leaf of result.leaves) {
        expect(leaf).toMatchObject({ triangles: 2, vertices: 6, hardNormals: true });
        expect(leaf.foldDegrees).toBeGreaterThan(5); expect(leaf.foldDegrees).toBeLessThan(25);
        expect(leaf.minimumArea).toBeGreaterThan(1e-10); expect(leaf.normalError).toBeLessThan(1e-6);
        expect(leaf.seamGap).toBeLessThan(1e-8);
        for (const root of leaf.roots) expect(Math.abs(root)).toBeLessThan(1e-8);
    }
    expect(result.unchanged).toEqual({ LOD0: true, LOD0_SMART: true });
    expect(result.variant).toMatchObject({ leaves: 50, triangles: 100, trianglesPerLeaf: { min: 2, max: 2 }, maximumTrianglesPerLeaf: 2 });
    expect(Math.max(...result.roots.map(Math.abs))).toBeLessThan(1e-8);
    expect(Math.max(...result.seams)).toBeLessThan(1e-8);
    expect(Math.min(...result.folds)).toBeGreaterThan(0.08); expect(Math.max(...result.folds)).toBeLessThan(0.45);
    await expect(page.locator('#plant-counts')).toHaveText('3 leaves · 6 tris');
    for (const pose of ['front', 'three_quarter', 'side']) {
        await page.evaluate(pose => window.__plantCardsStudy.setPose(pose), pose);
        await page.screenshot({ path: path.join(output, 'study_' + pose + '.png') });
    }
    await page.evaluate(() => {
        const s = window.__plantCardsStudy;
        s.camera.fov = 35; s.camera.zoom = 1; s.camera.updateProjectionMatrix();
        s.controls.target.set(0, 0.024, 0); s.camera.position.set(0.014, 0.03, 0.09);
        s.controls.update(); s.lighting.render(0);
    });
    await page.screenshot({ path: path.join(output, 'leaf_wireframe.png') });
    await page.getByRole('checkbox', { name: 'Wireframe', exact: true }).uncheck();
    await page.screenshot({ path: path.join(output, 'leaf_shaded.png') });
    await writeFile(path.join(output, 'geometry.json'), JSON.stringify(result, null, 2));
    expect(errors).toEqual([]);
});

test('Two-face LOD2 preserves field anchors and palette in nine fields', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod2-two-tris-1#01_overview');
    await page.waitForFunction(() => !!window.__grassLitterReadiness); await page.evaluate(() => window.__grassLitterReadiness);
    const parity = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__grassLitterScene;
        const { sampleGrassDebugV2ShootColor, sampleGrassDebugV2Lod2Color } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2ShootAppearance.js?v=lod2-color-1');
        const { createGrassDebugV2RibbonShoot } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?v=lod2-two-tris-1');
        const manifest = await (await fetch('/tests/artifacts/screens/grass_debug_v2/ninety_six_thousand_leaves_12m/scene.json')).json();
        const source = createGrassDebugV2RibbonShoot({ material: s.scene.getObjectByName('GrassField-LOD2').material, lod: 'LOD2' });
        source.trimAtSoil(() => 0); source.group.updateMatrixWorld(true);
        const anchors = source.leaves.slice(1).map(leaf => {
            const p = leaf.geometry.attributes.position;
            return new THREE.Vector3().fromBufferAttribute(p, 0).add(new THREE.Vector3().fromBufferAttribute(p, 2)).multiplyScalar(0.5)
                .applyMatrix4(leaf.matrixWorld).add(new THREE.Vector3(-0.035, 0, 0));
        });
        const high = s.scene.getObjectByName('GrassField-LOD1').geometry.attributes;
        const low = s.scene.getObjectByName('GrassField-LOD2').geometry.attributes;
        const referenceColors = [];
        for (let i = 0; i < high.uv.count; i++) if (high.uv.getY(i) === 1)
            referenceColors.push([high.color.getX(i), high.color.getY(i), high.color.getZ(i)]);
        let anchorError = 0, colorError = 0, rootError = 0;
        for (const placement of manifest.placements) for (let blade = 0; blade < 2; blade++) {
            const base = (placement.id * 2 + blade) * 6, angle = THREE.MathUtils.degToRad(placement.azimuthDegrees), anchor = anchors[blade];
            const expected = [placement.x + placement.scale * Math.cos(angle) * anchor.x, placement.z - placement.scale * Math.sin(angle) * anchor.x];
            anchorError = Math.max(anchorError, Math.abs((low.position.getX(base) + low.position.getX(base + 2)) / 2 - expected[0]),
                Math.abs((low.position.getZ(base) + low.position.getZ(base + 2)) / 2 - expected[1]));
            rootError = Math.max(rootError, ...[0, 2, 3].map(j => Math.abs(low.position.getY(base + j))));
            const reference = referenceColors[placement.id * 2 + blade];
            const variation = ((Math.imul(placement.id * 2 + blade + 1, 1597334677) ^ manifest.seed) >>> 0) / 4294967296;
            const dryness = variation < 0.12 ? 0.65 + variation / 0.12 * 0.35 : (variation - 0.12) * 0.22;
            const originalTip = new THREE.Color(), fittedTip = new THREE.Color();
            sampleGrassDebugV2ShootColor(1, originalTip, dryness); sampleGrassDebugV2Lod2Color(1, fittedTip, dryness);
            const c = fittedTip.multiplyScalar(reference[0] / originalTip.r).toArray();
            colorError = Math.max(colorError, Math.abs(low.color.getX(base + 1) - c[0]), Math.abs(low.color.getY(base + 1) - c[1]), Math.abs(low.color.getZ(base + 1) - c[2]));
        }
        source.dispose();
        return { leaves: low.position.count / 6, anchorError, colorError, rootError };
    });
    expect(parity.leaves).toBe(96000); expect(parity.anchorError).toBeLessThan(0.000003);
    expect(parity.colorError).toBeLessThan(0.000001); expect(parity.rootError).toBeLessThan(1e-8);
    await page.getByRole('combobox', { name: 'LOD', exact: true }).selectOption('LOD2');
    const result = await page.evaluate(() => {
        const s = window.__grassLitterScene, before = s.getSnapshot();
        s.setFieldCount(9); s.frameFields(); const all = s.getSnapshot();
        s.setMode('grass'); const grass = s.getSnapshot(); s.setMode('soil'); const soil = s.getSnapshot();
        s.setMode('all'); return { before, all, grass, soil };
    });
    expect(result.before).toMatchObject({ lod: 'LOD2', visibleLeaves: 96000, visibleTriangles: 192688 });
    expect(result.all).toMatchObject({ visibleFields: 9, visibleLeaves: 864000, visibleTriangles: 1729472 });
    expect(result.grass.visibleTriangles).toBe(1728590); expect(result.soil.visibleTriangles).toBe(590);
    await page.screenshot({ path: path.join(output, 'nine_fields.png') });
    await writeFile(path.join(output, 'field.json'), JSON.stringify({ parity, ...result }, null, 2));
    expect(errors).toEqual([]);
});
