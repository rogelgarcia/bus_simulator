// Compare shader ablations on forced flat LOD4 against matched soil and a geometry-only control.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeGrassLod4DecompositionReport } from '../../visual/grass_lod4_decomposition_report.mjs';

const visibilityFollowup = process.env.GRASS_LOD4_VISIBILITY_FOLLOWUP === '1';
const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/lod4_decomposition', visibilityFollowup ? 'visibility_followup' : '.');
const poses = ['front', 'rear', 'border'], rounds = 6, warmupFrames = 6, sampleFrames = 30;
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
function summary(values) {
    const averageMs = mean(values);
    const variance = values.reduce((sum, value) => sum + (value - averageMs) ** 2, 0) / (values.length - 1);
    const margin = 2.57058183661474 * Math.sqrt(variance / values.length);
    return { averageMs, ci95Ms: [averageMs - margin, averageMs + margin], blocks: values };
}

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
        args: ['--force-color-profile=srgb', '--disable-background-timer-throttling'] } });

test('Flat LOD4 shader decomposition and geometry control on hardware', async ({ page, browser }) => {
    test.skip(process.env.GRASS_TRANSITION_BENCHMARK !== '1', 'Opt in with GRASS_TRANSITION_BENCHMARK=1.');
    test.setTimeout(900000);
    await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html?configuration=lod4-flat&revision=lod4-decomposition-1#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness);
    await page.evaluate(() => window.__grassTransitionReadiness);
    await expect(page.locator('#transition-configuration')).toHaveValue('lod4-flat');
    await expect(page.locator('#transition-limit-0')).toBeDisabled();
    const metadata = await page.evaluate(async ({ warmupFrames, sampleFrames, visibilityFollowup }) => {
        const THREE = await import('three');
        const { createGrassDebugV2CanopyDiagnostic, GRASS_CANOPY_DIAGNOSTICS } = await import('/src/graphics/gui/grass_debugger_v2/GrassDebugV2CanopyDiagnostics.js');
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const s = window.__grassTransitionScene, timer = getOrCreateGpuFrameTimer(s.renderer);
        s.setAnimating(false); s.setHelpers(false);
        const meshes = [], originals = new Map(), diagnosticSets = new Map();
        s.fields.group.traverse(mesh => {
            if (!mesh.userData.grassCanopy) return;
            meshes.push(mesh); originals.set(mesh, { material: mesh.material, geometry: mesh.geometry });
            if (!diagnosticSets.has(mesh.material)) diagnosticSets.set(mesh.material,
                Object.fromEntries(Object.keys(GRASS_CANOPY_DIAGNOSTICS).map(id => [id, createGrassDebugV2CanopyDiagnostic(mesh.material, id)])));
        });
        const geometry = new THREE.PlaneGeometry(1, 1, 4, 4);
        geometry.rotateX(-Math.PI / 2); geometry.translate(0, meshes[0].geometry.attributes.position.getY(0), 0);
        const soilGroup = new THREE.Group(); soilGroup.name = 'FlatDiagnosticSoil';
        s.setSoilOnly(true);
        s.fields.group.traverse(source => {
            if (!source.isInstancedMesh || !source.name.endsWith('-Ground')) return;
            const mesh = new THREE.InstancedMesh(source.geometry, source.material, source.count);
            mesh.name = 'FlatDiagnosticSoil-' + source.parent.name;
            mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(0, source.count * 16));
            mesh.instanceMatrix.needsUpdate = true; mesh.position.copy(source.position); mesh.receiveShadow = true;
            mesh.computeBoundingBox(); mesh.computeBoundingSphere(); soilGroup.add(mesh);
        });
        s.setSoilOnly(false); soilGroup.visible = false; s.scene.add(soilGroup);
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        let clock = performance.now(), activeId = 'full';
        function renderNow() {
            clock = Math.max(clock + 1000 / 60, performance.now());
            const start = performance.now(); s.step(1 / 60, clock); return performance.now() - start;
        }
        async function render() { await frame(); return renderNow(); }
        function select(id) {
            activeId = id; s.fields.group.visible = id !== 'soil'; soilGroup.visible = id === 'soil';
            document.querySelector('#transition-soil').checked = id === 'soil';
            for (const mesh of meshes) {
                const original = originals.get(mesh);
                mesh.material = original.material; mesh.geometry = original.geometry;
            }
            if (id !== 'soil') for (const mesh of meshes) {
                const original = originals.get(mesh);
                mesh.material = diagnosticSets.get(original.material)[id === 'grid' ? 'full' : id].material;
                if (id === 'grid') mesh.geometry = geometry;
            }
        }
        function apply(pose, id) { s.setPose(pose); select(id); }
        function state() {
            const value = s.getSnapshot();
            return { configuration: value.configuration, soilOnly: activeId === 'soil', fields: value.fields,
                draw: value.performance.draw, selection: value.selection, shadows: value.shadows, glError: value.glError };
        }
        function audit() {
            const draws = [], previous = [];
            let shadowDraws = 0;
            s.scene.traverse(mesh => {
                if (!mesh.isMesh) return;
                const render = mesh.onBeforeRender, shadow = mesh.onBeforeShadow;
                previous.push([mesh, render, shadow]);
                mesh.onBeforeRender = function(...args) {
                    draws.push({ name: mesh.name, material: args[4].name, count: mesh.isInstancedMesh ? mesh.count : 1,
                        triangles: (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 });
                    return render.apply(this, args);
                };
                mesh.onBeforeShadow = function(...args) { shadowDraws++; return shadow.apply(this, args); };
            });
            try { s.step(0, clock += 501); }
            finally { for (const [mesh, render, shadow] of previous) { mesh.onBeforeRender = render; mesh.onBeforeShadow = shadow; } }
            return { draws, shadowDraws, state: state(), hud: document.querySelector('#scene-performance').textContent };
        }
        window.__lod4Decomposition = {
            async soak(pose, id, count = 60) { apply(pose, id); for (let i = 0; i < count; i++) await render(); },
            async run(pose, id) {
                apply(pose, id);
                const cases = { reference: 'full', variant: id, baseline: 'soil' };
                const submit = async (i, record = null) => {
                    await frame();
                    const order = ['reference', 'variant', 'baseline'];
                    for (let j = 0; j < order.length; j++) {
                        const label = order[(j + i) % order.length]; select(cases[label]);
                        const cpu = renderNow(), sequence = timer.getDiagnostics().submissionSequence;
                        if (record) record.push({ label, cpu, sequence });
                    }
                };
                for (let i = 0; i < warmupFrames; i++) await submit(i);
                const before = timer.getDiagnostics(), initial = state(), first = before.submissionSequence;
                const submissions = [];
                for (let i = 0; i < sampleFrames; i++) await submit(i, submissions);
                const last = timer.getDiagnostics().submissionSequence;
                const selected = () => timer.getSamplesSince(0).filter(sample => sample.submissionSequence > first && sample.submissionSequence <= last);
                for (let i = 0; i < 120 && selected().length < sampleFrames * 3; i++) { await frame(); timer.poll(); }
                const after = timer.getDiagnostics(), samples = selected();
                if (!before.active || !after.active || before.disjointCount !== after.disjointCount || samples.length !== sampleFrames * 3
                    || last - first !== sampleFrames * 3) throw new Error('Invalid hardware GPU block for ' + id);
                const bySequence = new Map(samples.map(sample => [sample.submissionSequence, sample.ms]));
                const values = label => submissions.filter(item => item.label === label).map(item => bySequence.get(item.sequence));
                select(id); renderNow();
                const final = state();
                return { pose, id, gpu: values('variant'), referenceGpu: values('reference'), baselineGpu: values('baseline'),
                    cpu: submissions.filter(item => item.label === 'variant').map(item => item.cpu),
                    state: final, scans: final.selection.scans - initial.selection.scans,
                    instanceUploads: final.fields.instanceUploads - initial.fields.instanceUploads,
                    shadowGenerations: final.shadows.generations - initial.shadows.generations };
            },
            async capture(pose, id) { apply(pose, id); for (let i = 0; i < warmupFrames; i++) await render(); return audit(); },
            restore() {
                apply('front', 'full');
                for (const mesh of meshes) mesh.material = originals.get(mesh).material;
                for (const variants of diagnosticSets.values()) for (const variant of Object.values(variants)) variant.dispose();
                geometry.dispose(); soilGroup.removeFromParent(); soilGroup.children.forEach(mesh => mesh.dispose());
                s.setConfiguration('distance'); s.step();
                const normal = state();
                s.setConfiguration('lod4-flat'); s.step();
                return { normal, flat: state() };
            }
        };
        const gl = s.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
        const first = meshes[0].material;
        return { renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
            viewport: [innerWidth, innerHeight], pixelRatio: s.renderer.getPixelRatio(), warmupFrames, sampleFrames,
            anisotropy: { albedo: first.map.anisotropy, normal: first.normalMap.anisotropy, roughness: first.roughnessMap.anisotropy },
            cases: visibilityFollowup ? Object.fromEntries(['full', 'baked_only', 'no_visibility'].map(id => [id, GRASS_CANOPY_DIAGNOSTICS[id]]))
                : { soil: 'Soil-only baseline', ...GRASS_CANOPY_DIAGNOSTICS, grid: '32-triangle flat cell, same complete shader; geometry control' },
            method: 'Six rotated rounds per bus pose. Each case receives 60 startup frames, then 6 warmup and 30 measured triplets per round. Each animation cycle renders full LOD4, the variant, and soil in rotating order with separate hardware GPU queries. Soil uses pre-uploaded copies of the existing soil batches; mode changes only toggle visibility/materials, never upload instances or regenerate shadows. Helpers off. No outlier filtering. Ablations are independent, not additive component timers.' };
    }, { warmupFrames, sampleFrames, visibilityFollowup });
    expect(metadata.renderer).not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
    const ids = Object.keys(metadata.cases);
    const report = { metadata: { ...metadata, browser: browser.version(), date: new Date().toISOString(), rounds }, poses: {}, errors };
    for (const pose of poses) {
        console.log('[LOD4Decomposition] Preparing ' + pose + ' shaders and textures.');
        for (const id of ids) {
            await page.evaluate(({ pose, id }) => window.__lod4Decomposition.soak(pose, id), { pose, id });
            expect(errors).toEqual([]);
        }
        const blocks = [];
        for (let round = 0; round < rounds; round++) {
            const order = ids.map((_, i) => ids[(i + round * 7) % ids.length]);
            if (round % 2) order.reverse();
            for (const id of order) {
                const block = await page.evaluate(({ pose, id }) => window.__lod4Decomposition.run(pose, id), { pose, id });
                blocks.push({ ...block, round });
                expect(block.state.glError).toBe(0); expect(block.scans).toBe(0); expect(block.instanceUploads).toBe(0);
                expect(block.shadowGenerations).toBe(0); expect(block.state.fields.sideLeafCells).toBe(0);
                expect(block.state.fields.levels).toEqual([0, 0, 0, 0, 4096]);
            }
            console.log('[LOD4Decomposition] ' + pose + ' round ' + (round + 1) + ': ' + blocks.filter(block => block.round === round)
                .map(block => block.id + ' ' + mean(block.gpu).toFixed(3)).join(' / '));
        }
        const results = Object.fromEntries(ids.map(id => {
            const selected = blocks.filter(block => block.id === id);
            return [id, { totalGpu: summary(selected.map(block => mean(block.gpu))),
                aboveSoilGpu: summary(selected.map(block => mean(block.gpu) - mean(block.baselineGpu))),
                savedGpu: summary(selected.map(block => mean(block.referenceGpu) - mean(block.gpu))),
                cpu: summary(selected.map(block => mean(block.cpu))), draw: selected[0].state.draw }];
        }));
        report.poses[pose] = { blocks, results, captures: {} };
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
        for (const id of ids) {
            const audit = await page.evaluate(({ pose, id }) => window.__lod4Decomposition.capture(pose, id), { pose, id });
            report.poses[pose].captures[id] = audit;
            expect(audit.shadowDraws).toBe(0);
            expect(audit.draws.some(draw => /-Fringe-|-LOD[0-3]-/.test(draw.name))).toBe(false);
            if (id !== 'soil') {
                expect(audit.draws.some(draw => draw.name.endsWith('-Ground'))).toBe(false);
                expect(audit.draws.filter(draw => draw.name.includes('-LOD4-')).every(draw => draw.triangles === (id === 'grid' ? 32 : 2))).toBe(true);
            }
            await page.screenshot({ path: path.join(output, pose + '_' + id + '.png') });
        }
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
    }
    const restored = await page.evaluate(() => window.__lod4Decomposition.restore());
    expect(restored.normal.fields.flatLod4).toBe(false);
    expect(restored.normal.fields.levels.slice(0, 4).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
    expect(restored.flat.fields.levels).toEqual([0, 0, 0, 0, 4096]);
    expect(restored.flat.fields.triangles).toBe(8192);
    expect(errors).toEqual([]);
    await writeGrassLod4DecompositionReport(output, report);
});
