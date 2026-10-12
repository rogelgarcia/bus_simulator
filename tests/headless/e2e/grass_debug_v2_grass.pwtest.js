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
    await page.route('**/GrassDebugV2DistanceGrass.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('externalShadows.update(); refreshShadows();', 'externalShadows.update(); refreshShadows(); window.__busBakedAssets = bakedAssets;') });
    });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/debug_tools/grass_debug_v2.html');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    await page.waitForFunction(() => window.__grassDebugV2.getSnapshot().frame > 5);
    const output = 'tests/artifacts/screens/grass_debug_v2/roadside_baked';
    await mkdir(output, { recursive: true });
    const initial = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
    expect(initial.grass).toMatchObject({ mode: 'AUTO', system: 'distance-lod', strategy: 'baked', patches: 8640, fieldCount: 30, columnsPerSide: 3, rowsPerSide: 5, gapMeters: 1,
        appearance: { paletteRevision: 'canopy-palette-17', canopyRootShade: .32, projectedCanopyBlend: true, canopyFiltering: { size: 1024, preparedMipContrast: 4.9, coarseMipGain: 1, cavityPower: .72, colorRange: 3, highlightShoulder: 60 } },
        field: { fieldSize: 8, fieldDepth: 36, fadeStyle: 'canopy', edgeStrips: true, lod3CardsPerSquareMeter: 0, lod4CardsPerSquareMeter: 0, cardBase: null },
        cards: null, selection: { distances: [.6, .8, 20, 30, 40], transitionFraction: .3, intervalMs: 50, movementThreshold: .2 } });
    await expect(page.locator('#grass-ranges')).toContainText('0.6 / 0.8 / 20 / 30 / 40');
    await expect(page.locator('[data-grass-strategy="baked"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-grass-strategy="current"]')).not.toHaveAttribute('aria-current');
    expect(initial.grass.levels.reduce((sum, n) => sum + n, 0)).toBe(8640);
    expect(initial.grass.placement).toMatchObject({ side: -1, column: 0, row: 0, minZ: -4 });
    expect(initial.land.grassPatchExcluded).toBe(true);
    const west = initial.grass.placements.filter(p => p.side === -1), east = initial.grass.placements.filter(p => p.side === 1);
    expect(west).toHaveLength(15); expect(east).toHaveLength(15);
    for (const group of [west, east]) group.forEach(p => {
        expect(p.maxX - p.minX).toBeCloseTo(8, 8);
        expect(p.maxZ - p.minZ).toBe(36);
        expect(p.minZ).toBe(-4 + p.row * 37);
        if (p.row > -1) expect(p.minZ - group.find(q => q.column === p.column && q.row === p.row - 1).maxZ).toBe(1);
        if (p.column > 0) {
            const inner = group.find(q => q.column === p.column - 1 && q.row === p.row);
            expect(p.side < 0 ? inner.minX - p.maxX : p.minX - inner.maxX).toBeCloseTo(1, 8);
        }
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
        const gaps = patches.flatMap(p => [
            ...(p.row < 3 ? [sample((p.minX + p.maxX) / 2, p.maxZ + .5)] : []),
            ...(p.column < 2 ? [sample(p.side < 0 ? p.minX - .5 : p.maxX + .5, (p.minZ + p.maxZ) / 2)] : [])
        ]);
        const shadowCamera = view.lighting.sun.shadow.camera;
        const shadowCorners = patches.flatMap(p => [p.minX, p.maxX].flatMap(x => [p.minZ, p.maxZ].map(z =>
            new THREE.Vector3(x, 0, z).project(shadowCamera).toArray())));
        return { centers: patches.map(p => sample((p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2)), gaps, shadowCorners, road: sample(0, 20) };
    });
    expect(groundCoverage.centers.every(count => count === 0)).toBe(true);
    expect(groundCoverage.gaps.every(count => count > 0)).toBe(true);
    expect(groundCoverage.road).toBeGreaterThan(0);
    expect(groundCoverage.shadowCorners.every(point => point.every(value => Math.abs(value) <= 1))).toBe(true);
    expect(initial.benchmark.route.grassExitZ).toBe(143);
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
    await page.evaluate(async () => {
        const THREE = await import('three'), view = window.__grassTestView;
        view.controls.setLookAt({ position: new THREE.Vector3(100, 150, -145), target: new THREE.Vector3(0, 0, 51) });
        view.grass.update(view.camera.position, performance.now(), true);
    });
    await page.waitForFunction(frame => window.__grassDebugV2.getSnapshot().frame > frame + 4, cached.frame);
    await page.screenshot({ path: `${output}/all-fields.png` });
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
        if (mode.startsWith('LOD')) expect(state.grass.levels[Number(mode.slice(3))]).toBe(8640);
        expect(state.land.grassPatchExcluded).toBe(mode !== 'OFF');
        if (mode === 'OFF') expect(state.grass.triangles).toBe(0);
        else expect(state.grass.triangles).toBeGreaterThan(0);
        snapshots[mode] = state.grass;
        if (['LOD2', 'LOD3', 'LOD4', 'LOD5', 'OFF'].includes(mode)) await page.screenshot({ path: `${output}/${mode.toLowerCase()}.png` });
    }
    expect(snapshots.LOD3.triangles).toBeLessThan(snapshots.LOD2.triangles);
    expect(snapshots.LOD4.triangles).toBeLessThan(snapshots.LOD3.triangles);
    // The retained 35 m fringe cutoff precedes the new 40 m canopy boundary.
    expect(snapshots.LOD5.field.sideLeafCells).toBe(0);
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
    const shadows = await page.evaluate(() => {
        const view = window.__grassTestView, renderer = view.renderer, strength = window.__busBakedAssets.settings.shadows;
        view.setCamera('overview'); view.grass.setMode('LOD5');
        const gl = renderer.getContext(), read = value => {
            strength.value = value; renderer.setRenderTarget(null); renderer.render(view.scene, view.camera);
            const pixels = new Uint8Array(renderer.domElement.width * renderer.domElement.height * 4);
            gl.readPixels(0, 0, renderer.domElement.width, renderer.domElement.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels;
        };
        const unshadowed = read(0), shadowed = read(1); let affected = 0, maxDrop = 0, brightestRoot = 0, darkestRoot = 1, casters = 0;
        for (let i = 0; i < shadowed.length; i += 4) {
            const drop = (unshadowed[i] + unshadowed[i + 1] + unshadowed[i + 2] - shadowed[i] - shadowed[i + 1] - shadowed[i + 2]) / 3;
            if (drop > 5) affected++; maxDrop = Math.max(maxDrop, drop);
        }
        view.grass.group.traverse(mesh => {
            if (mesh.isMesh && mesh.castShadow) casters++;
            if (!mesh.userData.grassCanopyStrip || !mesh.geometry.attributes.color) return;
            const color = mesh.geometry.attributes.color;
            for (let i = 0; i < color.count; i++) { darkestRoot = Math.min(darkestRoot, color.getX(i)); brightestRoot = Math.max(brightestRoot, color.getX(i)); }
        });
        view.grass.setMode('AUTO');
        return { affected, maxDrop, darkestRoot, brightestRoot, casters };
    });
    expect(shadows.affected).toBeGreaterThan(1000);
    expect(shadows.maxDrop).toBeGreaterThan(20);
    expect(shadows.darkestRoot).toBeCloseTo(.32, 5);
    expect(shadows.brightestRoot).toBe(1);
    expect(shadows.casters).toBe(0);
    await writeFile(`${output}/verification.json`, JSON.stringify({ snapshots, groundCoverage, near, boundary, shadows, errors }, null, 2));
    expect(errors).toEqual([]);
});

test('Bus scene retains the original lit strategy at its comparison URL', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/debug_tools/grass_debug_v2.html?grass=current');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    const grass = await page.evaluate(() => window.__grassDebugV2.getSnapshot().grass);
    expect(grass).toMatchObject({ strategy: 'current', appearance: null, fieldCount: 30,
        field: { lod3CardsPerSquareMeter: 12, lod4CardsPerSquareMeter: 6, cardBase: { enabled: true } },
        selection: { distances: [.6, .8, 1, 16, 32], transitionFraction: .5 } });
    await expect(page.locator('#grass-ranges')).toContainText('Original lit grass');
    await expect(page.locator('[data-grass-strategy="current"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-grass-strategy="baked"]')).not.toHaveAttribute('aria-current');
});
