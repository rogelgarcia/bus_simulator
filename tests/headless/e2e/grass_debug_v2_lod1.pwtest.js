// Validate the LOD1 budget, matching field placements/colors, and both live LOD selectors.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/lod1_narrow_tip/lod1');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off' });

test('Leaf LOD1 keeps the crease and soil contact with ten triangles', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mkdir(folder, { recursive: true });
    const previous = await readFile(path.resolve('tests/artifacts/screens/grass_debug_v2/lod1_ten_triangles/before_GrassDebugV2RibbonShoot.js'), 'utf8');
    await page.route('**/GrassDebugV2RibbonShoot.js?verify=before-ten-tris', route => route.fulfill({ contentType: 'text/javascript', body: previous }));
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot&revision=lod1-narrow-tip-1');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await page.getByRole('checkbox', { name: 'Wireframe', exact: true }).check();
    await page.getByRole('button', { name: 'LOD1', exact: true }).click();
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy;
        const { createGrassDebugV2RibbonShoot } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?v=lod1-narrow-tip-1');
        const { fitGrassDebugV2RibbonRoot } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonRoot.js?v=lod1-narrow-tip-1');
        const { createGrassDebugV2RibbonShoot: before } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?verify=before-ten-tris');
        const old = before({ material: s.plant.leaves[0].material, lod: 'LOD1' });
        const source = createGrassDebugV2RibbonShoot({ material: s.plant.leaves[0].material, lod: 'LOD1' });
        const projectedArea = geometry => {
            const p = geometry.attributes.position, ix = geometry.index;
            let area = 0;
            for (let i = 0; i < ix.count; i += 3) {
                const [a, b, c] = [0, 1, 2].map(k => ix.getX(i + k));
                area += Math.abs((p.getX(b) - p.getX(a)) * (p.getY(c) - p.getY(a)) - (p.getY(b) - p.getY(a)) * (p.getX(c) - p.getX(a))) / 2;
            }
            return area;
        };
        const silhouetteAreaRatio = projectedArea(source.leaves[0].geometry) / projectedArea(old.leaves[0].geometry);
        old.dispose();
        const unchanged = {};
        for (const lod of ['LOD0', 'LOD0_SMART']) {
            const a = createGrassDebugV2RibbonShoot({ material: s.plant.leaves[0].material, lod });
            const b = before({ material: s.plant.leaves[0].material, lod });
            unchanged[lod] = a.leaves.every((leaf, i) => {
                const g = leaf.geometry, oldG = b.leaves[i].geometry;
                return g.index.count === oldG.index.count && g.index.array.every((v, j) => v === oldG.index.array[j])
                    && Object.entries(g.attributes).every(([name, attr]) => attr.array.every((v, j) => v === oldG.attributes[name].array[j]));
            });
            a.dispose(); b.dispose();
        }
        source.trimAtSoil(() => 0); source.group.updateMatrixWorld(true);
        const inclined = [];
        for (let degree = 0; degree <= 45; degree += 1.875) for (const leaf of source.leaves.slice(1)) {
            const matrix = new THREE.Matrix4().makeRotationX(-THREE.MathUtils.degToRad(degree))
                .multiply(new THREE.Matrix4().makeTranslation(-0.035, 0, 0)).multiply(leaf.matrixWorld);
            const mesh = new THREE.Mesh(leaf.geometry.clone().applyMatrix4(matrix), leaf.material);
            fitGrassDebugV2RibbonRoot(mesh, () => 0); inclined.push(mesh.geometry.index.count / 3); mesh.geometry.dispose();
        }
        const sectionLengths = source.leaves.map(leaf => {
            const p = leaf.geometry.attributes.position, uv = leaf.geometry.attributes.uv;
            const rows = new Map();
            for (const i of new Set(leaf.geometry.index.array)) if (Math.abs(uv.getX(i) - 0.5) < 1e-6 && uv.getY(i) < 1 - 1e-6)
                rows.set(uv.getY(i).toFixed(6), i);
            const centers = [...rows.values()].sort((a, b) => uv.getY(a) - uv.getY(b));
            const [bottom, top] = centers.slice(-2);
            const rise = 0.047;
            const curvature = leaf.userData.specimenId === 'young-reference' ? 0 : THREE.MathUtils.degToRad(11) / rise;
            const arcLength = i => curvature ? Math.atan2(p.getY(i) * curvature, 1 + p.getZ(i) * curvature) / curvature : p.getY(i);
            const reference = s.shootLods.LOD0.leaves[source.leaves.indexOf(leaf)].geometry;
            const sharedTipBase = [leaf.geometry, reference].map(geometry => {
                const { position, uv } = geometry.attributes;
                return Array.from({ length: uv.count }, (_, i) => i)
                    .filter(i => Math.abs(uv.getY(i) - 0.918) < 1e-6 && uv.getX(i) === 0.5)
                    .map(i => [position.getX(i), position.getY(i), position.getZ(i)])
                    .sort((a, b) => a[0] - b[0]);
            });
            const bodyWidthError = Math.max(...sharedTipBase[0].flat().map((value, i) => Math.abs(value - sharedTipBase[1].flat()[i])));
            return { middleMeters: arcLength(top) - arcLength(bottom), bottomMeters: arcLength(bottom),
                tipStart: (uv.getY(top) - 0.18) / 0.82, bodyWidthError };
        });
        source.dispose();
        const leaves = s.shootLods.LOD1.leaves.map((leaf, index) => {
            leaf.updateMatrixWorld(true);
            const p = leaf.geometry.attributes.position, n = leaf.geometry.attributes.normal;
            let minimumClearance = Infinity, normalError = 0, minimumArea = Infinity;
            const point = i => new THREE.Vector3().fromBufferAttribute(p, i);
            for (let i = 0; i < p.count; i++) {
                const world = point(i).applyMatrix4(leaf.matrixWorld);
                minimumClearance = Math.min(minimumClearance, world.y - s.soil.getHeightAt(world.x, world.z));
                normalError = Math.max(normalError, Math.abs(new THREE.Vector3().fromBufferAttribute(n, i).length() - 1));
            }
            for (let i = 0; i < leaf.geometry.index.count; i += 3) {
                const [a, b, c] = [0, 1, 2].map(k => point(leaf.geometry.index.getX(i + k)));
                minimumArea = Math.min(minimumArea, b.sub(a).cross(c.sub(a)).length() / 2);
            }
            const uv = leaf.geometry.attributes.uv, tipFaces = [];
            for (let i = 0; i < leaf.geometry.index.count; i += 3) {
                const face = [0, 1, 2].map(k => leaf.geometry.index.getX(i + k));
                if (face.every(j => uv.getY(j) >= 0.918 - 1e-6)) tipFaces.push(face);
            }
            const tipVertices = [...new Set(tipFaces.flat())];
            const corners = tipVertices.filter(j => uv.getX(j) === 0 || uv.getX(j) === 1).map(j => ({
                station: (uv.getY(j) - 0.18) / 0.82,
                halfWidthRatio: Math.abs(p.getX(j)) / (0.0045 * 0.5 * Math.sin(80 * Math.PI / 180))
            }));
            const intermediateCenters = tipVertices.filter(j => Math.abs(uv.getX(j) - 0.5) < 1e-6
                && uv.getY(j) > 0.918 + 1e-6 && uv.getY(j) < 1 - 1e-6).length;
            let creaseEdges = 0, winding = 1;
            for (const face of tipFaces) {
                const [a, b, c] = face.map(point);
                const faceNormal = b.sub(a).cross(c.sub(a)).normalize();
                const shading = face.reduce((sum, j) => sum.add(new THREE.Vector3().fromBufferAttribute(n, j)), new THREE.Vector3()).normalize();
                winding = Math.min(winding, faceNormal.dot(shading));
                for (let j = 0; j < 3; j++) {
                    const a = face[j], b = face[(j + 1) % 3];
                    if (Math.abs(uv.getX(a) - 0.5) < 1e-6 && Math.abs(uv.getX(b) - 0.5) < 1e-6
                        && Math.abs(uv.getY(a) - uv.getY(b)) > 0.08) creaseEdges++;
                }
            }
            const reference = new THREE.Box3().setFromObject(s.shootLods.LOD0.leaves[index]);
            const bounds = new THREE.Box3().setFromObject(leaf);
            return { triangles: leaf.geometry.index.count / 3, minimumClearance, normalError, minimumArea,
                corners, tipFaces: tipFaces.length, intermediateCenters, creaseEdges, winding,
                heightDifference: bounds.max.y - reference.max.y,
                widthRatio: (bounds.max.x - bounds.min.x) / (reference.max.x - reference.min.x),
                sharedMaterial: leaf.material === s.shootLods.LOD0.leaves[index].material };
        });
        return { unchanged, silhouetteAreaRatio, snapshot: s.getSnapshot(), inclined, leaves, sectionLengths, active: s.shootLods.LOD1.group.visible && !s.shootLods.LOD0.group.visible };
    });
    expect(result.unchanged).toEqual({ LOD0: true, LOD0_SMART: true });
    expect(Math.abs(result.silhouetteAreaRatio - 1)).toBeLessThan(0.02);
    for (const section of result.sectionLengths) {
        expect(section.tipStart).toBeCloseTo(0.9, 6);
        expect(section.middleMeters).toBeCloseTo(0.01964730096, 8);
        expect(section.bottomMeters).toBeGreaterThan(0.022);
        expect(section.bodyWidthError).toBeLessThan(1e-8);
    }
    expect(result.active).toBe(true);
    expect(result.snapshot.mode).toBe('LOD1');
    expect(result.snapshot.wireframe.visible).toBe(true);
    expect(result.snapshot.rootSoilEnabled).toBe(true);
    expect(result.snapshot.source.trianglesPerLeaf).toEqual([10, 10, 10]);
    expect([...new Set(result.inclined)]).toEqual([10]);
    for (const leaf of result.leaves) {
        expect(leaf.triangles).toBe(10);
        expect(leaf.corners).toHaveLength(2);
        for (const corner of leaf.corners) { expect(corner.station).toBeCloseTo(0.94, 6); expect(corner.halfWidthRatio).toBeGreaterThan(0.87); expect(corner.halfWidthRatio).toBeLessThan(0.89); }
        expect(leaf.tipFaces).toBe(2); expect(leaf.intermediateCenters).toBe(0); expect(leaf.creaseEdges).toBe(2);
        expect(leaf.winding).toBeGreaterThan(0.9);
        expect(leaf.minimumClearance).toBeGreaterThanOrEqual(-1e-7);
        expect(leaf.normalError).toBeLessThan(1e-6);
        expect(leaf.minimumArea).toBeGreaterThan(1e-13);
        expect(Math.abs(leaf.heightDifference)).toBeLessThan(0.0001);
        expect(leaf.widthRatio).toBeGreaterThan(0.98); expect(leaf.widthRatio).toBeLessThan(1.02);
        expect(leaf.sharedMaterial).toBe(true);
    }
    await expect(page.locator('#plant-counts')).toHaveText('3 leaves · 30 tris');
    await expect(page.locator('#leaf-counts')).toHaveText('Single leaf: 10 tris\nPair left: 10 tris\nPair right: 10 tris');
    for (const lod of ['LOD1', 'LOD0']) {
        await page.getByRole('button', { name: lod === 'LOD0' ? 'Reference' : lod, exact: true }).click();
        await page.evaluate(() => { const s = window.__plantCardsStudy; s.setPose('front'); s.setWireframe(true); });
        await page.screenshot({ path: path.join(folder, 'study_' + lod + '.png') });
        await page.evaluate(() => {
            const s = window.__plantCardsStudy;
            s.controls.target.set(0, 0.0415, 0); s.camera.position.set(0.003, 0.045, 0.029);
            s.controls.update(); s.lighting.render(0);
        });
        await page.screenshot({ path: path.join(folder, 'tip_wireframe_' + lod + '.png') });
        await page.evaluate(() => window.__plantCardsStudy.setWireframe(false));
        await page.screenshot({ path: path.join(folder, 'tip_shaded_' + lod + '.png') });
    }
    await expect(page.locator('#plant-counts')).toHaveText('3 leaves · 132 tris');
    await writeFile(path.join(folder, 'leaf_validation.json'), JSON.stringify(result, null, 2));
    expect(errors).toEqual([]);
});

test('Field LOD selection preserves all 96000 leaf positions, colors, layers and camera', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await mkdir(folder, { recursive: true });
    await page.goto('/debug_tools/grass_litter_scene.html?revision=lod1-narrow-tip-1#01_overview');
    await page.waitForFunction(() => !!window.__grassLitterReadiness);
    await page.evaluate(() => window.__grassLitterReadiness);
    const snapshot = () => page.evaluate(() => window.__grassLitterScene.getSnapshot());
    const before = await snapshot();
    const parity = await page.evaluate(() => {
        const s = window.__grassLitterScene, field = s.scene.getObjectByName('Offline_96000_Leaves');
        const [high, low] = [field.children[0], field.getObjectByName('GrassField-LOD1')];
        const tips = mesh => {
            const { position, uv, color } = mesh.geometry.attributes, result = [];
            for (let i = 0; i < position.count; i++) if (uv.getY(i) >= 1 - 1e-7) result.push({
                position: [position.getX(i), position.getY(i), position.getZ(i)],
                color: [color.getX(i), color.getY(i), color.getZ(i)]
            });
            return result;
        };
        const a = tips(high), b = tips(low);
        if (a.length !== b.length) throw new Error('LOD tip counts differ: ' + a.length + ' vs ' + b.length);
        let positionError = 0, colorError = 0, minHeight = Infinity, maxHeight = 0, referenceMinHeight = Infinity, referenceMaxHeight = 0;
        for (let i = 0; i < a.length; i++) {
            for (let axis = 0; axis < 3; axis++) {
                positionError = Math.max(positionError, Math.abs(a[i].position[axis] - b[i].position[axis]));
                colorError = Math.max(colorError, Math.abs(a[i].color[axis] - b[i].color[axis]));
            }
            minHeight = Math.min(minHeight, b[i].position[1]); maxHeight = Math.max(maxHeight, b[i].position[1]);
            referenceMinHeight = Math.min(referenceMinHeight, a[i].position[1]); referenceMaxHeight = Math.max(referenceMaxHeight, a[i].position[1]);
        }
        return { tips: a.length, positionError, colorError, minHeight, maxHeight, referenceMinHeight, referenceMaxHeight,
            sharedMaterial: high.material === low.material, shadows: low.castShadow && low.receiveShadow,
            lowTriangles: low.geometry.index.count / 3 };
    });
    expect(parity.tips).toBe(96000);
    expect(parity.positionError).toBeLessThan(0.000003);
    expect(parity.colorError).toBeLessThan(0.000001);
    expect(parity.minHeight).toBeCloseTo(parity.referenceMinHeight, 6);
    expect(parity.maxHeight).toBeCloseTo(parity.referenceMaxHeight, 6);
    expect(parity.sharedMaterial && parity.shadows).toBe(true);
    expect(before.lods.LOD1.trianglesPerLeaf).toEqual({ min: 10, max: 10 });
    expect(parity.lowTriangles).toBe(before.lods.LOD1.triangles);
    expect(parity.lowTriangles).toBe(96000 * 10);
    const control = page.getByRole('combobox', { name: 'LOD', exact: true });
    await control.selectOption('LOD1');
    const after = await snapshot(), expectedAll = parity.lowTriangles + 688;
    expect(after).toMatchObject({ lod: 'LOD1', leaves: 96000, visibleLeaves: 96000, visibleTriangles: expectedAll,
        position: before.position, quaternion: before.quaternion });
    await expect(page.locator('#scene-counts')).toHaveText('12 × 12 m · 96,000 leaves · ' + expectedAll.toLocaleString('en-US') + ' triangles');
    for (const [name, mode, triangles] of [['Grass only', 'grass', parity.lowTriangles + 590], ['Soil', 'soil', 590], ['All', 'all', expectedAll]]) {
        await page.getByRole('radio', { name, exact: true }).check();
        expect(await snapshot()).toMatchObject({ lod: 'LOD1', mode, visibleTriangles: triangles });
    }
    for (const view of ['0', '2', '5']) {
        await page.locator('#scene-view').selectOption(view);
        for (const lod of ['LOD0', 'LOD1']) {
            await control.selectOption(lod);
            await page.screenshot({ path: path.join(folder, 'field_view_' + view + '_' + lod + '.png') });
        }
    }
    await control.selectOption('LOD0');
    expect((await snapshot()).visibleTriangles).toBe(4235512);
    await writeFile(path.join(folder, 'field_validation.json'), JSON.stringify({ parity, lods: before.lods, before, after }, null, 2));
    expect(errors).toEqual([]);
});
