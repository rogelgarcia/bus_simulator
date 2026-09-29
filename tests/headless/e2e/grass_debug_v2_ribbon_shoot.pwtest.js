// Verify soil-rooted blades retain their outline without a basal sheath or axial twist.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1, video: 'off' });
test('Soil-rooted leaves have no twisting base and stay within 50 triangles after clipping', async ({ page }) => {
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/soil_rooted_blades');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=shoot');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await expect(page.locator('#plant-counts')).toHaveText(/^3 leaves · [0-9,]+ tris$/);
    const result = await page.evaluate(async () => {
        const THREE = await import('three'), study = window.__plantCardsStudy;
        const { createGrassDebugV2RibbonShoot } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2RibbonShoot.js');
        const { clipGrassDebugV2MeshAtSoil } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2SoilClip.js');
        const source = createGrassDebugV2RibbonShoot({ material: study.plant.leaves[0].material });
        source.group.updateMatrixWorld(true);
        const authored = source.getSnapshot(), stride = authored.definition.acrossSegments + 2;
        const shapes = source.leaves.map((leaf, i) => {
            const p = leaf.geometry.attributes.position, n = leaf.geometry.attributes.normal;
            let twist = 0, creaseGap = 0, spineSideways = 0, minimumArea = Infinity, normalError = 0;
            const point = index => new THREE.Vector3().fromBufferAttribute(p, index);
            for (let row = 0; row < authored.definition.bladeSegments; row++) {
                const start = row * stride, across = point(start + stride - 1).sub(point(start)).normalize();
                twist = Math.max(twist, Math.hypot(across.y, across.z));
                creaseGap = Math.max(creaseGap, point(start + 1).distanceTo(point(start + 2)));
                spineSideways = Math.max(spineSideways, Math.abs(p.getX(start + 1)));
            }
            for (let j = 0; j < n.count; j++) normalError = Math.max(normalError,
                Math.abs(new THREE.Vector3().fromBufferAttribute(n, j).length() - 1));
            for (let j = 0; j < leaf.geometry.index.count; j += 3) {
                const [a, b, c] = [0, 1, 2].map(k => point(leaf.geometry.index.getX(j + k)));
                minimumArea = Math.min(minimumArea, b.sub(a).cross(c.sub(a)).length() * 0.5);
            }
            return { name: leaf.name, twist, creaseGap, spineSideways, minimumArea, normalError,
                rootHeight: p.getY(1), rootWidth: point(0).distanceTo(point(stride - 1)),
                tip: point(p.count - 1).toArray(), triangles: leaf.geometry.index.count / 3,
                expectedBend: i === 0 ? 0 : 11, finite: [...p.array, ...n.array].every(Number.isFinite) };
        });
        const clipped = study.plant.leaves.map(leaf => {
            const p = leaf.geometry.attributes.position;
            let minimumClearance = Infinity, boundaryVertices = 0;
            for (let i = 0; i < p.count; i++) {
                const point = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(leaf.matrixWorld);
                const clearance = point.y - study.soil.getHeightAt(point.x, point.z);
                minimumClearance = Math.min(minimumClearance, clearance);
                if (Math.abs(clearance) < 1e-6) boundaryVertices++;
            }
            return { name: leaf.name, triangles: leaf.geometry.index.count / 3, minimumClearance, boundaryVertices,
                vertices: p.count, usedVertices: new Set(leaf.geometry.index.array).size };
        });
        const left = new THREE.Box3().setFromObject(study.plant.leaves[1], true);
        const right = new THREE.Box3().setFromObject(study.plant.leaves[2], true);
        source.trimAtSoil(() => 0);
        source.group.updateMatrixWorld(true);
        const inclinedCounts = [];
        for (let inclination = 0; inclination <= 45; inclination += 1.875) for (const leaf of source.leaves.slice(1)) {
            const matrix = new THREE.Matrix4().makeRotationX(-THREE.MathUtils.degToRad(inclination))
                .multiply(new THREE.Matrix4().makeTranslation(-0.035, 0, 0)).multiply(leaf.matrixWorld);
            const geometry = leaf.geometry.clone().applyMatrix4(matrix), mesh = new THREE.Mesh(geometry, leaf.material);
            clipGrassDebugV2MeshAtSoil(mesh, () => 0);
            inclinedCounts.push(mesh.geometry.index.count / 3);
            mesh.geometry.dispose();
        }
        source.dispose();
        return { authored, shapes, clipped, inclinedCounts, pairGap: right.min.x - left.max.x,
            crowns: study.plant.crowns.length, meshes: study.plant.group.children.length,
            bakeMeshes: study.plant.bakeMeshes.length, displayed: study.plant.getSnapshot() };
    });
    expect(result.authored.stage).toBe('soil-rooted-blades');
    expect(result.authored.crownTriangles).toBe(0);
    expect(result.crowns).toBe(0); expect(result.meshes).toBe(3); expect(result.bakeMeshes).toBe(3);
    for (const shape of result.shapes) {
        expect(shape.triangles).toBe(42);
        expect(shape.rootHeight).toBe(0);
        expect(shape.rootWidth).toBeGreaterThan(0.0043);
        expect(shape.twist).toBeLessThan(1e-7);
        expect(shape.creaseGap).toBeLessThan(1e-8);
        expect(shape.spineSideways).toBeLessThan(1e-8);
        expect(shape.normalError).toBeLessThan(1e-6);
        expect(shape.minimumArea).toBeGreaterThan(1e-13);
        expect(shape.finite).toBe(true);
        if (shape.expectedBend) {
            expect(shape.tip[2]).toBeLessThan(-0.004);
            expect(shape.tip[2]).toBeGreaterThan(-0.005);
        } else {
            expect(shape.tip[2]).toBe(0);
            expect(shape.tip[1]).toBeCloseTo(0.047, 6);
        }
    }
    for (const leaf of result.clipped) {
        expect(leaf.triangles).toBeLessThanOrEqual(50);
        expect(leaf.minimumClearance).toBeGreaterThanOrEqual(-1e-7);
        expect(leaf.boundaryVertices).toBeGreaterThan(0);
        expect(leaf.usedVertices).toBe(leaf.vertices);
    }
    expect(result.pairGap).toBeGreaterThan(0.00019);
    expect(Math.max(...result.inclinedCounts)).toBeLessThanOrEqual(50);
    await page.addStyleTag({ content: '.plant-study-panel { visibility: hidden; }' });
    for (const pose of ['front', 'three_quarter', 'side', 'elevated', 'crown_close']) {
        await page.evaluate(pose => window.__plantCardsStudy.setPose(pose), pose);
        await page.screenshot({ path: path.join(folder, pose + '.png') });
    }
    expect(errors).toEqual([]);
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify(result, null, 2));
});
