// Verify the interactive four-thousand-leaf layout keeps matching LODs and working study controls.
import test, { expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off' });
test('4K leaf patch displays all LODs with shared placements and correction controls', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [], folder = path.resolve('tests/artifacts/screens/grass_debug_v2/field_turf_4k');
    await mkdir(folder, { recursive: true });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_plant_study.html?layout=random');
    await page.waitForFunction(() => !!window.__plantCardsReadiness);
    await page.evaluate(() => window.__plantCardsReadiness);
    await page.locator('[data-mode="LOD0"]').click();
    await expect(page.getByRole('heading', { name: '4K Leaf Patch' })).toBeVisible();
    await expect(page.locator('#plant-counts')).toHaveText('4000 leaves · 31,552,000 tris');
    const patch = await page.evaluate(() => {
        const s = window.__plantCardsStudy, p = s.patch.getSnapshot();
        const matrices = s.patch.lod0.children.filter(mesh => mesh.isInstancedMesh).filter((_, i) => i % 2 === 0);
        return { count: p.leaves, bounds: p.bounds, rootSoil: s.soil.group.visible, ground: s.scene.getObjectByName('GrassV2DirtTerrain').visible,
            bends: p.bends, distribution: p.distribution, periodicRoots: p.periodicRoots,
            rootsInside: p.placements.every(leaf => leaf.x >= -0.5 && leaf.x < 0.5 && leaf.z >= -0.5 && leaf.z < 0.5),
            cutEnds: matrices.every(mesh => {
                const uv = mesh.geometry.attributes.uv, positions = mesh.geometry.attributes.position;
                const tipT = uv.getY(uv.count - 1), tipVertices = Array.from({ length: uv.count }, (_, i) => i).filter(i => uv.getY(i) === tipT);
                return tipVertices.length === 33 && tipT < 0.9
                    && Math.max(...tipVertices.map(i => positions.getX(i))) - Math.min(...tipVertices.map(i => positions.getX(i))) > 0.001;
            }),
            occupiedCells: new Set(p.placements.map(leaf => Math.floor((leaf.x + 0.5) * 10) + ':' + Math.floor((leaf.z + 0.5) * 10))).size,
            nearestRoot: Math.sqrt(Math.min(...p.placements.map((leaf, i) => Math.min(...p.placements.slice(i + 1)
                .map(other => (leaf.x - other.x) ** 2 + (leaf.z - other.z) ** 2))))),
            yawBins: Array.from({ length: 8 }, (_, bin) => p.placements.filter(leaf => Math.floor(leaf.yaw / 45) === bin).length),
            composition: Object.fromEntries(p.bends.map(b => [b.id, p.placements.filter(leaf => leaf.profile === b.id).length])),
            independentWidth: p.placements.every(leaf => { const profile = p.bends.find(b => b.id === leaf.profile);
                return leaf.widthScale >= profile.width[0] && leaf.widthScale <= profile.width[1]
                    && leaf.scale >= profile.length[0] && leaf.scale <= profile.length[1] && leaf.widthScale !== leaf.scale; }),
            placements: p.placements.length, lod0Instances: matrices.reduce((n, m) => n + m.count, 0),
            matches: Object.values(s.patch.representations).every(variant => variant.group.children.filter(m => m.isInstancedMesh)
                .every((mesh, i) => mesh.instanceMatrix.array.every((value, j) => value === matrices[i].instanceMatrix.array[j]))) };
    });
    expect(patch.cutEnds).toBe(true);
    expect(patch.count).toBe(4000); expect(patch.placements).toBe(4000); expect(patch.lod0Instances).toBe(4000);
    expect(patch.composition).toEqual({ upright: 1600, bowed: 1600, relaxed: 800 });
    expect(patch.distribution).toBe('even-independent'); expect(patch.independentWidth).toBe(true);
    expect(patch.occupiedCells).toBe(100); expect(patch.nearestRoot).toBeGreaterThan(0.005);
    for (const bin of patch.yawBins) { expect(bin).toBeGreaterThan(360); expect(bin).toBeLessThan(660); }
    expect(patch.bounds.max[1]).toBeGreaterThan(0.065); expect(patch.bounds.max[1]).toBeLessThan(0.11);
    for (const bend of patch.bends) { expect(bend.rootInclinationDegrees).toBeGreaterThan(70); expect(bend.rootInclinationDegrees).toBeLessThan(73); }
    for (const bend of patch.bends) { expect(bend.tipFraction).toBeGreaterThan(0.7); expect(bend.tipFraction).toBeLessThan(0.9); }
    expect(patch.bends[0].tipInclinationDegrees).toBeGreaterThan(patch.bends[1].tipInclinationDegrees);
    expect(patch.bends[1].tipInclinationDegrees).toBeGreaterThan(patch.bends[2].tipInclinationDegrees);
    expect(patch.matches).toBe(true); expect(patch.rootSoil).toBe(false); expect(patch.ground).toBe(true);
    expect(patch.periodicRoots).toBe(true); expect(patch.rootsInside).toBe(true);
    for (const axis of [0, 2]) { expect(patch.bounds.min[axis]).toBeLessThan(-0.5); expect(patch.bounds.max[axis]).toBeGreaterThan(0.5); }
    await page.screenshot({ path: path.join(folder, 'lod0.png') });
    await page.evaluate(() => { const s = window.__plantCardsStudy; s.setSquareBounds(false);
        s.camera.position.set(1, 0.22, 1.4); s.controls.target.set(0, 0.055, 0); s.controls.update(); });
    await page.screenshot({ path: path.join(folder, 'lod0-low.png') });
    await page.locator('[data-pose="elevated"]').click();
    await page.screenshot({ path: path.join(folder, 'lod0-top.png') });
    await page.locator('[data-pose="three_quarter"]').click();
    for (const [mode, count] of [['refined', 10], ['detailed', 5], ['curved', 3], ['split', 2]]) {
        await page.locator('[data-mode="' + mode + '"]').click();
        await expect(page.locator('#plant-counts')).toHaveText('4000 leaves · ' + 4000 * count + ' cards · ' + 8000 * count + ' tris');
        await page.locator('#normal-facing').uncheck(); await page.locator('#alpha-coverage').uncheck();
        expect(await page.evaluate(() => window.__plantCardsStudy.patch.getSnapshot().corrections.every(c => !c.normalFacing && !c.alphaCoverage))).toBe(true);
        await page.locator('#normal-facing').check(); await page.locator('#alpha-coverage').check();
        expect(await page.evaluate(() => window.__plantCardsStudy.patch.getSnapshot().corrections.every(c => c.normalFacing && c.alphaCoverage))).toBe(true);
        await page.locator('#card-bounds').check(); await page.locator('#card-bounds').uncheck();
        await page.screenshot({ path: path.join(folder, mode + '.png') });
    }
    for (const pose of ['elevated', 'side', 'crown_close', 'far', 'two_meters', 'four_meters', 'three_quarter'])
        await page.locator('[data-pose="' + pose + '"]').click();
    await page.locator('[data-mode="LOD0"]').click();
    await expect(page.locator('#plant-counts')).toHaveText('4000 leaves · 31,552,000 tris');
    const colorCheck = await page.evaluate(async () => {
        const THREE = await import('three'), study = window.__plantCardsStudy;
        const { sampleGrassDebugV2BladeColor } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2Blade.js');
        const meshes = study.patch.lod0.children.filter(mesh => mesh.isInstancedMesh).filter((_, i) => i % 2 === 0);
        const expected = new THREE.Color();
        return meshes.every(mesh => mesh.material === meshes[0].material && mesh.instanceColor === null
            && Array.from({ length: mesh.geometry.attributes.color.count }, (_, i) => i).every(i => {
                sampleGrassDebugV2BladeColor(mesh.geometry.attributes.uv.getY(i), expected);
                const colors = mesh.geometry.attributes.color;
                return Math.max(Math.abs(colors.getX(i) - expected.r), Math.abs(colors.getY(i) - expected.g),
                    Math.abs(colors.getZ(i) - expected.b)) < 1e-7;
            }));
    });
    expect(colorCheck).toBe(true);
    expect(errors).toEqual([]);
});
