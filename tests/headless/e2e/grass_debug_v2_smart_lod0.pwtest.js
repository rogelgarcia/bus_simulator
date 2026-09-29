// Validate Reference/LOD0 selectors, widened shoulders, three-section body and field counts.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/root_fit/lod0');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off' });
test('LOD0 has wider shoulders, equal upper body sections and a longer base', async ({ page }) => {
    await mkdir(output, { recursive: true }); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const before = await readFile(path.join(output, 'before_GrassDebugV2RibbonShoot.js'), 'utf8');
    await page.route('**/GrassDebugV2RibbonShoot.js?verify=before-shoulder-width', route => route.fulfill({ contentType: 'text/javascript', body: before }));
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot&revision=root-fit-1');
    await page.waitForFunction(() => !!window.__plantCardsReadiness); await page.evaluate(() => window.__plantCardsReadiness);
    await page.getByRole('button', { name: 'LOD0', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Wireframe', exact: true }).check();
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy;
        const { createGrassDebugV2RibbonShoot: create } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?v=root-fit-1');
        const { createGrassDebugV2RibbonShoot: before } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?verify=before-shoulder-width');
        const { fitGrassDebugV2RibbonRoot } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonRoot.js?v=root-fit-1');
        const { clipGrassDebugV2MeshAtSoil } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2SoilClip.js');
        const material = s.plant.leaves[0].material, original = create({ material }), smart = create({ material, lod: 'LOD0_SMART' });
        const previous = before({ material, lod: 'LOD0_SMART' });
        const sections = smart.leaves.map((leaf, index) => {
            const g = leaf.geometry, { position: p, uv } = g.attributes;
            const used = [...new Set(g.index.array)], rows = new Map();
            for (const j of used) if (uv.getX(j) === 0.5 && uv.getY(j) <= 0.918 + 1e-6)
                rows.set(uv.getY(j).toFixed(6), j);
            const centers = [...rows.values()].sort((a, b) => uv.getY(a) - uv.getY(b));
            const bend = index === 0 ? 0 : THREE.MathUtils.degToRad(11) / 0.047;
            const arc = j => bend ? Math.atan2(p.getY(j) * bend, 1 + p.getZ(j) * bend) / bend : p.getY(j);
            const lengths = centers.slice(1).map((j, i) => arc(j) - arc(centers[i]));
            const cap = geometry => {
                const used = [...new Set(geometry.index.array)];
                return used.filter(j => geometry.attributes.uv.getY(j) > 0.918 + 1e-6).map(j =>
                    ['position', 'color', 'uv'].map(name => {
                        const a = geometry.attributes[name]; return Array.from(a.array.slice(j * a.itemSize, (j + 1) * a.itemSize)).join(',');
                    }).join(';')).sort();
            };
            const body = [[], []]; let tipFaces = 0, minArea = Infinity, minWinding = 1;
            for (let i = 0; i < g.index.count; i += 3) {
                const face = [0, 1, 2].map(k => g.index.getX(i + k));
                const [a, b, c] = face.map(j => new THREE.Vector3().fromBufferAttribute(p, j));
                const n = b.sub(a).cross(c.sub(a)); minArea = Math.min(minArea, n.length() / 2);
                const normal = face.reduce((sum, j) => sum.add(new THREE.Vector3().fromBufferAttribute(g.attributes.normal, j)), new THREE.Vector3()).normalize();
                minWinding = Math.min(minWinding, n.normalize().dot(normal));
                if (face.every(j => uv.getY(j) >= 0.918 - 1e-6)) tipFaces++;
                else {
                    const side = face.every(j => uv.getX(j) <= 0.5) ? 0 : 1;
                    body[side].push(face.map(j => [Math.abs(uv.getX(j) - 0.5).toFixed(3), uv.getY(j).toFixed(6)].join(':')).sort().join(','));
                }
            }
            const old = previous.leaves[index].geometry, oldUv = old.attributes.uv, oldP = old.attributes.position;
            const oldCenters = [...new Set(old.index.array)].filter(j => oldUv.getX(j) === 0.5 && oldUv.getY(j) <= 0.918 + 1e-6);
            const oldRows = [...new Map(oldCenters.map(j => [oldUv.getY(j).toFixed(6), j])).values()].sort((a, b) => oldUv.getY(a) - oldUv.getY(b));
            const oldArc = j => bend ? Math.atan2(oldP.getY(j) * bend, 1 + oldP.getZ(j) * bend) / bend : oldP.getY(j);
            const shoulders = used.filter(j => (uv.getX(j) === 0 || uv.getX(j) === 1) && Math.abs(uv.getY(j) - 0.918) < 1e-6).map(j => {
                const k = [...new Set(old.index.array)].find(k => oldUv.getX(k) === uv.getX(j) && Math.abs(oldUv.getY(k) - 0.918) < 1e-6);
                return Math.abs(p.getX(j) / oldP.getX(k));
            });
            return { centers: centers.length, lengths, shoulders, originalTopLength: oldArc(oldRows.at(-1)) - oldArc(oldRows.at(-2)),
                body: body.map(faces => faces.sort()), tipFaces, triangles: g.index.count / 3,
                cap: cap(g), previousCap: cap(old), minArea, minWinding };
        });
        const unchanged = {};
        for (const lod of ['LOD0']) {
            const a = create({ material, lod }), b = before({ material, lod });
            unchanged[lod] = a.leaves.every((leaf, i) => {
                const g = leaf.geometry, old = b.leaves[i].geometry;
                return g.index.count === old.index.count && g.index.array.every((v, j) => v === old.index.array[j])
                    && Object.entries(g.attributes).every(([name, a]) => a.array.length === old.attributes[name].array.length && a.array.every((v, j) => v === old.attributes[name].array[j]));
            });
            a.dispose(); b.dispose();
        }
        for (const source of [original, smart]) { source.trimAtSoil(() => 0); source.group.updateMatrixWorld(true); }
        const variants = [];
        for (let degrees = 0; degrees <= 45; degrees += 1.875) for (let leafIndex = 1; leafIndex <= 2; leafIndex++) {
            const counts = [original, smart].map(source => {
                const leaf = source.leaves[leafIndex];
                const transform = new THREE.Matrix4().makeRotationX(-THREE.MathUtils.degToRad(degrees))
                    .multiply(new THREE.Matrix4().makeTranslation(-0.035, 0, 0)).multiply(leaf.matrixWorld);
                const mesh = new THREE.Mesh(leaf.geometry.clone().applyMatrix4(transform), leaf.material);
                (source === original ? clipGrassDebugV2MeshAtSoil : fitGrassDebugV2RibbonRoot)(mesh, () => 0); const count = mesh.geometry.index.count / 3;
                const heights = mesh.geometry.attributes.position.array.filter((_, i) => i % 3 === 1);
                if (Math.min(...heights) < -1e-8) throw new Error('Inclined leaf crosses the soil.');
                mesh.geometry.dispose(); return count;
            });
            variants.push({ degrees, counts });
        }
        original.dispose(); smart.dispose(); previous.dispose();
        return { sections, variants, unchanged, snapshot: s.getSnapshot() };
    });
    for (const section of result.sections) {
        expect(section.centers).toBe(4);
        expect(section.lengths).toHaveLength(3);
        expect(section.lengths[1]).toBeCloseTo(section.lengths[2], 8);
        expect(section.lengths[2]).toBeCloseTo(section.originalTopLength, 8);
        expect(section.lengths[0]).toBeGreaterThan(section.lengths[1] * 1.5);
        expect(section.body[0]).toHaveLength(6); expect(section.body[1]).toEqual(section.body[0]);
        expect(section.tipFaces).toBe(6); expect(section.triangles).toBe(18);
        expect(section.cap).toEqual(section.previousCap);
        expect(section.shoulders).toEqual([expect.closeTo(1.03, 6), expect.closeTo(1.03, 6)]);
        expect(section.minArea).toBeGreaterThan(1e-13); expect(section.minWinding).toBeGreaterThan(0.9);
    }
    expect(result.unchanged).toEqual({ LOD0: true });
    for (const v of result.variants) { expect(v.counts[1]).toBe(18); }
    await expect(page.locator('#plant-counts')).toHaveText('3 leaves · 54 tris');
    await expect(page.locator('h1')).toHaveText('Leaf Growth · LOD0');
    await page.getByRole('button', { name: 'Reference', exact: true }).click();
    await expect(page.locator('#plant-counts')).toHaveText('3 leaves · 132 tris');
    await expect(page.locator('h1')).toHaveText('Leaf Growth · Reference');
    await page.getByRole('button', { name: 'LOD0', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Smart LOD0', exact: true })).toHaveCount(0);
    for (const lod of ['LOD0', 'LOD0_SMART']) {
        await page.evaluate(lod => { const s = window.__plantCardsStudy; s.setMode(lod); s.setPose('front'); }, lod);
        await page.screenshot({ path: path.join(output, 'study_' + lod + '.png') });
        await page.evaluate(() => {
            const s = window.__plantCardsStudy;
            s.camera.position.set(0.003, 0.045, 0.029); s.controls.target.set(0, 0.0415, 0);
            s.controls.update(); s.lighting.render(0);
        });
        await page.screenshot({ path: path.join(output, 'tip_' + lod + '.png') });
        await page.evaluate(() => window.__plantCardsStudy.setWireframe(false));
        await page.screenshot({ path: path.join(output, 'shading_' + lod + '.png') });
        await page.evaluate(async lod => {
            const THREE = await import('three'), s = window.__plantCardsStudy, leaf = s.shootLods[lod].leaves[1];
            leaf.updateWorldMatrix(true, false);
            const target = new THREE.Vector3(0, 0.035, -0.0035).applyMatrix4(leaf.matrixWorld);
            s.controls.target.copy(target); s.camera.position.copy(target).add(new THREE.Vector3(0.024, 0.038, 0.06));
            s.controls.update(); s.setWireframe(true); s.lighting.render(0);
        }, lod);
        await page.screenshot({ path: path.join(output, 'paired_tip_' + lod + '.png') });
        await page.evaluate(() => window.__plantCardsStudy.setWireframe(false));
        await page.screenshot({ path: path.join(output, 'paired_shading_' + lod + '.png') });
        await page.evaluate(() => window.__plantCardsStudy.setWireframe(true));
    }
    await writeFile(path.join(output, 'geometry.json'), JSON.stringify(result, null, 2)); expect(errors).toEqual([]);
});

test('Field Reference and LOD0 labels select the correct geometry and counts', async ({ page }) => {
    test.setTimeout(120000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/debug_tools/grass_litter_scene.html?revision=root-fit-1#01_overview');
    await page.waitForFunction(() => !!window.__grassLitterReadiness); await page.evaluate(() => window.__grassLitterReadiness);
    const lodControl = page.getByRole('combobox', { name: 'LOD', exact: true });
    await expect(lodControl.locator('option')).toHaveText(['Reference', 'LOD0', 'LOD1', 'LOD2']);
    await lodControl.selectOption({ label: 'LOD0' });
    const result = await page.evaluate(() => {
        const s = window.__grassLitterScene, field = s.scene.getObjectByName('Offline_96000_Leaves');
        const original = field.children[0], smart = field.getObjectByName('GrassField-LOD0_SMART');
        const tips = mesh => {
            const { position: p, uv, color: c } = mesh.geometry.attributes, out = [];
            for (let i = 0; i < uv.count; i++) if (uv.getY(i) === 1) out.push([p.getX(i), p.getY(i), p.getZ(i), c.getX(i), c.getY(i), c.getZ(i)]);
            return out;
        };
        const a = tips(original), b = tips(smart);
        const parity = { original: a.length, smart: b.length,
            error: Math.max(...a.map((v, i) => Math.max(...v.map((x, j) => Math.abs(x - b[i][j]))))) };
        const one = s.getSnapshot(); s.setFieldCount(9); s.frameFields(); const all = s.getSnapshot();
        s.setMode('grass'); const grass = s.getSnapshot(); s.setMode('soil'); const soil = s.getSnapshot(); s.setMode('all');
        return { parity, one, all, grass, soil };
    });
    expect(result.parity).toMatchObject({ original: 96000, smart: 96000 }); expect(result.parity.error).toBeLessThan(0.000003);
    expect(result.one.lods.LOD0.triangles - result.one.lods.LOD0_SMART.triangles).toBe(2507466);
    expect(result.one).toMatchObject({ visibleTriangles: 1728688, visibleLeaves: 96000, lod: 'LOD0_SMART' });
    expect(result.all).toMatchObject({ visibleTriangles: 15553472, visibleLeaves: 864000, visibleFields: 9 });
    expect(result.grass.visibleTriangles).toBe(15552590); expect(result.soil.visibleTriangles).toBe(590);
    await writeFile(path.join(output, 'field.json'), JSON.stringify(result, null, 2));
    expect(errors).toEqual([]);
});
