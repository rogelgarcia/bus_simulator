// Exercise both authored curve radii and the continuous grass/hardscape boundary in the bus lab.
import test, { expect } from '@playwright/test';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const output = path.resolve('tests/artifacts/screens/grass/ai613_curved_bus_lab');

async function frames(page) {
    const frame = await page.evaluate(() => window.__grassDebugV2.getSnapshot().frame);
    await page.waitForFunction(frame => window.__grassDebugV2.getSnapshot().frame > frame + 5, frame);
}

for (const radius of [18, 30]) test(`bus lab follows both sides of the ${radius} m bend across grass detail levels`, async ({ page }) => {
    test.setTimeout(180_000);
    await mkdir(output, { recursive: true });
    await page.setViewportSize({ width: 1600, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__grassTestView = view;\nlet copyFeedbackTimer;') });
    });
    await page.goto(`/debug_tools/grass_debug_v2.html?curve=${radius}`);
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    await frames(page);
    const initial = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
    expect(initial.grass.strategy).toBe('baked');
    expect(initial.grass.fieldCount).toBe(30);
    expect(initial.grass.curve.radius).toBe(radius);
    await expect(page.getByRole('combobox', { name: 'Curve radius' })).toHaveValue(String(radius));
    for (const pose of ['curve', 'curve-inner', 'curve-outer']) {
        await page.locator(`[data-curve-camera="${pose}"]`).click();
        await frames(page);
        await page.screenshot({ path: path.join(output, `radius-${radius}-${pose}.png`) });
    }
    const boundary = await page.evaluate(() => {
        const curve = window.__grassTestView.grass.curve, state = curve.getSnapshot();
        const coverage = curve.coverage;
        const points = [], tolerance = state.texelMeters * 2;
        for (const loop of state.hardscape) for (let i = 0; i < loop.length; i++) {
            const a = loop[i], b = loop[(i + 1) % loop.length], length = Math.hypot(b.x - a.x, b.z - a.z);
            if (length < .1) continue;
            const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
            if (Math.hypot(x - state.center.x, z - state.center.z) > state.radius + 10 || z < state.center.z + 2) continue;
            const nx = (b.z - a.z) / length, nz = -(b.x - a.x) / length;
            const pair = [coverage.sample(x + nx * .25, z + nz * .25), coverage.sample(x - nx * .25, z - nz * .25)];
            points.push({ x, z, pair, near: [coverage.sample(x + nx * tolerance, z + nz * tolerance), coverage.sample(x - nx * tolerance, z - nz * tolerance)] });
        }
        return { tolerance, points };
    });
    await writeFile(path.join(output, `radius-${radius}-boundary.json`), JSON.stringify({ initial, boundary, errors }, null, 2));
    expect(boundary.points.length).toBeGreaterThan(30);
    expect(boundary.points.filter(p => Math.min(...p.pair) >= .5 || Math.max(...p.pair) < .5)).toEqual([]);
    expect(boundary.points.filter(p => Math.min(...p.near) >= .5 || Math.max(...p.near) < .5)).toEqual([]);
    for (const mode of ['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4', 'LOD5', 'AUTO', 'OFF']) {
        await page.evaluate(mode => window.__grassDebugV2.setGrassMode(mode), mode);
        await frames(page);
        const rendered = await page.evaluate(() => {
            const view = window.__grassTestView, curve = view.grass.curve, materials = [];
            curve.group.traverseVisible(mesh => {
                if (mesh.isMesh && mesh.count) materials.push({ name: mesh.name, capacity: mesh.instanceMatrix.count, count: mesh.count,
                    masked: mesh.material.customProgramCacheKey().includes('grass.boundary') });
            });
            return { materials, field: curve.getSnapshot().field, ground: view.renderer.properties.get(view.content.ground.material).uniforms.grassBoundaryEnabled.value };
        });
        expect(rendered.materials.every(material => material.masked && material.count <= material.capacity)).toBe(true);
        expect(rendered.ground).toBe(mode === 'OFF' ? 0 : 1);
        if (mode.startsWith('LOD')) expect(rendered.field.levels[Number(mode.slice(3))]).toBeGreaterThan(1000);
        if (mode === 'OFF') expect(rendered.materials).toHaveLength(0);
        else expect(rendered.materials.length).toBeGreaterThan(0);
        if (mode === 'AUTO') expect(rendered.field.blendBatches).toBeGreaterThan(0);
        await page.screenshot({ path: path.join(output, `radius-${radius}-${mode}.png`) });
    }
    await page.evaluate(() => window.__grassDebugV2.setGrassMode('AUTO'));
    const motion = [];
    for (const distance of [5, 18, 25, 35, 45]) {
        motion.push(await page.evaluate(async distance => {
            const THREE = await import('three'), view = window.__grassTestView, curve = view.grass.curve.getSnapshot();
            const target = new THREE.Vector3(curve.center.x, 0, curve.center.z + curve.radius + 8);
            view.controls.setLookAt({ position: target.clone().add(new THREE.Vector3(0, 3, distance)), target });
            view.grass.update(view.camera.position, performance.now(), true);
            return view.grass.curve.getSnapshot().field;
        }, distance));
        await frames(page);
        await page.screenshot({ path: path.join(output, `radius-${radius}-distance-${distance}.png`) });
    }
    expect(motion.some(field => field.blendCandidateCells > 0)).toBe(true);
    expect(motion[0].levels).not.toEqual(motion.at(-1).levels);
    const gpu = await page.evaluate(async () => {
        const THREE = await import('three'), view = window.__grassTestView, coverage = view.grass.curve.coverage;
        const { bounds } = coverage, size = 256, width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
        const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, .1, 10);
        const centerX = (bounds.minX + bounds.maxX) / 2, centerZ = (bounds.minZ + bounds.maxZ) / 2;
        camera.position.set(centerX, 5, centerZ); camera.up.set(0, 0, -1); camera.lookAt(centerX, 0, centerZ);
        const geometry = new THREE.PlaneGeometry(width, depth); geometry.rotateX(-Math.PI / 2);
        const grass = new THREE.MeshBasicMaterial({ color: 0xff0000, toneMapped: false });
        const ground = new THREE.MeshBasicMaterial({ color: 0x00ff00, toneMapped: false });
        coverage.bind(grass); coverage.bind(ground, { inverse: true });
        for (const material of [grass, ground]) {
            const mesh = new THREE.InstancedMesh(geometry, material, 1);
            mesh.position.set(centerX - 7, 0, centerZ + 3);
            mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(7, 0, -3)); scene.add(mesh);
        }
        const renderer = view.renderer, target = new THREE.WebGLRenderTarget(size, size), previous = renderer.getRenderTarget();
        const pixels = new Uint8Array(size * size * 4);
        renderer.setRenderTarget(target); renderer.render(scene, camera); renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
        renderer.setRenderTarget(previous);
        let holes = 0, mismatches = 0, grassPixels = 0;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const offset = (y * size + x) * 4;
            const expected = coverage.sample(bounds.minX + (x + .5) / size * width, bounds.maxZ - (y + .5) / size * depth);
            if (pixels[offset] < 250 && pixels[offset + 1] < 250) holes++;
            const actual = pixels[offset] > 250;
            if (actual) grassPixels++;
            if (Math.abs(expected - .5) > .02 && actual !== (expected >= .5)) mismatches++;
        }
        geometry.dispose(); grass.dispose(); ground.dispose(); target.dispose();
        return { holes, mismatches, grassPixels };
    });
    expect(gpu.holes).toBe(0);
    expect(gpu.mismatches).toBe(0);
    expect(gpu.grassPixels).toBeGreaterThan(10000);
    await writeFile(path.join(output, `radius-${radius}-movement.json`), JSON.stringify({ motion, gpu }, null, 2));
    await page.getByRole('button', { name: 'Bus camera' }).click();
    await frames(page);
    expect((await page.evaluate(() => window.__grassDebugV2.getSnapshot())).grass.mode).toBe('AUTO');
    await page.getByRole('combobox', { name: 'Curve radius' }).selectOption(radius === 18 ? 'off' : '18');
    await page.waitForURL(url => radius === 18 ? !url.searchParams.has('curve') : url.searchParams.get('curve') === '18');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    const reloaded = await page.evaluate(() => window.__grassDebugV2.getSnapshot());
    expect(reloaded.grass.fieldCount).toBe(30);
    expect(reloaded.grass.curve?.radius ?? null).toBe(radius === 18 ? null : 18);
    if (radius === 18) await expect(page.locator('[data-curve-camera="curve"]')).toBeDisabled();
    expect(errors).toEqual([]);
});
