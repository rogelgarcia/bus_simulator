// Check fixed root topology, soil contact and unchanged upper geometry across field inclinations.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/lod1_ten_triangles/root_fit');
test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off' });

test('Fitted roots preserve boundary edges and fixed counts on flat and uneven soil', async ({ page }) => {
    await mkdir(output, { recursive: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot&revision=lod1-ten-tris-1');
    await page.waitForFunction(() => !!window.__plantCardsReadiness); await page.evaluate(() => window.__plantCardsReadiness);
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), s = window.__plantCardsStudy;
        const { createGrassDebugV2RibbonShoot: create } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?v=lod1-ten-tris-1');
        const { fitGrassDebugV2RibbonRoot: fit } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonRoot.js?v=lod1-ten-tris-1');
        const material = s.plant.leaves[0].material, results = [];
        for (const lod of ['LOD0_SMART', 'LOD1']) {
            const source = create({ material, lod }); source.group.updateMatrixWorld(true);
            for (let degree = 0; degree <= 45; degree += 1.875) for (const leaf of source.leaves) {
                const transform = new THREE.Matrix4().makeRotationX(-THREE.MathUtils.degToRad(degree)).multiply(leaf.matrixWorld);
                for (const [soil, heightAt] of [['flat', () => 0], ['study', s.soil.getHeightAt]]) {
                    const mesh = new THREE.Mesh(leaf.geometry.clone().applyMatrix4(transform), material);
                    const before = mesh.geometry.clone(), oldP = before.attributes.position;
                    fit(mesh, heightAt);
                    const g = mesh.geometry, p = g.attributes.position, point = j => new THREE.Vector3().fromBufferAttribute(p, j);
                    const rootClearances = [], edgeErrors = [];
                    for (let j = 0; j < 4; j++) {
                        const a = new THREE.Vector3().fromBufferAttribute(oldP, j), b = new THREE.Vector3().fromBufferAttribute(oldP, j + 4);
                        const direction = b.sub(a).normalize(), delta = point(j).sub(a);
                        edgeErrors.push(delta.clone().addScaledVector(direction, -delta.dot(direction)).length());
                        rootClearances.push(p.getY(j) - heightAt(p.getX(j), p.getZ(j)));
                    }
                    const upperUnchanged = Object.entries(g.attributes).every(([name, a]) =>
                        a.array.slice(4 * a.itemSize).every((value, j) => value === before.attributes[name].array[4 * a.itemSize + j]));
                    let minimumArea = Infinity, normalError = 0;
                    for (let i = 0; i < g.index.count; i += 3) {
                        const [a, b, c] = [0, 1, 2].map(k => point(g.index.getX(i + k)));
                        minimumArea = Math.min(minimumArea, b.sub(a).cross(c.sub(a)).length() / 2);
                    }
                    for (const j of new Set(g.index.array)) for (const name of ['normal', 'grassFacingNormal'])
                        normalError = Math.max(normalError, Math.abs(new THREE.Vector3().fromBufferAttribute(g.attributes[name], j).length() - 1));
                    const firstFit = p.array.slice(); fit(mesh, heightAt);
                    results.push({ lod, degree, leaf: leaf.name, soil, count: g.index.count / 3, upperUnchanged,
                        sameIndices: g.index.array.every((v, j) => v === before.index.array[j]),
                        rootError: Math.max(...rootClearances.map(Math.abs)), edgeError: Math.max(...edgeErrors),
                        creaseGap: point(1).distanceTo(point(2)), minimumArea, normalError,
                        repeatedFitError: Math.max(...p.array.map((v, j) => Math.abs(v - firstFit[j]))) });
                    before.dispose(); g.dispose();
                }
            }
            source.dispose();
        }
        return results;
    });
    expect(result).toHaveLength(300);
    for (const r of result) {
        expect(r.count).toBe(r.lod === 'LOD1' ? 10 : 18);
        expect(r.upperUnchanged && r.sameIndices).toBe(true);
        expect(r.rootError).toBeLessThan(1e-8); expect(r.edgeError).toBeLessThan(1e-8);
        expect(r.creaseGap).toBeLessThan(1e-8); expect(r.minimumArea).toBeGreaterThan(1e-10);
        expect(r.normalError).toBeLessThan(1e-6); expect(r.repeatedFitError).toBeLessThan(1e-8);
    }
    for (const lod of ['LOD0_SMART', 'LOD1']) for (const method of ['clipped', 'fitted']) {
        await page.evaluate(async ({ lod, method }) => {
            const s = window.__plantCardsStudy;
            const { createGrassDebugV2RibbonShoot: create } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js?v=lod1-ten-tris-1');
            const { clipGrassDebugV2MeshAtSoil: clip } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2SoilClip.js');
            const source = create({ material: s.plant.leaves[0].material, lod });
            if (method === 'clipped') source.leaves.forEach(leaf => clip(leaf, s.soil.getHeightAt));
            else source.trimAtSoil(s.soil.getHeightAt);
            s.setMode(lod); s.setWireframe(false);
            s.shootLods[lod].leaves.forEach((leaf, i) => {
                leaf.geometry.dispose(); leaf.geometry = source.leaves[i].geometry.clone();
            });
            source.dispose(); s.setMode(lod);
            s.controls.target.set(0, 0.005, 0); s.camera.position.set(0.012, 0.008, 0.026);
            s.controls.update(); s.lighting.render(0);
        }, { lod, method });
        await page.screenshot({ path: path.join(output, lod + '_' + method + '_root.png') });
    }
    await writeFile(path.join(output, 'root_validation.json'), JSON.stringify(result, null, 2));
    expect(errors).toEqual([]);
});
