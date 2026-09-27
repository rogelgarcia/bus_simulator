// Verify the full-scale field reuses the hybrid source and stays interactive across runtime LODs.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('Large field repeats 600 hybrid squares with separate camera views', async ({ page }) => {
    test.setTimeout(120000);
    const folder = path.resolve('tests/artifacts/screens/grass_debug_v2/large_field');
    await mkdir(folder, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await expect(page.locator('#field-cameras')).toBeVisible();
    await expect(page.locator('#field-visible')).not.toBeChecked();
    expect(await page.evaluate(() => window.__plantCardsStudy.largeField.group.visible)).toBe(false);
    await page.locator('#field-visible').check();
    const state = await page.evaluate(async () => {
        const THREE = await import('three');
        const s = window.__plantCardsStudy, f = s.largeField, chunks = f.group.children.filter(child => child.isGroup);
        const leafMeshes = chunks.flatMap(chunk => chunk.children.filter(mesh => mesh.name.startsWith('GrassV2FieldLeaves')));
        const floors = chunks.map(chunk => chunk.children[0]);
        const original = s.comparison.hybrid.refined.children;
        let maximumBoundaryError = 0, maximumUvError = 0, floorArea = 0;
        const occupied = new Set(), vertex = new THREE.Vector3();
        for (const floor of floors) {
            const { position, uv } = floor.geometry.attributes;
            for (let first = 0; first < position.count; first += 4) {
                const points = Array.from({ length: 4 }, (_, i) => floor.localToWorld(vertex.fromBufferAttribute(position, first + i)).clone());
                const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
                const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
                const column = Math.round((minX + maxX) / 2 - f.bounds.min.x - 0.5);
                const row = Math.round(f.bounds.max.z - (minZ + maxZ) / 2 - 0.5);
                occupied.add(column + ':' + row);
                const expected = [f.bounds.min.x + column + (column === 0 ? 0.03 : 0),
                    f.bounds.min.x + column + 1 - (column === 19 ? 0.03 : 0),
                    f.bounds.max.z - row - 1 + (row === 29 ? 0.03 : 0),
                    f.bounds.max.z - row - (row === 0 ? 0.03 : 0)];
                [minX, maxX, minZ, maxZ].forEach((value, i) => { maximumBoundaryError = Math.max(maximumBoundaryError, Math.abs(value - expected[i])); });
                points.forEach((point, i) => {
                    maximumUvError = Math.max(maximumUvError,
                        Math.abs(uv.getX(first + i) - (point.x - f.bounds.min.x - column)),
                        Math.abs(uv.getY(first + i) - (f.bounds.max.z - row - point.z)));
                });
                floorArea += (maxX - minX) * (maxZ - minZ);
            }
        }
        const matricesMatch = chunks[0].children.slice(1).every((mesh, index) =>
            Array.from(original[index].instanceMatrix.array).every((value, i) => mesh.instanceMatrix.array[i] === value));
        return { ...f.getSnapshot(), actualLeaves: leafMeshes.reduce((sum, mesh) => sum + mesh.count, 0),
            actualTiles: floors.reduce((sum, mesh) => sum + mesh.geometry.index.count / 6, 0),
            sharedMatrices: chunks.every(chunk => chunk.children.slice(1).every((mesh, i) => mesh.instanceMatrix === chunks[0].children[i + 1].instanceMatrix)),
            sharedTexture: floors.every(mesh => mesh.material === s.comparison.tiles[1].material),
            maximumBoundaryError, maximumUvError, floorArea, uniqueTiles: occupied.size, matricesMatch,
            groundWidth: s.scene.getObjectByName('GrassV2DirtTerrain').geometry.parameters.width,
            referenceRight: s.comparison.bounds.max.x };
    });
    expect(state).toMatchObject({ widthMeters: 20, depthMeters: 30, gapMeters: 0.6,
        tiles: 600, leaves: 600000, leavesPerSquare: 1000, textureLeavesPerSquare: 4000,
        actualLeaves: 600000, actualTiles: 600, chunks: 24, mode: 'refined',
        cards: 6000000, leafTriangles: 12000000, floorTriangles: 1200,
        sharedMatrices: true, sharedTexture: true, matricesMatch: true, uniqueTiles: 600, textureBorderMeters: 0.03 });
    expect(state.maximumBoundaryError).toBeLessThan(1e-6);
    expect(state.maximumUvError).toBeLessThan(1e-6);
    expect(state.floorArea).toBeCloseTo(19.94 * 29.94, 4);
    expect(state.bounds.min[0] - state.referenceRight).toBeCloseTo(0.6, 8);
    expect(state.bounds.max[0] - state.bounds.min[0]).toBe(20);
    expect(state.bounds.max[2] - state.bounds.min[2]).toBe(30);
    expect(state.bounds.max[0]).toBeLessThan(state.groundWidth / 2);
    await page.screenshot({ path: path.join(folder, 'comparison-and-field.png') });
    const views = {};
    for (const pose of ['overview', 'top', 'two_meters', 'four_meters']) {
        await page.locator('[data-field-pose="' + pose + '"]').click();
        views[pose] = await page.evaluate(async () => {
            const THREE = await import('three'), s = window.__plantCardsStudy, bounds = s.largeField.bounds;
            const corners = [];
            for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z])
                corners.push(new THREE.Vector3(x, y, z).project(s.camera).toArray());
            const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(s.camera.projectionMatrix, s.camera.matrixWorldInverse));
            const chunks = s.largeField.group.children.filter(child => child.isGroup);
            return { position: s.camera.position.toArray(), target: s.controls.target.toArray(), corners,
                visibleChunks: chunks.filter(chunk => frustum.intersectsObject(chunk.children[0])).length };
        });
        if (pose === 'overview' || pose === 'top') {
            for (const corner of views[pose].corners) { expect(Math.abs(corner[0])).toBeLessThan(0.94); expect(Math.abs(corner[1])).toBeLessThan(0.94); }
            expect(views[pose].visibleChunks).toBe(24);
        } else expect(views[pose].position[1]).toBeCloseTo(pose === 'two_meters' ? 2 : 4, 8);
        if (pose === 'top') {
            const hover = await page.evaluate(async () => {
                const THREE = await import('three'), s = window.__plantCardsStudy;
                const point = s.largeField.bounds.getCenter(new THREE.Vector3()).setY(0.01), ndc = point.clone().project(s.camera);
                return { x: (ndc.x + 1) * innerWidth / 2, y: (1 - ndc.y) * innerHeight / 2,
                    distance: s.camera.position.distanceTo(point).toFixed(2) };
            });
            await page.mouse.move(hover.x, hover.y);
            await expect(page.locator('.grass-patch-distance')).toHaveText('Distance: ' + hover.distance
                + ' m\nTexture: 4K\nLOD3 · 10: 1K\nTriangles: 20,002');
            await page.mouse.move(5, 5);
        }
        await page.screenshot({ path: path.join(folder, pose + '.png') });
    }
    for (const [mode, cards] of [['detailed', 5], ['curved', 3], ['split', 2], ['refined', 10]]) {
        await page.locator('[data-mode="' + mode + '"]').click();
        const actual = await page.evaluate(() => {
            const s = window.__plantCardsStudy;
            let triangles = 0;
            s.largeField.group.traverse(mesh => { if (mesh.name.startsWith('GrassV2FieldLeaves'))
                triangles += mesh.geometry.index.count / 3 * mesh.count; });
            return { snapshot: s.largeField.getSnapshot(), triangles };
        });
        expect(actual.snapshot.leaves).toBe(600000); expect(actual.snapshot.cardsPerLeaf).toBe(cards);
        expect(actual.triangles).toBe(600000 * cards * 2);
    }
    await page.locator('[data-pose="three_quarter"]').click();
    await page.locator('[data-mode="LOD0"]').click();
    expect(await page.evaluate(() => window.__plantCardsStudy.largeField.getSnapshot().mode)).toBe('refined');
    await page.locator('[data-mode="refined"]').click();
    expect(errors).toEqual([]);
    await writeFile(path.join(folder, 'validation.json'), JSON.stringify({ state, views, errors }, null, 2));
});
