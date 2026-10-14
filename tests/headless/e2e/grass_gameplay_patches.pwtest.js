// Verify immutable grass buffers and AO compatibility in the production game.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'tests/artifacts/screens/grass/gameplay_patches';

for (const transition of ['dissolve', 'shorten']) test(`${transition}: gameplay patch movement keeps grass buffers fixed and uses terrain for AO depth`, async ({ page }) => {
    test.setTimeout(180000);
    const caseOutput = transition === 'dissolve' ? output : `${output}/shorten`;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    if (transition === 'shorten') await page.route('**/grass/runtime/GameplayGrassRenderer.js*', async route => {
        const response = await route.fetch(), source = await response.text();
        const original = 'bounds: this.coverage.bounds, groundY: this.groundY });';
        expect(source).toContain(original);
        await route.fulfill({ response, body: source.replace(original,
            "bounds: this.coverage.bounds, groundY: this.groundY, terminalTransition: 'shorten' });") });
    });
    await page.addInitScript(() => {
        const original = WebGL2RenderingContext.prototype.bufferData;
        window.grassBufferSources = new Map();
        WebGL2RenderingContext.prototype.bufferData = function (target, data, ...args) {
            if (ArrayBuffer.isView(data)) {
                const binding = target === this.ARRAY_BUFFER ? this.ARRAY_BUFFER_BINDING : this.ELEMENT_ARRAY_BUFFER_BINDING;
                window.grassBufferSources.set(this.getParameter(binding), data.buffer);
            }
            return original.call(this, target, data, ...args);
        };
        window.restoreGrassBufferProbe = () => { WebGL2RenderingContext.prototype.bufferData = original; };
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?pose=civic_center_curve_front&coreTests=0');
    await page.waitForFunction(() => !!window.__busSim?.engine?.context?.city?.grass, null, { timeout: 90000 });
    const movement = await page.evaluate(async () => {
        const { engine, sm } = window.__busSim, grass = engine.context.city.grass;
        await Promise.all([grass.ready, engine.context.city.world.readyPromise,
            sm.current.busModel?.userData?.readyPromise, engine.waitForLightingReady()]);
        await new Promise(resolve => {
            let frames = 0;
            const unsubscribe = engine.addFrameListener(({ rendered }) => {
                if (rendered && ++frames === 3) { unsubscribe(); resolve(); }
            });
        });
        engine.stop();
        const renderer = engine.renderer, gl = renderer.getContext(), geometries = new Set();
        grass.group.traverse(mesh => { if (mesh.isMesh) geometries.add(mesh.geometry); });
        const attributes = new Set([...geometries].flatMap(geometry => [...Object.values(geometry.attributes), geometry.index].filter(Boolean)));
        const arrays = new Set([...attributes].map(attribute => attribute.array.buffer));
        const buffers = new Set([...window.grassBufferSources].filter(([, array]) => arrays.has(array)).map(([buffer]) => buffer));
        const versions = [...attributes].map(attribute => attribute.version);
        window.restoreGrassBufferProbe(); window.grassBufferSources.clear();
        const bus = sm.current.busAnchor.position;
        let lawn = null, nearest = Infinity;
        for (let x = bus.x - 50; x <= bus.x + 50; x += 2) for (let z = bus.z - 50; z <= bus.z + 50; z += 2) {
            const distance = Math.hypot(x - bus.x, z - bus.z);
            if (distance < nearest && [-2, 0, 2].every(dx => [-2, 0, 2].every(dz => grass.coverage.sample(x + dx, z + dz)))) {
                lawn = [x, z]; nearest = distance;
            }
        }
        if (!lawn) throw new Error('No gameplay lawn for patch movement.');
        const originals = ['bufferData', 'bufferSubData'].map(name => [name, gl[name]]);
        let uploads = 0;
        for (const [name, original] of originals) gl[name] = function (target, ...args) {
            const binding = target === this.ARRAY_BUFFER ? this.ARRAY_BUFFER_BINDING : this.ELEMENT_ARRAY_BUFFER_BINDING;
            if (buffers.has(this.getParameter(binding))) uploads++;
            return original.call(this, target, ...args);
        };
        const samples = [], positions = new Map(), anchors = new Set(), visibleLevels = new Set();
        let stablePlacements = true;
        const visible = () => grass.patches.group.children.filter(mesh => mesh.visible && mesh.userData.grassPatchLevel !== undefined)
            .map(mesh => [mesh.userData.grassPatchLevel, mesh.position.x, mesh.position.z]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
        try {
            for (let frame = 0; frame < 120; frame++) {
                const pose = frame < 60 ? frame : 119 - frame;
                engine.camera.position.set(lawn[0] + Math.sin(pose / 7) * 10, grass.groundY + .2 + Math.sin(pose / 9) ** 2 * 4, lawn[1] + pose * .8);
                engine.camera.lookAt(lawn[0], grass.groundY + .1, lawn[1] - 8);
                grass.update(); renderer.render(engine.scene, engine.camera);
                const snapshot = grass.getSnapshot(), placement = JSON.stringify(visible());
                if (positions.has(pose) && positions.get(pose) !== placement) stablePlacements = false;
                positions.set(pose, placement); anchors.add(snapshot.anchor.join(','));
                snapshot.field.levels.forEach((count, level) => { if (count) visibleLevels.add(level); });
                samples.push(snapshot.field.updateMs);
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        } finally { for (const [name, original] of originals) gl[name] = original; }
        window.grassProbeLawn = lawn;
        return { uploads, trackedBuffers: buffers.size, attributes: attributes.size, stablePlacements, anchors: anchors.size,
            versionsUnchanged: [...attributes].every((attribute, index) => attribute.version === versions[index]),
            visibleLevels: [...visibleLevels].sort(), samples, snapshot: grass.getSnapshot(), glError: gl.getError() };
    });
    await mkdir(caseOutput, { recursive: true });
    const ao = [];
    for (const mode of ['gtao', 'ssao']) for (const handling of ['alpha_test', 'exclude']) {
        const row = await page.evaluate(async ({ mode, handling }) => {
            const { engine } = window.__busSim, grass = engine.context.city.grass, lawn = window.grassProbeLawn;
            const { shouldApplyAoAlphaCutout } = await import('/src/graphics/visuals/postprocessing/AoAlphaCutoutSupport.js');
            const current = engine.ambientOcclusionSettings;
            engine.setAmbientOcclusionSettings({ ...current, mode, scope: 'all', indirectScope: 'all',
                alpha: { ...current.alpha, handling }, gtao: { ...current.gtao, updateMode: 'every_frame', debugView: false } });
            engine.camera.position.set(lawn[0] + 8, grass.groundY + 4, lawn[1] + 12);
            engine.camera.lookAt(lawn[0], grass.groundY, lawn[1]); grass.update(true);
            engine.renderFrame();
            let colorDraws = 0, overrideDraws = 0, cutoutCandidates = 0, aoPasses = 0, terrainDepthDraws = 0;
            const hooks = [];
            grass.group.traverse(mesh => {
                if (!mesh.isMesh) return;
                if (shouldApplyAoAlphaCutout(mesh.material, mesh)) cutoutCandidates++;
                const original = mesh.onBeforeRender; hooks.push([mesh, original]);
                mesh.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
                    if (scene.overrideMaterial) overrideDraws++; else if (material === this.material) colorDraws++;
                    original.call(this, renderer, scene, camera, geometry, material, group);
                };
            });
            const renderer = engine.renderer, originalRender = renderer.render;
            renderer.render = function (scene, camera) {
                if (scene === engine.scene && scene.overrideMaterial) aoPasses++;
                return originalRender.call(this, scene, camera);
            };
            engine.scene.traverse(mesh => {
                if (!mesh.isMesh || !/ground/i.test(mesh.name) || mesh.name.startsWith('Grass')) return;
                const original = mesh.onBeforeRender; hooks.push([mesh, original]);
                mesh.onBeforeRender = function (...args) {
                    if (args[1].overrideMaterial) terrainDepthDraws++;
                    original.apply(this, args);
                };
            });
            try { engine.renderFrame(); engine.renderFrame(); }
            finally { renderer.render = originalRender; for (const [mesh, original] of hooks) mesh.onBeforeRender = original; }
            return { mode, handling, colorDraws, overrideDraws, cutoutCandidates, aoPasses, terrainDepthDraws,
                visible: grass.group.visible, diagnostics: engine.getAmbientOcclusionDebugInfo() };
        }, { mode, handling });
        ao.push(row);
        await page.screenshot({ path: `${caseOutput}/${mode}-${handling}.png` });
    }
    await writeFile(`${caseOutput}/validation.json`, JSON.stringify({ movement, ao, errors }, null, 2));
    expect(movement.snapshot.strategy).toBe('patches');
    expect(movement.snapshot.field.terminalTransition).toBe(transition);
    expect(movement.trackedBuffers).toBeGreaterThan(10);
    expect(movement.uploads).toBe(0);
    expect(movement.versionsUnchanged).toBe(true);
    expect(movement.stablePlacements).toBe(true);
    expect(movement.anchors).toBeGreaterThan(2);
    expect(movement.visibleLevels).toEqual([0, 1, 2, 3, 4, 5]);
    expect(movement.glError).toBe(0);
    for (const row of ao) {
        expect(row.colorDraws, `${row.mode}/${row.handling}`).toBeGreaterThan(0);
        expect(row.overrideDraws).toBe(0);
        expect(row.cutoutCandidates).toBe(0);
        expect(row.aoPasses).toBeGreaterThan(0);
        expect(row.terrainDepthDraws).toBeGreaterThan(0);
        expect(row.visible).toBe(true);
    }
    expect(errors).toEqual([]);
});
