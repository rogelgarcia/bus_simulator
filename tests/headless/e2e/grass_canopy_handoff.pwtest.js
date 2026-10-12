// Reproduce supplied seam poses and distinguish camera-motion shimmer from LOD selection changes.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const phase = process.env.GRASS_HANDOFF_PHASE || 'after';
const output = 'tests/artifacts/screens/grass_debug_v2/canopy_handoff/' + phase;
const poses = [
    { name: 'high', camera: [13.809, 15.855, 78.109, 172.307, -25.421, 0] },
    { name: 'oblique', camera: [-35.076, 12.444, -45.491, -155.267, -3.457, 0] },
    { name: 'bus', camera: [-2.4, 6.883, -18.63, 180, -19.206, 0] }
];
test.use({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    ...(process.env.GRASS_HANDOFF_HARDWARE ? { launchOptions: { args: ['--use-angle=d3d11', '--enable-webgl-developer-extensions'] } } : {}) });

test('final grass handoff is stable in the supplied moving camera views', async ({ page }) => {
    test.skip(!!process.env.GRASS_HANDOFF_JITTER_ONLY);
    test.setTimeout(240000);
    const errors = [], results = [];
    await mkdir(output, { recursive: true });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    if (process.env.GRASS_HANDOFF_REFERENCE) for (const path of [
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2BakedLightingAssets.js',
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2FarTexture.js',
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2TransitionBlend.js',
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2TransitionFields.js',
        'src/graphics/gui/grass_debugger_v2/GrassDebugV2TransitionSelection.js',
        ...['GrassTransitionBlendShaderLoader.js', 'grass_baked_appearance.vert.glsl', 'grass_transition_blend.vert.glsl',
            'grass_transition_blend.frag.glsl', 'grass_transition_blend_pars.vert.glsl', 'grass_transition_blend_pars.frag.glsl'].map(name => 'src/graphics/shaders/materials/grass/' + name)
    ]) {
        const body = execFileSync('git', ['show', '28578dd92049fd4c651cb56513349a97079b7cbf:' + path], { encoding: 'utf8' });
        await page.route('**/' + path.split('/').at(-1) + '*', route => route.fulfill({ status: 200, contentType: path.endsWith('.glsl') ? 'text/plain' : 'application/javascript', body }));
    }
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__handoffView = view;\nlet copyFeedbackTimer;') });
    });
    await page.route('**/GrassDebugV2DistanceGrass.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const settings = selection.getSnapshot();', 'window.__handoffFields = { fields, selection };\nconst settings = selection.getSnapshot();') });
    });
    await page.goto('/debug_tools/grass_debug_v2.html?grass=baked');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    await page.evaluate(() => window.__handoffView.renderer.setAnimationLoop(null));
    const hardware = await page.evaluate(() => {
        const view = window.__handoffView, gl = view.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), viewport: view.getSnapshot().viewport, timer: view.gpuTimer.getDiagnostics() };
    });
    for (const pose of poses) {
        await page.evaluate(async pose => {
            const THREE = await import('three'), view = window.__handoffView;
            view.camera.position.fromArray(pose.camera);
            view.camera.rotation.set(...[pose.camera[4], pose.camera[3], pose.camera[5]].map(THREE.MathUtils.degToRad), 'YXZ');
            view.camera.updateMatrixWorld(true);
            window.__handoffOrigin = view.camera.position.clone();
            window.__handoffPrevious = null;
        }, pose);
        for (const lod of ['LOD4', 'LOD5', 'AUTO']) {
            const result = await page.evaluate(lod => {
                const view = window.__handoffView;
                view.grass.setMode(lod); view.grass.update(view.camera.position, performance.now(), true); view.lighting.render(0);
                return { grass: view.grass.getSnapshot(), draw: { ...view.renderer.info.render } };
            }, lod);
            await page.locator('#game-canvas').screenshot({ path: `${output}/${pose.name}-${lod}.png` });
            results.push({ pose: pose.name, lod, ...result });
        }
        const motion = [];
        // Small translations make threshold noise visible without large scene displacement.
        for (let frame = 0; frame < 25; frame++) {
            const result = await page.evaluate(frame => {
                const view = window.__handoffView, { camera, renderer } = view;
                camera.position.copy(window.__handoffOrigin); camera.position.x += frame * .01; camera.updateMatrixWorld(true);
                view.grass.update(camera.position, 20000 + frame * 16.667, frame === 0); view.lighting.render(0);
                const gl = renderer.getContext(), { width, height } = renderer.domElement, pixels = new Uint8Array(width * height * 4);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const previous = window.__handoffPrevious, point = camera.position.clone(), placements = view.grass.getSnapshot().placements;
                const bins = [33, 35, 37, 39, 41, 43].map(distance => ({ distance, count: 0, difference: 0, squared: 0, luma: 0, detail: 0 }));
                for (let y = 2; y < height - 2; y += 2) for (let x = 2; x < width - 2; x += 2) {
                    point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                    const t = (.07 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                    const distance = Math.hypot(wx - camera.position.x, wz - camera.position.z), bin = bins.find(bin => Math.abs(distance - bin.distance) < 1);
                    if (t <= 0 || !bin || !placements.some(p => wx > p.minX + 1 && wx < p.maxX - 1 && wz > p.minZ + 1 && wz < p.maxZ - 1)) continue;
                    const i = (y * width + x) * 4, luma = a => a[i] * .2126 + a[i + 1] * .7152 + a[i + 2] * .0722;
                    const value = luma(pixels), diff = previous ? value - luma(previous) : 0;
                    bin.count++; bin.luma += value; bin.difference += Math.abs(diff); bin.squared += diff * diff;
                    bin.detail += (value - pixels[i + 4] * .2126 - pixels[i + 5] * .7152 - pixels[i + 6] * .0722) ** 2;
                }
                window.__handoffPrevious = pixels;
                return { frame, bins: bins.map(b => ({ distance: b.distance, count: b.count, mean: b.luma / b.count, motion: b.difference / b.count, rms: Math.sqrt(b.squared / b.count), detail: Math.sqrt(b.detail / b.count) })) };
            }, frame);
            motion.push(result);
            if (frame % 6 === 0) await page.locator('#game-canvas').screenshot({ path: `${output}/${pose.name}-motion-${frame}.png` });
        }
        results.push({ pose: pose.name, motion });
    }
    await writeFile(`${output}/results.json`, JSON.stringify({ phase, hardware, results, errors }, null, 2));
    const costs = process.env.GRASS_HANDOFF_PERF ? await page.evaluate(async poses => {
        const view = window.__handoffView, { renderer, gpuTimer: timer } = view;
        const { fields, selection } = window.__handoffFields, THREE = await import('three');
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve)), rows = [];
        if (!timer.isSupported) throw new Error('GPU timer unavailable for handoff comparison.');
        const select = mode => {
            selection.setSettings({ canopyTransitionFraction: mode === 'before' ? .3 : .85 });
            const state = selection.getSnapshot(); fields.configureBlend(state.transitionBands, state.bridgeEnabled);
            view.grass.setMode(mode === 'soil' ? 'OFF' : 'AUTO'); view.grass.update(view.camera.position, performance.now(), true);
            const materials = new Set(); fields.group.traverse(mesh => { if (mesh.material) materials.add(mesh.material); });
            for (const material of materials) {
                const defines = material.defines, level = defines?.GRASS_TRANSITION_BLEND_LEVEL;
                if (defines?.BAKED_GRASS_CANOPY_UV_SCALE) defines.BAKED_GRASS_CANOPY_UV_SCALE = mode === 'before' ? '1.0' : '1.6';
                if (level === 4 && material.userData.grassCanopyHandoff) {
                    if (mode === 'before') delete defines.GRASS_CANOPY_COLOR_HANDOFF;
                    else defines.GRASS_CANOPY_COLOR_HANDOFF = 1;
                }
                if (level === 5 && defines.BAKED_GRASS_CANOPY_VIEW) {
                    if (mode === 'before') delete defines.GRASS_CANOPY_SURFACE_HANDOFF;
                    else defines.GRASS_CANOPY_SURFACE_HANDOFF = 1;
                    material.transparent = mode !== 'before'; material.depthWrite = mode === 'before';
                }
                material.needsUpdate = true;
            }
        };
        const render = () => { timer.poll(); timer.beginFrame(); view.lighting.render(0); timer.endFrame(); };
        const drain = async (limit = 0) => {
            for (let wait = 0; timer.getDiagnostics().pendingQueryCount > limit && wait < 120; wait++) {
                await frame(); timer.poll();
            }
            const state = timer.getDiagnostics();
            if (!state.active || state.pendingQueryCount > limit) throw new Error('GPU query drain failed: ' + JSON.stringify(state));
        };
        const renderBatch = async count => {
            for (let i = 0; i < count; i++) {
                if (i % 4 === 0) { await frame(); timer.poll(); await drain(12); }
                render();
            }
        };
        for (const pose of poses) {
            view.camera.position.fromArray(pose.camera);
            view.camera.rotation.set(...[pose.camera[4], pose.camera[3], pose.camera[5]].map(THREE.MathUtils.degToRad), 'YXZ'); view.camera.updateMatrixWorld(true);
            for (const mode of ['soil', 'before', 'after']) { select(mode); await renderBatch(48); }
            for (const [round, modes] of [['soil', 'before', 'after'], ['after', 'before', 'soil'], ['before', 'soil', 'after'], ['after', 'soil', 'before']].entries()) for (const mode of modes) {
                select(mode);
                await renderBatch(16); await drain();
                const start = timer.getDiagnostics();
                await renderBatch(64);
                const end = timer.getDiagnostics().submissionSequence;
                await drain();
                const samples = timer.getSamplesSince(start.sampleSequence).filter(s => s.submissionSequence > start.submissionSequence && s.submissionSequence <= end);
                if (samples.length !== 64 || timer.getDiagnostics().disjointCount !== start.disjointCount)
                    throw new Error('Invalid GPU handoff samples: ' + JSON.stringify({ pose: pose.name, round, mode, count: samples.length, start, end: timer.getDiagnostics() }));
                rows.push({ pose: pose.name, round, mode, gpuMs: samples.reduce((sum, s) => sum + s.ms, 0) / samples.length, samples: samples.map(s => s.ms), draw: { ...renderer.info.render } });
            }
        }
        select('after'); return rows;
    }, poses) : [];
    await writeFile(`${output}/results.json`, JSON.stringify({ phase, hardware, results, costs, errors }, null, 2));
    expect(errors).toEqual([]);
    for (const row of results.filter(row => row.motion)) for (const frame of row.motion) for (const bin of frame.bins) {
        if (bin.count > 50) expect(Number.isFinite(bin.rms), `${row.pose} ${bin.distance}m`).toBe(true);
    }
});

test('changing the terminal fade does not exchange bright and dark pixels abruptly', async ({ page }) => {
    test.skip(!!process.env.GRASS_HANDOFF_REFERENCE);
    test.setTimeout(120000);
    const errors = [];
    await mkdir(output, { recursive: true });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/grass_debugger_v2/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('let copyFeedbackTimer;', 'window.__handoffView = view;\nlet copyFeedbackTimer;') });
    });
    await page.route('**/GrassDebugV2DistanceGrass.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('const settings = selection.getSnapshot();', 'window.__handoffFields = { fields, selection };\nconst settings = selection.getSnapshot();') });
    });
    await page.goto('/debug_tools/grass_debug_v2.html?grass=baked');
    await page.waitForFunction(() => !!window.__grassDebugV2);
    await page.evaluate(() => window.__grassDebugV2.readiness);
    const rows = await page.evaluate(async poses => {
        const THREE = await import('three'), view = window.__handoffView, { fields, selection } = window.__handoffFields;
        const { camera, renderer } = view, rows = [], gl = renderer.getContext(), { width, height } = renderer.domElement;
        view.renderer.setAnimationLoop(null);
        for (const pose of poses) {
            camera.position.fromArray(pose.camera);
            camera.rotation.set(...[pose.camera[4], pose.camera[3], pose.camera[5]].map(THREE.MathUtils.degToRad), 'YXZ'); camera.updateMatrixWorld(true);
            view.grass.update(camera.position, performance.now(), true);
            const point = camera.position.clone(), placements = view.grass.getSnapshot().placements, offsets = [];
            for (let y = 2; y < height - 2; y += 2) for (let x = 2; x < width - 2; x += 2) {
                point.set((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1, 1).unproject(camera).sub(camera.position);
                const t = (.07 - camera.position.y) / point.y, wx = camera.position.x + point.x * t, wz = camera.position.z + point.z * t;
                const distance = Math.hypot(wx - camera.position.x, wz - camera.position.z);
                if (t > 0 && distance > 32 && distance < 40 && placements.some(p => wx > p.minX + 1 && wx < p.maxX - 1 && wz > p.minZ + 1 && wz < p.maxZ - 1)) offsets.push((y * width + x) * 4);
            }
            const bands = selection.getSnapshot().transitionBands;
            for (const style of ['dissolve', 'canopy']) {
                fields.setFadeStyle(style);
                let previous = null, changed = 0, difference = 0, squared = 0, maximum = 0;
                for (let step = 0; step < 13; step++) {
                    fields.configureBlend(bands.map((b, i) => i === 4 ? { ...b, start: b.start + step * .02, end: b.end + step * .02 } : b), true);
                    view.lighting.render(0);
                    const pixels = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    if (previous) for (const i of offsets) {
                        const delta = Math.max(...[0, 1, 2].map(c => Math.abs(pixels[i + c] - previous[i + c])));
                        difference += delta; squared += delta * delta; changed += Number(delta > 8); maximum = Math.max(maximum, delta);
                    }
                    previous = pixels;
                }
                rows.push({ pose: pose.name, style, pixels: offsets.length, changedFraction: changed / (offsets.length * 12), meanDifference: difference / (offsets.length * 12), rms: Math.sqrt(squared / (offsets.length * 12)), maximum });
            }
            fields.configureBlend(bands, true);
        }
        return rows;
    }, poses);
    await writeFile(`${output}/transition-only.json`, JSON.stringify({ rows, errors }, null, 2));
    expect(errors).toEqual([]);
    for (const row of rows.filter(r => r.style === 'canopy')) {
        const before = rows.find(r => r.pose === row.pose && r.style === 'dissolve');
        expect(row.pixels).toBeGreaterThan(100);
        expect(row.changedFraction, row.pose + ' hard pixel changes').toBeLessThan(before.changedFraction * .25);
        expect(row.rms, row.pose + ' fade-only spikes').toBeLessThan(before.rms * .5);
    }
});
