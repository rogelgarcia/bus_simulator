// Isolate the cost of the user's almost-all-LOD4 setup without changing production materials.
import test, { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeGrassTransitionLod4CostReport } from '../../visual/grass_transition_lod4_cost_report.mjs';

const output = path.resolve('tests/artifacts/screens/grass_debug_v2/transition_lab/lod4_cost');
const treatments = ['soil', 'lod4', 'single_scale', 'soil_shader'];
const poses = ['front', 'rear', 'border'];
const rounds = 6, warmupFrames = 30, sampleFrames = 60;
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
function summarize(values) {
    const averageMs = mean(values);
    const variance = values.reduce((sum, value) => sum + (value - averageMs) ** 2, 0) / (values.length - 1);
    const margin = 2.57058183661474 * Math.sqrt(variance / values.length);
    return { averageMs, ci95Ms: [averageMs - margin, averageMs + margin], blockMeans: values };
}

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, video: 'off', trace: 'off',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
        args: ['--force-color-profile=srgb', '--disable-background-timer-throttling'] } });

test('Almost-all-LOD4 cost, submitted geometry and duplicate-ground audit', async ({ page, browser }) => {
    test.skip(process.env.GRASS_TRANSITION_BENCHMARK !== '1', 'Opt in with GRASS_TRANSITION_BENCHMARK=1.');
    test.setTimeout(600000);
    await mkdir(output, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/debug_tools/grass_transition_scene.html?transition=0&experiment=baseline&revision=transition-draw-count-1#front');
    await page.waitForFunction(() => !!window.__grassTransitionReadiness);
    await page.evaluate(() => window.__grassTransitionReadiness);
    const metadata = await page.evaluate(async ({ warmupFrames, sampleFrames }) => {
        const s = window.__grassTransitionScene;
        const { getOrCreateGpuFrameTimer } = await import('/src/graphics/engine3d/perf/GpuFrameTimer.js');
        const timer = getOrCreateGpuFrameTimer(s.renderer);
        s.setAnimating(false); s.setHelpers(false);
        s.setSettings({ distances: [.1, .2, .3, .4], scale: .5, sideLeafDistance: 5 });
        const canopyMeshes = [], materials = new Map();
        s.fields.group.traverse(mesh => { if (mesh.userData.grassCanopy) {
            canopyMeshes.push(mesh); materials.set(mesh, mesh.material);
        } });
        const distance = canopyMeshes[0].material.userData.grassCanopyDistance.value;
        const originalDistance = distance.clone();
        // Borrow the existing world-UV soil material; only diagnostic shading changes.
        s.setSoilOnly(true);
        const soil = s.fields.group.getObjectByName('GrassTransitionField_0-Ground').material;
        s.setSoilOnly(false);
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        let clockMs = performance.now();
        async function renderFrame() {
            await frame(); clockMs = Math.max(clockMs + 1000 / 60, performance.now());
            s.step(1 / 60, clockMs);
        }
        function apply(pose, treatment) {
            for (const mesh of canopyMeshes) mesh.material = materials.get(mesh);
            distance.copy(originalDistance);
            s.setPose(pose); s.setSoilOnly(treatment === 'soil');
            if (treatment === 'single_scale') distance.set(1000, 2000, originalDistance.z);
            if (treatment === 'soil_shader') for (const mesh of canopyMeshes) mesh.material = soil;
        }
        function state() {
            const value = s.getSnapshot();
            return { fields: value.fields, selection: value.selection, draw: value.performance.draw,
                shadows: value.shadows, glError: value.glError };
        }
        function audit() {
            const cells = s.fields.cells;
            const byPosition = new Map(cells.map(cell => [cell.centerX + ',' + cell.centerZ, cell.id]));
            const surfaces = new Uint8Array(cells.length), matrix = s.camera.matrix.clone();
            const draws = [], previous = [];
            let shadowDraws = 0;
            s.scene.traverse(mesh => {
                if (!mesh.isMesh) return;
                previous.push([mesh, mesh.onBeforeRender, mesh.onBeforeShadow]);
                const onRender = mesh.onBeforeRender, onShadow = mesh.onBeforeShadow;
                mesh.onBeforeRender = function(...args) {
                    const material = args[4];
                    draws.push({ name: mesh.name, material: material.name, type: material.type,
                        instances: mesh.isInstancedMesh ? mesh.count : 1,
                        triangles: (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3,
                        transparent: material.transparent, alphaTest: material.alphaTest, depthWrite: material.depthWrite });
                    return onRender.apply(this, args);
                };
                mesh.onBeforeShadow = function(...args) { shadowDraws++; return onShadow.apply(this, args); };
                if (!mesh.isInstancedMesh || !mesh.visible
                    || !(mesh.userData.grassCanopy || mesh.name.endsWith('-Ground'))) return;
                for (let i = 0; i < mesh.count; i++) {
                    mesh.getMatrixAt(i, matrix);
                    const id = byPosition.get(matrix.elements[12] + ',' + matrix.elements[14]);
                    if (id === undefined) throw new Error('Unknown ground instance.');
                    surfaces[id]++;
                }
            });
            try { s.step(0, clockMs += 501); }
            finally { for (const [mesh, render, shadow] of previous) {
                mesh.onBeforeRender = render; mesh.onBeforeShadow = shadow;
            } }
            return { draws, shadowDraws, invalidGroundCells: [...surfaces].filter(count => count !== 1).length,
                state: state(), hud: document.querySelector('#scene-performance').textContent };
        }
        window.__lod4Cost = {
            async soak(pose, treatment, count = 120) {
                apply(pose, treatment);
                for (let i = 0; i < count; i++) await renderFrame();
            },
            async run(pose, treatment) {
                apply(pose, treatment);
                for (let i = 0; i < warmupFrames; i++) await renderFrame();
                const before = timer.getDiagnostics(), initial = state();
                const first = before.submissionSequence;
                for (let i = 0; i < sampleFrames; i++) await renderFrame();
                const last = timer.getDiagnostics().submissionSequence;
                const selected = () => timer.getSamplesSince(0).filter(sample => sample.submissionSequence > first && sample.submissionSequence <= last);
                for (let i = 0; i < 120 && selected().length < sampleFrames; i++) { await frame(); timer.poll(); }
                const after = timer.getDiagnostics(), gpu = selected().map(sample => sample.ms);
                if (!before.active || !after.active || before.disjointCount !== after.disjointCount
                    || gpu.length !== sampleFrames || last - first !== sampleFrames) throw new Error('Invalid GPU timing block.');
                const final = state();
                return { pose, treatment, gpu, state: final,
                    scans: final.selection.scans - initial.selection.scans,
                    shadowGenerations: final.shadows.generations - initial.shadows.generations };
            },
            async capture(pose, treatment) {
                apply(pose, treatment);
                for (let i = 0; i < warmupFrames; i++) await renderFrame();
                return audit();
            }
        };
        const gl = s.renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
            viewport: [innerWidth, innerHeight], pixelRatio: s.renderer.getPixelRatio(), warmupFrames, sampleFrames,
            settings: state().selection, canopyDistance: originalDistance.toArray(),
            treatments: { soil: 'Matched soil-only baseline', lod4: 'Screenshot configuration: .1/.2/.3/.4 m, half preset, 5 m side cutoff',
                single_scale: 'Diagnostic only: disable near/far texture-scale blend; keep paired 2 m tiles and full lighting',
                soil_shader: 'Diagnostic only: identical canopy instances/geometry with the existing soil material; no canopy vertex bevel' },
            method: 'GPU timer queries around complete frames; helpers off. Six rotating rounds, 30 warmup plus 60 measured frames; 120 startup frames per treatment/pose. Preparation and shadow regeneration excluded. No outlier removal.' };
    }, { warmupFrames, sampleFrames });
    expect(metadata.renderer).not.toMatch(/swiftshader|llvmpipe|software|basic render/i);
    expect(metadata.viewport).toEqual([1920, 1080]); expect(metadata.pixelRatio).toBe(1);
    const report = { metadata: { ...metadata, rounds, browser: browser.version(), date: new Date().toISOString() }, poses: {}, errors };
    for (const pose of poses) for (const treatment of treatments) {
        await page.evaluate(({ pose, treatment }) => window.__lod4Cost.soak(pose, treatment), { pose, treatment });
    }
    for (const pose of poses) {
        const blocks = [];
        for (let round = 0; round < rounds; round++) {
            for (let i = 0; i < treatments.length; i++) {
                const treatment = treatments[(round + i) % treatments.length];
                const block = await page.evaluate(({ pose, treatment }) => window.__lod4Cost.run(pose, treatment), { pose, treatment });
                blocks.push({ ...block, round });
                expect(block.state.glError).toBe(0); expect(block.scans).toBe(0); expect(block.shadowGenerations).toBe(0);
            }
            console.log('[LOD4Cost] ' + pose + ' round ' + (round + 1) + ': ' + blocks.filter(block => block.round === round)
                .map(block => block.treatment + ' ' + mean(block.gpu).toFixed(3) + ' ms').join(' / '));
        }
        const soil = blocks.filter(block => block.treatment === 'soil');
        const results = Object.fromEntries(treatments.map(treatment => {
            const samples = blocks.filter(block => block.treatment === treatment);
            return [treatment, { totalGpu: summarize(samples.map(block => mean(block.gpu))),
                aboveSoilGpu: summarize(samples.map((block, i) => mean(block.gpu) - mean(soil[i].gpu))), draw: samples[0].state.draw }];
        }));
        report.poses[pose] = { blocks, results, captures: {} };
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
        for (const treatment of treatments) {
            const audit = await page.evaluate(({ pose, treatment }) => window.__lod4Cost.capture(pose, treatment), { pose, treatment });
            report.poses[pose].captures[treatment] = audit;
            expect(audit.invalidGroundCells).toBe(0); expect(audit.shadowDraws).toBe(0);
            expect(audit.state.glError).toBe(0);
            expect(audit.hud).toContain('Triangles ' + audit.state.draw.triangles.toLocaleString('en-US'));
            expect(audit.state.draw.triangles).toBeGreaterThan(0);
            expect(audit.state.draw.calls).toBeGreaterThan(0);
            if (treatment === 'lod4') expect(audit.draws.filter(draw => draw.name.includes('-LOD4-'))
                .every(draw => !draw.transparent && draw.alphaTest === 0 && draw.depthWrite)).toBe(true);
            await page.screenshot({ path: path.join(output, pose + '_' + treatment + '.png') });
        }
        expect(results.lod4.draw.triangles).toBeGreaterThan(results.soil.draw.triangles);
        expect(results.single_scale.draw).toEqual(results.lod4.draw);
        expect(results.soil_shader.draw).toEqual(results.lod4.draw);
        await writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2));
    }
    expect(errors).toEqual([]);
    await writeGrassTransitionLod4CostReport(output, report);
});
