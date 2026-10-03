// Separate height, tessellation, bevels, fringe and shadow shading with matched soil baselines.
import test, { expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeGrassLod4FactorsReport } from '../../visual/grass_lod4_factors_report.mjs';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/lod4_factors');
const rounds = 6, samples = 30, warmup = 6;
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
function summary(values) {
    const averageMs = mean(values), variance = mean(values.map(value => (value - averageMs) ** 2)) * values.length / (values.length - 1);
    const margin = 2.57058183661474 * Math.sqrt(variance / values.length);
    return { averageMs, ci95Ms: [averageMs - margin, averageMs + margin], blocks: values };
}

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
        args: ['--force-color-profile=srgb', '--disable-background-timer-throttling'] } });

test('LOD4 elevation, fringe and shadows on hardware', async ({ page, browser }) => {
    test.skip(process.env.GRASS_TRANSITION_BENCHMARK !== '1', 'Opt in with GRASS_TRANSITION_BENCHMARK=1.');
    test.setTimeout(900000); await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html?configuration=lod4-elevated-sides&revision=lod4-factors-1#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness);
    await page.evaluate(() => window.__grassTransitionReadiness);
    const metadata = await page.evaluate(async ({ samples, warmup }) => {
        const THREE = await import('three');
        const { cloneMaterialShaderContract } = await import('/src/graphics/shaders/core/MaterialShaderHookRegistry.js');
        const { createGrassDebugV2CanopyDiagnostic } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyDiagnostics.js');
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const s = window.__grassTransitionScene, timer = getOrCreateGpuFrameTimer(s.renderer), sun = s.lighting.sun;
        s.setAnimating(false); s.setHelpers(false);
        s.setOptimization('shadow');
        const cases = {
            ground: { label: 'Ground-level quad', surface: 'ground', reference: 'ground' },
            raised: { label: 'Raised 10 cm quad', surface: 'flat', reference: 'ground' },
            grid: { label: 'Raised flat 32-triangle grid', surface: 'grid', reference: 'raised' },
            bevel: { label: 'Elevation + bevel, no leaves', surface: 'beveled', reference: 'grid' },
            side35: { label: 'Elevation + side grass within 35 m', surface: 'beveled', sides: 35, reference: 'bevel' },
            sideAll: { label: 'Elevation + all side grass (200 m)', surface: 'beveled', sides: 200, reference: 'side35' },
            legacy: { label: 'Raised quad, previous shadow shader', surface: 'flat', material: 'legacy', reference: 'raised' },
            tileOff: { label: 'Raised quad, baked self-shadows off', surface: 'flat', material: 'tileOff', reference: 'raised' },
            flatSceneOff: { label: 'Raised quad, scene shadows off; baked kept', surface: 'flat', shadows: 'sceneOff', reference: 'raised' },
            flatAllOff: { label: 'Raised quad, all shadows off', surface: 'flat', shadows: 'allOff', reference: 'raised' },
            bevelAllOff: { label: 'Elevation + bevel, all shadows off', surface: 'beveled', shadows: 'allOff', reference: 'bevel' },
            sidesSceneOff: { label: 'Elevation + side grass, scene shadows off; baked kept', surface: 'beveled', sides: 35, shadows: 'sceneOff', reference: 'side35' },
            sidesAllOff: { label: 'Elevation + side grass, all shadows off', surface: 'beveled', sides: 35, shadows: 'allOff', reference: 'side35' }
        };
        const meshes = [], states = new Map(), ownedGeometry = new Set(), variants = new Map();
        s.fields.group.traverse(mesh => { if (mesh.userData.grassCanopy) { meshes.push(mesh); states.set(mesh, {}); } });
        for (const surface of ['beveled', 'flat', 'ground']) {
            s.fields.setLod4Surface(surface);
            for (const mesh of meshes) states.get(mesh)[surface] = { geometry: mesh.geometry, material: mesh.material,
                boundingBox: mesh.boundingBox, boundingSphere: mesh.boundingSphere };
        }
        for (const mesh of meshes) {
            const state = states.get(mesh), geometry = state.beveled.geometry.clone(); ownedGeometry.add(geometry);
            state.grid = { ...state.flat, geometry };
            for (const base of [state.flat.material, state.beveled.material]) if (!variants.has(base)) {
                const legacy = cloneMaterialShaderContract(base); delete legacy.defines.GRASS_CANOPY_BAKED_SHADOW_ONLY;
                const tileOff = createGrassDebugV2CanopyDiagnostic(base, 'no_visibility');
                variants.set(base, { legacy, tileOff });
            }
        }
        const grassShadow = sun.shadow.map;
        // Keep separate complete caches; never regenerate a shadow map inside a timed frame.
        sun.shadow.map = null; s.setSoilOnly(true); const emptyShadow = sun.shadow.map;
        const soil = new THREE.Group(); soil.name = 'FactorSoilBaseline';
        const cloneBatch = source => {
            const mesh = new THREE.InstancedMesh(source.geometry, source.material, source.count);
            mesh.name = source.name; mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(0, source.count * 16));
            mesh.instanceMatrix.needsUpdate = true; mesh.position.copy(source.position); mesh.receiveShadow = true;
            mesh.computeBoundingBox(); mesh.computeBoundingSphere(); return mesh;
        };
        s.fields.group.traverse(mesh => { if (mesh.isInstancedMesh && mesh.name.endsWith('-Ground')) soil.add(cloneBatch(mesh)); });
        sun.shadow.map = grassShadow; s.setSoilOnly(false); soil.visible = false; s.scene.add(soil);
        const fringes = new Map(), frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        let active = 'raised', clock = performance.now(), equivalencePixels = null;
        const render = () => { clock = Math.max(clock + 1000 / 60, performance.now()); const start = performance.now(); s.step(1 / 60, clock); return performance.now() - start; };
        function setShadowMode(mode) {
            const enabled = mode !== 'allOff';
            if (s.renderer.shadowMap.enabled !== enabled) {
                s.renderer.shadowMap.enabled = enabled;
                // Warmed programs are reused; mode-switch setup is outside the CPU submission timer.
                s.scene.traverse(mesh => { if (mesh.isMesh) for (const material of [mesh.material].flat()) material.needsUpdate = true; });
                for (const state of states.values()) for (const value of Object.values(state)) value.material.needsUpdate = true;
                for (const value of variants.values()) { value.legacy.needsUpdate = true; value.tileOff.material.needsUpdate = true; }
            }
            s.scene.traverse(mesh => { if (mesh.isMesh) mesh.receiveShadow = mode !== 'sceneOff' || !!mesh.userData.grassCanopy; });
        }
        function select(id, baseline = false) {
            active = baseline ? 'soil-' + id : id;
            const spec = cases[id]; setShadowMode(spec.shadows);
            sun.shadow.map = !baseline && spec.sides ? grassShadow : emptyShadow;
            s.fields.group.visible = !baseline; soil.visible = baseline;
            for (const [distance, group] of fringes) group.visible = !baseline && distance === spec.sides;
            s.fields.group.traverse(mesh => { if (mesh.name.includes('-Fringe-')) mesh.visible = false; });
            for (const mesh of meshes) {
                const state = states.get(mesh)[spec.surface]; Object.assign(mesh, state);
                if (spec.material === 'legacy') mesh.material = variants.get(state.material).legacy;
                if (spec.material === 'tileOff') mesh.material = variants.get(state.material).tileOff.material;
            }
        }
        function state() {
            const value = s.getSnapshot();
            return { active, draw: value.performance.draw, selection: value.selection, shadows: value.shadows,
                uploads: value.fields.instanceUploads, glError: value.glError };
        }
        function audit() {
            const draws = [], previous = []; let shadowDraws = 0;
            s.scene.traverse(mesh => {
                if (!mesh.isMesh) return;
                const before = mesh.onBeforeRender, shadow = mesh.onBeforeShadow; previous.push([mesh, before, shadow]);
                mesh.onBeforeRender = function(...args) { draws.push({ name: mesh.name, count: mesh.count ?? 1,
                    triangles: (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 }); return before.apply(this, args); };
                mesh.onBeforeShadow = function(...args) { shadowDraws++; return shadow.apply(this, args); };
            });
            try { render(); } finally { for (const [mesh, before, shadow] of previous) { mesh.onBeforeRender = before; mesh.onBeforeShadow = shadow; } }
            return { ...state(), draws, shadowDraws };
        }
        window.__lod4Factors = {
            async prepare(pose) {
                setShadowMode(); sun.shadow.map = grassShadow; s.fields.group.visible = true; soil.visible = false;
                for (const group of fringes.values()) { group.removeFromParent(); group.children.forEach(mesh => mesh.dispose()); }
                fringes.clear(); s.setPose(pose);
                for (const distance of [35, 200]) {
                    s.setSettings({ sideLeafDistance: distance });
                    const group = new THREE.Group(); group.name = 'FactorSideGrass-' + distance;
                    s.fields.group.traverse(mesh => { if (mesh.isInstancedMesh && mesh.name.includes('-Fringe-') && mesh.count) group.add(cloneBatch(mesh)); });
                    group.visible = false; fringes.set(distance, group); s.scene.add(group);
                }
                s.setSettings({ sideLeafDistance: 35 });
                for (const id of Object.keys(cases)) { select(id); for (let i = 0; i < 30; i++) { await frame(); render(); } }
                for (const id of ['raised', 'flatSceneOff', 'flatAllOff']) { select(id, true); for (let i = 0; i < 30; i++) { await frame(); render(); } }
            },
            async run(id) {
                const labels = ['variant', 'reference', 'baseline', 'referenceBaseline'], spec = cases[id];
                const submit = async (i, records) => {
                    await frame();
                    for (let j = 0; j < 4; j++) {
                        const label = labels[(i + j) % 4];
                        select(label.startsWith('reference') ? spec.reference : id, label === 'baseline' || label === 'referenceBaseline');
                        const cpu = render(), sequence = timer.getDiagnostics().submissionSequence;
                        records?.push({ label, cpu, sequence });
                    }
                };
                for (let i = 0; i < warmup; i++) await submit(i);
                const before = timer.getDiagnostics(), initial = state(), records = [];
                for (let i = 0; i < samples; i++) await submit(i, records);
                const last = timer.getDiagnostics().submissionSequence;
                const read = () => timer.getSamplesSince(0).filter(sample => sample.submissionSequence > before.submissionSequence && sample.submissionSequence <= last);
                for (let i = 0; i < 120 && read().length < samples * 4; i++) { await frame(); timer.poll(); }
                const after = timer.getDiagnostics(), values = read();
                if (!before.active || !after.active || before.disjointCount !== after.disjointCount || values.length !== samples * 4
                    || last - before.submissionSequence !== samples * 4) throw new Error('Invalid hardware GPU block: ' + id);
                const bySequence = new Map(values.map(value => [value.submissionSequence, value.ms]));
                select(id); render(); const final = state();
                return { id, gpu: Object.fromEntries(labels.map(label => [label, records.filter(row => row.label === label).map(row => bySequence.get(row.sequence))])),
                    cpu: records.filter(row => row.label === 'variant').map(row => row.cpu), state: final,
                    scans: final.selection.scans - initial.selection.scans, uploads: final.uploads - initial.uploads,
                    shadowGenerations: final.shadows.generations - initial.shadows.generations };
            },
            async capture(id) {
                select(id); for (let i = 0; i < warmup; i++) { await frame(); render(); }
                const value = audit();
                if (id === 'raised' || id === 'legacy') {
                    const gl = s.renderer.getContext(), pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    if (id === 'raised') equivalencePixels = pixels;
                    else {
                        let changedPixels = 0, maximumChannelError = 0;
                        for (let i = 0; i < pixels.length; i += 4) {
                            let changed = false;
                            for (let channel = 0; channel < 3; channel++) {
                                const error = Math.abs(pixels[i + channel] - equivalencePixels[i + channel]);
                                maximumChannelError = Math.max(maximumChannelError, error); changed ||= error > 0;
                            }
                            changedPixels += Number(changed);
                        }
                        value.equivalence = { pixels: pixels.length / 4, changedPixels, maximumChannelError };
                    }
                }
                return value;
            },
            restore() {
                setShadowMode(); sun.shadow.map = grassShadow;
                for (const group of fringes.values()) { group.removeFromParent(); group.children.forEach(mesh => mesh.dispose()); }
                soil.removeFromParent(); soil.children.forEach(mesh => mesh.dispose()); emptyShadow.dispose();
                for (const geometry of ownedGeometry) geometry.dispose();
                for (const value of variants.values()) { value.legacy.dispose(); value.tileOff.dispose(); }
                for (const mesh of meshes) Object.assign(mesh, states.get(mesh).ground);
                s.fields.group.visible = true; s.fields.setLod4Surface('ground'); s.setConfiguration('distance'); s.step();
                return s.getSnapshot().glError;
            }
        };
        const gl = s.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER), cases,
            viewport: [innerWidth, innerHeight], pixelRatio: s.renderer.getPixelRatio(), samples, warmup,
            method: 'Six rotated rounds per bus pose; each animation cycle submits variant, reference, matched soil, and reference soil in rotating order with separate GPU queries. 30 warmup frames per case/pose, then 6 warmup + 30 measured quartets per block. All samples retained. Helpers off. Separate prebuilt empty/grass shadow caches. Zero timed shadow draws, selection scans or instance uploads. Shadow toggle setup excluded from CPU submission time. Effects are paired ablations, not additive GPU stage timers.' };
    }, { samples, warmup });
    expect(metadata.renderer).not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
    await page.addStyleTag({ content: '#scene-panel, #scene-performance { visibility: hidden !important; }' });
    const captureOnly = process.env.GRASS_LOD4_FACTORS_CAPTURE_ONLY === '1';
    const ids = Object.keys(metadata.cases), report = captureOnly ? JSON.parse(await readFile(path.join(output, 'benchmark.json'), 'utf8'))
        : { metadata: { ...metadata, rounds, browser: browser.version(), date: new Date().toISOString() }, poses: {}, errors };
    if (captureOnly) {
        expect(report.metadata.renderer).toBe(metadata.renderer); expect(report.metadata.cases).toEqual(metadata.cases);
        report.metadata.captureDate = new Date().toISOString(); report.errors = errors;
    }
    for (const pose of ['front', 'rear', 'border']) {
        console.log('[LOD4Factors] Preparing ' + pose); await page.evaluate(pose => window.__lod4Factors.prepare(pose), pose);
        expect(errors).toEqual([]); const blocks = captureOnly ? report.poses[pose].blocks : [];
        for (let round = 0; round < (captureOnly ? 0 : rounds); round++) {
            const order = ids.map((_, i) => ids[(i + round * 5) % ids.length]); if (round % 2) order.reverse();
            for (const id of order) {
                const block = await page.evaluate(id => window.__lod4Factors.run(id), id); blocks.push({ ...block, round });
                expect(block.state.glError).toBe(0); expect(block.scans).toBe(0); expect(block.uploads).toBe(0); expect(block.shadowGenerations).toBe(0);
            }
            console.log('[LOD4Factors] ' + pose + ' round ' + (round + 1));
        }
        const results = Object.fromEntries(ids.map(id => {
            const selected = blocks.filter(block => block.id === id);
            return [id, { totalGpu: summary(selected.map(block => mean(block.gpu.variant))),
                soilGpu: summary(selected.map(block => mean(block.gpu.baseline))),
                aboveSoilGpu: summary(selected.map(block => mean(block.gpu.variant) - mean(block.gpu.baseline))),
                effectGpu: summary(selected.map(block => mean(block.gpu.variant) - mean(block.gpu.reference))),
                effectAboveSoilGpu: summary(selected.map(block => mean(block.gpu.variant) - mean(block.gpu.baseline) - mean(block.gpu.reference) + mean(block.gpu.referenceBaseline))),
                cpu: summary(selected.map(block => mean(block.cpu))), draw: selected[0].state.draw }];
        }));
        report.poses[pose] = { blocks, results, captures: {} };
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
        for (const id of ids) {
            const capture = await page.evaluate(id => window.__lod4Factors.capture(id), id); report.poses[pose].captures[id] = capture;
            expect(capture.shadowDraws).toBe(0); expect(capture.glError).toBe(0);
            expect(capture.draws.some(draw => draw.name.endsWith('-Ground') || /-LOD[0-3]-/.test(draw.name))).toBe(false);
            expect(capture.draws.some(draw => draw.name.includes('-Fringe-'))).toBe(!!metadata.cases[id].sides);
            if (capture.equivalence) {
                // Different compiled programs may round a few output pixels by one 8-bit level.
                expect(capture.equivalence.maximumChannelError).toBeLessThanOrEqual(1);
                expect(capture.equivalence.changedPixels / capture.equivalence.pixels).toBeLessThan(.0001);
            }
            await page.screenshot({ path: path.join(output, pose + '_' + id + '.png') });
        }
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
    }
    expect(await page.evaluate(() => window.__lod4Factors.restore())).toBe(0); expect(errors).toEqual([]);
    await writeGrassLod4FactorsReport(output, report);
});
