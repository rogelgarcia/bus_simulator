// Verify the shared six-level grass in the real bus/road/tree scene, including rectangular boundaries and shadows.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('Bus scene uses distance grass, cached lighting, and complete terrain in OFF mode', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__grassTestView = view;\nlet copyFeedbackTimer;') });
    });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/debug_tools/grass_debug_v2.html');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    await page.waitForFunction(() => window.__grassDebugV2.getSnapshot().frame > 5);
    const output = 'tests/artifacts/screens/grass_debug_v2/roadside_fields';
    await mkdir(output, { recursive: true });
    const initial = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
    expect(initial.grass).toMatchObject({ mode: 'AUTO', system: 'distance-lod', patches: 1728, fieldCount: 6, gapMeters: 2,
        field: { fieldSize: 8, fieldDepth: 36, fadeStyle: 'dissolve', edgeStrips: true, lod3CardsPerSquareMeter: 12, lod4CardsPerSquareMeter: 3,
            cardBase: { density: .45, enabled: true, resolution: 1024, variants: 2 } },
        selection: { distances: [.6, .8, 1, 16, 32], intervalMs: 50, movementThreshold: .2 } });
    expect(initial.grass.levels.reduce((sum, n) => sum + n, 0)).toBe(1728);
    expect(initial.land.grassPatchExcluded).toBe(true);
    const west = initial.grass.placements.filter(p => p.side === -1), east = initial.grass.placements.filter(p => p.side === 1);
    expect(west).toHaveLength(3); expect(east).toHaveLength(3);
    for (const group of [west, east]) group.forEach((p, i) => {
        expect(p.maxX - p.minX).toBeCloseTo(8, 8);
        expect(p.maxZ - p.minZ).toBe(36);
        if (i) expect(p.minZ - group[i - 1].maxZ).toBe(2);
        expect(p.minX).toBe(group[0].minX);
    });
    west.forEach((p, i) => {
        expect(p.minX).toBeCloseTo(-east[i].maxX, 6);
        expect(p.minZ).toBe(east[i].minZ);
    });
    const groundCoverage = await page.evaluate(async () => {
        const THREE = await import('three'), view = window.__grassTestView;
        const patches = view.grass.getSnapshot().placements;
        view.content.ground.updateMatrixWorld(true);
        const sample = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0)).intersectObject(view.content.ground).length;
        return { centers: patches.map(p => sample((p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2)),
            gaps: [0, 1, 3, 4].map(i => sample((patches[i].minX + patches[i].maxX) / 2, patches[i].maxZ + 1)), road: sample(0, 20) };
    });
    expect(groundCoverage.centers.every(count => count === 0)).toBe(true);
    expect(groundCoverage.gaps.every(count => count > 0)).toBe(true);
    expect(groundCoverage.road).toBeGreaterThan(0);
    expect(initial.grass.shadows.canopy.externalCasters).toBeGreaterThan(0);
    expect(initial.grass.shadows.canopy.generations).toBe(1);
    await page.screenshot({ path: `${output}/auto-bus.png` });
    const snapshots = { initial };
    for (const pose of ['overview', 'grass']) {
        await page.evaluate(pose => window.__grassDebugV2.setCamera(pose), pose);
        const frame = await page.evaluate(() => window.__grassDebugV2.getSnapshot().frame);
        await page.waitForFunction(frame => window.__grassDebugV2.getSnapshot().frame > frame + 4, frame);
        await page.screenshot({ path: `${output}/auto-${pose}.png` });
        snapshots[pose] = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
    }
    const stationary = snapshots.grass;
    await page.waitForFunction(frame => window.__grassDebugV2.getSnapshot().frame > frame + 12, stationary.frame);
    const cached = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
    expect(cached.grass.selection.scans).toBe(stationary.grass.selection.scans);
    expect(cached.grass.shadows.generations).toBe(initial.grass.shadows.generations);
    const near = await page.evaluate(async () => {
        const THREE = await import('three'), view = window.__grassTestView;
        const p = view.grass.getSnapshot().placement;
        view.controls.setLookAt({ position: new THREE.Vector3(p.minX + .5, .4, p.minZ + 34.5),
            target: new THREE.Vector3(p.minX + 2, .03, p.minZ + 30) });
        view.grass.update(view.camera.position, performance.now(), true);
        return view.grass.getSnapshot();
    });
    expect(near.levels[0]).toBeGreaterThan(0);
    expect(near.field.blendCandidateCells).toBeGreaterThan(0);
    await page.screenshot({ path: `${output}/auto-near.png` });
    await page.evaluate(() => window.__grassDebugV2.setCamera('grass'));
    for (const mode of ['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5', 'OFF', 'AUTO']) {
        await page.locator(`[data-grass-mode="${mode}"]`).click();
        await expect(page.locator(`[data-grass-mode="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
        const state = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
        expect(state.grass.mode).toBe(mode);
        if (mode.startsWith('LOD')) expect(state.grass.levels[Number(mode.slice(3))]).toBe(1728);
        expect(state.land.grassPatchExcluded).toBe(mode !== 'OFF');
        if (mode === 'OFF') expect(state.grass.triangles).toBe(0);
        else expect(state.grass.triangles).toBeGreaterThan(0);
        snapshots[mode] = state.grass;
        if (['LOD2', 'LOD3', 'LOD4', 'LOD5', 'OFF'].includes(mode)) await page.screenshot({ path: `${output}/${mode.toLowerCase()}.png` });
    }
    expect(snapshots.LOD3.triangles).toBeLessThan(snapshots.LOD2.triangles);
    expect(snapshots.LOD4.triangles).toBeLessThan(snapshots.LOD3.triangles);
    expect(snapshots.LOD5.field.sideLeafCells).toBeGreaterThan(0);
    for (const value of ['coverage', 'alpha', 'staggered', 'dissolve']) {
        await page.locator('#grass-fade').selectOption(value);
        expect(await page.evaluate(() => window.__grassDebugV2.getSnapshot().grass.field.fadeStyle)).toBe(value);
    }
    expect(await page.locator('#grass-counts').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const boundary = await page.evaluate(async () => {
        const { grassTransitionCanopyProfile } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2TransitionCanopy.js');
        const levels = new Uint8Array(144).fill(4);
        levels[137] = 3;
        const diagonal = grassTransitionCanopyProfile({ id: 132, x: 0, z: 33, edge: 1 }, levels, 4, 36);
        const end = grassTransitionCanopyProfile({ id: 143, x: 3, z: 35, edge: 10 }, levels, 4, 36);
        const geometries = [];
        window.__grassTestView.grass.group.traverse(mesh => {
            if (mesh.isInstancedMesh && mesh.visible) geometries.push({ count: mesh.count, capacity: mesh.instanceMatrix.count });
        });
        return { diagonal, end, geometries };
    });
    expect(boundary.diagonal & 128).toBe(128);
    expect(boundary.end & 15).toBe(10);
    expect(boundary.geometries.every(mesh => mesh.count <= mesh.capacity)).toBe(true);
    await writeFile(`${output}/verification.json`, JSON.stringify({ snapshots, near, boundary, errors }, null, 2));
    expect(errors).toEqual([]);
});
