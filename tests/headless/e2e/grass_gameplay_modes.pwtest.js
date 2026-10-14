// Exercise the production grass renderer through the real game's Options lifecycle.
import test, { expect } from '@playwright/test';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const output = path.resolve('tests/artifacts/screens/grass/quality_presets');
async function ready(page) {
    await page.waitForFunction(() => !!window.__busSim?.engine?.context?.city?.grass, null, { timeout: 90_000 });
    await page.evaluate(async () => {
        const { engine, sm } = window.__busSim;
        await Promise.all([engine.context.city.grass.ready, engine.context.city.world.readyPromise,
            sm.current.busModel?.userData?.readyPromise, engine.waitForLightingReady()]);
        await new Promise(resolve => {
            let frames = 0;
            const unsubscribe = engine.addFrameListener(({ rendered }) => { if (rendered && ++frames === 3) { unsubscribe(); resolve(); } });
        });
    });
}
async function options(page) {
    await page.evaluate(async () => {
        window.__busSim.sm.pushOverlay('options');
        window.grassOptions = window.__busSim.sm.states.get('options');
        window.grassOptions._ui.setTab('grass');
    });
}
async function snapshot(page) { return page.evaluate(() => window.__busSim.engine.context.city.grass.getSnapshot()); }
async function measure(page) {
    return page.evaluate(async () => {
        const { engine } = window.__busSim;
        const samples = [], draws = [], triangles = [];
        let warmup = 30;
        await new Promise(resolve => {
            const unsubscribe = engine.addFrameListener(({ rendered, rawDt }) => {
                if (!rendered) return;
                if (warmup-- <= 0) { samples.push(rawDt * 1000); draws.push(engine.renderer.info.render.calls); triangles.push(engine.renderer.info.render.triangles); }
                if (samples.length === 120) { unsubscribe(); resolve(); }
            });
        });
        const sorted = samples.slice().sort((a, b) => a - b), mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const gl = engine.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
        return { meanMs: mean, medianMs: sorted[60], p95Ms: sorted[114], fps: 1000 / mean, samples: samples.length,
            calls: Math.max(...draws), triangles: Math.max(...triangles), memory: { ...engine.renderer.info.memory },
            gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            grass: engine.context.city.grass.getSnapshot(), lighting: engine.getBakedLightingDebugInfo(), shadows: engine.shadowSettings };
    });
}

test('gameplay grass quality supports preview, cancel, save, reset and re-entry', async ({ page }) => {
    test.setTimeout(240_000);
    await mkdir(output, { recursive: true });
    await page.setViewportSize({ width: 1600, height: 900 });
    const errors = [], authoringRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (/tests\/artifacts|grass_debugger_v2|debug_tools\/grass/.test(request.url())) authoringRequests.push(request.url()); });
    await page.goto('/?pose=civic_center_curve_front&coreTests=0');
    await ready(page);
    expect((await snapshot(page)).mode).toBe('high');
    expect((await snapshot(page)).active).toBe(true);
    expect((await snapshot(page)).strategy).toBe('patches');
    expect((await snapshot(page)).field.geometryPolicy).toBe('immutable');
    const threeD = await measure(page);
    await page.screenshot({ path: path.join(output, 'gameplay-3d.png') });
    await options(page);
    const quality = page.getByRole('group', { name: 'Grass quality', exact: true });
    await expect(page.getByRole('combobox', { name: 'Grass mode', exact: true })).toHaveCount(0);
    await expect(quality.getByRole('button')).toHaveText(['Flat', 'Low', 'Medium', 'High', 'Ultra']);
    await expect(quality.getByRole('button', { name: 'High', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: path.join(output, 'options-3d.png') });
    const settings = [];
    for (const [name, mode, fieldMode, distances] of [
        ['Flat', 'flat', 'OFF', [.6, .8, 8, 18, 36]], ['Low', 'low', 'LOD5', [.6, .8, 8, 18, 36]],
        ['Medium', 'medium', 'AUTO', [.6, .8, 8, 16, 24]], ['High', 'high', 'AUTO', [.6, .8, 8, 18, 36]],
        ['Ultra', 'ultra', 'AUTO', [.6, .8, 8, 22, 42]], ['High', 'high', 'AUTO', [.6, .8, 8, 18, 36]]
    ]) {
        await quality.getByRole('button', { name, exact: true }).click();
        await expect(quality.locator('[aria-pressed="true"]')).toHaveCount(1);
        await expect(quality.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
        const state = await snapshot(page); settings.push(state);
        expect(state.mode).toBe(mode); expect(state.active).toBe(mode !== 'flat');
        expect(state.field.mode).toBe(fieldMode); expect(state.field.distances).toEqual(distances);
        expect(state.field.terminalTransition).toBe('shorten');
        if (mode === 'low') { expect(state.field.levels.slice(0, 5)).toEqual([0, 0, 0, 0, 0]); expect(state.field.levels[5]).toBeGreaterThan(0); }
        await page.screenshot({ path: path.join(output, `options-${mode}.png`) });
    }
    await writeFile(path.join(output, 'quality-settings.json'), JSON.stringify(settings, null, 2));
    await quality.getByRole('button', { name: 'Flat', exact: true }).click();
    expect((await snapshot(page)).active).toBe(false);
    await page.screenshot({ path: path.join(output, 'options-texture.png') });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await snapshot(page)).mode).toBe('high');
    await options(page);
    await quality.getByRole('button', { name: 'Flat', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const before = (await snapshot(page)).updates;
    const texture = await measure(page);
    expect((await snapshot(page)).updates).toBe(before);
    await page.screenshot({ path: path.join(output, 'gameplay-texture.png') });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bus_sim.grass.v1')))).toEqual({ mode: 'flat' });
    await page.reload(); await ready(page);
    expect((await snapshot(page)).mode).toBe('flat');
    expect((await snapshot(page)).ready).toBe(false);
    await options(page);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await ready(page);
    expect((await snapshot(page)).mode).toBe('high');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await snapshot(page)).mode).toBe('flat');
    const repeated = await page.evaluate(async () => {
        const engine = window.__busSim.engine, grass = engine.context.city.grass;
        for (let i = 0; i < 6; i++) { engine.setGrassSettings({ mode: 'high' }); await grass.ready; engine.setGrassSettings({ mode: 'flat' }); }
        engine.setGrassSettings({ mode: 'high' });
        return engine.scene.children.filter(node => node.name === 'GameplayGrass').length;
    });
    expect(repeated).toBe(1);
    const closePoint = await page.evaluate(() => {
        const { engine, sm } = window.__busSim, grass = engine.context.city.grass, bus = sm.current.busAnchor.position;
        let best = null, distance = Infinity;
        for (let x = Math.floor(bus.x - 50); x < bus.x + 50; x++) for (let z = Math.floor(bus.z - 50); z < bus.z + 50; z++) {
            const d = Math.hypot(x - bus.x, z - bus.z);
            if (d >= distance || ![-3, 0, 3].every(dx => [-3, 0, 3].every(dz => grass.coverage.sample(x + dx, z + dz)))) continue;
            best = [x + .5, grass.groundY + .8, z + .5]; distance = d;
        }
        if (!best) throw new Error('No nearby gameplay lawn for close inspection.');
        sm.current._poseCamera.position.fromArray(best); sm.current._poseCamera.target.copy(bus).y = 1;
        sm.current._poseCamera.quaternion = null; sm.current._applyGameplayPoseCamera(); grass.update(true);
        return best;
    });
    await ready(page);
    await page.screenshot({ path: path.join(output, 'gameplay-grass-close.png') });
    const close3d = await measure(page);
    await page.evaluate(() => window.__busSim.engine.setGrassSettings({ mode: 'flat' }));
    const closeTexture = await measure(page);
    await page.screenshot({ path: path.join(output, 'gameplay-texture-close.png') });
    await page.evaluate(() => window.__busSim.engine.setGrassSettings({ mode: 'high' }));
    const movement = [];
    for (const [name, position, target] of [
        ['near', [-171, 1.2, 57], [-156, .25, 44]],
        ['transition', [-171, 4, 88], [-151, 0, 38]],
        ['distant', [-201, 15, 130], [-140, 0, 30]]
    ]) {
        await page.evaluate(({ position, target }) => {
            const { engine, sm } = window.__busSim;
            sm.current._poseCamera.position.fromArray(position); sm.current._poseCamera.target.fromArray(target);
            sm.current._poseCamera.quaternion = null; sm.current._applyGameplayPoseCamera();
            engine.context.city.grass.update(true);
        }, { position, target });
        await ready(page);
        await page.screenshot({ path: path.join(output, `gameplay-${name}.png`) });
        movement.push(await snapshot(page));
    }
    expect(new Set(movement.map(state => state.anchor.join(','))).size).toBeGreaterThan(1);
    const boundaries = await page.evaluate(() => {
        const { engine, sm } = window.__busSim, grass = engine.context.city.grass;
        const road = grass.coverage.sample(sm.current.busAnchor.position.x, sm.current.busAnchor.position.z);
        const buildings = grass.coverageInput.buildingFootprints.map(loops => {
            const loop = loops[0];
            const x = loop.reduce((sum, p) => sum + p.x, 0) / loop.length, z = loop.reduce((sum, p) => sum + p.z, 0) / loop.length;
            return grass.coverage.sample(x, z);
        });
        const before = grass.dynamicShadows.generations;
        sm.current.busAnchor.position.x += 5; sm.current.busAnchor.updateMatrixWorld(true);
        grass.update(true);
        return { road, buildings, dynamicChanged: grass.dynamicShadows.generations > before,
            groundY: grass.patches.group.position.y, expectedGroundY: engine.context.city.generatorConfig.ground.surfaceY };
    });
    expect(boundaries.road).toBe(false);
    expect(boundaries.buildings.filter(Boolean)).toHaveLength(0);
    expect(boundaries.groundY).toBe(boundaries.expectedGroundY);
    expect(boundaries.dynamicChanged).toBe(true);
    const shadowPixels = await page.evaluate(closePoint => {
        const { engine, sm } = window.__busSim, grass = engine.context.city.grass, renderer = engine.renderer;
        sm.current.busAnchor.position.x = closePoint[0]; sm.current.busAnchor.position.z = closePoint[2];
        sm.current.busAnchor.updateMatrixWorld(true);
        engine.camera.position.set(closePoint[0] + 12, 5, closePoint[2] + 12); engine.camera.lookAt(closePoint[0], 0, closePoint[2]);
        grass.update(true);
        const gl = renderer.getContext(), read = strength => {
            grass.asset.settings.shadows.value = strength;
            renderer.setRenderTarget(null); renderer.render(engine.scene, engine.camera);
            const pixels = new Uint8Array(renderer.domElement.width * renderer.domElement.height * 4);
            gl.readPixels(0, 0, renderer.domElement.width, renderer.domElement.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return pixels;
        };
        const off = read(0), on = read(1); let affected = 0, maximumDrop = 0;
        for (let i = 0; i < on.length; i += 4) {
            const drop = (off[i] + off[i + 1] + off[i + 2] - on[i] - on[i + 1] - on[i + 2]) / 3;
            if (drop > 5) affected++; maximumDrop = Math.max(maximumDrop, drop);
        }
        return { affected, maximumDrop };
    }, closePoint);
    expect(shadowPixels.affected).toBeGreaterThan(100);
    expect(shadowPixels.maximumDrop).toBeGreaterThan(10);
    await page.evaluate(() => {
        const { engine, sm } = window.__busSim;
        window.disposedGrass = engine.context.city.grass;
        sm.go('welcome'); sm.go('game_mode');
    });
    await ready(page);
    expect(await page.evaluate(() => window.disposedGrass.disposed && !window.disposedGrass.group.parent)).toBe(true);
    expect((await snapshot(page)).active).toBe(true);
    const driveStart = await page.evaluate(() => {
        const state = window.__busSim.sm.current;
        state._poseCamera = null; state.gameLoop.paused = false;
        return state.busAnchor.position.toArray();
    });
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(start => {
        const position = window.__busSim.sm.current.busAnchor.position;
        return Math.hypot(position.x - start[0], position.z - start[2]) > 2;
    }, driveStart, { timeout: 15000 });
    await page.keyboard.up('ArrowUp');
    const driveEnd = await page.evaluate(() => {
        window.__busSim.sm.current.gameLoop.paused = true;
        return window.__busSim.sm.current.busAnchor.position.toArray();
    });
    await page.screenshot({ path: path.join(output, 'gameplay-after-driving.png') });
    await writeFile(path.join(output, 'performance.json'), JSON.stringify({ viewport: [1600, 900], pose: 'civic_center_curve_front', warmupFrames: 30, threeD, texture, closePoint, close3d, closeTexture, movement, boundaries, shadowPixels, driveStart, driveEnd, errors, authoringRequests }, null, 2));
    expect(authoringRequests).toEqual([]);
    expect(errors).toEqual([]);
});

test('grass quality honors changes during loading, saves Ultra and returns to High defaults', async ({ page }) => {
    test.setTimeout(150000);
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (request.url().endsWith('/grass.bin')) requests.push(request.url()); });
    await page.addInitScript(() => {
        if (!sessionStorage.getItem('grassQualitySeeded')) {
            localStorage.setItem('bus_sim.grass.v1', JSON.stringify({ mode: 'texture' }));
            sessionStorage.setItem('grassQualitySeeded', '1');
        }
    });
    await page.goto('/?pose=civic_center_curve_front&coreTests=0'); await ready(page);
    expect((await snapshot(page)).mode).toBe('flat'); expect(requests).toEqual([]);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/grass.bin', async route => { await gate; await route.continue(); });
    await options(page);
    const quality = page.getByRole('group', { name: 'Grass quality', exact: true });
    const requested = page.waitForRequest('**/grass.bin');
    await quality.getByRole('button', { name: 'High', exact: true }).click(); await requested;
    await quality.getByRole('button', { name: 'Low', exact: true }).click();
    await quality.getByRole('button', { name: 'Ultra', exact: true }).click();
    expect((await snapshot(page)).active).toBe(false);
    release(); await ready(page);
    expect(requests).toHaveLength(1);
    expect((await snapshot(page)).mode).toBe('ultra');
    expect((await snapshot(page)).field.distances).toEqual([.6, .8, 8, 22, 42]);
    const switches = await page.evaluate(() => {
        const { engine } = window.__busSim, grass = engine.context.city.grass, patches = grass.patches, asset = grass.asset;
        const attributes = new Set(patches.group.children.flatMap(mesh => [...Object.values(mesh.geometry.attributes), mesh.geometry.index].filter(Boolean)));
        const versions = [...attributes].map(attribute => attribute.version), geometry = patches.group.children.map(mesh => mesh.geometry);
        const rows = [];
        for (const mode of ['medium', 'low', 'high', 'ultra', 'flat', 'ultra']) {
            engine.setGrassSettings({ mode });
            const uniforms = engine.renderer.properties.get(patches.material.leaves[4]).uniforms;
            rows.push({ mode, height: uniforms.grassPatchHeightBand.value.toArray(), ground: uniforms.grassPatchHandoffBand.value.toArray() });
        }
        return { rows, same: grass.asset === asset && grass.patches === patches && patches.group.children.every((mesh, i) => mesh.geometry === geometry[i]),
            unchanged: [...attributes].every((attribute, i) => attribute.version === versions[i]) };
    });
    expect(switches.same && switches.unchanged).toBe(true);
    for (const row of switches.rows.filter(row => ['medium', 'high', 'ultra'].includes(row.mode))) {
        const expected = { medium: [16, 24], high: [18, 36], ultra: [22, 42] }[row.mode];
        expect(row.height).toEqual(expected); expect(row.ground).toEqual([expected[0] - (expected[1] - expected[0]) / 8, expected[1]]);
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.reload(); await ready(page);
    expect((await snapshot(page)).mode).toBe('ultra');
    await options(page);
    await expect(quality.getByRole('button', { name: 'Ultra', exact: true })).toHaveAttribute('aria-pressed', 'true');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Use defaults', exact: true }).click();
    await expect(page.locator('#ui-options')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('bus_sim.grass.v1'))).toBeNull();
    await page.reload(); await ready(page); expect((await snapshot(page)).mode).toBe('high');
    await options(page);
    await expect(quality.getByRole('button', { name: 'High', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'options-default-high.png') });
    await writeFile(path.join(output, 'quality-switching.json'), JSON.stringify({ switches, requests, errors }, null, 2));
    expect(errors).toEqual([]);
});
